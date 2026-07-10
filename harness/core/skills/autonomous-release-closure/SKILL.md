---
name: autonomous-release-closure
description: Use when a task must close review-to-merge work, stacked PR or release promotion chains, or post-merge cleanup and adopt follow-through using current evidence instead of one-shot actions
---

# Autonomous Release Closure

## Outcome Contract
- **Outcome:** the agent gets one reusable single-entry closure loop for PR or release closure that advances through `Assess`, `Remediate`, `Verify`, `ReReview`, `Merge`, `Cleanup`, and `Adopt`.
- **Done when:** the skill preserves `planning/active/<task-id>/` as authoritative memory, defines each stage boundary, defines strict stop or escalate rules, and treats completion as proven only after review, verification, merge, cleanup, and adoption obligations are all resolved.
- **Evidence:** `scripts/evaluate-autonomous-release-closure.mjs`, `tests/core/autonomous-release-closure-eval.test.mjs`, `tests/core/skill-index.test.mjs`, `tests/adapters/skill-profile.test.mjs`, and `tests/adapters/skill-projection.test.mjs` all pass.
- **Output:** a reusable closure protocol for unattended PR or release work, not a new runtime, router, or hook system.

## Trigger Model
- The skill is available in the workspace full profile and can be used whenever that profile is loaded.
- If the user explicitly requests `autonomous-release-closure`, the agent must call this skill.
- The agent may also call this skill proactively when the task semantics clearly match closure work such as stacked PR promotion, review-to-merge closure, or post-merge cleanup and adopt follow-through.
- The current repository does **not** provide an auto-trigger, runtime, router, or hook that hard-invokes this skill. Triggering remains user-explicit or agent-semantic.

## Best Fit Scenarios
- Review feedback is already known and the task must iterate until review, verification, and merge readiness are all closed.
- A stacked PR or release promotion chain must be advanced one proven target at a time, such as work PR to release-candidate PR to trunk PR.
- Merge already happened, but safe cleanup, sync, post-merge verification, or adopt work is still required before claiming completion.
- A task should continue unattended until it reaches `success`, `partial-success`, or `blocked-with-evidence` with durable proof.

## When to Use
- PR or release closure requires repeated loops across review feedback, verification, merge readiness, cleanup, and adoption.
- Current state must be re-read from repository and external evidence before each next action.
- The user wants one workflow that can continue until a real terminal state or a justified stop condition.

Do not use this skill when:
- the task is a quick one-shot fix with no review, merge, cleanup, or adoption loop;
- broad product requirements are still undefined;
- the next action is a large architecture rewrite rather than closure work;
- a repo-specific policy requires a human decision before any safe next action exists.

## Bridge From `finishing-a-development-branch`
- `finishing-a-development-branch` owns the integration choice and the immediate action that completes it, such as local merge or PR creation.
- Hand off to `autonomous-release-closure` after finishing succeeds **only** when the user or task explicitly requires continued unattended closure work after PR creation or integration.
- Typical handoff cases are:
  - continue driving PR feedback to merge;
  - promote a merged branch onward toward `main` or another final trunk;
  - complete post-merge cleanup, sync, or adopt obligations.
- If no continued closure obligation exists after finishing completes its integration step, do not hand off.

## Multi-PR Target Resolution
- Explicit user or task targets win first. If the user names a PR, branch, or promotion destination, use that target.
- Otherwise, resolve exactly one promotion chain from current evidence. Use PR links, branch bases, merge relationships, stack metadata, and repo policy in that order.
- Follow the default chain order only when the evidence proves a single chain: leaf or work PR -> candidate or integration branch PR -> trunk PR. Treat `main` as the default final target, not the starting target.
- If the evidence shows multiple disjoint chains or cannot prove a single chain, stop at `blocked-with-evidence` and record the competing targets instead of guessing.
- Do not merge across chains just because branch names look related.

## Loop Budget And Termination
- Default loop budget is the earliest of:
  - 10 full loops;
  - 2 hours of wall-clock time;
  - 3 consecutive rounds of the same blocker class with no new leverage.
- This outer workflow cycle is the `closure loop`.
- The 15-minute review polling cadence belongs only to `ReReview`; it does not mean each closure loop lasts 15 minutes.
- `failed-verification` is an internal loop-back result, not a terminal completion state.
- When any budget is exhausted, move to a fallback decision instead of continuing to spin.

## Fallback / Spillover Rule
- Problems that affect core functionality, correctness, security, data integrity, or release acceptance criteria are non-spillable. They cannot be merged through as deferred follow-up work.
- A deferred issue is allowed only when there is positive evidence that it is non-blocking for the claimed closure target.
- Every deferred issue must be recorded in planning, linked to a concrete owner or issue, and described as remaining work rather than hidden under `success`.
- `partial-success` is valid only when the primary closure goal is complete and the remaining deferred work is proven non-blocking.

## Workflow
1. Restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md`.
2. Start every closure loop in `Assess`.
3. Use current evidence to choose exactly one next stage:
   - `Remediate`
   - `Verify`
   - `ReReview`
   - `Merge`
   - `Cleanup`
   - `Adopt`
4. Keep each stage inside its narrow permission boundary.
5. Sync durable state back to `planning/active/<task-id>/` after every stage. During rereview waiting, record `rereview_requested_at`, `last_observed_review_at`, `last_observed_gate_state`, and `next_reassess_due_at`.
6. Return to `Assess` whenever evidence changes, verification fails, or an external gate moves; during `ReReview`, that means event-or-cadence, whichever happens first.
7. Stop only at:
   - `success`
   - `partial-success`
   - `blocked-with-evidence`
8. If a verification step fails, treat `failed-verification` as an internal loop-back and return to `Assess`.

## Lifecycle Anchor Sync
- When the closure loop reaches `success`, `partial-success`, or `blocked-with-evidence`, sync the terminal result back to `planning/active/<task-id>/`.
- If the repository provides lifecycle anchor receipts, write one under `.harness/lifecycle/anchors/<taskId>/` with the terminal outcome, evidence refs, and `syncBackRef`.
- Treat anchor receipts as review evidence for `lifecycle-sweep`, not as lifecycle authority.
- `success` can support a close recommendation only after review, verification, merge, cleanup, and adopt obligations are resolved.
- `partial-success` can support close review only when deferred work is explicitly non-blocking and owned.
- `blocked-with-evidence` supports an explicit blocker review; it must not be auto-applied by lifecycle sweep.

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
- Re-enter `Assess` on the next review result or gate change, or at the 15-minute review polling cadence, whichever happens first.
- `ReReview` is not complete just because `@codex review` was posted.
- If the loop must hand off while still waiting, planning must carry `next_reassess_due_at` and the last observed review/gate state.

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
- Implying the repository already auto-runs this skill through a router, hook, or runtime
- Treating the workflow like a fixed linear script instead of re-entering through `Assess`
- Guessing which PR to promote when evidence does not prove a single chain
- Treating the 15-minute review polling cadence as if it defines the duration of every closure loop
- Merging after verification failure or unresolved actionable review
- Treating `failed-verification` as a terminal success or terminal partial success
- Deleting worktrees without provenance and safety evidence
- Claiming completion after re-requesting review but before observing the new result
- Claiming completion after merge while cleanup or adopt work is still open
