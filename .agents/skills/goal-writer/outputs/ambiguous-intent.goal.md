```text
/goal Objective: Convert the ambiguous request into a stable improvement goal that can be executed safely without pretending the missing details are known.
Context: The request says the experience should be “better” but does not define the exact surface. Assumptions: the target is the current repo, the user wants a measurable improvement rather than a broad redesign, and the first acceptable contract should stay within one execution lane.
Constraints: Keep the goal narrow enough that validation is concrete, state every inferred default explicitly, and do not jump to deep-reasoning unless the round actually becomes architecture-heavy. Inferred acceptance metric: `3` named acceptance checks prove the improvement is real enough to finish.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- Keep quick rounds lightweight; do not create a companion plan or subagents just because `/goal` is running.
- Keep `planning/active/<task-id>/` authoritative for tracked rounds and sync durable state after each phase.
- For tracked or deeper rounds, work checkpoint by checkpoint and log a short note in `planning/active/<task-id>/progress.md` after each checkpoint.
- For deep-reasoning rounds, use `docs/superpowers/plans/<date>-<task-id>.md`, require 1 read-only reviewer subagent before executing any new or materially revised companion plan, and execute approved plans with normal Superpowers execution, worktree, and git-progress discipline.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- Inspect `planning/active/<task-id>/task_plan.md`, run `node --test tests/core/goal-writer-eval.test.mjs`, and compare the chosen surface with `git diff --stat`.
Done Criteria:
- Inferred acceptance metric: `3` proof checks pass, including `node --test tests/core/goal-writer-eval.test.mjs` and a `git diff --stat` bounded to the chosen surface.
- The final goal states assumptions clearly enough that a later replan can stay stable instead of drifting.
Stop/Escalate:
- Stop and ask if the request actually refers to more than `1` execution surface or if no defensible `3`-check metric can be formed.
Next Step: Re-read the active planning files, choose the smallest likely target surface, and write the first tracked goal draft with the assumptions inline.
```
