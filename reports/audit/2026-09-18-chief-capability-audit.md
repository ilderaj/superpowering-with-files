# Chief 功能、能力与作用审计报告（2026-09-18）

- 性质：只读审计（不实施、不改生产代码、不改宿主配置、不动 Git/外部系统）
- 范围：本仓库（SWF）的 Chief / ChiefOps 规范源、代码契约、CLI、投影与安装副本
- 证据标注：【source 本仓库规范源】【code 本仓库代码】【docs 本仓库文档】【projection 投影副本】【install 已安装副本】【verified 本日实测】【legacy 历史残留】

---

## 0. 结论摘要

1. **Chief 是治理角色，不是模型、不是运行时、不是「更强的模型」。** 仓库 SOP 明确定义：Chief 拥有 intake、route、plan、worker binding、gates、independent review、acceptance——**且仅在该角色被激活时**（tracked 或委派车道）。quick 工作与 direct tracked 工作都不需要 Chief。【docs】
2. **Chief 最不可替代的能力是「验收（acceptance）」，而且它是代码强制的**，不是文档约定：Trio 的 accept / stop / close / archive 都要求 `actor: 'chief'`；close 还要求已有 actor=chief 的 durable accepted/stopped 证据；Host 的 worker 观察被显式禁止声称 Chief acceptance。【code】
3. **Chief 现在不再拥有「拉起可见 worker」的运行时能力。** Root active routing 只有 direct/native-first 与 `manual_pending`；legacy 输入 `visible_worker_required` 对任一 Host operation 都返回 `manual_pending:legacy_visible_worker_required_retired`，不恢复 bridge、不做 native fallback。Corleone 名册（Don/Underboss/Capo/Button Man/Soldato）保留为静态/历史兼容，不是 active execution contract。【docs】【code】【verified】
4. **ChiefOps 被显式限定为 governance-only companion**：不是 runner、scheduler、registry、跨线程 goal controller，也不是第四套任务状态面，且不设定模型专属执行策略。【source】
5. **验收闭环的语义分离是硬约束**：`candidate_done`（worker 候选）≠ Chief `accepted`；`generated/opened/rendered/accepted/delivered` 互不推出；本地验证不证明 merge/deploy/adoption。【docs】【source】
6. **发现两处副本漂移（不阻塞使用，但影响「四面一致」的结论）**：
   - dsh 插件 vendored 的 `chiefops/SKILL.md` 落后于规范源，缺 Linear 可见性、夜队列（nightly）决策、关闭/归档口径；而 dsh README 声称 assets 与仓库源 byte-identical，当前不成立。【verified】
   - 用户全局 `~/.agents/skills/chiefops/` 保留了 7 个 2026-08-02 的 V0b 期文件（`references/` 下 assignment-packet / checkin-watchdog / permission-delegation / session-routing，加顶层 rubric.md / examples.md / template.md），不在当前规范清单内。【verified】【legacy】
7. **历史脉络**：`chief-worker-session-routing-issue-20260709`、`chiefops-goal-worker-analysis-20260728`、`chiefops-native-goal-worker-20260728`（**blocked**：未发现 authenticated 跨线程 goal 控制面）。V0b 的 overlay 运行时（spawn/continue/handoff/abandon/respawn）已退役——tests/installer 下不再有对应 overlay/service 测试。【verified】

---

## 1. Chief 是什么

**定义【docs】**：Chief 是一个治理角色，不是「更聪明的模型」的同义词，也不是「更多仪式」。

| 活动 | 谁可执行 | 证明了什么 |
|---|---|---|
| Focused verification | direct executor 或 worker | 观测到的命令/检查支持所声称行为 |
| Independent review | 独立 reviewer 或 Chief（风险需要时） | 有界工作符合需求与仓库标准 |
| **Chief acceptance** | 委派/Chief-governed 车道中的 Chief | worker 候选在范围内、证据充分、可回写为 accepted |
| Human gate | 用户 | merge/push/release/publish/deploy/send/凭据/破坏性动作的许可 |

**边界【source】**：ChiefOps「governance-only」；Trio 是唯一 durable task authority；Host 拥有 lifecycle、continuation、permissions 与 authenticated execution evidence。Chief 不替代 Host 生命周期，不把 legacy visible input 当作 active execution contract，也不以本地模拟代替 Host 的 user-owned task workflow。

## 2. Chief 的功能面（做了什么）

| 功能 | 内容 | 证据面 |
|---|---|---|
| Intake | 接收五要素（目标/影响面/约束非目标/验收证明/边界与 gate）；quick 直接完成，tracked 建或恢复三件套 | 【source】【docs】 |
| 路由 | 在每个任务上选 quick / tracked，并选唯一能力包 dev / office / safety | 【source】 |
| 规划 | 维护 `planning/active/<task-id>/` 的 task_plan / findings / progress 为唯一权威 | 【source】 |
| 切片与冻结 | 冻结 authority root、taskId、currentSlice、baseline、allowed paths、non-goals、proof、evidence sink、stop conditions、return contract；绑定含三文件 sha256 | 【source】 |
| 派单 | 构造 8 字段 Assignment Packet（authority/currentSlice/nonGoals/proof/capability/allowedOperations/deadline/expectedReturn），拒绝第九字段 | 【code】 |
| Gate | 人类 gate 保持绑定；批准只解除适用的 Host 限制，永不扩大 frozen scope | 【source】 |
| 独立复核 | 复核绑定、scope、需求、fresh proof、必需 review 证据与 human-gate 状态 | 【docs】 |
| 验收回写 | 只有全部满足才 accept 并回写；否则 request changes 或 block | 【docs】【code】 |
| 生命周期 | accept / stop / close / archive，且都需要 actor=chief | 【code】 |
| 交接 | handoff 记录：已完成工作、验证、blocker、所需决策、next action、resume condition | 【source】 |
| 交付证据 | GitHub 绑定：repository、PR、当前 head SHA、必需检查、review gate、observed merged/closed；head 变化使 head-bound proof 失效 | 【source】 |
| 可选工具面 | 复用 `linear-work-control` 做人类可见 checkpoint；`reports/linear/<task-id>/linear.json` 为非权威外部元数据 | 【source】 |
| 夜队列决策 | intake 必须显式给出 nightly 决策（缺省即不排程）；只有 bounded/acceptance 已写/无待决人类决策/编辑面不重叠才推荐 | 【source】 |
| 昼夜就绪审计 | local-first 就绪审计（trio、授权、依赖、blocker、当前证据）；复用未变化证据，只刷新变化项 | 【source】 |

## 3. Chief 的能力边界（不做什么）

- **不拥有运行时 worker 编排**：内部路由只产出 direct/native-first 或 `manual_pending`；`visible_worker_required` 是一律失败的 legacy 输入。【docs】【code】
- **不是** runner、scheduler、daemon、queue、worker inbox、registry、worker backlog、第二 memory system 或第四任务状态面。【source】【docs】
- **不代替人类 gate**：merge/push/release/publish/deploy/send/凭据/破坏性/数据丢失操作永远留人类；route、capability、checkpoint 或 worker 结果都不能提供人类许可。【docs】
- **不把请求当证据**：requested model/effort 表达意图；actual 在没有 Host authenticated 证据前是 `unknown`；静态角色配置不构成动态 child 权限。【docs】
- **不做模型专属执行策略**：ChiefOps「sets no model-specific execution policy」。【source】
- **不追溯改写运行中 worker 的权限**：权限是 scope→sandbox→approval 三层顺序判定，审批永不扩权，物化输出（AGENTS.md、.agents/**）在 scope 层直接阻断。【docs】

## 4. 实现落点（代码 / CLI / 安装）

| 面 | 路径 | Chief 相关作用 |
|---|---|---|
| 策略技能 | `harness/trio/governance/chiefops/SKILL.md` | ChiefOps 治理契约全文（intake/Linear/夜队列/交付/归档/dispatch/acceptance） |
| 策略引用 | `harness/trio/governance/chiefops/references/delegated-execution.md` | 冻结校验、权限、worker approval、语义车道、worker-local goals；「Chief owns planning, assignment, review, gates, acceptance, authority writeback」 |
| 路由核心 | `harness/trio/core/routing.mjs` | `CHIEF_WORK_ROLES`、`CHIEF_REQUESTED_MODELS`、`CHIEF_REQUESTED_EFFORTS`、`matchesChiefRelease`（chiefRelease 释放语义车道）、拒绝 Host observation 声称 Chief acceptance |
| 生命周期存储 | `harness/trio/core/store.mjs` | `requireChief(actor)`：accept/stop/close/archive 强制 actor=chief；close 要求 durable accepted/stopped 证据 |
| CLI | `harness/installer/commands/trio.mjs` | `accept`（Record chief acceptance evidence）、`stop`、`close`、`archive`；`--role chief` 属 Chief 工作角色 |
| 投影 | `harness/trio/projection.mjs` | 注册 `chiefops/SKILL.md` 为主面、`chiefops/references/delegated-execution.md` 为支持面 |
| Host 适配 | `harness/trio/hosts/codex.mjs` | Corleone 名册与身份；don 档仅在 legacy visible 输入下选中；`renderCodexHandoffRequest` 对 visible_worker_required 抛 blocker |
| 安装 | `harness/installer/commands/install.mjs` | `--takeover-chiefops`：仅对已存在的 schema-v2 user-global 状态、五个已拥有主面、恰好一个 unowned ChiefOps 目标生效 |
| 评测 | `scripts/evaluate-trio-v2.mjs` | 编排代理以 `chiefSessionId` 计算 freshShare = chiefFresh/(chiefFresh+delegateFresh)；limitations 保留「Cutover remains pending until Chief verifies the complete precondition matrix.」 |

## 5. Chief 在模型/角色路由中的位置

- **工作角色集合【code】**：Chief 侧 = `chief | thinking | planning | orchestrating | high_density_judgment`；执行侧 = `executing | searching | researching | coding | exploring | repetitive_execution`。两侧互斥。
- **复杂度只标执行侧**：对 Chief 工作角色传入 complexity 会被拒绝（"Complexity is execution-scoped"）。
- **Chief 请求模型集合【code】**：`gpt-6-astra | gpt-5.6-sol | gpt-5.6-terra | gpt-5.6-luna`，effort ∈ `low|medium|high|xhigh|max`；legacy 冻结包省略 Chief effort 时按 `max` 保留。
- **human override 只能改 Chief/high-density 切片**，执行角色永不升级模型或 effort。
- **Corleone 层级**与 Chief 的关系是「向 Chief 返回证据」：Underboss 的指令即 "return evidence to the Chief"；所有 Corleone 身份都声明 "Your title grants no permissions, acceptance authority, model claim, or human-gate bypass."【code】

## 6. 验收闭环（Chief 的核心能力）

1. worker 产出 `candidate_done` → 只有在 Chief 独立复核证据 + Trio 回写后才成为 durable accepted。
2. 代码层强制：`acceptTrioTask` / `stopTrioTask` / `closeTrioTask` / `archiveTrioTask` 全部 `requireChief`。【code】
3. Close gate：task_plan 必须 `Status: active` 且 `Archive Eligible: no`，progress 中必须存在 actor=chief 的 accepted/stopped；否则 `ERR_TRIO_ACCEPTANCE_REQUIRED`。【code】
4. Archive gate（本地）：close 后置 `Status: closed` / `Archive Eligible: yes` / `Close Reason`；归档走既有 Chief-owned 路径，要求字节漂移校验与发布租约。【source】【code】
5. Linear `Done` 需完成 gate；Linear auto-archive 无手工归档动作；不得承诺立即归档或释放配额，不得删 issue 模拟归档。Codex 任务归档是独立的 Host 动作，需独立验证。【source】
6. **Direct 与 governed 的区别**：direct tracked 由执行者自证技术验证即可完成；只有「委派 worker 作为主执行」或「所选治理车道明确要求」才需要 Chief 独立验收。【docs】

## 7. 副本一致性与漂移（四面对照）

| 面 | 路径 | chiefops/SKILL.md sha256 | 判定 |
|---|---|---|---|
| 规范源 | `harness/trio/governance/chiefops/SKILL.md` | `e61c34ccbdc6874b3bf427ffb5e8d6672c2aa828264a66926810f3d60bba1253` | 基准 |
| 工作区投影 | `.agents/skills/chiefops/SKILL.md` | `e61c34cc…` | 一致 |
| 用户全局安装 | `~/.agents/skills/chiefops/SKILL.md` | `e61c34cc…` | 一致（含残留文件，见下） |
| dsh 插件 vendored | `plugins/dsh/assets/skills/chiefops/SKILL.md` | `9e9ba0e514ea37075341eb2b7b6c48743d86f45fea3c1aeed466749d58812597` | **落后** |

**dsh 漂移内容【verified】**：vendored 版本仍为旧 description（"Optional governance router for a selected Chief or delegated Trio lane"），且缺失以下已进入规范源的段落：Linear 可见性与 `reports/linear/<task-id>/linear.json`、nightly 夜队列决策面与写入时机、昼夜就绪审计、GitHub 交付 head/merged 证据、local archive 与 Linear 归档规则。dsh README 声称 assets「byte-identical to the repository sources」，当前不成立；dsh 的 parity 测试对比的是 routing 决策核心（HEAD 275345d），不覆盖 chiefops 文案。

**用户全局残留【verified】【legacy】**：`~/.agents/skills/chiefops/` 除当前 SKILL.md 与 `references/delegated-execution.md` 外，还有 dated 2026-08-02 的 `references/{assignment-packet,checkin-watchdog,permission-delegation,session-routing}.md` 与 `rubric.md`、`examples.md`、`template.md`——均为 V0b overlay 期产物，不在 `harness/trio/projection.mjs` 声明的清单内。归属（managed vs stale residue）未验证；清理需单独授权。

## 8. 本日验证证据

| 命令 / 检查 | 结果 | 覆盖 |
|---|---|---|
| `node --test tests/trio/store.test.mjs tests/trio/host-routing.test.mjs tests/trio/routing.test.mjs tests/trio/model-routing.test.mjs tests/trio/lifecycle.test.mjs tests/trio/projection.test.mjs` | **260 pass / 0 fail**（exit 0） | Chief 生命周期、角色路由、投影面 |
| `shasum -a 256` × 4 | 见第 7 节 | 副本一致性 |
| `diff -u` source vs dsh vendored | 缺失 6 段策略文本 | drift |
| `ls tests/installer` | 无 chiefops-overlay/service 测试 | V0b overlay 已退役 |

## 9. 未验证与风险

- 本次仅跑 focused 6 文件测试；未跑全量 `npm run verify:trio`，也未跑 plugin-kit / dsh vitest。
- dsh vendored 落后是「刻意 pin（HEAD 275345d）」还是「未同步 drift」：需 owner 定性，本次不下结论。
- `~/.agents/skills/chiefops` 残留文件归属未验证。
- 跨线程 native goal control 仍 blocked（历史任务结论）；Chief 的 goal/continuation 能力只能依赖 Host 工具面。
- 实际 model / effort 无 authenticated Host 证据时仍为 `unknown`；本次审计未取得任何 authenticated 运行证据。
- 本审计是静态/配置级证据，不等同于生产、验收、用户可见交付或已确认结果。

## 10. 建议（均需单独授权，本次未执行）

1. 定性 dsh vendored chiefops：若确认为 drift，按 dsh 的基线/pin 约定评估同步方式，并同步更新 dsh README 的一致性声明或改为显式 pin 说明。
2. 对 `~/.agents/skills/chiefops/` 做一次只读归属检查，确认 V0b 残留文件是 managed 还是 stale residue，再决定是否清理（清理属删除动作，需明确授权）。
3. 维持 Chief 的治理边界：任何「让 Chief 直接 spawn/调度 worker」的回归都应视为与当前 active routing 契约冲突。
4. 若需要把本次结论作为 durable 交付，可补跑全量 `npm run verify:trio` 并把结果写入本 trio 的 progress。

---

## 11. 后续变更（2026-09-18，本报告之后）

本报告第 3、4、7 节记录的是变更前的状态。同日经用户授权执行了 legacy Corleone / visible-worker 链路移除：

- `harness/trio/hosts/codex.mjs`：删除 Corleone 名册、callsign 分配、profile/role-file renderer、`renderCodexHandoffRequest`；仅保留 Host operation 重导出、`ADAPTER_VOCABULARY`/`adapterStatus` 与 `resolveCodexPermissionIntent`。
- `tests/trio/host-routing.test.mjs`、`tests/trio/model-routing.test.mjs`：删除对应测试，保留 retire 契约、generic host、permission intent 与 adapter 断言。
- `plugins/dsh`：删除 `src/core/corleone.ts` 与 dispatch 的 persona 绑定，改为 execution-role 门禁（blocker `execution_role_unavailable`）。
- 宿主配置：`~/.codex/agents/*.toml`（14 个）与 `~/.codex/config.toml` 的 `[agents.*]` 已移除；`~/.agents/skills/chiefops/` 的 7 个 V0b 残留文件已移除。备份在 `.harness-backup/legacy-corleone-20260918/`。
- 保留 `routing.mjs` 的 retire 契约：`visible_worker_required` 仍返回 `manual_pending:legacy_visible_worker_required_retired`。
- 仍未处理（需单独授权）：dsh vendored `chiefops/SKILL.md` 落后规范源；dsh `assets/skills/trio/*` 与 `.agents/skills/trio/*` 的字节漂移。
- 变更记录见 `planning/active/legacy-corleone-removal-20260918/`。
