# Copilot Planning With Files Compatibility

Copilot receives a materialized `planning-with-files` copy because its skill loading and hook behavior can differ from Codex and Claude Code.

The materialized copy must preserve:

- task-scoped planning paths,
- `task_plan.md`, `findings.md`, and `progress.md`,
- tracked-task precedence over any “straightforward work” default,
- restore-context guidance,
- sync-back behavior.

The materialized copy must also preserve the companion-plan boundary: detailed superpowers implementation plans stay in the companion artifact, while active planning files keep only durable summaries, references, and status.

The materialized copy must avoid incompatible hook assumptions, especially when Copilot uses native VS Code hook files as the primary contract and Claude-format hooks only as a compatibility surface.

Harness materializes Copilot's `planning-with-files` copy instead of linking it. During `sync`, Harness copies `harness/upstream/planning-with-files` into the Copilot skill root, applies the shared `Harness planning-with-files companion-plan patch`, and then applies the `Harness Copilot planning-with-files patch`.

`doctor` checks for both markers so a stale or manually edited copy is visible.

Target paths:

- Workspace: `.agents/skills/planning-with-files`
- User-global: `~/.agents/skills/planning-with-files`

Explicit env overrides and legacy Copilot roots remain supported for compatibility: `HARNESS_AGENT_SKILL_ROOT`, `GITHUB_COPILOT_SKILL_ROOT`, `.github/skills/planning-with-files`, and `~/.copilot/skills/planning-with-files`.
