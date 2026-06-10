```text
/goal Objective: Turn the rough request into a stable tracked goal contract for a small Codex workflow improvement without drifting into a full implementation plan.
Context: The user intent is sparse and only establishes that the workflow should be safer and easier to finish. Assumptions: the authoritative task state lives in `planning/active/<task-id>/`, the work stays inside this repo, and success can be proven with a compact validation set.
Constraints: Keep the root goal stable, do not widen into unrelated cleanup, and keep the prompt concise enough to stay under the Codex limit. Inferred acceptance metric: success is proven by `2` focused validations and `1` explicit quantified done target.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- Keep quick rounds lightweight; do not create a companion plan or subagents just because `/goal` is running.
- Keep `planning/active/<task-id>/` authoritative for tracked rounds and sync durable state after each phase.
- Use `docs/superpowers/plans/<date>-<task-id>.md` plus optional read-only verifier subagents only for deep-reasoning rounds.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- Run exactly `2` targeted checks that cover the changed workflow text and the touched proof surface.
Done Criteria:
- At least `1` quantified completion target appears in the final contract and both `2` validation checks pass.
- No durable task state is written outside `planning/active/<task-id>/`.
Stop/Escalate:
- Stop and ask if the authoritative repo surface is unclear or if the goal cannot be validated with `2` focused checks.
Next Step: Re-open the active planning files, confirm the smallest authoritative workflow surface, and draft the tracked goal contract against that scope first.
```
