# Autonomous Release Closure Examples

## Example 1: Actionable review feedback loop
- `Assess` finds open actionable review threads
- `Remediate` applies the smallest fix
- `Verify` runs targeted tests
- The closure loop returns to `Assess` immediately after `Verify`; it does not wait 15 minutes because no new external review result is pending yet
- `ReReview` triggers `@codex review`
- While waiting, the workflow re-enters `Assess` on the next review result or gate change, or on the 15-minute review polling cadence, whichever happens first
- It does not mark `ReReview` complete immediately after posting `@codex review`
- If the run hands off before the next observation, planning carries `next_reassess_due_at`

## Example 2: Single proven stacked promotion chain
- The task does not name a target, so `Assess` resolves one proven chain from evidence:
  - work PR -> `release/2026-06` PR -> `main` PR
- The current actionable target is the work PR because it is the leaf of the only proven chain
- After that PR merges, the next loop re-enters `Assess`, advances to the release-candidate PR, and only reaches the `main` PR last
- `main` is treated as the default final destination, not the default immediate target

## Example 3: Disjoint PR ambiguity -> `blocked-with-evidence`
- `Assess` finds two open PRs that both mention the same feature branch, but one targets `release/2026-06` and the other targets `staging-hotfix`
- Repo evidence does not prove that both PRs belong to one promotion chain
- The skill records both candidate chains, explains why no single chain is proven, and stops at `blocked-with-evidence`
- The skill does not guess which chain to merge first

## Example 4: `finishing-a-development-branch` handoff after PR creation
- `finishing-a-development-branch` pushes the feature branch and creates the work PR successfully
- The user also asked to keep driving that PR through review, merge, post-merge cleanup, and promote the result to `main`
- The workflow hands off to `autonomous-release-closure`, which starts at `Assess` against the created PR and continues through the remaining closure stages

## Example 5: Merge completed but adoption follow-through still open
- `Assess` finds merge already done
- `Cleanup` verifies local and origin state
- `Adopt` runs global adoption and records residual blockers
- This can happen in a very short closure loop because no review polling wait is involved
