---
name: autonomous-release-closure
description: Use when a task must drive pull request or release closure across review fixes, verification, re-review, merge, cleanup, and adoption using current evidence instead of one-shot actions
---

# Autonomous Release Closure

## Outcome Contract
- **Outcome:** the agent gets one reusable single-entry workflow for PR or release closure that loops through `Assess`, `Remediate`, `Verify`, `ReReview`, `Merge`, `Cleanup`, and `Adopt`.
- **Done when:** the skill preserves `planning/active/<task-id>/` as authoritative memory, defines each stage boundary, defines strict stop or escalate rules, and treats completion as proven only after review, verification, merge, cleanup, and adoption obligations are all resolved.
- **Evidence:** `scripts/evaluate-autonomous-release-closure.mjs`, `tests/core/autonomous-release-closure-eval.test.mjs`, `tests/core/skill-index.test.mjs`, `tests/adapters/skill-profile.test.mjs`, and `tests/adapters/skill-projection.test.mjs` all pass.
- **Output:** a reusable closure protocol for unattended PR or release work, not a new runtime, router, or hook system.

## When to Use
- PR or release closure requires repeated loops across review feedback, verification, merge readiness, cleanup, and adoption.
- Current state must be re-read from repository and external evidence before each next action.
- The user wants one workflow that can continue until a real terminal state or a justified stop condition.

Do not use this skill when:
- the task is a quick one-shot fix with no review, merge, cleanup, or adoption loop;
- broad product requirements are still undefined;
- the next action is a large architecture rewrite rather than closure work;
- a repo-specific policy requires a human decision before any safe next action exists.

## Workflow
1. Restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md`.
2. Start every loop in `Assess`.
3. Use current evidence to choose exactly one next stage:
   - `Remediate`
   - `Verify`
   - `ReReview`
   - `Merge`
   - `Cleanup`
   - `Adopt`
4. Keep each stage inside its narrow permission boundary.
5. Sync durable state back to `planning/active/<task-id>/` after every stage.
6. Return to `Assess` whenever evidence changes, verification fails, or an external gate moves.
7. Stop only at:
   - `success`
   - `partial-success`
   - `blocked-with-evidence`
   - internal `failed-verification` loop-back

## Stage Contracts

### `Assess`
- Read PR state, review threads, checks, mergeability, conflicts, branch divergence, worktrees, and adoption state.
- Do not edit code, merge, delete, or adopt here.

### `Remediate`
- Apply the smallest confirmed fix.
- Do not mix unrelated refactors into closure work.

### `Verify`
- Run targeted proof for the actual issue surface.
- Do not continue on weak or indirect evidence.

### `ReReview`
- Trigger `@codex review`.
- Re-check on a 15-minute cadence while waiting for the next review result or gate change.

### `Merge`
- Merge only with sufficient evidence for mergeability, review state, and policy interpretation.
- Treat admin merge as exceptional and require explicit justification.

### `Cleanup`
- Sync retained branches and remove only proven-safe temporary branches or worktrees.
- Archive evidence before destructive cleanup when needed.

### `Adopt`
- Run post-merge adoption and health checks.
- Distinguish historical blockers from newly introduced failures.

## Common Mistakes
- Treating the workflow like a fixed linear script instead of re-entering through `Assess`
- Merging after verification failure or unresolved actionable review
- Deleting worktrees without provenance and safety evidence
- Claiming completion after re-requesting review but before observing the new result
- Claiming completion after merge while cleanup or adopt work is still open
