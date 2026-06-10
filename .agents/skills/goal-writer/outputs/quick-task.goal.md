```text
/goal Objective: Fix one low-risk quick task without inflating it into a planning-heavy workflow.
Context: Narrow surface fix with short feedback loop.
Constraints: Touch only `1` authoritative surface and avoid broad cleanup. Inferred acceptance metric: `2` validation checks pass.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`; If the current round stays quick, keep it lightweight and do not create a companion plan or subagents.
- Keep `planning/active/<task-id>/` authoritative, sync durable state after each phase, use `docs/superpowers/plans/<date>-<task-id>.md` plus 1 read-only reviewer subagent before executing any new or materially revised companion plan if a round becomes deep-reasoning, and do not allow goal drift.
Validation: Run exactly `2` checks.
Done Criteria:
- Both `2` validation checks pass and exactly `1` authoritative quick-task surface is updated.
Stop/Escalate: Escalate if the fix expands beyond `1` surface or becomes tracked work.
Next Step: Re-open active planning files and patch the quick-task surface first.
```
