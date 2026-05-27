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
- 共享的 `Shell And Token-Saving Preferences` 已经存在于 canonical policy 与当前投影产物中，不再只是待实施方向；`policy-render` 与 `context-budget` 相关测试当前通过。
- 当前仓库实测的 always-on entry 体量并不高：Codex 约 1230 tokens、Copilot 约 1024、Cursor 约 1237、Claude Code 约 1222，均远低于 entry budget。
- 当前最显著的预算异常是 Copilot hook payload 汇总约 720 tokens，超过其专用 `hookPayload` problem 阈值 500；但单个 hook 事件均未单独超限。
- 当前 planning hot context 约 245 tokens、skill profile discovery 约 225-226 tokens，均远低于预算，说明 planning 摘要本身不是当前主矛盾。
- 当前 hook payload 实测只覆盖 `codex`、`copilot` 以及 `superpowers`、`planning-with-files` 两类 skill，`cursor`、`claude-code` 仍缺同等级运行时测量证据。

## Phases

### Phase 1 — Capture Initial Analysis
**Status:** complete
- [x] 记录已完成的分析报告。
- [x] 记录官方文档/研究员核查摘要。
- [x] 记录当前本地 harness 状态。

### Phase 2 — Evidence Expansion
**Status:** pending
- [ ] 补充每个 IDE/CLI 的官方文档原文摘要与链接。
- [ ] 标注哪些能力是官方支持，哪些只是 prompt-level 指导。
- [ ] 补充 Codex Reddit 方法的第三方验证出处，如能找到原帖。

### Phase 3 — Local Dry-run Measurements
**Status:** pending
- [ ] 设计不改代码的小范围输出量测方法。
- [ ] 对典型命令测量 full output vs capped output 的 bytes/token 粗估。
- [ ] 分别覆盖 grep/search、test/build、diff/log、JSON/curl 类命令。

### Phase 4 — Candidate Optimization Analysis
**Status:** pending
- [ ] 比较 byte cap、smart wrappers、IDE-native truncation、ignore/exclude、thin projection、summary compaction 的收益与风险。
- [ ] 评估哪些优化不会降低 harness 有效性。
- [ ] 形成后续可执行方案候选，但执行前需另行确认。

## Open Questions
- Codex lifecycle hooks 是否能安全实现命令输出强制 cap，而不是仅依赖 `AGENTS.md` 软约束？待官方文档和小测验证。
- Claude Code hooks 是否适合默认启用，还是应保持 opt-in？待评估维护成本与误伤风险。
- Cursor 是否有官方 command output truncation 或只可通过 rules/ignore/sandbox 间接控制？待补充。
- Gemini CLI `tools.truncateToolOutputThreshold` 对所有 tool output 的实际行为边界是什么？待 dry-run。
- OpenCode plugins 是否值得用于强制输出裁剪，还是 `compaction.prune` + rules 足够？待评估。
- `readHarnessHealth()` 当前对 hook payload 的预算判定是否高估了 Copilot 的真实单次注入成本，因为它按 target 聚合了 `SessionStart`、`UserPromptSubmit`、`Stop` 等不同生命周期事件？待确认预算语义。
- Copilot 当前 hook payload `problem` 是否应通过缩减 hook 文本解决，还是应改写汇总/阈值模型以反映 per-event 而非 cumulative 成本？待进一步证据。
- `cursor` 与 `claude-code` 的 hook payload 未纳入当前实测集合，现有“跨 IDE 成本结构”结论是否因此偏向 Codex/Copilot？待补齐。
- companion plan `docs/superpowers/plans/2026-05-20-harness-token-output-compression-plan.md` 当前缺少回指 `planning/active/harness-token-cost-analysis/` 的信息，是否说明执行状态与 planning sync-back 已失真？待整理。

## Decision Log
| Time | Decision | Rationale |
|---|---|---|
| 2026-05-20 14:39:18 UTC+8 | 建立 tracked planning 任务 `harness-token-cost-analysis` | 用户明确要求后续会多次脑暴和分析，需要持久化上下文。 |
| 2026-05-20 14:39:18 UTC+8 | 当前只记录分析，不执行改造 | 用户要求不要直接出方案和执行，先详细分析。 |

## Companion Plan
- Path: `docs/superpowers/plans/2026-05-20-harness-token-output-compression-plan.md`
- Summary: Implement shared cross-IDE shell output compression guidance through existing Harness policy projections, with render and budget tests.
- Sync-back status: implementation plan recorded; execution not started.

## Plan Record: 2026-05-20 22:50:45 UTC+8

### Phase 5 — Implementation Plan For Safest Direction
**Status:** complete
- [x] Selected one safest token-compression direction for current four IDE targets.
- [x] Wrote companion implementation plan.
- [x] Synced summary back into tracked planning files.

## Plan Record: 2026-05-27 11:11:54 UTC+8

### Phase 6 — Refresh Runtime Evidence Baseline
**Status:** in_progress
- [x] 对照当前仓库状态复核 tracked findings 与 companion plan 假设。
- [x] 实测四个当前目标的 always-on entry 体量。
- [x] 实测当前 context health 中的 entry、hooks、planning hot context、skill profile 摘要。
- [x] 区分 hook 汇总中的“多事件累计成本”与“单次 prompt 实际注入成本”，尤其是 Copilot。
- [x] 为 `cursor`、`claude-code` 补齐 hook payload 的等价运行时证据，或明确记录为何暂不支持同样测量。
- [x] 对典型 shell 输出类别做 repo 内实测，验证当前 `head -c` / wrapper 结论的真实收益与误伤边界。
- [ ] 将新增证据收敛为后续研究/实施候选排序，继续保持不直接执行改造。

## Plan Record: 2026-05-27 11:36:11 UTC+8

### Evidence Baseline Addendum
- Copilot hook payload 的 `problem` verdict 来自 target turn cumulative total：当前约 `715` approx tokens；最大单事件为 `Stop` 约 `277` tokens，单事件未触发 problem。
- 当前 health ledger 将 Cursor 与 Claude Code hook turn 记为 `0`，但手动执行已投影 hook runtime 后发现二者并非无成本，而是未纳入自动测量。
- Cursor/Claude Code 的 upstream superpowers `SessionStart` 当前各注入约 `1408` approx tokens，是未被 health 捕捉的 bootstrap 热点。
- planning hot context 将三个 tracked planning 文件约 `5867` approx tokens 压缩到约 `220` tokens，约 `26.7x`；但本轮发现 parser 对普通 `Status:` phase 行不敏感，可能产生轻量但陈旧的 hot context。
- shell 输出测量显示 `git ls-files` 全量约 `79,298` approx tokens，`head -c 4000` 或 tail 类压缩可节省约 `99%`；focused installer tests 仅约 `334` tokens，压缩无收益。

## Plan Record: 2026-05-27 13:16:04 UTC+8

### External Comparator Addendum — Waza
- 用户要求只分析 `https://github.com/tw93/Waza` 与 SuperpoweringWithFiles 的异同及可借鉴点，不执行实现改造。
- 已完成 Waza 只读浅克隆和文档/skill/脚本检查。
- Waza 被归类为轻量 skill distribution/toolkit comparator，而不是 multi-target governance harness comparator。
- 可借鉴方向已记录到 `findings.md`，实现仍不在本阶段范围内。

## Plan Record: 2026-05-27 13:46:07 UTC+8

### Phase 7 — Implementation Plan For Token-Cost And Waza Patterns
**Status:** waiting_review
- [x] 基于本轮 token-cost 证据和 Waza 对照结论选择可执行改造范围。
- [x] 将高置信 token 优化收敛到 compact superpowers hooks、all-target hook measurement、worst-event hook budget accounting、planning hot context next-step 修复。
- [x] 将 Waza 借鉴点收敛为 lazy skill outcome contracts 与静态契约测试，避免增加 always-on prompt 体量。
- [x] 写入 companion implementation plan，等待用户 review。

## Additional Companion Plan
- Path: `docs/superpowers/plans/2026-05-27-harness-token-cost-waza-optimization-plan.md`
- Summary: Implement compact Cursor/Claude superpowers session-start hooks, all-target hook payload measurement, worst-event hook summary accounting, current-phase planning hot context next-step selection, and Waza-style outcome contracts for Harness-owned lazy skills.
- Sync-back status: plan created for review; implementation not started.
