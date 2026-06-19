```text
/goal Objective: Stabilize the authentication goal contract without drifting into unrelated cleanup.
Context: The task is bounded to one authentication workflow surface and can be proven with a short validation loop.
Constraints: Keep the root goal stable, stay inside this repo, and avoid broad cleanup. Inferred acceptance metric: `2` validation checks pass.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- Keep quick rounds lightweight; do not create a companion plan or subagents just because `/goal` is running.
- Keep `planning/active/<task-id>/` authoritative for tracked rounds and sync durable state after each phase.
- For deep-reasoning rounds, use `docs/superpowers/plans/<date>-<task-id>.md`, require 1 read-only reviewer subagent before executing any new or materially revised companion plan, and execute approved plans with normal Superpowers execution, worktree, and git-progress discipline.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- Run `npm test test/auth -- --runInBand` and compare the result with `git diff --stat`.
Done Criteria:
- `npm test test/auth -- --runInBand` passes, `git diff --stat` stays limited to `1` authentication workflow surface, and no goal drift is introduced.
Stop/Escalate:
- Stop and ask if the task expands beyond `1` workflow surface.
Next Step: Re-open the active planning files and patch the authentication goal surface first.
```
