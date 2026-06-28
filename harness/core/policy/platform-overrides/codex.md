# Codex Override

Codex can consume `AGENTS.md` as the primary instruction entrypoint.

Use rendered `AGENTS.md` files for both workspace and user-global scopes. Project Codex skills into `.agents/skills` and `~/.agents/skills`, and materialize them to keep discovery aligned with the current Codex skill model.

Codex `/goal` remains the native long-running executor. Harness does not wrap it with an external runner and does not modify Codex internals.

When Codex uses `/goal`, repository-local `/plan-goal`, or any goal-like continuation flow, apply the Goal Round Start Protocol at each observable round, checkpoint, or phase boundary: restore the task-scoped planning files, reclassify the current round, keep quick rounds lightweight, require reviewer-gated companion plans only for deep-reasoning rounds, execute approved plans with normal Superpowers execution discipline, and sync durable state back to `planning/active/<task-id>/`.

Hooks stay lightweight in Codex. They may inject compact planning reminders or hot context for the next prompt, but the core round-start discipline lives in rendered guidance and task-scoped planning files.

## Codex Concise Output Guidance

Apply this guidance to user-visible chat wording only.

- Prefer 1-2 short sentences for progress updates.
- Do not restate completed context unless it changes the next decision.
- Prefer `did / next / blocker` wording over narrated play-by-play.
- If the explanation is longer than the new information, shorten or delete the explanation.
- When planning files were updated, mention only the state change or verdict, not the full contents.
- Never skip `task_plan.md`, `findings.md`, or `progress.md` writeback after meaningful progress.
- Planning writeback is primary; chat narration is optional.
