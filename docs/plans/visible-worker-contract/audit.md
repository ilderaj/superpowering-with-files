# Visible worker 契约审计

## 结论

> 2026-09-06 scope addendum：实施只覆盖 Root Harness 与 Codex adapter。DSH 的审计事实保留为历史依据，但 `plugins/dsh/**` 的 source、tests、docs、projection 和 parity 全部排除；后续可单独决定是否 deprecated DSH support。

当前问题不是单一 Host 工具缺失，而是三个时期的语义叠在一起：早期把用户可见 Codex session 当作 Chief 可调度 worker；Trio v2 将该意图编码为 `visible_worker_required`；Astra 简化把普通工作改为 direct/native-first，却保留了 strict 兼容分支。仓库随后又在 DSH 中把 `ctx.subagents` 产生的子代理称为 visible worker。

结果是：根路由禁止 native 替代 strict-visible，但没有生产调用者执行这个路由；DSH 的真实 dispatch 不调用该路由，反而把 persona-bound subagent 当作 visible worker。继续补 Host bridge 会恢复已经被简化方向淘汰的控制面，也无法解决不同 Host 对“visible”的不同定义。

应当在 Root Harness 退役 active strict-visible execution contract，并保留最小 legacy parser/evidence vocabulary。direct/native-first、Trio 权威、权限 envelope、requested/actual 证据、候选验收和 `manual_pending` 都继续保留。DSH 不作为本次实施或验收的一部分。

## 证据链

### 历史演进

| 时期 | 已发生变化 | 当前含义 |
| --- | --- | --- |
| 2026-07 | Chief worker 设计把用户可见 session 当作受控执行者 | 依赖当时 Host 能让 Chief 自主创建和管理其他任务 |
| 2026-08 | Trio v2 引入 `visible_worker_required`、fail-closed、worker identity 和 lifecycle descriptors | 建立了强约束，但 decision descriptor 不等于 Host 执行器 |
| 2026-09-04 | Corleone/DSH bridge repair 补 packet-derived identity、persona 和 provider gate | 修复了当时契约内的接缝；没有证明 DSH subagent 与 Codex visible task 等价 |
| 2026-09-06 | Astra simplification 使普通工作 direct/native-first、模型与角色解耦 | strict-visible 只剩显式兼容；普通版本不应重建或等待 bridge |
| V1.3 | H1 从 strict Host gate 改为 default/native continuation，E7 7/7，E8 接受 | 证明当前产品路径不依赖 visible worker |

### 当前实现矩阵

| 层 | 当前事实 | 判断 |
| --- | --- | --- |
| `harness/trio/core/routing.mjs` | 定义 `default/visible_worker_required` 和 `visible_worker/native_subagent/manual_pending`；strict 缺能力时 fail-closed | 有价值的纯决策与兼容测试；没有连接 Host 生命周期的生产 caller |
| `harness/trio/hosts/codex.mjs` | 选择 Corleone identity，渲染 handoff/role 文件 | 请求与配置生成器；不创建、等待或控制 Codex task |
| Codex Host 当前工具 | native subagent 可用于内部 helper；独立 task 只能在用户明确要求时创建 | visible task 是用户所有的独立工作单元，不是可被 harness 默认调度的 child |
| `plugins/dsh/src/core/routing.ts` | root routing 的 TypeScript port | parity/纯决策面；不是实际 dispatch 的 admission gate |
| `plugins/dsh/src/dispatch.ts` | 直接读取 packet、解析 persona 后调用 `subagents.start` | 真实执行面；目前绕过 strict root route，并将 subagent 描述为 visible worker |
| DSH persona gate | 所有 dispatch 都要求 provider `capabilities.persona === true` | 与模型/角色解耦冲突；persona 缺失不应阻塞普通 native 执行 |
| DSH start evidence | SDK 承诺 one-shot `start` 同步发出 `subagent/start`；`event.runId` 是 lifecycle run id，`event.id` 与 `SubagentRun.id` 是 child session id。当前 dispatcher 却允许 event 缺失或 registry provider 不匹配后继续 | 证据实现与依赖契约不一致；必须以 `event.id === String(run.id)` 和 registry provider 匹配 event，并单独保存非空 `event.runId`，否则 dispose 并 pending |
| 文档/投影 | 同时存在 direct/native-first、strict-visible 和“subagent 是 visible worker” | 对使用者和执行者形成三套不兼容心智模型 |

### 已验证的直接矛盾

1. Root strict：`visible_worker_required` 不允许 native fallback。
2. Root execution：仓库命令和 Host adapter 没有调用 `resolveHostOperation` 去执行生命周期；descriptor 仍是非执行结果。
3. DSH execution：`dispatchWorker` 不调用 ported `resolveHostOperation`，并对 strict packet 选择 Don persona 后调用 `subagents.start`。
4. Host semantics：当前 `create_thread` 只用于用户明确要求的新任务；当前任务的子工作使用 multi-agent subagent。
5. Persona：身份标签不能证明 visible、模型、effort、权限或实际执行；把 persona capability 设为普通 dispatch 的硬门会增加无价值阻塞。
6. Evidence：DSH 的 `run.id`/`event.id` 标识 child session，`event.runId` 标识该次 lifecycle；匹配的同步 event 能证明 Host 接受了一个具体 subagent run。packet provider/model 仍只是 requested/declared，不能据此填写 actual model/effort。

### 当前兼容库存

2026-09-06 对 `planning/active/*/swf-packet.json` 的只读扫描只发现两份 packet：

- `swf-visible-worker-bridge-repair-20260904` 含 `visible_worker_required`，但没有任何 evidence 文件或可验证 Host handle；
- `swf-coding-harness-implementation-20260904` 含旧值 `direct_tracked`，同样没有 evidence 文件。

因此当前没有需要保留 continue/status/collect/interrupt Host 执行兼容的活跃 visible lifecycle。历史 packet 可继续由只读 status 命令解释；任何 Host lifecycle、DSH dispatch 或 acceptance 都必须先由当前 authority 显式 rebind。实施开始时仍需重扫一次，若出现可信 active handle 则停止切换并先制定单项收尾方案。

### Source 到证据边界

| 阶段 | 可信来源 | 可以声明 | 不可以声明 |
| --- | --- | --- | --- |
| requested | packet、用户输入、Corleone selection | requested model/effort/persona/topology | actual Host 状态 |
| resolved | root/DSH pure routing | route、blocker、requested provider | 已执行、可见 |
| started | DSH `SubagentRun.id` + 匹配的同步 `subagent/start` | Host 接受了该 native subagent run、registry provider | actual model/effort、用户可见 task |
| completed | paired run settlement + worker-result | native candidate 已结束及 stop reason | Chief/human 已接受 |
| accepted | Trio/digest/evidence gate + human/Chief acceptance | 候选被当前 authority 接受 | 用户已经看到交付物 |
| delivered | Host/UI 的实际打开、发送或可见状态 | 对应交付动作已发生 | 其他未观测渠道也已送达 |

## 选择比较

| 方案 | 收益 | 代价与风险 | 结论 |
| --- | --- | --- | --- |
| 重建专用 visible-worker bridge | 让旧 strict 文案再次可执行 | 恢复 Host 控制面、依赖未承诺的 task API、违背 direct/native-first、增加调度与状态复杂度 | 拒绝 |
| 一次删除所有 visible 字段和值 | 最快清理表面复杂度 | 旧 packet/证据无法解释，可能中断已有 lifecycle，扩大版本兼容风险 | 拒绝 |
| 退役新 spawn，隔离 legacy，拆分 visible task 与 native helper | 消除当前假契约；保留历史和收尾；顺着 Astra 简化 | 需要同时修 root、DSH、测试、文档和旧 Trio disposition | 采用 |

## Root 目标边界

### 保留

- `quick/tracked`、direct completion 和 delegated candidate acceptance。
- 三份 Trio 文件作为唯一 durable task authority。
- packet digest、authority binding、scope/sandbox/approval、path envelope、lane reservation 和 human gates。
- requested model/effort 与 authenticated actual evidence 分离。
- native subagent 的 proper-subset 范围和父执行者整合责任。
- `manual_pending` 作为真实、可恢复 blocker。
- Corleone roster 作为可选 persona/历史兼容配置；persona 不决定模型或拓扑。

### 退役为 legacy-only

- 新 packet 中的 `primaryExecution = visible_worker_required`。
- resolver 新产出的 `visible_worker` route；该值只保留为历史 evidence vocabulary。
- Don Michael 与 strict-visible 的自动绑定。
- “Chief 必须通过 visible worker 执行生产修改”的一般规则。
- 将 DSH recorded subagent 等同于 visible worker 的文案和验收。

### 保留到兼容库存清零

- 解析历史 `visible_worker_required` 值，以返回稳定迁移 blocker。
- 读取历史 `routeKind = visible_worker` evidence。
- 允许只读 status/inspection 展示旧 packet/evidence；Host lifecycle 和 DSH dispatch/accept 必须先显式 rebind。当前库存没有可信 active Host handle，不保留 dormant lifecycle 执行分支。
- 现有 `worker` evidence 文件名/字段先保持 wire compatibility；文案改为 delegated-run evidence。

### DSH disposition

DSH 当前的 dispatch/persona/evidence 问题不在本次修复范围内。计划不修改、不测试、不投影 `plugins/dsh/**`，也不要求 root/DSH parity。Root 收敛完成不代表 DSH 已适配；后续若 deprecated DSH support，应另起任务处理删除、迁移和用户影响。

### Host 外部动作

用户明确要求“新建一个任务”时，Host 可以创建用户可见独立任务。该动作不表示当前任务已分派内部 worker，不自动继承父 Trio、授权、acceptance 或 completion，也不作为 strict packet 的替代实现。

## 旧任务 disposition

| 任务 | 当前事实 | 实施阶段建议 |
| --- | --- | --- |
| `swf-visible-worker-bridge-repair-20260904` | Phase 1–5 已接受；Phase 6 仍要求所有 wave 使用 real visible workers | 保留修复证据，标记 Phase 6 被 Astra/V1.3 supersede，任务完成并可归档 |
| `visible-worker-lifecycle-bridge-20260809` | 本地 fail-closed 证明完成；Host bridge 和 strict empirical units 长期 pending，且仍使用 `swf_executor` | 标记剩余 units superseded；不再等待 Host bridge，任务完成并可归档 |
| `swf-coding-harness-upstream-implementation-20260903` | 被 strict unavailable 阻塞，但后续 execution task 已完成并合入 | 记录 successor completion，关闭过时 blocker；是否归档按统一 lifecycle cleanup 执行 |
| `swf-coding-harness-implementation-20260904` | 已 closed，产物已经进入 main/global adoption | 仅修正文档中的全-visible 叙述；不重写执行证据 |
| `chief-worker-session-routing-issue-20260709` | 已 closed，任务仍留在 active 目录 | 保留历史；目录迁移另由统一 archive cleanup 处理 |

## Roadmap 影响

- V1.3：保留已接受的 default/native H1；只补 errata，说明旧 strict-unavailable 是历史兼容证据，不重跑或改写。
- V1.4 preflight：完成本契约收敛；V1.4 主线无需新增 worker 系统。产品/业务/office 试点使用当前主任务或 bounded native helper；交付仍按 generated/opened/rendered/accepted/delivered 分层。
- V2.0：经济协作只比较 direct/native helper 和用户明确创建的独立任务。后者是不同的工作组织方式，不能混入 subagent 成本或完成率。

## 风险与未知

- 当前工作区包含 V1.3 和其他未提交变更；未来实现必须使用精确 allowlist 或隔离 worktree，不能清理现有状态。
- Root routing 和 DSH port 当前存在 parity 关系，但本次用户明确排除 DSH；因此 Root tests 不能继续把 DSH parity 当作 acceptance gate。该已知分叉必须在 DSH 的独立弃用/迁移决定中处理。
- 当前扫描未发现可信 active legacy Host handle；实施开始时必须重扫。若库存发生变化，停止切换并先处理该单项，不因此恢复通用 bridge。
- 不需要提高整个 packet envelope 版本：`visible_worker_required` 本身足以识别本次 legacy contract。把所有 version 1 packet 一概判旧会误伤同版本的其他历史值并扩大迁移面。
