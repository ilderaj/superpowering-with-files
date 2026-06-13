# Autonomous Release Closure Template

## Loop Skeleton

1. Restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md`
2. `Assess`
   - resolve explicit target first
   - otherwise prove exactly one promotion chain
   - if multiple disjoint chains remain, stop at `blocked-with-evidence`
   - if `finishing-a-development-branch` just completed integration, continue here only when unattended closure work is still required
3. Choose one:
   - `Remediate`
   - `Verify`
   - `ReReview`
   - `Merge`
   - `Cleanup`
   - `Adopt`
4. Sync durable state
5. Return to `Assess`
- this outer cycle is the `closure loop`

## Loop Budget

- stop after 10 full loops, 2 hours wall-clock, or 3 consecutive same-class blockers with no new leverage
- the 15-minute review polling cadence belongs only to `ReReview`; it does not mean each closure loop lasts 15 minutes
- on budget exhaustion, make a fallback decision instead of spinning
- `failed-verification` loops back into `Assess`; it is not a terminal completion state

## Terminal States

- `success`
- `partial-success`
- `blocked-with-evidence`

## Hard Stops

- no proven single target or promotion chain
- insufficient merge or delete evidence
- blocker repeated with no new leverage
- unresolved policy ambiguity
- issue touches correctness, security, data integrity, or release acceptance

## Finishing Handoff

- `finishing-a-development-branch` owns the integration decision and immediate execution
- hand off here only after finishing succeeds and continued PR-to-merge, promote-to-trunk, cleanup, or adopt work is explicitly required
- if finishing completed the job and no follow-through remains, do not invoke this skill

## Review Polling Cadence

- `ReReview` uses a 15-minute review polling cadence only while waiting for reviewer or gate changes
- remediation and verification loops can return to `Assess` immediately without waiting 15 minutes
