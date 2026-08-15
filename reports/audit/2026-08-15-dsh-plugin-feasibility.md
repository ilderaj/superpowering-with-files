# SWF → DeepSeek Harness (dsh) 插件：可行性分析报告与落地计划

- 日期：2026-08-15
- 状态：待 Jared 验收（不实施）
- 决策来源：grilling 会话 4 轮，共 14 项决策，frontier 已清空
- 证据标注：【verified 本日】官方源码/registry 实测；【SWF-local】本仓库 HEAD d64ddcc 事实（harness/trio 自 c19c335 起无变更，d64ddcc 仅改 grilling skill 文档）；【假设】工程默认值（非用户决策）；【建议】推荐方案

## 0. 结论

**总体：可行，无硬阻塞，属「中高置信度实验性 v1」。** dsh 的 cordis 插件模型 + subagent 服务 + approval/skills/conversationEvents 服务面，足以承载 SWF 的规划权威、路由、Chief 决策层、skills、gate 与经济性控制。唯一无法等价的是「认证级模型证据」，已决策用三态证据降级。

上次报告（2026-08-14-deepseek-harness-feasibility.md）反对 in-harness 插件的理由是第二权威风险；本设计以「Trio 文件唯一权威 + dsh session 仅作证据」解除该反对。

## 1. 共享设计树（14 项已收敛）

1. 形态：SWF 作为 dsh 插件（cordis apply(ctx)）
2. 范围：全量策略 + 执行骨架（规划三件套、entry policy、dev/office/safety、skills、router、chiefops）
3. 权威：Trio 规划文件唯一权威，dsh session 仅作证据/执行日志
4. worker = dsh 原生 subagent（接受放弃认证级模型证据）
5. Chief 决策核心内嵌插件，dsh 主 session 当 Host/操作入口
6. skills 原样打包进插件 assets（附 dsh 适配前言，不做双副本重写）
7. worker provider 混合：默认 dsh-sdk，packet 显式要求时才用 codex/claude-code
8. 证据三态：authenticated / host-claimed / unknown；验收只认 authenticated 或 host-claimed + 显式人工确认
9. 经济性：分层模型 + 每 task 预算封顶
10. gate 双层：Trio 文件 gate registry 判定为准，dsh approval 作交互通道
11. 本地插件、代码进 SWF 仓库（plugins/dsh/）、pin 0.1.0-rc.6、暂不发布 npm
12. 触发：自动检测（planning 三件套或任务标记），非 SWF 会话透明直通
13. 验收：worker 完成 → 插件校验 hash/证据 → 人类在 dsh approval 显式 accept 才 durable done
14. 预算默认：≤2 并行 worker、约 100k tokens 封顶、deep 档额外确认、超限转 manual_pending

## 2. 证据基础

### dsh 侧【verified 本日】

来源：官方仓库 deepseek-ai/deepseek-harness（master 浅克隆，commit 47f943859bef60e4160492346772ded9b24f765a，2026-08-13 19:38 +0800）；npm @deepseek-ai/dsh 最新 0.1.0-rc.6（2026-08-15 复测：dist-tags.latest=0.1.0-rc.6，发布 2026-08-13T12:35:03Z）。

- 插件模型：TypeScript 插件导出 apply(ctx)，经 inject 声明所需服务；官方标注「技术预览、兼容性可能破坏」。
- 可注入服务实测清单：sessions、conversationEvents、agents、goals、tools、skills、llm、approval、shell、commands、sandboxPolicy、sessionQuery、compaction、tokenMeter、fs、subprocess、inputTriggers、sessionPersistence。
  - conversationEvents + sessions：自动检测/拦截可行（决策 12 的根据）。
  - approval：人类 gate 交互通道（决策 10、13 的根据）。
  - skills：挂载 vendored skills（决策 6 的根据）。
  - tokenMeter：预算封顶（决策 9、14 的根据）。
- subagent 服务 ctx.subagents：多 provider 实测存在——subagent-dsh-sdk（子 dsh 运行时、显式声明 model、默认 deepseek-v4-flash）、subagent-codex（真 codex app-server --stdio 子进程）、subagent-claude-code、in-process driver；每次派发携带 {provider, model, maxTokens}，subagent 有独立 SessionId 与自身会话日志，可 followup/interrupt；全局工具 send_message / interrupt_agent。
- 版本风控：rc.6 与 master 均在本周内变动，必须 pin + lockfile（决策 11 的根据）。

### SWF 侧【SWF-local】

- harness/trio/core/routing.mjs 是唯一决策层：8 字段不可变 Assignment Packet 以 sha256 绑定三个规划文件；严格可见 worker，无法认证即 manual_pending；无原生 fallback；actual model/effort 无认证 Host 证据时保持 unknown。
- 核心资产：harness/trio/core/{authority,read,routing,store}.mjs、hosts/{codex,generic}.mjs、config.mjs、projection.mjs、governance/chiefops/SKILL.md、.agents/skills/trio/{SKILL,dev,office,safety}、templates/{entry-policy,task_plan,findings,progress}.md。
- 本仓库尚无任何 dsh 插件代码，无既有 adapter/bridge。

## 3. 分系统可行性

| 子系统 | 结论 | 依据/降级点 |
| --- | --- | --- |
| 规划权威 + hash 绑定路由 | 高可行 | 纯决策逻辑移植 TS，golden 测试对照现有 routing.mjs；binding_mismatch 立即停 |
| skills + capability packs | 高可行 | dsh skills 服务可挂载；原样 vendored + 适配前言 |
| Chief 决策核心 | 高可行 | intake/route/plan/gate/验收判定是纯函数层，无宿主依赖 |
| worker 执行体 | 中可行·降级 | subagent 即 worker，证据仅 host-claimed（SessionId+provider+declared model） |
| 人类 gate | 中可行 | approval 服务存在；双层判定需适配 dsh preset 语义 |
| 经济性控制 | 高可行 | tokenMeter + 派发参数封顶 + 超限 manual_pending |
| 触发与验收 | 高可行 | conversationEvents 自动检测 + approval 人工 accept |

## 4. 必须正式改写的 SWF 规则

这些改写是本设计的前提，不是隐藏行为，实施时必须写入插件文档：

- 「可见 worker」重定义：在 dsh 宿主下，可见 worker = 经 ctx.subagents 派发且记录 {SessionId, provider, declared model} 的 subagent。无记录直接派发 = silent fallback，一律禁止。
- actual=unknown 三态化：新增 host-claimed 态，永远不得写成 authenticated。
- approval_policy=never 语义：映射为 dsh approval preset + 高风险类强制 manual_pending，不复刻 Codex 专属字段。
- 「不得用原生 subagent 顶替执行 worker」重述：在 dsh 宿主下改为「不得用无记录 subagent 顶替可见 worker」，意图（防静默降级）保留。

## 5. v1 明确不做/做不到

- 认证级模型与 effort 证据（→ host-claimed）。
- Codex Host 专属证据字段。
- 跨宿主 worker 身份互通（SWF 在 Codex 下仍走原 Host 语义，插件只管 dsh 侧）。
- npm 发布与自动升级（rc 期锁版本）。

## 6. 主要风险

- 上游 rc 期 weekly breaking → pin + 升级必须过测试门。
- ChatGPT 配额 → 默认 dsh-sdk/deepseek 档；codex provider 仅在 packet 显式要求时启用。
- 第二权威回归 → 任何 dsh 侧写回必须先过 Trio hash 绑定。
- dsh 文档站 2026-08-15 曾现瞬时 SSL 抖动 → 证据已改由官方源码克隆取得，不构成阻塞。

## 7. 落地计划（每阶段有 gate，不跨阶段）

- **Phase 0 — 决策核心移植**（无 dsh 依赖）：plugins/dsh/ 建仓、pin rc.6、routing.mjs 决策核心转 TS，TDD golden 测试（基线 → 对抗用例 → 最小绿）。Gate：binding_mismatch/fail-closed 行为与现状逐一对照通过。
- **Phase 1 — 插件骨架**：apply(ctx) + 服务注入（conversationEvents/sessions/skills/commands/tokenMeter/approval）、vendored skills、自动检测触发、/swf 命令面、packet 落盘 planning/active/<task-id>/、三态证据记录。Gate：一个受限 task 手动冒烟 + 非 SWF 会话直通验证。
- **Phase 2 — worker 与 gate 接线**：ctx.subagents 混合 provider 路由、预算封顶、双层 gate、candidate→人类 accept 流程。Gate：一个冻结路径的 RED→GREEN 切片 + 一次真实人类 accept 记录。
- **Phase 3 — 加固与 rollout**：锁版本升级门、证据审计、skills 适配前言、重定义规则写入文档、manual_pending fail-closed 回归。Gate：Jared review + 验收。

**全程 stop conditions**：任一规划文件 hash 不符 → 停；worker 身份无记录 → manual_pending；预算超限 → manual_pending；gated 类别无 approval → 停。

## 8. 工程假设（非用户决策）

- 插件名 swf-dsh；代码放 plugins/dsh/。
- Assignment Packet 以 JSON 存于 planning/active/<task-id>/。
- 直通检测 = planning 三件套或 .swf-task 标记存在。
- worker 证据写入 planning 目录 evidence 文件。

## 9. 验收清单（Jared）

- [ ] 14 项设计树无分歧
- [ ] 证据类别（verified/SWF-local/假设/建议）接受
- [ ] 第 4 节四条规则改写接受
- [ ] 预算默认值与 stop conditions 接受
- [ ] Phase 0 是否单独授权执行
