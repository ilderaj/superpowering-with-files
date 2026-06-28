```text
/goal Objective: Repair the docs publishing goal without widening into a planning loop.
Context: Tracked docs publishing workflow.
Constraints: Keep the root goal stable, avoid unrelated cleanup, and stay within the tracked budget. Inferred acceptance metric: `2` proof commands pass across `1` workflow surface.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- Keep quick rounds lightweight; do not create a companion plan or subagents just because `/goal` is running.
- Keep `planning/active/<task-id>/` authoritative for tracked rounds and sync durable state after each phase.
- For tracked or deeper rounds, work checkpoint by checkpoint and log a short note in `planning/active/<task-id>/progress.md` after each checkpoint.
- For deep-reasoning rounds, use `docs/superpowers/plans/<date>-<task-id>.md`, require 1 read-only reviewer subagent before executing any new or materially revised companion plan, and execute approved plans with normal Superpowers execution, worktree, and git-progress discipline.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- Run `pnpm lint --filter docs` and `pnpm test --filter docs`.
Done Criteria:
- `pnpm lint --filter docs` and `pnpm test --filter docs` both pass, and exactly `1` docs publishing workflow surface is updated without widening into a planning loop.
Stop/Escalate:
- Escalate if the task expands beyond `1` publishing workflow surface or needs a companion plan.
Next Step: Re-open planning files and inspect the docs publishing surface first.
```
