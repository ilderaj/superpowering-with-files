# Expected Autonomous Release Closure Contract

## Scenario
- Restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md`.
- Start every loop in `Assess`.
- The workflow keeps encountering the same blocker class after repeated checks.

## Expected Decisions
- Stop after 10 full loops, 2 hours, or 3 consecutive rounds of the same blocker class with no new leverage.
- Make a fallback decision instead of spinning when the loop budget is exhausted.
- Use `partial-success` only when the primary target is complete and the remaining work is proven non-blocking.
- Otherwise stop at `blocked-with-evidence`.
- Re-check on a 15-minute cadence only while the budget still allows another loop.

## Required Evidence
- The report must show loop counts or elapsed time, not just a vague “keep trying” instruction.
- The report must explain why the chosen fallback decision is safer than continuing to spin.
