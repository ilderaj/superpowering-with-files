# Expected Autonomous Release Closure Contract

## Scenario
- Restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md`.
- Start every loop in `Assess`.
- There is no explicit target, so the skill must prove exactly one promotion chain before acting.
- The proven chain is leaf or work PR -> candidate or integration branch PR -> `main`.

## Expected Decisions
- `Assess` resolves the leaf or work PR as the immediate actionable target.
- The candidate or integration branch PR is advanced only after the lower PR merges cleanly.
- `main` is the default final destination, not the default immediate target.
- Re-check on a 15-minute cadence while waiting for review or merge state to change.

## Required Evidence
- The report must record exactly one promotion chain and explain why it is proven.
- The report must show why `main` is only the final target for this stacked promotion chain.
