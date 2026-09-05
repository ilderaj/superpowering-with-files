---
name: dev
description: Development quality contract for Trio v2 implementation work.
---

# Development Capability

This capability applies after the Trio entry policy selects development work. It governs quality behavior only. The Trio remains the durable task authority, while the Host owns worker and subtask lifecycle, continuation, requested and actual model evidence, permissions, and external or human gates.

## Quality Loop

Inspect the current code or artifact first, along with constraints, ownership, and the baseline, before changing anything. State the goal, constraints, success criteria, and relevant risks. Clarify or design only when material uncertainty, unclear architecture, a non-obvious root cause, or high-risk judgment makes it necessary. When judgment is material, compare bounded alternatives and record the selected trade-off.

Use the highest feasible public seam. Keep the rule red before green: write one behavior at a time, observe a real RED before production text or code, write the smallest GREEN change, and refactor only while GREEN. Keep one vertical slice in flight; it must be independently verifiable. Reject implementation-coupled assertions, tautological expectations, bulk horizontal test batches, and mock-only proof.

## Implementation Discipline

Choose the simplest bounded solution that satisfies the verified slice and its constraints. Make the smallest root-cause diff against the existing code or text. Reuse an existing public surface before creating a new one. Add no speculative complexity: no speculative abstractions, configurable branches, or machinery the slice does not need. Preserve working behavior and architectural ownership while changing only what the slice requires. Fallbacks are explicit-contract-only: add a fallback only when the governing contract explicitly requires or permits one; never invent an unexpected fallback. Remove obsolete code only within the bound slice and only when removal is verifiable. Record out-of-scope findings in the Trio findings file without mutating the surface.

## Planning Contract

Plan the smallest independently verifiable slice with exact files, dependencies, non-goals, proof command, evidence sink, stop conditions, and return contract. Every step must have a concrete outcome; use no placeholders. Wide mechanical changes use expand, migrate in green batches, then contract. Keep durable task state in the Trio and do not create another authority or task-state surface.

Every execution handoff must be decision-complete for the executor: objective, exact affected surfaces when known, verified baseline, required behavior, non-goals, dependencies and order, RED proof, smallest GREEN implementation, verification command, backstop verification, evidence sink, stop or block conditions, and expected return contract.

Quick work stays lightweight and does not acquire mandatory fan-out, worktree, design, or review ceremony. Tracked work restores or creates only the three planning files under the bound active task. Deep reasoning is a current-round decision for material uncertainty or high-risk judgment; it is not a durable task type and does not create another authority.

## Debugging Contract

Start with a fast, deterministic, red-capable feedback loop. Reproduce exactly, minimize the case, and gather evidence across the relevant public seams. Trace the bad value backward to its root cause. State one falsifiable hypothesis, change one variable at a time, and test it. Fix the source and keep a regression test. After three failed attempts, stop and question the plan or architecture instead of adding another patch.

## Review Contract

Review a fixed work product on independent Standards and Spec axes. Check the implementation against repository reality and the bound requirements before changing it. Verify every finding technically; important findings block acceptance until addressed. A review report is evidence to evaluate, not an automatic implementation command.

## Verification Contract

Before completion, commit, or phase advance, run fresh verification completely. Read command exits, test counts, and failure details; preserve the evidence before making a claim. A worker report, previous run, partial run, or adjacent green test is not proof. Requested model and effort express intent; without authenticated Host evidence, actual model and effort remain unknown.

## Method Selection

`dev` selects methods from task evidence; it does not run every method on every task. Selection is declarative method routing: a matching installed Host skill is optional acceleration under the same Trio scope and not a new projected inventory entry, an implicit dispatch permission, a model choice, or a claim of authenticated Host execution.

| Method | Trigger | Required evidence | Selection effect | Escalation / non-effect |
|---|---|---|---|---|
| `domain-modeling` | A domain term, rule, state, or role is new, renamed, overloaded, or contradictory. | Read the existing terminology or ADR source; record the resolved term and a concrete scenario in the Trio. | Runs before design when language affects the interface. | Creates or updates CONTEXT.md or an ADR only under explicit authority; material unresolved terminology escalates to Chief. |
| `codebase-design` | A new or materially expanded interface, an unclear test seam, repeated adapters, shallow or pass-through friction, a wide refactor, or a coupling and locality finding. | Module, interface, seam, and depth rationale, dependency category, test strategy, and the selected trade-off. | Runs after domain modeling when both match; alternatives only for material choices. | Never refactors, creates abstractions, or fans out automatically; major interface decisions escalate to Chief. |
| `diagnosing-bugs` | Reported broken, throwing, failing, or slow behavior; an unexpected test failure; or three disciplined failed attempts. | An exact red-capable loop, a minimized reproduction, 3-5 ranked falsifiable hypotheses, probes, and regression or backstop evidence. | Runs before a root-cause fix unless a known reproduction already supports ordinary TDD. | No speculative patch, broad instrumentation, or unauthorized environment access. |
| `code-review` | Review is requested; a fixed non-empty diff is ready for phase advance or closure; or a worker returns a candidate. | A resolved fixed point plus separate Standards and Spec reports or counts and technically verified material findings. | Runs after implementation and verification and before Chief acceptance or risk-triggered direct closure. | Never merges the Standards and Spec axes, edits source automatically from review, merges, or replaces human acceptance. |

Priority: route and safety first; domain modeling before design when terms affect the interface; diagnosis before a non-obvious fix; TDD inside every behavior-changing slice; review after the fixed diff is complete.

## Integration Gates

Two protocols are selected by an integration boundary, not by every edit. They compose the methods above and never create a new capability family, a mandatory runner, a background worker, task state, or permission.

| Protocol | Trigger | Required result | Never implies |
|---|---|---|---|
| `change-quality-gate` | A non-empty development diff is ready to commit, push, open or update a PR, enter candidate acceptance, or close. | Bound base, spec, and head; a risk-relevant test matrix; real RED to GREEN or regression proof where behavior changed; fresh verification; `git diff --check`; a fixed-point Standards and Spec review; evidence recorded in the Trio. | A commit, push, PR creation, approval, merge, release, or a claim that a local hook alone proved quality. |
| `pr-feedback-loop` | A user explicitly binds one open PR, its Trio, a five-minute heartbeat, a severity policy, and the allowed external actions. | A read-only current PR, head, check, and thread snapshot; evidence-backed triage; deduplication keyed by PR, head SHA, thread or comment identity, and update time; a routed state of `repair_required`, `follow_up`, `awaiting_human`, or `eligible_for_native_auto_merge`. | Unbound background monitoring, monitor source mutation, issue, reply, or resolve writes without policy, direct Git merge, or treating a quiet interval as approval. Native auto-merge applies only under an explicit per-PR opt-in after a required human APPROVED review on the current head with current checks and severe-thread gates passing. |

## Read-only PR Feedback Loop

Bind one open PR to the Trio before observation: repository, number and URL, base ref and SHA, current head SHA, fixed spec reference, and a complete policy contract. The machine binding requires non-empty `requiredChecks`, `humanReviewPolicy: current_head_human_approved_required`, `mergeabilityPolicy: current_head_mergeable_required`, `severityPolicy: critical_major_repair_minor_follow_up`, `repairPushPolicy: disabled`, `threadWritePolicy: read_only`, `followUpIssuePolicy: draft_only`, and `autoMergePolicy: disabled` by default. The observer reads only the current PR, paginated review threads/reviews, and status checks through the Host's read-only GitHub adapter; it never edits source or executes GitHub actions.

When every observed field is unchanged, the loop stays quiet. A changed head invalidates all head-specific review, check, and gate evidence. Each candidate is keyed by PR, current head SHA, thread or comment identity, update time, and verdict, then classified as `real`, `already_fixed`, `stale`, `false_positive`, or `needs_user_decision` and routed by severity. Critical and Major findings route to `repair_required`; Minor findings route to `follow_up`; informational or uncertain findings remain `awaiting_human`.

`eligible_for_native_auto_merge` is only a conditional observation status: explicit opt-in for this PR, current required checks, mergeable current PR, no actionable Critical/Major thread, and a required human `APPROVED` review on the same current head must all be present. The observer never replies, resolves threads, creates issues or reviews, changes labels or credentials, closes, merges, auto-merges, pushes, commits, or approves as a human.

The reducer emits a fail-closed monitor lifecycle decision. A human approval is effective only when the current PR `reviewDecision` is `APPROVED` and an `APPROVED` review targeting the current head carries authenticated `author.__typename: User` evidence; bot or missing actor type fails closed. `CHANGES_REQUESTED` or `REVIEW_REQUIRED` invalidates historical approval. Quietness compares the complete normalized PR, check, review, mergeability, and thread/comment snapshot, not only observation keys. Review, thread, comment, and check pagination cursors advance independently and monotonically. Continue only for one bounded genuinely pending machine check; stop for `repair_required`, `deferred_follow_up_recording` (deduplicate accepted nonblocking findings into draft issues before stopping), `awaiting_human_gate`, `landing_eligibility` (exact current head plus a human gate), `stale_binding`, `rejected_binding`, `terminal_pr`, or any unreadable observation.

## Isolation and Closure

Detect existing isolation and ownership before creating a workspace. Prefer native Host isolation, avoid concurrent writes to shared mutable paths, and verify a clean baseline. Clean only a workspace whose provenance authorizes cleanup. Branch closure verifies first, preserves human gates, never auto-merges, pushes, discards, releases, deploys, publishes, or sends, and never removes a Host-owned workspace.

## Return Contract

Return the changed paths, exact commands and exits, test counts, evidence, requested and actual model or effort observations, unresolved risks, limitations, and an explicit `candidate_done` or `blocked` status. Worker completion is only a candidate; Chief performs acceptance and durable Trio writeback.
