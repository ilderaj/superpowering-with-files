# Safety Policy

- Never run agents from HOME, /Users, /, Documents, Desktop, Downloads, or broad parent folders.
- Run agents only inside a specific project root or sacrificial worktree.
- Bypass is allowed only for rebuildable directories.
- Checkpoint before bypass, autopilot, destructive work, or long-running tasks.
- Delete, cleanup, reset, permission, and credential-related operations require ask or deny.
- Secrets, certificates, releases, payment, and production config changes do not use bypass.
- Destructive commands without an upstream branch require explicit human ask.
- Risk assessment for destructive changes must be persisted in `planning/active/<task-id>/task_plan.md` under `## Risk Assessment` before execution.
- Cross-workspace writes are denied; cross-workspace deletes are denied unconditionally.
- End every agent task with a diff review and a push to remote when applicable.
