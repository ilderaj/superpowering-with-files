# Expected Autonomous Release Closure Contract

## Scenario
- Restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md`.
- Start every loop in `Assess`.
- Evidence reveals multiple disjoint chains tied to the same feature branch.

## Expected Decisions
- `Assess` records both candidate chains and stops at `blocked-with-evidence`.
- The workflow does not guess which PR to merge first.
- Re-check on a 15-minute cadence only if a concrete external clarifier is expected.

## Required Evidence
- The skill must explain that multiple disjoint chains remain unresolved.
- The stop reason must be `blocked-with-evidence`, not an inferred merge order.
