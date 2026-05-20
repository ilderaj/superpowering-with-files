# Task Plan: Harness Token Cost Analysis

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Plan Record: 2026-05-20 14:39:18 UTC+8

## Goal
建立一个可持续追踪的分析工作区，用于记录 harness 框架在普通直接任务与复杂 superpowers/harness 任务中的 token 开销结构、IDE/CLI 差异、已验证的降耗方法，以及后续脑暴/实测结论。

## Scope
- 分析普通直接任务与复杂 superpowers/harness 任务的整体 token 成本构成。
- 记录不同 IDE/CLI 的官方上下文入口、规则文件、hook/settings 能力，以及对命令输出截断策略的兼容性。
- 评估 Reddit 图片中 Codex `AGENTS.md` byte-cap 方法的有效性与局限。
- 后续继续补充 dry-run、小范围验证、方案候选与风险评估。

## Non-Goals
- 本阶段不直接修改 harness 实现。
- 本阶段不直接生成降耗实施方案或执行改造。
- 不基于猜测写结论；所有判断必须标注证据来源、dry-run 结果或“待验证”。

## Current Findings Summary
- 本地 harness doctor 已通过。
- 本地 sync dry-run 显示 targets 包括 `codex`、`copilot`、`cursor`、`claude-code`，计划生成/同步 entry files、hooks、hook scripts 等 projection artifacts。
- 普通任务 token 主要来自基础提示、用户需求、少量文件读取、shell 输出和最终回复。
- 复杂 superpowers/harness 任务额外引入 planner/developer/evaluator、planning files、findings/progress、IDE-specific projection、skills/superpowers、验证与 retry loop，因此成本是阶段叠加而不是线性增加。
- 最大不可控 token 来源是 shell/tool output，而不是规划文本本身。
- Reddit 图片中的 `COMMAND 2>&1 | head -c 4000` 对 Codex `AGENTS.md` 属于有效的 prompt-level 行为指导，但不是硬约束。
- 不同 IDE/CLI 应使用不同 native 入口：Codex/OpenCode 用 `AGENTS.md`，Claude Code 用 `CLAUDE.md`/`.claude/rules`，Cursor 用 `.cursor/rules`/`AGENTS.md`，Gemini CLI 用 `GEMINI.md`/settings/hooks。

## Phases

### Phase 1 — Capture Initial Analysis
Status: complete
- [x] 记录已完成的分析报告。
- [x] 记录官方文档/研究员核查摘要。
- [x] 记录当前本地 harness 状态。

### Phase 2 — Evidence Expansion
Status: pending
- [ ] 补充每个 IDE/CLI 的官方文档原文摘要与链接。
- [ ] 标注哪些能力是官方支持，哪些只是 prompt-level 指导。
- [ ] 补充 Codex Reddit 方法的第三方验证出处，如能找到原帖。

### Phase 3 — Local Dry-run Measurements
Status: pending
- [ ] 设计不改代码的小范围输出量测方法。
- [ ] 对典型命令测量 full output vs capped output 的 bytes/token 粗估。
- [ ] 分别覆盖 grep/search、test/build、diff/log、JSON/curl 类命令。

### Phase 4 — Candidate Optimization Analysis
Status: pending
- [ ] 比较 byte cap、smart wrappers、IDE-native truncation、ignore/exclude、thin projection、summary compaction 的收益与风险。
- [ ] 评估哪些优化不会降低 harness 有效性。
- [ ] 形成后续可执行方案候选，但执行前需另行确认。

## Open Questions
- Codex lifecycle hooks 是否能安全实现命令输出强制 cap，而不是仅依赖 `AGENTS.md` 软约束？待官方文档和小测验证。
- Claude Code hooks 是否适合默认启用，还是应保持 opt-in？待评估维护成本与误伤风险。
- Cursor 是否有官方 command output truncation 或只可通过 rules/ignore/sandbox 间接控制？待补充。
- Gemini CLI `tools.truncateToolOutputThreshold` 对所有 tool output 的实际行为边界是什么？待 dry-run。
- OpenCode plugins 是否值得用于强制输出裁剪，还是 `compaction.prune` + rules 足够？待评估。

## Decision Log
| Time | Decision | Rationale |
|---|---|---|
| 2026-05-20 14:39:18 UTC+8 | 建立 tracked planning 任务 `harness-token-cost-analysis` | 用户明确要求后续会多次脑暴和分析，需要持久化上下文。 |
| 2026-05-20 14:39:18 UTC+8 | 当前只记录分析，不执行改造 | 用户要求不要直接出方案和执行，先详细分析。 |
