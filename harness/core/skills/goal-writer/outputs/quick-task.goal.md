```text
/goal Objective: Correct the single low-risk quick task without inflating it into a planning-heavy workflow.
Context: Narrow surface fix with a short feedback loop.
Constraints: Touch only `1` authoritative quick-task surface and avoid broad cleanup. Inferred acceptance metric: `2` validation checks pass.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`; if the current round stays quick, keep it lightweight and do not create a companion plan or subagents.
- Keep `planning/active/<task-id>/` authoritative, sync durable state after each phase, and do not allow goal drift.
Validation: Run exactly `2` focused checks.
Done Criteria:
- Both `2` validation checks pass and exactly `1` authoritative quick-task surface is updated.
Stop/Escalate: Escalate if the fix expands beyond `1` surface or becomes tracked work.
Next Step: Re-open the active planning files and patch the single quick-task surface first.
```
