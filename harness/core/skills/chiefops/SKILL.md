---
name: chiefops
description: Use when a tracked task needs a bounded governance lens over planning state and execution receipts, without creating a new runner or memory system
---

# ChiefOps

## Overview
ChiefOps is a narrow governance skill for tracked execution. It helps a controller read the current task state, execution receipts, and proof obligations, then produce bounded chief and worker prompt contracts for the next slice. It does not create durable state, replace task memory, or act as a runner.

## Outcome Contract

- **Outcome:** the user gets a bounded ChiefOps readout plus, when needed, a chief prompt and worker prompt contract that stay anchored to the existing planning and receipt surfaces.
- **Done when:** the output keeps `planning/active/<task-id>/` as the only durable task memory, treats `.harness/execution/receipts/<taskId>/*.json` as execution truth, cites the current `Proof Target` or primary proof surface, names the next bounded execution slice, and avoids forbidden artifacts such as a new board file, runner, or receipt dialect.
- **Evidence:** current task planning files, existing execution receipts and follow-up closures, and any derived runtime board surface already produced by Harness.
- **Output:** a governance readout and bounded prompt contract, not orchestration automation.

## When to Use
- A tracked task is already in execution and needs a concise governance snapshot before the next slice.
- You need to decide whether the next issue is an execution issue, plan issue, or proof issue using existing planning and receipt truth.
- You want a chief/worker prompt contract that stays inside current authority, receipt, and proof boundaries.

Do not use this skill when:
- the task is quick enough for direct execution without a governance pass;
- the main need is intake shaping or writing a reviewed implementation plan;
- the work needs a new runner, scheduler, daemon, or long-lived manager;
- the task lacks `planning/active/<task-id>/` or enough receipt/proof context to support a grounded governance readout.

## Required Truth Surfaces
- `planning/active/<task-id>/task_plan.md`
- `planning/active/<task-id>/findings.md`
- `planning/active/<task-id>/progress.md`
- `.harness/execution/receipts/<taskId>/*.json` when execution receipts exist
- follow-up closure state, if the task uses execution follow-ups

If the current round depends on a companion plan, read only the relevant section needed for the current slice. Do not promote the companion plan into a second durable memory system.

## Chief Prompt Contract
The chief prompt should stay compact and grounded in existing truth. It should:

- restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md` first;
- use the existing ChiefOps board/readout rather than chat history as state;
- route tracked production to a visible session worker by default;
- limit Chief-direct work to quick tasks and narrow gate or reconcile verification;
- choose exactly one bounded next action;
- avoid scope expansion;
- route intake or plan deficiencies to `plan` / `goal2plan`;
- route release-closure work to `autonomous-release-closure` when that discipline is the real next slice;
- route proof and closure work to `verify`, `reconcile`, `finish`, or `release` instead of pretending ChiefOps verifies or closes work by itself;
- request or record execution receipts through existing receipt/progress paths rather than inventing a new state surface.

The chief prompt frame stays:

```text
ChiefOps Readout
- Task: <task-id>
- Current route/lane: <tracked route or execution context>
- Proof target: <copied from the current verification contract when available>
- Execution truth: <receipt summary or "no receipts yet">
- Risk focus: <highest current blocker or drift risk>
- Recommended next slice: <one bounded slice>
- Sync-back requirement: update planning/active/<task-id>/ after meaningful progress
```

## Historical Session Routing
When a user provides historical `threadId` or `sessionId` values and asks the chief to continue, handle, or carry forward that work, those historical `threadId` or `sessionId` values default to explicit worker/session routing. Treat the IDs as a routing cue, not only as background context.

Before doing Chief inline work, explicitly choose and explain one route:

- `continue_worker`: use when the referenced worker/session is current enough, bound to the same task authority, and safe to continue.
- `respawn_worker`: use when the old session is stale, unavailable, or unsafe, but the bounded slice still matters and should be reissued in a fresh worker context.
- `handoff_worker`: use when a message or manual handoff is the safest way to continue without claiming the worker has already started.
- `chief_direct`: use only when the chief should intentionally take a bounded slice inline.

Chief-direct remains allowed only with an explicit reason. The explanation must include any stale/unsafe rationale, the bounded slice, proof target, evidence sink, and return-to-Chief gate. If the chief cannot name those fields, route the work to a worker/session path or stop for intake clarification.

Historical session routing does not create a worker registry or session manager. Record durable assignment intent only in the existing planning/progress surfaces when needed, and keep receipts for outcome evidence only.

## Visible Codex Session Worker Requests
When the user explicitly asks for a visible Codex session worker, visible Codex session worker is the requested execution route. A subagent, hidden/internal worker slice, or Chief-direct implementation is a downgrade from that request, not an equivalent fulfillment.

Before using a subagent, hidden/internal worker, or Chief-direct fallback, the chief must explicitly state:

- the requested visible Codex session worker route;
- the Codex thread/session tool path attempted or the gate that makes it unavailable;
- the downgrade reason;
- the bounded slice;
- the proof target and evidence sink;
- the return-to-Chief gate.

If those fields are missing, do not claim the worker request is satisfied. Use Codex thread/session tools, produce a pending handoff, or stop for the missing gate instead of silently substituting subagent/internal worker wording.

## Assignment Packet
When the next slice should be handed to a worker or framed for manual execution, derive an Assignment Packet from existing planning and receipt truth. The packet is a prompt contract, not a durable object or worker database.

Use runtime field names when an existing V0b field already represents the requirement. `authorityRoot` may appear as a human-facing manual-handoff label, but the packet field is `planningRoot`; likewise, the bounded objective uses `currentSlice` rather than a second `objective` field.

Tracked worker Assignment Packets require:

- `authorityTaskId`
- `planningRoot`: absolute path to the single authority checkout
- `taskPlanPath`, `findingsPath`, and `progressPath`: exact absolute paths under that authority root
- `bindingObservation`: current hashes for the exact trio files, or another observation the worker can actually verify
- `majorPhase`: `discovery`, `design`, `execute`, `verify`, or `reconcile`
- `currentSlice`: one bounded objective
- `nonGoals`
- `proofTarget`
- `primaryProof`
- `evidenceSink`
- `capabilityClass`
- `reasoningDemand`: `light`, `standard`, or `deep`
- `costPreference`: `economy`, `balanced`, or `quality_first`
- `latencyClass`: `interactive`, `standard`, or `long_running`
- `riskClass`
- `permissionClass`: `observe`, `workspace`, `egress_gated`, or `release`
- `allowedOps`
- `delegationPolicy`: `prohibited`, `worker_discretion`, or `encouraged`
- `upgradeTrigger`
- `expectedCheckInBy`: an ISO milestone deadline, not a poll interval
- `stopCondition`
- `expectedReceipt`
- `returnToChiefInstruction`

Exact trio paths are derived from `planningRoot` plus `authorityTaskId`; they are rendered for worker preflight but are not duplicate schema fields. `bindingObservation` is transient handoff evidence. `allowedOps` plus `nonGoals` express allowed and forbidden surfaces. `latencyClass` selects the deadline class, while `expectedCheckInBy` is the concrete deadline. Existing `workerId`, `threadId`, and `sessionId` fields carry visible-worker identity.

Tracked phases use `worker_discretion` as the tracked-phase default. `encouraged` is a preference, not a mandatory spawn. The Chief must not forward Chief chat history; derive the packet from the current trio and necessary source references.

Default storage rule:

- keep the packet derived/ephemeral by default;
- if assignment intent needs a durable trace, record it in the existing execution-unit contract inside `task_plan.md` and a timestamped coordination note in `progress.md`;
- do not persist assignment intent in execution receipts before work has actually been attempted or completed.

## Worker Prompt Contract
When delegating or framing a tracked worker slice, the worker prompt must include:

- the absolute `authorityRoot`, `authorityTaskId`, exact trio paths, and current binding observation;
- an exact-path preflight that reads the three authoritative files, compares the current hashes with `bindingObservation` before tracked edits, and returns `binding_mismatch` when they are missing, stale, or contradictory;
- the instruction to set `HARNESS_PROJECT_ROOT` to the absolute authority root, or pass explicit `--root` when a Harness command supports it;
- the bounded file or surface list;
- the expected proof for that slice;
- the current `Proof Target`, `Primary Proof`, and `Evidence Sink` when available;
- the instruction to keep the next slice bounded and return to the chief after that single slice;
- the requirement to return status and evidence to the Chief; Chief owns planning writeback into `planning/active/<task-id>/` unless the packet separately grants a bounded planning edit;
- the requirement to reference the existing execution-receipt schema if a receipt is written;
- the instruction to use `task_plan.md` / `progress.md` for assignment intent and execution receipts only for outcome evidence;
- the instruction not to create `release_board.md`, `worker_checkins.md`, `pr_truth.md`, a new receipt dialect, or any second planning directory.
- the instruction to keep planning single-homed: do not copy, symlink, or unignore the trio inside a worker worktree, and do not use an unbounded home-directory scan as absence proof.

## Major-Phase Gate And Audit

- One primary visible worker session normally stays with one tracked task across phases.
- Every declared major phase must return to Chief before the next phase begins; the worker remains autonomous inside the approved phase.
- Chief uses file-first, session-as-an-audit-source review: start with the trio, receipt, and referenced evidence, then inspect targeted artifacts or session turns only when risk or contradiction requires it.
- Receipts are outcome evidence. Chief alone accepts or rejects the claim and reconciles durable task state.
- Direct human input is classified as `stop_or_safety`, `in_slice_clarification`, or `authority_changing_instruction`; authority changes stop at a safe point until Chief reconciles and reissues the packet.

## Delegation And Permission

- `prohibited` forbids worker-local delegation for the slice.
- `worker_discretion` asks the worker to evaluate bounded independent tactics and is the tracked default.
- `encouraged` asks the worker to prefer useful independent tactics but never requires a spawn.
- Subagents are session-internal tactics. Their authority and permission are strict subsets of the parent ceiling, and they return only to the primary worker.
- Every child dispatch declares an explicit model and thinking value and is mechanically narrower than its parent envelope. Luna/high requires verified detailed-plan bytes and eligibility; without it, use Terra/high. Sol still requires its recorded admission. These are manual contract checks, not native host enforcement.
- When a parent binding declares child dispatches, validate every matching child return before parent acceptance; reject missing, duplicate, unexpected, or drifted returns.
- Promote a slice to a visible parallel worker when it becomes cross-phase, long-running, directly human-steered, independently outcome-bearing, or the owner of distinct mutable state.
- Binding authorization does not prove runtime enforcement. Missing permission enforcement must fail closed rather than treating a worktree as a sandbox.

## Check-In And Watchdog

Worker returns are event-driven: started, blocked, authority change, safety or respawn issue, and major-phase-ready. Default milestone classes are startup at 2 minutes, quick checks at 5 minutes, standard slices at 10 minutes, and long slices at 20 to 30 minutes. The first miss receives one probe and a minute-scale grace period; do not busy poll.

## Guardrails
- Keep `planning/active/<task-id>/` authoritative.
- Treat execution receipts as immutable truth, not as a format to reinterpret or replace.
- Reuse the existing Mode-Aware Verification Contract vocabulary exactly.
- Prefer the already-derived runtime board if available; otherwise derive only from existing planning and receipt surfaces.
- Keep the next step bounded to one slice and do not widen scope from inside ChiefOps.
- Use existing workflow lanes and skills for plan, proof, reconcile, finish, and release work.
- Stay read-only unless the enclosing task already calls for implementation work.
- `ChiefOps` may coordinate bounded next-step reasoning, but it does not own execution routing.

## Common Mistakes
- treating ChiefOps as a new runner, scheduler, or session manager
- inventing a ChiefOps-specific receipt schema or board file
- using execution receipts to store assignment intent before work has an outcome
- letting an Assignment Packet turn into a durable worker registry or hidden backlog
- using the companion plan as the primary durable memory instead of `planning/active/<task-id>/`
- producing a broad management plan instead of one bounded next execution slice
