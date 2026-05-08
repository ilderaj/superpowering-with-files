# Findings: Companion Plan Warning Governance

## Verified Findings

- 已确认：4 月 11 日与 4 月 19 日相关 warning 的根因不是缺少 task 关系，而是 active task / companion plan 使用了不被 `plan-locations.mjs` 识别的普通文本或 blockquote 格式；改成 canonical label（`Companion plan:` / `Active task path:`）后即可被 health 正确认领。
- 已确认：`docs/superpowers/plans/2026-04-26-cross-ide-hook-capability-alignment.md` 已被 active task 引用，但原先只在 blockquote 里写 `Active task path:`，health 不会解析；补 plain list label 后可消除 missing-back-reference warning。
- 已确认：`docs/superpowers/plans/2026-04-20-global-auto-apply-adoption.md` 与 `docs/superpowers/plans/2026-04-25-agent-safety-harness.md` 是已归档任务的历史 companion artifact。要消除 orphan warning，应把它们迁到各自 `planning/archive/<timestamp-task>/companion_plan.md`，而不是伪造新的 active task 引用。

## Open Threads

- None.