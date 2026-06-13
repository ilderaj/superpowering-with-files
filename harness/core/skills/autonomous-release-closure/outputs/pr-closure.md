# Expected Autonomous Release Closure Contract

## Scenario
- Restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md`.
- Start every loop in `Assess`.
- A single PR still needs review closure, merge, cleanup, and adopt follow-through.

## Expected Decisions
- Route to `Remediate` when actionable review or conflict work exists.
- Route to `Verify` after code changes.
- Route to `ReReview` after proof passes and a fresh `@codex review` is needed.
- Re-check on a 15-minute cadence while waiting.
- Route to `Merge` only when review and merge gates are sufficiently evidenced.
- Route to `Cleanup` after merge to sync branches and remove only proven-safe temporary work.
- Route to `Adopt` when post-merge adoption and health alignment still remain.

## Required Evidence
- Stop with `blocked-with-evidence` when policy ambiguity or insufficient destructive-action proof remains.
- Preserve stage-by-stage evidence in `planning/active/<task-id>/`.
