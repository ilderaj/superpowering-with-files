# Autonomous Release Closure Examples

## Example 1: PR review feedback loop
- `Assess` finds open actionable review threads
- `Remediate` applies the smallest fix
- `Verify` runs targeted tests
- `ReReview` triggers `@codex review`

## Example 2: Ready-to-merge branch
- `Assess` finds no open review issues and mergeability is clean
- `Merge` executes the merge
- `Cleanup` syncs local branches and removes safe temporary work

## Example 3: Merge completed but adoption still open
- `Assess` finds merge already done
- `Cleanup` verifies local and origin state
- `Adopt` runs global adoption and records residual blockers
