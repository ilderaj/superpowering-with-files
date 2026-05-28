# Findings: CC Harness Analysis

## Findings Record: 2026-05-27 16:03:23 UTC+8

- 本次任务要求只做分析，不修改源代码。
- 需要重点判断：项目是否实际支持 Claude Code，而不是仅在文档或计划中声明支持。
- `uv run python /Users/jared/.claude/skills/planning-with-files/scripts/session-catchup.py $(pwd)` 在当前沙箱下因访问全局 uv 缓存被拒绝，未取得 catchup 报告。

## Findings Record: 2026-05-27 17:58:28 UTC+8

- 已确认 Claude Code 适配优化 plan 的核心目标是修正证据语义，而不是默认开启 hooks。
- Companion plan 已保存到 `docs/superpowers/plans/2026-05-27-cc-harness-analysis.md`。
- Plan 重点覆盖：`health.mjs` 的 Claude Code payload measurement、hook evidence 分层、doctor/verify/adoption 输出语义、settings mismatch 测试、Claude Code hooks 文档边界。
- 当前状态是等待用户 review；未执行任何 implementation code 修改。

## Findings Record: 2026-05-27 22:54:32 UTC+8

- 用户已明确要求在新 worktree 中执行 companion plan，可视为对 review checklist 的执行批准。
- 已创建隔离 worktree：`.worktrees/202605271452-cc-harness-analysis-001`，对应分支 `202605271452-cc-harness-analysis-001`。
- 在新 worktree 中运行 `npm install --no-audit --no-fund && npm test`，基线通过，可把后续失败归因到本次改动。

## Findings Record: 2026-05-27 23:41:40 UTC+8

- `health.mjs` 现在把 Claude Code hook 证据拆分为 config-level verified 与 runtime not measured，并把 local payload evidence 通过共享 summary 提供给 doctor/verify/adoption。
- Claude Code local hook payload measurement 需要目标环境变量参与，否则 `superpowers` 的 `session-start` 会退回 top-level `additionalContext` 输出；已通过 target-aware measurement env 修正根因。
- reviewer 指出的非 Claude hook problem 文案扩散问题已收敛：只有 `claude-code` 缺失 settings hook 时才附带 `.claude/settings.json` / `~/.claude/settings.json` 目标路径提示。
- 文档现已明确四层验证边界：projection、settings hooks、local payload、runtime invocation；`doctorPassed` 不再被表述成 runtime proof。
