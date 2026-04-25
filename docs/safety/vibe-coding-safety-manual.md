# Vibe Coding Safety Manual

Before a high-risk agent session, do only these things:

1. Do not run agents from broad directories such as `HOME`, `/Users`, `Desktop`, or `Downloads`; run only inside a specific project root or a sacrificial worktree.
2. Run `./scripts/harness worktree-preflight --safety` first, then record the reported base ref and SHA in `planning/active/<task-id>/progress.md`.
3. Create isolation with `git worktree add <path> -b <branch> <base>`. Long-running, bypass, and autopilot work belong only in that worktree.
4. Before any `rm -rf`, `git reset --hard`, broad permission change, or cleanup script, run `./scripts/harness checkpoint . --quiet`.
5. Write the command, target paths, impact scope, checkpoint path, and rollback steps into a non-placeholder row under `## Risk Assessment` in `task_plan.md`.
6. Do not use bypass for secrets, certificates, payments, production config, or release artifacts.
7. After a milestone, use `./scripts/harness checkpoint-push --message="..."` to create the preferred remote recovery point before merge, worktree cleanup, or temporary-directory removal.
8. Before ending the session, review the diff and write the executed commands, verification results, and checkpoint paths back to `progress.md`.

Red flags:

- “It is just a generated directory cleanup”
- “I can push later”
- “The main checkout is basically the same as a worktree”

If any of those thoughts appear, stop and add the checkpoint, risk assessment, and remote recovery point first.
