# Goal Writer Template

Return exactly one markdown fenced block and keep the inner `/goal` prompt `<=4000` characters.

## Compact Frame for Simple / Quick Goals

Use this when the goal is single-surface, low-risk, or otherwise clearly simple. Keep it short. The inner prompt should usually stay below `1200` characters.

```text
/goal Objective: [one stable sentence describing 1 verified finish line]
Context: [1-2 short facts]. [Optional `Assumptions: ...`]
Constraints: [scope boundary plus any non-goal]. [Optional `Inferred acceptance metric: ...`]
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`; keep quick rounds lightweight, and if a round becomes deep-reasoning use `docs/superpowers/plans/<date>-<task-id>.md` plus 1 read-only reviewer subagent before executing any new or materially revised companion plan.
- Keep `planning/active/<task-id>/` authoritative, sync durable state after each phase, and do not allow goal drift.
Validation: [1-2 exact commands or authoritative evidence surfaces]
Done Criteria:
- [At least one numeric target tied to the validation proof]
Stop/Escalate: [one short boundary condition]
Next Step: [the immediate first action]
```

## Standard Frame for Tracked / Full Goals

Use this when the work is tracked, context-heavy, or deep-reasoning.

```text
/goal Objective: [one stable sentence describing 1 root outcome]
Context: [2-4 concise facts that change scope, validation, or constraints]. [If inferred, add `Assumptions: ...` here or in Constraints.]
Constraints: [scope boundaries, non-goals, safety limits, and any host/repo constraints]. [If needed, add `Inferred acceptance metric: ...` here or in Done Criteria.]
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- Keep quick rounds lightweight; do not create a companion plan or subagents just because `/goal` is running.
- Keep `planning/active/<task-id>/` authoritative for tracked rounds and sync durable state after each phase.
- For tracked or deeper rounds, work checkpoint by checkpoint and log a short note in `planning/active/<task-id>/progress.md` after each checkpoint.
- For deep-reasoning rounds, use `docs/superpowers/plans/<date>-<task-id>.md`, require 1 read-only reviewer subagent before executing any new or materially revised companion plan, and execute approved plans with normal Superpowers execution, worktree, and git-progress discipline.
- Prefer one clear finish line before heavier orchestration; if the task later proves deeper, say so without allowing goal drift.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- [1-3 exact commands, authoritative evidence surfaces, or runtime validations]
Done Criteria:
- [At least one line with a numeric target tied to the validation proof]
- [Other completion checks if needed]
Stop/Escalate:
- [When to stop, ask, or escalate]
Next Step: [the immediate first action once the goal starts]
```

## Compression Rules
- Choose the compact frame first for genuinely simple goals instead of filling the standard frame mechanically.
- Start from one proof target and one finish line before adding orchestration language.
- For tracked or deeper prompts, name the checkpoints and the short `progress.md` logging rule explicitly instead of assuming the loop stays legible on its own.
- If Objective or Context explicitly marks repeated/bounded passes, add one `Iteration Contract:` line under Work Discipline: each pass re-reads fresh evidence/feedback/state, uses it to select the next bounded action, and reclassifies to one-shot/staged work if it cannot change that choice.
- Prefer one short paragraph for `Context` and `Constraints`.
- Keep `Validation` and `Done Criteria` to the smallest set that still proves success.
- Remove narration, rationale, and history that do not change execution.
- If a section grows large, compress it instead of dropping the section.
- When returning to the user, wrap whichever frame you used inside one fenced block and do not add prose outside it.

## Numeric Target Rules
- `Done Criteria` must contain at least one digit.
- User-provided numbers are preferred.
- If none exist, derive a defensible metric and label it `Inferred acceptance metric`.
