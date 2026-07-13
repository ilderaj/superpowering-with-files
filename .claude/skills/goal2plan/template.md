# Goal2Plan Template

Return exactly one markdown fenced block and keep the inner prompt `<=4000` characters.

```text
/goal Objective: Produce a reviewed implementation plan for [root objective]; do not execute implementation.
Context: [facts that change plan quality]. [Optional `Assumptions: ...`]
Constraints: Keep `planning/active/<task-id>/` authoritative; use a native /goal flow; do not modify Codex internals; do not build an external runner. [Optional `Inferred acceptance metric: ...`]
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before every substantive round.
- Audit intake sufficiency first and list the missing intake dimensions before drafting the plan.
- For coding work, capture the coding intake contract: domain terms, highest practical test seam, tracer-bullet vertical slice, blocking edges, and Standards/Spec review split. Keep authority in `planning/active/<task-id>/`, not `tickets.md`.
- If broad intake is missing, run a bounded native intake audit; if only narrow facts are missing, use concise Q&A.
- Draft the implementation plan using writing-plans structure and save it to `docs/superpowers/plans/<date>-<task-id>.md`.
- Break the planning loop into checkpoints and append a short progress log to `planning/active/<task-id>/progress.md` after each checkpoint.
- Use `1` read-only reviewer subagent for every new or materially revised plan.
- Revise under a `3`-round cap, sync back after each phase, do not allow goal drift, and if the reviewed plan proves the task is straightforward enough for direct or tracked execution, stop Goal2Plan, reclassify, and fall back.
Validation:
- Inspect `planning/active/<task-id>/task_plan.md`, review `docs/superpowers/plans/<date>-<task-id>.md`, and verify that the plan names exact files or work surfaces, task breakdown, validation commands, fallback rules, and acceptance criteria.
Done Criteria:
- `1` reviewed implementation plan is saved to `docs/superpowers/plans/<date>-<task-id>.md`.
- `planning/active/<task-id>/` records summary, reviewer verdict, blockers, checkpoint status, fallback decision, and sync-back status.
Stop/Escalate:
- Stop if blocking facts remain unknown after `3` planning cycles, if the reviewer rejects the same gap twice, or if the work is clearly direct or tracked execution instead of a Goal2Plan case.
Next Step: Restore the active planning files and list the missing intake dimensions before drafting the prompt.
```
