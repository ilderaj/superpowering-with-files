# Goal Writer Template

Use this exact frame and keep the final prompt `<=4000` characters.

```text
/goal Objective: [one stable sentence describing the root outcome]
Context: [2-4 concise facts that change scope, validation, or constraints]. [If inferred, add `Assumptions: ...` here or in Constraints.]
Constraints: [scope boundaries, non-goals, safety limits, and any host/repo constraints]. [If needed, add `Inferred acceptance metric: ...` here or in Done Criteria.]
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- Keep quick rounds lightweight; do not create a companion plan or subagents just because `/goal` is running.
- Keep `planning/active/<task-id>/` authoritative for tracked rounds and sync durable state after each phase.
- Use `docs/superpowers/plans/<date>-<task-id>.md` plus optional read-only verifier subagents only for deep-reasoning rounds.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- [1-3 exact commands, evidence checks, or runtime validations]
Done Criteria:
- [At least one line with a numeric target]
- [Other completion checks if needed]
Stop/Escalate:
- [When to stop, ask, or escalate]
Next Step: [the immediate first action once the goal starts]
```

## Compression Rules
- Prefer one short paragraph for `Context` and `Constraints`.
- Keep `Validation` and `Done Criteria` to the smallest set that still proves success.
- Remove narration, rationale, and history that do not change execution.
- If a section grows large, compress it instead of dropping the section.

## Numeric Target Rules
- `Done Criteria` must contain at least one digit.
- User-provided numbers are preferred.
- If none exist, derive a defensible metric and label it `Inferred acceptance metric`.
