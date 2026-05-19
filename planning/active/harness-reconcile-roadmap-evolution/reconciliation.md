# Reconciliation: harness-reconcile-roadmap-evolution

## Planned Intent

- Capture the roadmap/backlog review into durable, searchable, traceable docs.
- Update roadmap and backlog at different levels of granularity.
- Produce a six-iteration implementation plan with checkpoints, verification, and reconcile nodes.
- Challenge the plan until loopholes are fixed enough for owner review and later agent execution.

## Actual Changes

- Added `docs/reconciliation.md` with SOT map, conflict ownership, artifact shape, scope control, validation expectations, and lifecycle signal definitions.
- Updated `docs/roadmap.md` with a six-iteration Harness evolution sequence.
- Updated `docs/backlog.md` with REC/MCP/ADOPT/UPD/OFFICE backlog items and CDX acceptance amendments.
- Added `docs/superpowers/plans/2026-05-17-harness-reconcile-roadmap-evolution-implementation-plan.md`.
- Created tracked task files under `planning/active/harness-reconcile-roadmap-evolution/`.
- Added discoverability links/sections in `docs/workflows.md`, `docs/maintenance.md`, `docs/architecture.md`, `docs/cloud-dev-harness.md`, and `README.md`.
- Implemented reconciliation lifecycle detection in planning scripts, including status/readiness fields and archive-ready warning behavior.
- Exposed reconciliation fields, counts, and anomalies through `active-summary` CLI JSON/text and runtime active task summary.
- Exposed standalone reconciliation artifacts through MCP task resources when present.
- Added record/template ergonomics for standalone `reconciliation.md` artifacts.
- Added focused tests for summary status, MCP resource listing/reading, record helper support, and archive preservation.

## Acceptance Status

- [x] Durable reconciliation/SOT policy exists.
- [x] Roadmap contains six iterations with checkpoints and verify/reconcile nodes.
- [x] Backlog contains explicit REC/MCP/ADOPT/UPD/OFFICE items.
- [x] Long implementation plan contains iteration tasks, verification commands, reconcile nodes, exit criteria, and future-agent handoff guidance.
- [x] Independent evaluator challenged loopholes.
- [x] High-risk loopholes were addressed: lane-vs-gate ambiguity, discoverability, conflict ownership, lifecycle state, docs-only exemption, current-task reconciliation.
- [x] Iteration 1-2 core lifecycle/tooling/docs support exposes reconciliation as a real active-task signal.
- [x] Archive preservation for standalone `reconciliation.md` is covered by tests.
- [ ] Owner review is still pending.

## Verification Evidence

- `grep -R "REC-001\|REC-002\|REC-003\|MCP-001\|ADOPT-001\|UPD-001\|OFFICE-001" -n docs planning/active/harness-reconcile-roadmap-evolution` — passed before follow-up edits; confirms IDs are searchable.
- `grep -R "docs/reconciliation.md\|reconcile\|reconciliation.md" -n docs planning/active/harness-reconcile-roadmap-evolution` — passed before follow-up edits; confirms discoverability after additions should be stronger.
- `./scripts/harness active-summary --json` — identified missing lifecycle block for this task; fixed by adding `## Current State`.
- `npm test -- tests/core/*.test.mjs` — failed due to pre-existing personal-path violations in `docs/superpowers/plans/2026-05-15-alma-goal-a-mcp-readonly-adoption-plan.md` and a worktree copy, not caused by this task's new files.
- `npm test -- tests/installer/active-summary-command.test.mjs tests/core/companion-plan-lifecycle.test.mjs tests/mcp/resources.test.mjs tests/installer/record-command.test.mjs` — pass, 17 tests, after adding Iteration 1-2 core coverage.
- `npm run test:core` — initially failed on the older absolute `/Users/jared/` docs path; replaced that sample command with `/path/to/SuperpoweringWithFiles`, reran, and passed, 10 tests.
- `./scripts/harness active-summary --json` — pass; current task reports `reconciliationStatus=complete` and `reconciliationReady=true`; four legacy archive-ready tasks now report expected `reconciliation_open` anomalies.

## Intentional Deviations

- The plan now frames reconciliation as a **gate** first, not automatically a new first-class lane, to avoid conflicting with existing lane docs. A future implementation may promote it to a lane only if README/workflows/maintenance/tooling are updated together.
- This task did not archive unrelated active tasks; it only records that Iteration 1 should audit them with owner approval.

## Drift / Follow-Up Required

- Existing repository still has unrelated active-summary warnings; Iteration 1-2 now makes four legacy archive-ready tasks visible as `reconciliation_open` anomalies.
- REC-002 still needs an owner decision on whether reconciliation-open archive-ready legacy tasks should hard-block archive after cleanup, or remain warning-only for backward compatibility.
- MCP-001 remains proposed until the MCP runtime facade waiting-review task is closed or explicitly accepted as baseline.

## Docs / Roadmap / Backlog Updates Needed

- Owner should review whether roadmap should call the six-iteration sequence near-term or split it into epics after Iterations 1-2.
- Owner should decide whether standalone `reconciliation.md` is required for all tracked coding tasks, or whether a `progress.md` section is enough for smaller tasks.

## Archive Readiness

Not ready for full program archive. Iteration 1-2 core implementation is reconciled and verified, but the overall roadmap-evolution task should remain `waiting_review` until owner review of the broader plan is complete and any requested edits are applied.
