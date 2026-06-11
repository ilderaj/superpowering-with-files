# Goal2Plan Template

Return exactly one markdown fenced block and keep the inner prompt `<=4000` characters.

```text
/goal Objective: Produce a reviewed implementation plan for [root objective]; do not execute implementation.
Context: [facts that change plan quality]. [Optional `Assumptions: ...`]
Constraints: Keep `planning/active/<task-id>/` authoritative; use a native /goal flow; do not modify Codex internals; do not build an external runner. [Optional `Inferred acceptance metric: ...`]
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before every substantive round.
- If broad intake is missing, use brainstorming; if only narrow facts are missing, use concise Q&A.
- Draft the implementation plan using writing-plans structure and save it to `docs/superpowers/plans/<date>-<task-id>.md`.
- Use `1` read-only reviewer subagent for every new or materially revised plan.
- Revise under a `3`-round cap, sync back after each phase, and do not allow goal drift.
Validation:
- Verify the final plan names exact files or work surfaces, task breakdown, validation commands, fallback rules, and acceptance criteria.
Done Criteria:
- `1` reviewed implementation plan is saved to `docs/superpowers/plans/<date>-<task-id>.md`.
- `planning/active/<task-id>/` records summary, reviewer verdict, blockers, and sync-back status.
Stop/Escalate:
- Stop if blocking facts remain unknown after `3` planning cycles or if the reviewer rejects the same gap twice.
Next Step: Restore the active planning files and list the missing intake dimensions before drafting the prompt.
```
