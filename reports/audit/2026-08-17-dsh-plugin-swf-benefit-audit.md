# SWF→dsh 插件改造审计 + SWF-in-dsh 收益分析 + 实地对比测试方案

- 日期：2026-08-17
- 性质：只读分析与审计（不实施、不改生产代码、不碰宿主配置）
- 环境事实：本次会话本身运行在 DeepSeek Harness（dsh）中（`$DSH_HOME=~/.dsh`，web 入口 http://127.0.0.1:3080，默认 provider `opencode-go/deepseek-v4-flash`）；`~/.dsh/cordis.patch.yml` 当前为 `[]`，swf-dsh 插件**尚未挂载到本宿主**。
- 证据标注：【verified 本日】本仓库/本宿主实测；【SWF-local】仓库事实；【假设】工程假设；【建议】推荐方案

---

## 0. 结论摘要

1. **框架问题域**：superpowering-with-files（SWF）解决的是「本地编码代理工作流的治理层」问题——路由分类、持久任务权威、可见 worker 拓扑、经济性控制、人类 gate 与 fail-closed 诚实出口。它是一个 harness（对请求分类、套规则、选执行体、判完成、留人类 gate），不是 IDE。
2. **改造审计结论**：`plugins/dsh` 的移植质量高、纪律强——决策核心与 `harness/trio/core/routing.mjs`（HEAD 275345d）逐字节 parity（12 项 golden 测试），200/200 测试通过，四条宿主改写全部在代码层强制执行（非仅文档），版本锁与证据审计就位。**但「很好地 apply 到 dsh」仍受一个未验证前提约束：插件从未在真实 dsh 宿主上加载运行过**（rollout 清单 item 1–5 全数未验；本宿主 patch 为 `[]`）。代码层适配是充分的，宿主层接线是未证明的。
3. **收益分析结论**：SWF-in-dsh 相对 dsh 原生 harness 模式（goal rounds / subagent / workflow / ralph / GenUI + sandbox/approval/tokenMeter）的收益是**治理形的（governance-shaped），不是能力形的（capability-shaped）**：
   - 真实增量：跨主机/跨会话的持久任务权威、确定性 fail-closed 路由本体（binding_mismatch/manual_pending/budget_exceeded/gate 停）、三态证据纪律（host-claimed 永不得写成 authenticated 且可审计）、经济策略硬路由（Flash 执行档、no-fallback、预算封顶）、candidate→人工 accept 的验收生命周期。
   - 无增量或负增量：执行原语 = dsh subagent（同一原语，无能力差）；证据上限只能到 host-claimed（dsh 无认证级 Host 证据，SWF 最高证据档在 dsh 下达不到，accept 实际退化为「host-claimed + 人工确认」，与 dsh 原生人类 gate 的信任差很小）；双权威簿记（Trio + packet/evidence）与 /swf 命令仪式是额外成本。
   - 因此「有没有确实产生收益」**在只读分析层面无法定案**——收益形态已明确（治理、可靠性、恢复、验收证据），但收益量级（成本、成功率、返工、范围漂移、人工介入）必须实地对照测量。这正是第 4 节测试方案要回答的问题。

---

## 1. 框架问题域与 harness 范围

### 1.1 解决的主要问题【SWF-local】

- **可重复、可审计、安全的本地产物工作流**：规划状态持久化（planning trio）、一套策略投影到多个代理表面（Codex 原生、dsh 插件、generic 回退）、验证与发布通道显式化（README/PRODUCT）。
- **路由与分类**：`quick` / `tracked` / `deep`（deep 为逐轮推理决策，不是持久任务类型）；每个任务恰好一个能力包 `dev` / `office` / `safety`。
- **唯一任务权威**：`planning/active/<task-id>/` 三件套（task_plan / findings / progress）是 tracked 工作的唯一持久权威；worker 结果只是 candidate，Chief 验收回写后才 durable。
- **严格可见 worker 拓扑**：tracked 变更路由到可见 `swf_executor` 角色（请求经济档案 Flash/high|xhigh|max，无 fallback）；无合规 worker 时诚实出口 `manual_pending`（blocker + resumeCondition），**绝不静默降级**。
- **三层权限治理**：scope（Assignment Packet `allowedOperations` 是唯一授权源）→ sandbox（authenticated 证据 + 可写根覆盖）→ approval（allow/deny，永不扩权）。
- **人类 gate**：merge/push/release/publish/send/凭据/破坏性操作永远留人类。
- **经济性**：Flash 执行档、复杂度→effort 档位、每 task 预算封顶、超限 manual_pending。

### 1.2 范围边界【SWF-local】

- **控制**：路由与包选择、持久任务记录、可见 worker 拓扑与证据、权限判定、人类 gate、预算与审批流。
- **不声称**：调度器/守护行为；无认证 Host 证据时的 actual 身份（`actual` 保持 `unknown`）；未实现的生命周期桥（诚实出口 manual_pending）；静默回退。

### 1.3 与 dsh 的关系【verified 本日 + SWF-local】

- dsh 是 Cordis 插件式组合的宿主（预览期 rc 质量）：提供 sessions / subagents / approval / skills / tokenMeter / commands / sandbox 等服务面。它是运行时本地的执行/会话权威，**不是** SWF 任务权威的替代。
- SWF 以插件形态（`plugins/dsh/`）把策略层搬进 dsh：Trio 文件唯一权威，dsh session 仅作证据/执行日志。2026-08-14 报告曾拒绝 in-harness 插件（第二权威风险），本设计以「Trio 唯一权威 + dsh session 仅证据」解除该反对（2026-08-15 可行性报告）。

---

## 2. dsh 插件改造审计

### 2.1 改造事实【verified 本日】

- 代码位置与基线：`plugins/dsh/`，决策核心移植自 `harness/trio/core/routing.mjs`（HEAD 275345d）；`git merge-base --is-ancestor` 验证 275345d 为 HEAD 祖先、且主干 `routing.mjs` 最后一次改动（994cf38d）早于 275345d —— **基线未过期，parity 对照有效**；harness/trio 目录自基线起无 diff。
- 提交链：Slice 0（核心移植 + parity）→ Slice 1（骨架 + 自动检测 + /swf route|bind|status|accept）→ Slice 2（ctx.subagents 派发 + 双层 gate + 预算 + accept）→ Slice 3（版本锁 + 证据审计 + fail-closed 回归），随后 PR #163 两轮 review 修复。README/pnpm verify 均与代码一致。
- 测试：`pnpm verify` 本日复跑通过——version-lock ok、build ok、**19 个测试文件 200/200 通过**；parity 测试对 shared 决策面（classify/route/packet digest/model-effort/resolveHostOperation/adjudicatePermission）与基线做 JSON 逐字节与错误消息逐字对照。
- 版本锁：`@deepseek-ai/dsh@0.1.0-rc.6` 精确 pin（package.json + pnpm-lock.yaml 双检），`check:version-lock` 守卫，升级必须过测试门。
- 宿主演进事实：`conversationEvents`/`inputTriggers` 经官方源码（47f943859…）核实为 client/UI 侧服务，插件改用宿主侧服务面（sessions 生命周期 + commands + skills + tokenMeter + approval），`ctx.subagents` 防御性解析（未挂载即 fail closed，不崩溃）。

### 2.2 四条宿主改写是否在代码层强制执行【verified 本日】

| 改写规则（2026-08-15 报告 §4） | 代码强制点 | 实测 |
| --- | --- | --- |
| 1. 可见 worker = 经 ctx.subagents 派发且记录 {SessionId, provider, declared model} 的 subagent；无记录 = silent fallback，禁止 | `src/dispatch.ts` step 9–10：派发前注册 `subagent/start` 观察者，记录不全 → `run.dispose()` + `dispatch_record_unavailable` manual_pending | ✅ 强制执行（28 条 dispatch 测试覆盖） |
| 2. 三态证据，host-claimed 永不得写成 authenticated | `src/core/evidence.ts` `evidenceRecord` 抛错 + `packet.ts` write 边界 `requireNotHostClaimedAsAuthenticated` + 证据审计 R4/R5 | ✅ 写边界双保险（writeEvidence 前 assert + requireNot…） |
| 3. approval_policy 不复刻 Codex 字段，映射 dsh approval preset；gated 类别无 approval 即停 | `src/core/dispatch.ts` `classifyGateCategories`（显式 gateCategories + allowedOperations 关键字扫描双形状）+ `dispatch.ts` step 5（`gate_approval_required` manual_pending） | ✅ 注意 `allowedOperations` 同时接受对象信封与字符串数组两种形状，关键字扫描不丢 gate |
| 4. 「不得用原生 subagent 顶替执行 worker」重述为「不得用无记录 subagent 顶替可见 worker」 | 同上 1：每一次派发都先观察 start 事件再成记录，记录失败即 dispose | ✅ 意图（防静默降级）保留 |

另核：stop conditions 全覆盖——binding_mismatch（bind 拒写/dispatch 不启动/accept 拒授权）、worker 无记录 → manual_pending、预算超限 → manual_pending、gated 无审批 → 停；`/swf audit` 证据审计 R1–R6 可运行。

### 2.3 审计发现：做得好 / 间隙 / 风险【verified 本日】【假设】

**做得好**
- Parity 纪律：决策核心纯 TS 移植 + golden 对照，行为逐字节一致，错误消息逐字一致；harness 基线保持不动。
- 写边界不变式：三态证据的不变式不在「约定层」而在「写入层」强制，审计 R4/R5 二次确认。
- Ticket 完整性防护：`swf-packet.json` 存 digest，hand-edit（如删掉 gated 操作）会在 dispatch/accept 前以 `packet_digest_mismatch` 拦截——比只验 Trio hash 更严。
- accept 生命周期：candidate（worker-result settled + stopReason=completed + runId 与 worker 会话一致 + packet digest 一致）→ Trio hash 验 → 证据态 gate → dsh approval → durable acceptance 证据。四道身份校验齐全。
- 预算会计不跨任务泄漏：ledger 按 authorityRoot+taskId 分键；宿主级并行帽（≤2）与任务级 ledger 分开。
- 风险处置诚实：rollout 清单明确「本 Codex 环境无真实 dsh 宿主，流程以 mock ctx.subagents/ctx.approval 证明；真实宿主机项是 rollout gate」。

**间隙 / 风险**
1. **真实宿主验证全空（最大间隙）**：插件加载（cordis patch）、`/swf route/bind/status` 真实会话、真实 `subagent/start` 事件形状（`SubagentRunInfo` 字段：runId/provider/id 等）、真实 tokenMeter 语义、`/swf audit` 真实数据——全部未验。mock 的 start 事件形状（`{runId,provider,id,local:true}`）需与 rc.6 实装核对。
2. **派发证据依赖 `parent.session`**：`ctx.tokenMeter.measure(session)` 需要 `parent` 带 `session`；真实宿主 agent 对象是否暴露 session 属性未验（step 7 try/catch 兜底为 0，可能低估）。
3. **subagent 服务未注入**：`inject` 列表不含 subagents（有意为之），派发时才防御性解析——若宿主服务注册名不是 `subagents`，会恒 `subagents_service_unavailable`。需在真实宿主确认 cordis 服务名。
4. **registry provider 名是部署形状**：`subagent-dsh-sdk` 等名称验证于官方源码，若宿主私有改名则 fail closed（安全方向正确，但需实地核对）；本宿主 settings.yaml 只配了 `opencode-go`/`opencodex`，`subagent-codex`/`subagent-claude-code` 在本宿主下预期不可解析 → `provider_unavailable`，codex/claude-code 档实测不可用。
5. **预算语义词**：tokenMeter 的 totalTokens 是会话级聚合，任务级归因是启发式——SWF 预算与 dsh 原生一样面临归因噪声。
6. **插件只写 `planning/active/<taskId>/swf-packet.json` + `evidence/`**：`authorityRoot` 来自 packet binding（绝对路径），宿主须保证只读挂载的工作区是权威根；`danger-full-access` + 无审批的最小组合在本脏工作根目录依旧被 08-14 报告禁止。

### 2.4 审计结论

**改造本身质量：高。能把 harness/SWF 的策略层在代码层面很好地表达为 dsh 插件——决策核心逐字节 parity、四条改写全部代码化、fail-closed 回归矩阵齐备、版本锁与证据审计就位。** 但「能否很好地 apply 到 dsh」的宿主侧答案仍取决于 rollout 清单 item 1–5（真实加载、真实派发证据、真实预算、真实审计、第一次真实人工 accept）。换言之：**代码适配充分、宿主接线未证明**。在完成这些真实宿主验证前，任何「已在 dsh 中收益」的断言都不成立。

---

## 3. SWF-in-dsh vs dsh 原生 harness 模式的收益分析

### 3.1 比较对象：dsh 原生 harness 模式【verified 本日，宿主实装】

本次会话的宿主即 dsh，原生工具面（dsh 自己的 harness 模式）：

| dsh 原生模式 | 能力概要 |
| --- | --- |
| goal rounds（create/get/update_goal） | 同会话长目标：持续自动续轮、rounds 上限、resume/pause/blocked；**会话内**持久，会话 resume/fork 后 disarm 需重新武装 |
| subagent / subagent_fork | 后台委托：独立子会话、durable id、结果回传、send_message 续跑/中断 |
| workflow | JS 编排脚本：多子代理扇出、phases、JSON schema 校验、pipeline/parallel |
| ralph | fresh-agent 迭代环：每轮全新子代理、共享 workspace 记忆 |
| GenUI（dsh-ui） | 回复内交互 UI；render_ui 工具行卡片 |
| sandbox / approval | 文件沙箱模式（read-only/workspace-write/danger-full-access）+ approval preset（ask/never），工具级 fail-closed |
| tokenMeter / session 持久化 / compaction | 会话 token 计量、jsonl 会话日志、压缩 |

### 3.2 从 SWF 的目标角度：收益矩阵【SWF-local + 分析】

SWF 的目标（见 §1.1）逐条对照 dsh 原生现状：

| SWF 目标 | dsh 原生现状 | SWF-in-dsh 增量（收益） | 收益性质 |
| --- | --- | --- | --- |
| 持久任务权威、跨会话恢复 | goal 会话内持存、resume 后 disarm；会话 jsonl 是证据不是权威 | Trio 文件跨宿主/跨会话/跨崩溃无条件持存，人可读、可 diff、可版本化；恢复不依赖宿主事件 | **真实增量**（可靠性/可恢复性） |
| 确定性 fail-closed 路由 | 依赖系统提示 skill 文本（软）+ 人类 gate（硬），无封闭决策本体 | binding_mismatch/manual_pending/budget_exceeded/gate 停是纯函数 + 哈希校验，跨宿主逐字节一致；无静默降级 | **真实增量**（一致性/可审计性） |
| requested vs actual 证据纪律 | subagent 记录 SessionId/provider/model，但无证据态分类、无「host-claimed 不得写成 authenticated」不变式、无审计 | 三态证据 + 写边界不变式 + `/swf audit`（R1–R6）；验收只认 authenticated 或 host-claimed+人工确认 | **真实增量**（证据纪律） |
| 经济性硬路由 | tokenMeter 计量存在，但无策略层决策 provider/model/effort、无 no-fallback、无档位封顶 | Flash 执行档、复杂度→effort 映射、预算封顶→manual_pending、deep 档显式确认；codex/claude-code 仅 packet 显式要求 | **真实增量**（成本控制） |
| candidate→人类 accept 生命周期 | approval 服务是工具级 gate，不与任务验收生命周期（candidate 判定→hash 验→证据态→durable acceptance）绑定 | 完整验收链与 durable acceptance 证据 | **真实增量**（交付治理） |
| 每任务一个能力包（dev/office/safety 质量契约） | skills 服务可挂载，但「一包一任务」的路由是策略而非机制 | vendored 能力契约 + 适配前言，packet 绑定能力 | 部分增量（契约品质，非机制） |

### 3.3 从 SWF 的实现角度：代价与无增量点【SWF-local + 分析】

1. **执行原语无增量**：dsh 下的可见 worker 就是 ctx.subagents 派发的 subagent——与 dsh 原生后台委托是**同一原语**。SWF 围绕它加的是一层证据簿记与 gate，不新增执行能力。SWF 在 Codex 下的差异化原语（静态 role 配置、no-fallback、认证级证据）在 dsh 下不存在对应物。
2. **证据上限封顶在 host-claimed**：dsh 没有 Codex 式认证级 Host 证据；`authenticated` 档在本宿主下无法自然达成（除非未来宿主提供 evidenceRef 契约）。accept 实际依赖「host-claimed + 人工确认」，其信任差与 dsh 原生「人类在 approval 里点头」差距很小——差异在于**记录的标准与可审计性**，不在于信任本身。
3. **双权威簿记**：同一任务同时有 Trio 三件套（权威）与 swf-packet.json/evidence/（派发与证据层）；两者需靠 hash 绑定维持一致。这是 08-14 报告警惕的「第二权威」风险的管理形态——管理得当（写回前必须过 hash 绑定），但多一层簿记与失败模式（如 budget 写入也要先 Trio 验 match）。
4. **仪式成本**：`/swf bind` 需要手造 8 字段 packet JSON（或 Chief 生成）；`/swf dispatch/accept/status/audit` 命令面是显式操作；对比 dsh 原生 goal 的自然语言创建与自动续轮。对 quick 任务零收益（两侧都 inline）。
5. **默认经济档重合**：本宿主默认 `opencode-go/deepseek-v4-flash` 与 SWF `FLASH_EXECUTION_MODEL` 默认一致——增量不在默认档，而在**拒绝升级与显式档位策略**。
6. **预算归因噪声**：tokenMeter 会话级聚合对任务级预算本来就是启发式；SWF 的 100k 封顶与 dsh 原生计量面对同样的归因不确定性。

### 3.4 收益分析结论

- **方向明确**：SWF-in-dsh 的收益是治理形的——确定性路由、跨会话权威、证据纪律、经济策略、验收生命周期。这些 dsh 原生模式要么没有（确定性路由本体、证据不变式、验收证据），要么是软约束（skill 文本）而非机制。
- **量级未定**：这些治理增量是否在真实任务上转化为可测收益（成功率/返工率/成本/恢复速度/范围漂移/人工介入），只读分析**无法定案**。特别是：双权威簿记与命令仪式的摩擦，可能吃掉部分治理收益；host-claimed 上限可能让验收信任差趋近于零。
- **因此下一个动作不是「采纳」而是「实地测量」**——这正是第 4 节。

---

## 4. 测试机制设计与可落地 Plan（实地测试与对比）

### 4.1 待测命题（可证伪假设）

- H1（治理保真）：插件在真实 dsh 宿主上加载后，fail-closed 路径（binding_mismatch / manual_pending / budget_exceeded / gate_approval_required / provider_unavailable / dispatch_record_unavailable）全部按代码语义触发；非 SWF 会话零拦截零写入。
- H2（质量收益）：同一批匹配任务，SWF-in-dsh 臂的候选一次验收率 ≥ dsh 原生臂，返工/范围漂移/人为返工（human interventions）≤ 原生臂。
- H3（经济收益）：SWF-in-dsh 臂的单位任务 token 消耗与成本代理 ≤ 原生臂（Flash 档 + 预算封顶 + no-fallback 生效），超预算任务比原生臂少。
- H4（恢复收益）：人工中断/会话崩溃后，SWF-in-dsh 臂按 Trio 恢复的路径清晰度与耗时优于原生 goal 再武装。
- H5（摩擦成本）：SWF-in-dsh 臂的仪式开销（packet 构造、/swf 操作、簿记）不显著吃掉 H2–H4 的收益（以命令数/人工操作数为代理）。

### 4.2 机制

- **场景套件**：复用 `scripts/evaluate-trio-v2.mjs` 的 12 场景骨架（quick-bug / tracked-feature / complex-debug / broad-refactor / cross-session-recovery / two-worker / plan-mismatch / luna-to-terra / host-unavailable / source-backed-document / formula-spreadsheet / high-risk-cleanup），为每个场景固定：任务脚本（fixture）、packet fixture（8 字段 + 绑定）、proof（确定性验证命令）、验收标准。场景本身不改，只在两臂之间换执行形态。
- **一次性工作区隔离**：每臂每任务用 `git worktree`（仓库已有 `.codex-worktrees`/`.worktrees` 模式）或 `mktemp -d` 克隆到 disposable 路径；**严禁在脏工作根直接跑 dsh 任务**（08-14 报告禁令）。Trio 权威文件在一次性工作区内生成，宿主只读挂载该工作区。
- **双臂**：
  - 臂 A（SWF-in-dsh）：`cordis.patch.yml` 挂载 `plugins/dsh/dist`（指向本仓库源码，local loader）→ `/swf bind`（packet fixture + Trio hash）→ `/swf dispatch`（真实 ctx.subagents）→ run settle → `/swf audit` + `/swf accept`（真实 dsh approval）。
  - 臂 B（dsh 原生）：同一任务脚本，用 create_goal + subagent/subagent_fork/workflow 完成，无 Trio、无 packet、无证据层；人类验收用原生 approval 通道。
  - 同机顺序执行，每轮换臂次序，工作区隔离防污染；provider/model 固定 `opencode-go/deepseek-v4-flash`，避免模型混杂。
- **采集**：每臂每任务收集——任务 token（tokenMeter 会话级读数，采样点：开始/结束）、会话 jsonl（`$DSH_HOME/sessions/.../session.jsonl.zstd` 解压抽取事件）、命令日志、人工介入次数、返工轮次、范围漂移（diff 影响面 vs packet `allowedOperations`）、耗时、证据文件（臂 A 的 evidence/ + `/swf audit` 结果）。结果统一进一个 JSONL 结果表（schema 参照 benchmark.md 的字段纪律）。
- **指标**：成功率（candidate 验收率）、返工率、范围漂移率、单位 token 成本代理、预算超限率、恢复耗时、人工介入次数、仪式开销（/swf 或对等命令数）。

### 4.3 落地 Plan（每阶段有 gate，不跨阶段）

**Phase A — 宿主接线验证（前置，需人类 gate）**
- 动作：把 `plugins/dsh` 以 local cordis patch 挂到**测试用 dsh home（或一次性 profile）**；核对真实 `subagent/start` 事件形状与 `SubagentRunInfo`、tokenMeter 语义、subagents 服务名；跑 rollout 清单 item 2（load + /swf route/bind/status + 非 SWF 直通）。
- Gate：A 全部通过；任何形状不符 → 修插件（进下一轮）或记 blocker。

**Phase B — 机制构建（本仓库内，只读宿主）**
- 动作：在 `tests/` 下新增 `dsh-fieldtest` 目录：场景套件 + packet fixture 生成器 + 一次性 worktree 启动器 + 采集器（tokenMeter/jsonl/evidence）+ 结果表校验；先用 mock 模式 RED→GREEN（复用 plugins/dsh/test 的 mock ctx）。
- Gate：机制在 mock 下自检通过；验证脚本 `pnpm` 可复跑。

**Phase C — 单任务试点（第一次真实人工 accept）**
- 动作：一个受限真实任务（如「在一次性 worktree 里给 plugins/dsh 补一个文档段落」）走完整 `/swf bind→dispatch→settle→audit→accept`；记录 rollout 清单 item 1/3/4/5 的证据。
- Gate：一次真实人工 accept 落盘 durable acceptance 证据；`/swf audit` ok。

**Phase D — A/B 对照跑（N≥3 匹配任务/臂，可多轮）**
- 动作：12 场景中选 4–6 个 tracked 场景，每臂各跑 N≥3 次（幂等任务脚本），采集 §4.2 全部指标，输出对照表。
- Gate：每臂结果可复现；指标采集无缺失；若发现机制缺陷先修机制，不修结果。

**Phase E — 判定与决策**
- 动作：汇总证据 → 对 H1–H5 逐条判定（通过/不通过/不确定+原因）→ 给出 promote（进入 Roadmap 1.0.13 selective breadth 候选）/ hold（继续修）/ rollback（保持 Codex 主线）三选一建议，交人类决定。
- Gate：人工决策 + 结论回写报告；不自动升级任何安装面。

### 4.4 风险与回滚

- 预览期漂移：已 pin rc.6 + 版本锁守卫；若 rc 升级破坏 → 守卫失败即停，不绕过。
- 宿主配置污染：Phase A 用一次性 dsh home/profile；不改本机 `~/.dsh` 主配置（本项目当前 `cordis.patch.yml` 为 `[]`，保持不动，除非人类明确授权）。
- 成本：每任务固定 Flash + maxTokens 32k + 100k 封顶；跑冒烟/试点阶段数量受控。
- 回滚：任何阶段异常 → 删一次性 worktree/测试 home，仓库侧除 reports/ 与 tests/dsh-fieldtest 外零改动。

---

## 5. 验收清单

- [ ] 审计结论（§2.4、§3.4）接受
- [ ] 四条宿主改写已在代码层强制执行的对照（§2.2）接受
- [ ] 收益分析结论「治理形收益、量级待实地测量」（§3）接受
- [ ] 测试方案（§4）接受；Phase A 是否授权（涉及一次性宿主配置）单独决策