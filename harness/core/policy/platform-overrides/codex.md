# Codex Override

Codex can consume `AGENTS.md` as the primary instruction entrypoint.

Use rendered `AGENTS.md` files for both workspace and user-global scopes. Project Codex skills into `.agents/skills` and `~/.agents/skills`, and materialize them to keep discovery aligned with the current Codex skill model.

Codex `/goal` remains the native long-running executor. Harness does not wrap it with an external runner and does not modify Codex internals.

When Codex uses `/goal`, repository-local `/plan-goal`, or any goal-like continuation flow, apply the Goal Round Start Protocol at each observable round, checkpoint, or phase boundary: restore the task-scoped planning files, reclassify the current round, keep quick rounds lightweight, use companion-plan plus verifier gating only for deep-reasoning rounds, and sync durable state back to `planning/active/<task-id>/`.

Hooks stay lightweight in Codex. They may inject compact planning reminders or hot context for the next prompt, but the core round-start discipline lives in rendered guidance and task-scoped planning files.
