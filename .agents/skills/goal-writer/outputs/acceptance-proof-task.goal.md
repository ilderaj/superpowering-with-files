```text
/goal Objective: Stabilize one proof-first goal contract without unrelated cleanup.
Context: One workflow-contract surface with a short validation loop.
Constraints: Stay in this repo, keep the root goal stable, and avoid broad cleanup. Inferred acceptance metric: `2` validation checks pass.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- Keep quick rounds lightweight; do not create a companion plan or subagents just because `/goal` is running.
- Keep `planning/active/<task-id>/` authoritative for tracked rounds and sync durable state after each phase.
- For tracked or deeper rounds, work checkpoint by checkpoint and log a short note in `planning/active/<task-id>/progress.md` after each checkpoint.
- For deep-reasoning rounds, use `docs/superpowers/plans/<date>-<task-id>.md`, require 1 read-only reviewer subagent before executing any new or materially revised companion plan, and execute approved plans with normal Superpowers execution, worktree, and git-progress discipline.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- Run `node --test tests/core/goal-writer-eval.test.mjs` and compare the result with `git diff --stat`.
Done Criteria:
- `node --test tests/core/goal-writer-eval.test.mjs` passes, `git diff --stat` stays limited to `1` workflow-contract surface, and no goal drift is introduced.
Stop/Escalate:
- Stop and ask if the task expands beyond `1` workflow surface.
Next Step: Re-open the planning files and patch the workflow-contract surface first.
```
