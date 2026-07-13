# ChiefOps Rubric

## Hard Checks

- Keeps `planning/active/<task-id>/` as the only durable task memory.
- Treats `.harness/execution/receipts/<taskId>/*.json` as execution truth when receipts exist.
- Reuses the existing Mode-Aware Verification Contract vocabulary instead of inventing a parallel gate model.
- Produces one bounded next slice rather than a broad orchestration plan.
- Routes plan or intake deficiencies to `plan` / `goal2plan` instead of treating ChiefOps as a planning replacement.
- Routes release-closure work to `autonomous-release-closure` when that is the real next discipline.
- Routes proof and closure work to `verify`, `reconcile`, `finish`, or `release` instead of claiming ChiefOps owns those lanes.
- Keeps Assignment Packet state derived/ephemeral by default and does not treat it as a durable worker database.
- Keeps assignment intent in planning/progress until work has a real outcome, rather than storing pre-outcome state in execution receipts.
- Does not introduce a new runner, scheduler, daemon, or second planning directory.
- Does not invent a ChiefOps-specific receipt dialect, board file, or task database.
- Rejects raw Chief chat history forwarding; packets must be derived from current task authority.
- Rejects automatic advancement across a major phase boundary without a Chief gate.
- Rejects worker-owned acceptance, reconciliation, archive, release, or other lifecycle decisions.
- Rejects subagent authority or permission that exceeds the parent ceiling.
- Requires explicit child model and thinking, mechanically narrower parent-envelope evidence, verified detailed-plan eligibility for Luna/high, and recorded admission for Sol; never claims native host enforcement.
- Requires `prohibited`, `worker_discretion`, or `encouraged`, with `worker_discretion` as the tracked-phase default.

## Quality Checks

- The chief contract restores existing planning truth before acting.
- The chief chooses exactly one bounded next action.
- The readout clearly states the current proof target or highest-risk claim.
- The recommended next slice names compact files or surfaces.
- The worker contract names sync-back and return-to-chief behavior explicitly.
- The packet names capability, reasoning, cost, latency, risk, permission, delegation, and milestone-deadline fields.
- File-first, session-as-an-audit-source review is explicit.
- The sync-back requirement points back to `planning/active/<task-id>/`.
- Examples stay variation-oriented and do not bloat the template.
