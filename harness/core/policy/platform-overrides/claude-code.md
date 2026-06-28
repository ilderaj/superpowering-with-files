# Claude Code Override

Claude Code can use `CLAUDE.md`, skills, plugins, and hooks.

Render a thin `CLAUDE.md` entry file and materialize per-skill projections under `.claude/skills`. Do not install or mutate hooks unless the user explicitly selects hook installation.

Claude Code does not ship a native long-running goal executor like Codex `/goal`. When a goal-like continuation flow is active (for example the `ralph-loop` plugin or a `/goal` skill), apply the Goal Round Start Protocol at each observable round, checkpoint, or phase boundary: restore the task-scoped planning files, reclassify the current round, keep quick rounds lightweight, and sync durable state back to `planning/active/<task-id>/`.

Hooks in Claude Code are settings-backed (`.claude/settings.json`). They are inert until Claude Code settings reference them through the `hooks` field; projected scripts alone do not prove live runtime invocation. Treat `doctorPassed` as a Harness health check, not as evidence that a live Claude Code session has invoked a hook.

For leaf workspaces (for example opening `packages/demo/`), Claude Code still uses the current git worktree root as the default authority root. See the Leaf Workspace Root Policy section for the bounded resolution order and explicit override flow.
