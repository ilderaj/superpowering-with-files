# Findings
- Worktree base: `codex/global-context-remediation @ 5d1bc98a8c9fd6a9734bbd5c16428918daef3f32`
- `health.context.warnings` 承载 budget warning / problem；`doctor` 仍以 `health.problems` 作为失败条件。
- `harness/core/context-budgets.json` 先作为 canonical metadata，覆盖 `entry` / `hookPayload` / `planningHotContext` / `skillProfile` 四类预算。
- 现有 `planning/active/global-rule-context-load-analysis/progress.md` 属于并行任务，不应触碰。
