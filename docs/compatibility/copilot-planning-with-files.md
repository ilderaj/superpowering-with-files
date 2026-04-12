# Copilot Planning With Files Compatibility

Copilot receives a materialized `planning-with-files` copy because its skill loading and hook behavior can differ from Codex and Claude Code.

The materialized copy must preserve:

- task-scoped planning paths,
- `task_plan.md`, `findings.md`, and `progress.md`,
- restore-context guidance,
- sync-back behavior.

The materialized copy must avoid incompatible hook assumptions.

Harness materializes Copilot's `planning-with-files` copy instead of linking it. During `sync`, Harness copies `harness/upstream/planning-with-files` into the Copilot skill root and applies the `Harness Copilot planning-with-files patch` marker. `doctor` checks for that marker so a stale or manually edited copy is visible.

Target paths:

- Workspace: `.github/skills/planning-with-files`
- User-global: `~/.copilot/skills/planning-with-files`
