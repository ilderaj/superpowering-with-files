/goal Objective: Implement the tracked repo change fully enough that the resulting skill, projections, and validations all align without redefining the root deliverable.
Context: This is multi-phase work with durable decisions, projected skill artifacts, and test coverage requirements that span more than one file family.
Constraints: Keep the root goal fixed, preserve `planning/active/<task-id>/` as authoritative memory, and avoid turning tracked work into automatic deep-reasoning unless the architecture becomes unclear.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- Keep quick rounds lightweight; do not create a companion plan or subagents just because `/goal` is running.
- Keep `planning/active/<task-id>/` authoritative for tracked rounds and sync durable state after each phase.
- Use `docs/superpowers/plans/<date>-<task-id>.md` plus optional read-only verifier subagents only for deep-reasoning rounds.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- Run the dedicated fixture evaluator plus the focused repo tests that prove projection and rendering still work.
Done Criteria:
- All `6` fixture prompts pass every hard check and at least `3` focused validation surfaces stay green.
- The skill, supporting files, and rendered projections stay aligned with `planning/active/<task-id>/` as the durable source of truth.
Stop/Escalate:
- Stop and escalate if the change needs a second planning system, cannot keep goal drift under control, or breaks more than `1` unrelated projection surface.
Next Step: Re-open the active planning files, confirm the tracked implementation phases, and land the canonical skill plus evaluator before touching projections.
