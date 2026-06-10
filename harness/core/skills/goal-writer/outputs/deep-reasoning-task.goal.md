```text
/goal Objective: Resolve the architecture-heavy goal-loop problem without changing Codex internals and without letting the root deliverable drift.
Context: The work spans policy, projected guidance, validation surfaces, and architecture choices that may require deeper reasoning than a normal tracked round.
Constraints: Stay inside repo-owned guidance surfaces, treat `planning/active/<task-id>/` as authoritative memory, and use deeper reasoning only when the current round truly needs it.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- Keep quick rounds lightweight; do not create a companion plan or subagents just because `/goal` is running.
- Keep `planning/active/<task-id>/` authoritative for tracked rounds and sync durable state after each phase.
- If a round is deep-reasoning, create or update `docs/superpowers/plans/<date>-<task-id>.md`, require 1 read-only reviewer subagent before executing any new or materially revised companion plan, execute only from the approved plan, and cap plan-polishing at `3` verifier rounds.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- Verify the design against policy, projected guidance, and targeted tests before claiming completion.
Done Criteria:
- At least `3` architecture validation surfaces pass and no more than `3` verifier rounds are consumed.
- Deep-reasoning artifacts stay linked back to `planning/active/<task-id>/` and do not replace authoritative task memory.
Stop/Escalate:
- Stop and escalate if the repo-owned guidance cannot reconcile the conflict within `3` verifier rounds or if the change would require Codex internals.
Next Step: Re-open the active planning files, isolate the architecture conflict, and write the first companion-plan revision only if the current round is truly deep-reasoning.
```
