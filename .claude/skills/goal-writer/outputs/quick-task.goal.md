/goal Objective: Correct the single low-risk quick task without inflating it into a planning-heavy or subagent-heavy workflow.
Context: The current work is a narrow surface fix with low architecture risk and a short feedback loop.
Constraints: Keep scope to the authoritative quick-task surface, preserve existing repo conventions, and avoid broad cleanup or refactor work.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- If the current round stays quick, keep it lightweight and do not create a companion plan or subagents.
- If the round becomes tracked, keep `planning/active/<task-id>/` authoritative and sync durable state after each phase.
- Use `docs/superpowers/plans/<date>-<task-id>.md` plus optional read-only verifier subagents only if the round becomes deep-reasoning.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- Run exactly `2` focused checks that prove the quick change works and that no unrelated contract moved.
Done Criteria:
- Both `2` validation checks pass and exactly `1` authoritative quick-task surface is updated.
- No companion plan is created unless the round genuinely stops being quick.
Stop/Escalate:
- Stop and escalate if the fix expands beyond `1` authoritative surface or needs architecture work that makes it tracked.
Next Step: Re-open the active planning files, confirm the single quick-task surface, and patch that smallest authority first.
