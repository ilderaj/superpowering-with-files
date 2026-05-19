# Task Plan: harness-reconcile-roadmap-evolution

## Goal

Turn the roadmap/backlog review into durable, reviewable Harness planning artifacts and update the product roadmap/backlog so implementation agents can execute the next evolution without losing traceability.

## Context

The review found that Harness has strong planning persistence and companion-plan synchronization, but no explicit post-implementation reconciliation lane for aligning specs, actual code changes, verification evidence, roadmap/backlog status, and archive readiness.

This task documents the decision, updates roadmap/backlog at the right granularity, and produces one long implementation plan that can be reviewed and then executed by other agents.

## Scope

- Add a durable reconciliation/SOT policy document.
- Update `docs/roadmap.md` with the next six-iteration direction.
- Update `docs/backlog.md` with executable backlog items for reconciliation, MCP compatibility, cloud parity, adoption, upstream update, and office templates.
- Produce a long implementation plan under `docs/superpowers/plans/`.
- Verify that the resulting docs are searchable, linked, and internally consistent.

## Out Of Scope

- Implementing the reconcile lane in code.
- Archiving existing active tasks.
- Changing MCP runtime behavior.
- Creating GitHub issues.
- Committing changes.

## Success Criteria

- `docs/reconciliation.md` exists and defines SOT boundaries, reconcile scope, artifact format, and validation expectations.
- `docs/roadmap.md` includes a six-iteration Harness evolution sequence with checkpoint and verify/reconcile nodes.
- `docs/backlog.md` includes explicit backlog items and acceptance signals for the new direction.
- The implementation plan is concrete enough for another agent to execute without re-deriving intent.
- Verification catches missing links, missing backlog IDs, and obvious status drift introduced by this task.

## Plan

1. Inspect existing roadmap, backlog, workflow, architecture, maintenance, and active planning docs.
2. Create `docs/reconciliation.md` as the durable policy anchor.
3. Update roadmap with near-term evolution sequence and active item references.
4. Update backlog with REC, MCP, ADOPT, UPD, and OFFICE items plus CDX amendments.
5. Write a six-iteration implementation plan with checkpoints, verify/reconcile gates, dependencies, and agent handoff guidance.
6. Run grep/link checks and ask an independent review agent to challenge loopholes.
7. Fix any identified gaps, then record progress and final status.

## Review Notes

Pending user review. If approved, implementation can be split across other agents using the iteration boundaries in the long plan.

## Risk Assessment

| Timestamp | Command | Target | Workspace Boundary | Checkpoint | Rollback |
| --- | --- | --- | --- | --- | --- |
| 2026-05-19 12:25 UTC+8 | `git checkout -- harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/companion_sync.cpython-313.pyc harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/planning_paths.cpython-313.pyc harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/task_lifecycle.cpython-313.pyc harness/upstream/planning-with-files/scripts/__pycache__/planning_paths.cpython-313.pyc harness/upstream/planning-with-files/scripts/__pycache__/task_lifecycle.cpython-313.pyc` | Generated tracked `__pycache__/*.pyc` files dirtied by test/import runs. | Current worktree only: `/Users/jared/SuperpoweringWithFiles/.worktrees/202605191157-harness-reconcile-execution`. | `/Users/jared/.agent-config/checkpoints/202605191157-harness-reconcile-execution/2026-05-19T04-25-57Z` | Restore from checkpoint bundle/diff if checkout removes needed state; otherwise rerun tests to regenerate ignored bytecode if needed. |
| 2026-05-19 12:37 UTC+8 | `git checkout -- harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/companion_sync.cpython-313.pyc harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/planning_paths.cpython-313.pyc harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/task_lifecycle.cpython-313.pyc` | Generated tracked overlay `__pycache__/*.pyc` files dirtied by Python-backed test/import runs. | Current worktree only: `/Users/jared/SuperpoweringWithFiles/.worktrees/202605191157-harness-reconcile-execution`. | `/Users/jared/.agent-config/checkpoints/202605191157-harness-reconcile-execution/2026-05-19T04-36-56Z` | Restore from checkpoint bundle/diff if checkout removes needed state; otherwise rerun tests to regenerate bytecode if needed. |

## Current State

Status: waiting_review
Archive Eligible: no
Close Reason: pending owner review of roadmap/backlog updates and long implementation plan.
Reconcile: complete for this planning/doc update; see `reconciliation.md`.
