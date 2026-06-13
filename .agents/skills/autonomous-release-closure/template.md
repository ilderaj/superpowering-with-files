# Autonomous Release Closure Template

## Loop Skeleton

1. Restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md`
2. `Assess`
3. Choose one:
   - `Remediate`
   - `Verify`
   - `ReReview`
   - `Merge`
   - `Cleanup`
   - `Adopt`
4. Sync durable state
5. Return to `Assess`

## Terminal States

- `success`
- `partial-success`
- `blocked-with-evidence`

## Hard Stops

- unclear requirements
- insufficient merge or delete evidence
- repeated blocker with no new leverage
- unresolved policy ambiguity
