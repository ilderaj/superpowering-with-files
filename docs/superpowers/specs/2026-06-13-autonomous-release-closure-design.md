# Autonomous Release Closure Design

## Summary

Harness should add a reusable single-entry skill that can drive a release or pull-request closure workflow from open issues to verified completion.

The recommended model is **Single Entry + Staged Core**:

- one public skill entrypoint handles the full workflow;
- the internal logic uses a stage-based state machine;
- each stage has narrow permissions, explicit exit criteria, and clear stop conditions;
- durable task truth stays in `planning/active/<task-id>/`;
- the workflow loops from current evidence rather than relying on fragile linear progress assumptions.

This design is intended to support workflows such as:

- fixing PR review feedback;
- verifying and re-requesting review;
- checking mergeability and conflicts;
- merging once gates are satisfied;
- cleaning up local branches and worktrees;
- running post-merge adoption and health checks.

## Problem

The current repo has good building blocks for individual slices of release closure:

- tracked task planning;
- review request discipline;
- review reception discipline;
- branch finishing and cleanup guidance;
- adoption and health commands.

What it does not yet have is a reusable workflow that can:

1. inspect the current closure state;
2. decide the next safe action;
3. loop through remediation, verification, re-review, merge, cleanup, and adoption;
4. stop safely when evidence is insufficient or a human decision is required.

Without that orchestration layer, end-to-end closure work is repeatable in practice but not yet captured as a reusable skill.

## Goals

- Provide one skill entrypoint for end-to-end PR and release closure work.
- Support repeated evidence-driven loops rather than one-shot actions.
- Keep durable truth in `planning/active/<task-id>/`.
- Allow safe automation of:
  - issue triage;
  - minimal remediation;
  - targeted verification;
  - review re-request;
  - periodic re-check while waiting;
  - merge;
  - post-merge cleanup;
  - post-merge adoption checks.
- Make completion semantics strict enough that intermediate progress is not misreported as finished work.
- Preserve a clear boundary between safe automation and escalation-required situations.

## Non-Goals

- Do not turn every release task into a superpowers-only deep-reasoning workflow.
- Do not hardcode repository-specific file paths beyond declared planning authority and explicit tool surfaces.
- Do not automatically perform large architectural rewrites to satisfy review feedback.
- Do not treat ambiguous policy or destructive operations as implicitly safe.
- Do not replace existing lower-level skills; this skill should orchestrate or borrow their patterns, not erase them.

## Confirmed Constraints

- Authoritative task memory remains:
  - `planning/active/<task-id>/task_plan.md`
  - `planning/active/<task-id>/findings.md`
  - `planning/active/<task-id>/progress.md`
- The skill is available from the workspace full profile, but availability is not the same thing as automatic execution.
- Triggering must stay explicit or evidence-based at the agent level; this repo does not add a hard runtime auto-trigger, router, or hook for closure work.
- The workflow must prefer current external and repository state over stale memory.
- The workflow must be able to resume after interruption.
- Waiting for new review results is part of the workflow, not an exceptional case.
- Merge, cleanup, and adoption steps require stronger evidence than ordinary code edits.

## Trigger Model

- Loading the workspace full profile makes the skill callable in the current environment.
- If the user explicitly requests `autonomous-release-closure`, the agent must use it.
- The agent may also invoke it proactively when task semantics clearly match unattended closure work, such as review-to-merge loops, stacked promotion, or post-merge cleanup and adoption.
- The repository does not currently implement a hard auto-trigger. No runtime, router, or hook should imply that this workflow starts by itself.

## Approaches Considered

### Option 1: Monolithic Controller

One large skill document owns the entire workflow with little internal structure.

Pros:

- simplest mental model for the caller;
- clearly matches the “single robot” intuition.

Cons:

- harder to maintain;
- harder to verify safely;
- easier for unrelated responsibilities to blur together.

### Option 2: Single Entry + Staged Core

One public skill entrypoint owns the workflow, but the internals are organized as an explicit state machine with narrow stage contracts.

Pros:

- still feels like one autonomous workflow;
- easier to reason about and validate;
- easier to evolve into sub-skills later if needed;
- lets each stage define its own safety boundary.

Cons:

- slightly more design work up front;
- requires explicit stage semantics.

### Option 3: Orchestrator + Multiple Child Skills

A coordinator skill delegates most actions to separate child skills.

Pros:

- maximal modularity;
- strong separation of concerns.

Cons:

- weaker “single entry” experience;
- requires additional interface design between skills;
- over-abstracted for the first version.

## Recommended Approach

Choose **Option 2: Single Entry + Staged Core**.

Why:

- it best matches the user goal of unattended end-to-end closure;
- it keeps the user-facing workflow simple;
- it gives the implementation strong internal boundaries;
- it avoids prematurely designing a large skill-to-skill protocol.

## Design Principles

1. **Assess before acting**
   Every loop begins from current evidence, not assumptions about prior progress.

2. **Narrow permissions per stage**
   Each stage may do only one category of work.

3. **Minimal remediation**
   Fix the confirmed problem surface first; do not mix in unrelated cleanup.

4. **Verification before advancement**
   A successful edit is not enough; advancement requires evidence.

5. **No ambiguous destructive actions**
   Merge, delete, cleanup, and adoption require explicit proof that they are safe.

6. **Durable resumability**
   The workflow must leave enough planning evidence to resume after interruption.

7. **Completion must be proven**
   “Looks done” is insufficient when the task includes review loops, merge, cleanup, and adoption.

8. **Do not guess the closure target**
   Promotion must follow explicit targets or a single evidenced chain, not branch-name intuition.

9. **Deferred issues need explicit proof**
   Spillover is allowed only when the remaining issue is proven non-blocking for the claimed closure target.

## Skill Boundaries And Handoff

### Relationship With `finishing-a-development-branch`

- `finishing-a-development-branch` remains responsible for choosing the integration path and carrying out the immediate action that completes that choice, such as a local merge or PR creation.
- `autonomous-release-closure` begins only after that step if there is a clear unattended closure obligation still open.
- Typical handoff cases include:
  - continuing a PR through review, verification, and merge;
  - promoting a merged branch farther along a release chain toward trunk;
  - completing post-merge cleanup, sync, or adoption work that was explicitly left in scope.
- If finishing completes the requested integration step and no downstream closure obligation remains, there is no automatic handoff.

## Target Resolution

- An explicit user or task target wins first. If a PR, branch, or destination is named, use it.
- Otherwise, resolve at most one promotion chain from current evidence.
- Evidence should be evaluated in this order:
  - PR links;
  - branch base relationships;
  - merge relationships;
  - stack metadata;
  - repo policy.
- The default progression `leaf/work -> candidate/integration -> trunk` is valid only when the evidence proves a single chain.
- `main` should be treated as the default final target in that chain, not as the automatic starting assumption.
- If evidence points to multiple disjoint chains, or cannot prove one canonical chain, the workflow must stop at `blocked-with-evidence` and record the competing interpretations instead of guessing across chains.

## State Machine

The workflow should use the following stage graph:

`Assess -> Remediate -> Verify -> ReReview -> Merge -> Cleanup -> Adopt`

Important semantics:

- this is not a one-way linear pipeline;
- every new `closure loop` begins in `Assess`;
- any stale assumption or failed check returns the workflow to `Assess`.
- target resolution must happen from current evidence before merge or promotion decisions are taken.

## Loop Budget And Termination

- The default loop budget is whichever limit is reached first:
  - 10 full loops;
  - 2 hours of wall-clock time;
  - 3 consecutive rounds blocked by the same blocker class without new leverage.
- The outer workflow cycle above is the `closure loop`.
- The 15-minute review polling cadence belongs only to `ReReview` waits; it does not mean each closure loop lasts 15 minutes.
- Hitting a loop budget does not justify pretending the work is done.
- `failed-verification` remains an internal loop-back signal. It returns the workflow to `Assess`, but repeated failures still count toward the loop budget.
- When a limit is exhausted, the workflow must either stop with `blocked-with-evidence` or narrow into a justified non-blocking spillover record.

### Transition rules

- actionable review feedback, comments, or conflicts -> `Remediate`
- code changed but proof is missing -> `Verify`
- verification complete but updated review is still needed -> `ReReview`
- review state clean and merge gates satisfied -> `Merge`
- merge complete but branch/worktree/local-vs-origin state still open -> `Cleanup`
- cleanup complete but installation or projection still needs to catch up -> `Adopt`
- any newly discovered blocker or changed external state -> back to `Assess`

## Stage Contracts

### `Assess`

Responsibilities:

- inspect PR state, reviews, comments, checks, mergeability, conflicts, branch divergence, worktrees, and adoption state;
- produce a fact summary;
- choose the next stage.

Allowed actions:

- read-only repository and remote state inspection;
- planning sync-back.

Disallowed actions:

- code changes;
- merge;
- cleanup deletion;
- adoption writes.

Output:

- current fact snapshot;
- next-stage decision.

### `Remediate`

Responsibilities:

- implement the smallest sufficient fix for confirmed issues;
- record why feedback is accepted or rejected.

Allowed actions:

- focused code or script edits;
- thread-aware response preparation;
- planning updates.

Disallowed actions:

- unrelated refactors;
- speculative rewrites before the problem is confirmed.

Exit condition:

- the candidate fix is complete and ready for proof collection.

### `Verify`

Responsibilities:

- gather strong evidence that the remediation actually addresses the issue;
- record the exact proof surface and result.

Allowed actions:

- targeted tests;
- lint or build checks;
- mergeability probes;
- conflict checks;
- adoption or doctor checks when relevant.

Disallowed actions:

- advancing on weak or indirect evidence;
- merging after failed verification.

Exit conditions:

- pass -> `ReReview` or `Merge`, depending on current external state;
- fail -> back to `Assess`.

### `ReReview`

Responsibilities:

- request fresh review after verified changes;
- periodically re-check for new feedback or gate changes.

Allowed actions:

- trigger `@codex review`;
- create or use a periodic re-check mechanism;
- read new review state.

Disallowed actions:

- merging while actionable review remains unresolved.

Default waiting behavior:

- when waiting for new reviewer output or merge-gate changes, re-check on a periodic cadence;
- the initial design target is a 15-minute interval unless the repo or tool surface requires a different cadence.

Exit conditions:

- new actionable feedback -> back to `Assess`;
- no actionable feedback and merge gates satisfied -> `Merge`.

### `Merge`

Responsibilities:

- execute merge only when mergeability, review state, checks, and policy interpretation are all sufficiently evidenced.

Allowed actions:

- normal merge;
- explicitly justified admin merge when the only remaining blocker is a known policy-level gate and repository rules allow it.

Disallowed actions:

- merging with unresolved actionable feedback;
- merging when gate cause is still ambiguous.

Exit conditions:

- success -> `Cleanup`;
- failure or changed conditions -> back to `Assess`.

### `Cleanup`

Responsibilities:

- close the post-merge local state:
  - fast-forward retained branches;
  - remove proven-safe temporary branches or worktrees;
  - archive deletion evidence where needed.

Allowed actions:

- safe local sync;
- proven-safe cleanup with recorded evidence.

Disallowed actions:

- deleting unclear or unproven objects;
- deleting dirty or provenance-ambiguous worktrees without archived evidence and explicit safety proof.

Exit conditions:

- cleanup done -> `Adopt` or terminal success if no adoption work is requested.

### `Adopt`

Responsibilities:

- run post-merge environment alignment such as global adoption or health checks;
- separate newly introduced issues from historical pre-existing blockers.

Allowed actions:

- `adopt globally`;
- adoption status checks;
- doctor or health checks;
- planning evidence updates.

Disallowed actions:

- misclassifying historical known blockers as proof that the release closure workflow failed.

Exit conditions:

- adoption complete with explainable residual state -> terminal success or blocked-with-evidence.

## Escalation Rules

The skill must stop and escalate instead of continuing automatically when any of the following is true:

- the requirement boundary is unclear and review feedback cannot be evaluated safely;
- continuing would require a broad architectural rewrite rather than issue-focused remediation;
- merge, deletion, cleanup, or admin-merge safety evidence is insufficient;
- the same blocker repeats across multiple loops without new leverage;
- external policy interpretation is uncertain;
- the next step requires a human approval the workflow does not own.
- multiple PRs or branches are in play but the evidence does not prove a single promotion chain.

When escalating, the skill must leave:

- the current facts;
- the blocking reason;
- what evidence or decision is still missing;
- the recommended next action.

## Fallback And Spillover

- Issues that affect functionality, correctness, security, data integrity, or release acceptance are not spillable. They block merge or promotion until resolved.
- A deferred issue is acceptable only when there is positive evidence that it does not block the closure target being claimed.
- Every deferred issue must be written into planning with:
  - the evidence that it is non-blocking;
  - the remaining work;
  - a concrete follow-up owner or issue.
- `partial-success` is appropriate only when the primary closure target is complete and the remaining work is explicitly recorded as non-blocking follow-through.

## Durable Outputs

Every loop should update durable task context, not merely produce actions.

The workflow should persist:

- current stage;
- latest `Assess` summary;
- current PR/branch/review/merge/cleanup/adoption state;
- what remediation was attempted;
- what verification was run and what it covered;
- whether the workflow is currently waiting for review, waiting for external state, or waiting for a human decision.

These outputs belong in:

- `planning/active/<task-id>/task_plan.md`
- `planning/active/<task-id>/findings.md`
- `planning/active/<task-id>/progress.md`

Deep-reasoning companion plans remain optional and should be introduced only when complexity genuinely justifies them.

## Outcome Semantics

### `success`

Use only when:

- the requested closure target has reached its real terminal state;
- required verification exists;
- review/merge/cleanup/adoption obligations inside scope are all complete.

### `partial-success`

Use when:

- a major milestone is done, such as a PR merge;
- but the user-requested closure workflow still has unfinished downstream obligations.

This is a progress state, not a terminal completion claim, and it must not hide spillable issues that lack non-blocking evidence and follow-up ownership.

### `blocked-with-evidence`

Use when:

- the workflow cannot safely continue because of external gates, missing authority, or unresolved ambiguity;
- and the missing condition is explicitly documented.

### `failed-verification`

Use when:

- the current remediation did not pass proof collection.

This is an internal loop signal, not a terminal outcome.

## Completion Criteria

The workflow may claim full completion only when all of the following are true:

- actionable review feedback has been resolved, dismissed with evidence, or otherwise conclusively handled;
- the latest relevant fixes have matching verification evidence;
- required merges succeeded and their gate interpretation is documented;
- requested post-merge sync, cleanup, and adoption work is complete;
- authoritative planning contains enough context for later audit or resume.

The workflow must not claim completion when:

- it only requested another review and has not yet observed the result;
- it merged the PR but skipped requested cleanup or adoption work;
- it lacks strong evidence for the final state.

## Rollout Guidance

Version 1 should optimize for the workflow proven in the PR85 / PR86 closure sequence:

1. assess current PR state;
2. fix confirmed issues;
3. verify with targeted evidence;
4. re-request review;
5. poll on a timed cadence;
6. merge when gates are satisfied;
7. sync and clean local state;
8. run adoption and health checks;
9. record residual blockers precisely.

Later versions may split internal execution helpers into child skills, but v1 should keep the public interface single-entry.

## Open Questions For Implementation Planning

- Should the 15-minute re-check be implemented with a formal automation tool, a reusable polling helper, or an abstract “periodic monitor” contract?
- Which merge-gate reasons are safe enough to classify as admin-merge eligible in v1?
- How much repository-specific cleanup policy should live in the generic skill versus repo-local guidance?
