# Chief-Executor 执行路由与执行有效性审计报告

Task: `plan-execute-deepseek-executor-20260808`
审计时间: 2026-08-09（Asia/Shanghai）
审计性质: 只读审计（未修改 Trio 三件套、未提交、未推送、未改生产代码）
审计对象: commit `dd7a989`（feat(trio): visible-worker required execution routing and swf_executor role，10 files, +413/-1）及其承载的 Plan→Execute 委托机制；审计期间 worker 续跑新增 `95667e0`（fix(ci): 1 file, +1/-1，homepage smoke 测试预期对齐 main-only 的 36f95fe 标题变更）一并纳入范围

## 1. 结论摘要

**总体判定：实现与需求（task_plan.md 的 Goal + 6 个 Slice）逐条对齐，路由判断正确、fail-closed 路径有效，测试证据可复现（verify:trio 217/217、focused 43/43、verify:core 24/24）。**

执行有效性方面有一个结构性事实需要人类明确认知：本实现提供的是一套**决策库 + Host 角色约束 + 策略文本**的组合，仓库内**没有可执行的 visible-worker spawn/collect 生命周期桥**。因此"Chief 不得 inline 生产变更 / 不得用 native subagent 顶替主执行"的强制力来自三层：Host 角色配置（硬，锁死 model/effort/no-fallback）、策略文本与角色 instructions（软，依赖模型遵守）、人类 gate（硬）。路由层在任何不满足条件下都诚实返回 `manual_pending`（含 blocker + resumeCondition），没有静默降级到 native（在 packet 存在且声明 strict 的前提下）。

审计发现的 7 项 note/delta 不构成阻塞，但建议在 Chief acceptance 时逐项确认（见 §6）。

## 2. 审计方法

- 恢复任务目录绑定：`planning/active/plan-execute-deepseek-executor-20260808/`（三件套为唯一权威）。
- 验证 git 现场：branch/HEAD/commit/PR/工作区脏状态。
- 逐文件阅读实现：`harness/trio/core/routing.mjs`（全文）、`harness/trio/hosts/codex.mjs`、三处策略镜像（`skill/SKILL.md`、`templates/entry-policy.md`、根 `AGENTS.md`、`.agents/skills/trio/**` 投影）、dev 能力合同、两份测试文件新增段。
- 复跑验证：focused 测试、`verify:trio`、`verify:core`、`sync --check`、`doctor --check-only`、TOML 解析、`ocx agent status` 实况。
- 边界行为实测：无 packet / null packet 时的路由结果（见 §5.3）。
- 需求来源对照：`task_plan.md` Goal 与 Slices、`docs/superpowers/specs/2026-07-10-chief-worker-operating-model-design.md`（Assignment Packet 合同）、`docs/superpowers/plans/2026-07-13-chief-visible-worker-route-hardening-20260713.md`（visible-worker 为硬路由、不可伪称回执）。

## 3. Git 现场验证

| 检查项 | 实测 | 与记录一致性 |
|---|---|---|
| 分支 | `dev` | 一致 |
| HEAD | `95667e0`（初始检查时为 `6a68ed0` Merge；审计期间 worker 续跑提交 95667e0 并推送，origin/dev = 95667e0，origin/main = 36f95fe） | 与 progress.md 新增事件（ci-fix、pr-ci-green）一致 |
| 目标 commit | `dd7a989f12156d9fc8f351d98cc31f9589337420` 在历史中 | 一致 |
| PR | #146 draft OPEN，dev→main；CI：repo-verify SUCCESS（95667e0），mergeable MERGEABLE，mergeStateStatus CLEAN | 一致 |
| 工作区脏状态 | 仅 `harness/upstream/**`（vendored pre-existing）；own-path diff vs HEAD 为空 | 一致 |
| 全局投影 | `~/.codex/AGENTS.md`、`~/.agents/skills/trio/SKILL.md`、`~/.agents/skills/trio/dev/SKILL.md` 均含新边界/手交字段 | 一致 |

## 4. 逐 Slice 对照（实现 vs 需求）

### Slice 1 — RED 测试

需求：strict 路由、executor role、Plan/Execute 边界合同先 RED。
实现：`tests/trio/host-routing.test.mjs` 新增 7 条（strict 选 visible / strict 不 fallback native / 无 visible 能力 fail-closed / legacy 链不变 / strict manual descriptor 携带 packet 与 reason / 八字段不变 / role 锁定 + instructions）；`tests/trio/dev-capability.test.mjs` 新增 2 条（entry 边界合同 + 拒绝 Chief inline 变更；dev 手交字段合同 + 拒绝不完整手交）。RED 事件记录于 progress.md（`red-tests`，2026-08-08T14:01:01.521Z）。
核查：9 条新增测试全部存在且断言与需求逐句对应；RED→GREEN 事件链完整。

### Slice 2 — strict 拓扑路由

需求：`primaryExecution` 从 Assignment Packet `capability` 读取（`default` | `visible_worker_required`）；strict 时仅 visible，任何 visible 安全检查失败 → `manual_pending`（reason `visible_worker_required_unavailable:<detail>`），不对该主请求评估 native fallback；default 时 visible→native→manual 链逐字节不变。
实现（`harness/trio/core/routing.mjs`）：
- `PRIMARY_EXECUTION_KINDS = ['default','visible_worker_required']`；`primaryExecutionKind()` 读 `input.assignmentPacket?.capability.primaryExecution`，缺省 `default`，非法值抛错。
- strict 分支：`visibleResult.safe` 为真 → `visible_worker`；否则直接构造 `manual_pending` descriptor，携带完整 `assignmentPacket`、`blocker = visible_worker_required_unavailable:<reason>`、`resumeCondition`，**路由上不返回 native_subagent**。
- default 分支：`visibleSafety → nativeSafety → manual_pending` 链与 baseline 逐字节一致（native 仍受 child envelope 必须为 proper subset、`native_ultra_forbidden`、lane conflict 等约束）。
- `ASSIGNMENT_PACKET_FIELDS` 保持恰好八字段（authority/currentSlice/nonGoals/proof/capability/allowedOperations/deadline/expectedReturn）；`buildAssignmentPacket` 强制八字段 + authority binding 形状（绝对路径、合法 taskId、恰好三个 Trio 文件、sha256 格式）+ binding observation 与 binding 一致。
核查：代码路径与需求一致；43/43 focused 复跑通过。

### Slice 3 — swf_executor role 投影

需求：`SWF_EXECUTOR_ROLE`（name/model/effort/instructions/no fallback）+ 渲染函数；`harness/trio` 下不新增运行时文件。
实现（`harness/trio/hosts/codex.mjs`）：`SWF_EXECUTOR_ROLE` 冻结对象（model `opencode-go/deepseek-v4-flash`、`modelReasoningEffort: 'xhigh'`、`fallbackModel: null`、instructions 含"执行已接受的 SWF 计划、不重新设计 scope/架构/接口/验收标准、缺决策或模型不可用时返回 blocked、嵌套委托必须复用 swf_executor"）；`renderSwfExecutorAgentEntry()` 渲染 `[agents.swf_executor]` 表；`renderSwfExecutorRoleFile()` 渲染原生 role 文件（无 fallback 键）。
核查：import-boundaries inventory 复跑精确（11 个文件，无新增运行时文件）。

### Slice 4 — Trio 策略 Plan/Execute 边界

需求：entry policy（skill/template/AGENTS.md）加入 Plan and Execute Boundary；dev Planning Contract 强化 decision-complete 手交字段；不新增第四份规划文件、不新建 skill、不恢复 ChiefOps 机制。
实现：三处策略镜像 + 投影副本均含边界段；dev SKILL.md 新增手交字段句（objective、exact affected surfaces、verified baseline、required behavior、non-goals、dependencies/order、RED proof、smallest GREEN、verification command、backstop verification、evidence sink、stop/block conditions、expected return contract）。校验器新增两条反例测试（改写成"Chief 可 inline/可 substitute native"必须拒绝；手交字段可省略必须拒绝）。
核查：`sync --check` exit 0、`doctor --check-only` exit 0；未发现第四 authority 文件或新 skill。

### Slice 5 — Host 配置

需求：验证 OpenCodex host 假设并记录 delta；`[roles.swf_executor]`（实现为原生 `[agents.swf_executor]` 表）应用到 `~/.codex/config.toml`，带时间戳备份；TOML 可解析；不启用任何 model fallback。
实现与实况：
- `~/.codex/config.toml` 含 `[agents.swf_executor] → config_file = ~/.codex/agents/swf_executor.toml`；备份 `config.toml.bak-plan-execute-20260808` 存在。
- role 文件：name/description/nickname_candidates/model=flash/model_reasoning_effort=xhigh/developer_instructions；**无 fallback 键**。python tomllib 复解析通过（含断言）。
- `ocx agent status` 实况：`injection.model = opencode-go/deepseek-v4-flash`、`injection.effort = xhigh`、`injection.syncCodexSubagentDefaults = true`、`fallback.models = none`、efforts 含 `xhigh`、`subagents.chosen` 当前仅 flash。
核查：Host 假设全部满足；delta 记录基本准确（见 §6 第 4/6 条）。

### Slice 6 — 终态 gate 与证据

需求：`verify:trio`、`verify:all`、`git diff --check`；证据写回。
复跑结果：`verify:trio` 217/217（含 import-boundaries inventory 精确）；focused 43/43；`verify:core` 24/24 exit 0；own-path `git diff --check` 干净；仓库级 diff --check 仅剩 `harness/upstream/**` pre-existing 尾随空白（与记录一致）。`verify:all`（trio + core + homepage）已由 worker 在 95667e0 上续跑 exit 0（progress.md `pr-ci-green` 事件），PR CI 同步 SUCCESS；本审计复核了 core 24/24 与 trio 217/217。

## 5. 路由判断有效性分析

### 5.1 strict 路径（visible_worker_required）

| 场景 | 实测路由 | 证据 |
|---|---|---|
| visible 能力齐备（authenticated + visible + operation supported + model/effort 可控 + permission/path 绑定 + 无 lane 冲突） | `visible_worker` | 测试 "strict primary execution selects a visible worker" |
| visible 不安全（如 model controls 未绑定）但 native 可用 | `manual_pending`，reason 含 `visible_worker_required_unavailable`，**不含 native** | 测试 "never falls back to a native subagent" |
| 无 visible 能力观测 | `manual_pending`，reason 含 `visible_unknown/visible_unsupported` | 测试 "fails closed when no visible worker capability" |
| packet 缺失 / 为 null | **静默走 default 链**（实测 native_subagent） | 见 §5.3 与 §6-1 |

manual descriptor 携带：`kind='manual_pending'`、完整 assignmentPacket、`blocker`、`resumeCondition`（"Provide an authenticated Host visible worker with bound model, effort, permission, and path controls, or release the visible_worker_required topology."）。

### 5.2 default 路径（legacy）

实测：visible 因 `visible_model_controls_unbound` 失败 → native（child envelope 为 proper subset、非 ultra）→ native 不支持 → manual_pending（reason 为 `visible;<native>` 拼接）。与 baseline 行为一致，无回归。

### 5.3 边界实测（本次审计新增证据）

`resolveHostOperation({operation:'spawn', observation: {visible unsafe, native supported}, ...})` 且**不传 assignmentPacket** → 返回 `native_subagent`（fallback `visible_model_controls_unbound`）；传 `assignmentPacket: null` 结果相同。
含义：strict 意图只能通过 packet 表达；packet 缺失即视为 legacy。`buildAssignmentPacket` 的八字段强制只在构造 packet 时生效，`resolveHostOperation` 本身不要求 packet 必传。这是 Chief 侧的一个易错点（漏传 packet 会静默失去 strict 保护），建议在指引中明确，未来可考虑在 strict 意图存在但 packet 缺失时 fail-closed（当前为设计取舍，非需求违约）。

### 5.4 安全不变量（未改动且有效）

- binding 形状校验：authorityRoot 绝对路径、taskId 防穿越、恰好三文件、sha256 格式、binding observation 必须与 binding 一致。
- 观测状态禁止声称 `accepted/chief_accepted`（`validateObservedStatus` 抛错）。
- envelope：child 必须 ⊆ parent 且为 proper subset；permission/operation/externalEffect 集合与 mutablePaths 前缀均做子集与冲突检查。
- lane：reserved lane（有 mutablePaths 且未 release）与其他 worker 路径冲突则拒绝；spawn 时 executing visible lane ≥2 拒绝。
- native：非 spawn 一律 `native_target_unbound`；ultra effort 禁止；`native_visible_identity_conflict` 防身份混淆。
- model/effort：requested 为意图，`actualModel/actualEffort` 无 authenticated evidence 时保持 `unknown`（strict manual 路径同样输出 unknown，符合"不伪称实际"）。

### 5.5 执行有效性（真实强制面）

1. **硬**：Host role 配置锁死 model/effort/no-fallback（`ocx agent status` 可验证）；`[agents.swf_executor]` 存在则 role 选择面成立（本线程即 swf_executor 实例）。
2. **软**：策略文本 + role developer_instructions 约束模型行为（不 redesign、缺决策返回 blocked、嵌套复用 role）。
3. **硬**：人类 gate（merge/push/release/publish/send/credential/destructive 等）与 Chief acceptance 门槛（worker `done` 仅 candidate）。
4. **决策层硬**：`resolveHostOperation` 在 strict 且 packet 声明时不产生 native 路由，只产出 `manual_pending`——即"路由判断"在代码层是 fail-closed 的；但仓库内没有把该判断接到实际进程启动的桥（无 spawn/collect 执行器），因此"执行有效性"最终落在 Host/人类侧。这正是 07-13 route-hardening 与本次 goal 的既定边界（manual_pending 是设计的诚实出口，不是缺陷）。

## 6. 发现清单（note / delta，不阻塞）

| # | 级别 | 发现 | 建议 |
|---|---|---|---|
| 1 | note | `resolveHostOperation` 不强制要求 assignmentPacket；漏传时 strict 意图无法表达，静默走 legacy 链（实测） | 人类指引中强调 packet 必传；未来可在检测到"调用方本应 strict"时 fail-closed |
| 2 | note | strict 分支仍调用 `nativeSafety`（仅用于 manualCapabilityEvidence 的 nativeOperationSupport 取证），但**路由**从不返回 native。与"never evaluate"字面有出入，行为正确 | 接受为取证性评估；如需字面一致可改 lazy 评估（非必须） |
| 3 | limit（已声明） | 仓库无可见 worker spawn/collect 生命周期桥；强制面为 role 配置 + 策略 + 人类 gate | 保持；这是既定设计边界 |
| 4 | delta | 记录为 `codex-cli 0.147.0-alpha.6.5`，当前 shim 报告 `0.146.1`（/opt/homebrew/bin/codex 为 opencodex shim，ocx = opencodex 2.11.0） | acceptance 时确认实际二进制版本与 role 支持面 |
| 5 | pre-existing | Trio CLI `progress` 命令 BigInt 序列化输出 bug（未触碰的 installer/store 路径） | 与本次变更无关；另立任务可选修复 |
| 6 | delta | 记录 `subagents.chosen = [flash, pro]`，当前实况仅 flash（更接近目标） | acceptance 时以实况为准 |
| 7 | note（已闭环） | 审计开始时 `verify:all` 的 homepage 段未重跑；worker 续跑已在 95667e0 上补跑 verify:all exit 0，且 PR CI repo-verify SUCCESS | 无需再补跑；acceptance 时以 PR 状态为准 |
| 8 | note | 审计期间 worker 续跑新增 `95667e0`（homepage smoke 测试预期对齐 36f95fe 的 main-only 标题变更），已纳入审计范围，变更最小（+1/-1）、无越权 | 并入 PR #146 一并验收 |

## 7. 总体判定

**需求对照：通过（approve-with-notes）。** 实现与 task_plan 六个 Slice 逐条一致，路由判断在代码层 fail-closed，测试与 Host 证据可复现，全局投影与 PR 状态与记录一致。§6 的 8 项均为 note/delta，无需求违约、无安全降级；其中 #7 已闭环，新增 #8 为最小 CI 对齐修复。

**最终 acceptance 仍属人类/Chief gate**：本报告不替代 Trio writeback（accept/close/archive）与 PR #146 merge gate。建议 acceptance 时按 §6 逐项勾销，并在 merge 前补跑一次 `verify:all`。
