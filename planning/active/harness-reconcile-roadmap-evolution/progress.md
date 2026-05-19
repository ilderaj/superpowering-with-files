# Progress: harness-reconcile-roadmap-evolution

## 2026-05-17 20:50 UTC+8

- Created tracked planning task for the roadmap/backlog reconciliation work.
- Added `docs/reconciliation.md` as the durable SOT/reconcile policy anchor.

## 2026-05-17 21:02 UTC+8

- Updated `docs/roadmap.md` with a six-iteration Harness evolution sequence and explicit checkpoint/verify/reconcile nodes.
- Updated `docs/backlog.md` with REC/MCP/ADOPT/UPD/OFFICE backlog items and amended CDX parity/contract acceptance signals.

## 2026-05-17 21:08 UTC+8

- Added long implementation plan at `docs/superpowers/plans/2026-05-17-harness-reconcile-roadmap-evolution-implementation-plan.md`.
- Plan combines six iterations and includes checkpoints, verification commands, reconcile nodes, exit criteria, and future-agent handoff guidance.

## 2026-05-17 21:20 UTC+8

- Ran independent evaluator review. It flagged lane/gate ambiguity, missing discoverability, missing conflict ownership, missing lifecycle state, missing current-task reconciliation, broad docs-only exemption, subjective verification, and MCP/cloud scope risks.
- Fixed the high-risk issues by reframing reconcile as a gate-first concept, adding discoverability references, adding conflict ownership, narrowing exemptions, adding lifecycle state, and creating this task's reconciliation artifact.

## 2026-05-19 12:08 UTC+8

- Implemented Iteration 1-2 core lifecycle/tooling support for reconciliation status.
- Added lifecycle detection for `complete`, `not_required`, `waived`, `open`, and `unknown` based on standalone artifacts, progress sections, and `Reconcile:` fields.
- Exposed reconciliation status/readiness and counts in `active-summary` CLI JSON/text and runtime active task summary; archive-ready tasks without readiness now emit `reconciliation_open` anomalies.
- Added MCP `harness://task/<task-id>/reconciliation` resources when a standalone reconciliation artifact exists.
- Added `./scripts/harness record --file reconciliation` support and a reconciliation template.
- Added tests proving `reconciliation.md` survives archive movement with the task directory.
- Updated docs for actual lifecycle signals, summary warnings, archive preservation, and the current warning-not-blocking behavior.
- Verification:
  - `npm test -- tests/installer/active-summary-command.test.mjs tests/core/companion-plan-lifecycle.test.mjs tests/mcp/resources.test.mjs tests/installer/record-command.test.mjs` — pass, 17 tests.
  - `npm run test:core` — initially failed on pre-existing `/Users/jared/` path in an older plan; replaced with `/path/to/SuperpoweringWithFiles`, reran — pass, 10 tests.
  - `./scripts/harness active-summary --json` — pass; current task reports `reconciliationStatus=complete`, `reconciliationReady=true`; four legacy archive-ready tasks report `reconciliation_open` anomalies.
