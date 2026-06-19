```text
/goal Objective: Fix one low-risk quick task with verified finish line.
Context: One narrow surface with a short loop.
Constraints: Touch only `1` surface; no broad cleanup. Inferred acceptance metric: `2` proof commands pass.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`; If the current round stays quick, keep it lightweight and do not create a companion plan or subagents.
- Keep `planning/active/<task-id>/` authoritative, sync durable state after each phase, and if a round becomes deep-reasoning use `docs/superpowers/plans/<date>-<task-id>.md` plus 1 read-only reviewer subagent before any new or materially revised companion plan; do not allow goal drift.
Validation: Run `node --test tests/q.test.mjs` and `git diff --stat`.
Done Criteria:
- `node --test tests/q.test.mjs` exits `0`, `git diff --stat` stays limited to `1` surface, and exactly `1` authoritative surface is updated.
Stop/Escalate: Escalate if the fix expands beyond `1` surface or becomes tracked work.
Next Step: Re-open active planning files and patch surface first.
```
