# Chief and Visible Worker Operating Model Design

## Status

Reviewed and user-approved specification. Planning Stage 4 is complete; implementation has not been authorized.

This is a design specification, not an implementation plan. It records the approved Chief/visible-worker operating model and the constraints that a later implementation plan must preserve.

## Authority And Lifecycle

- Active task: `planning/active/chief-worker-operating-model-20260710/`
- Lifecycle state: waiting_review, awaiting Stage 5 authorization
- Durable authority: the task-scoped planning trio
- Companion role: detailed design only
- Sync-back status: reviewer verdict and accepted revisions synchronized to the trio

If this specification conflicts with the current planning trio, the trio wins and the conflict must be reconciled before implementation planning.

## Problem

All human task communication currently passes through the Chief session. That gives Chief valuable cross-task business context, but it also causes the Chief chat to accumulate unrelated research, implementation details, logs, and historical task state.

Harness simultaneously requires Chief to use the currently bound planning trio as task authority. When Chief also performs tracked research, planning, execution, and verification directly, chat context becomes an implicit second memory system and task authority becomes unstable.

The design must separate governance context from production context without reducing Chief to a clerical scheduler or losing necessary business judgment.

## Goals

- Keep the current bound trio as the only durable task source of truth.
- Keep Chief focused on intake, binding, business judgment, authorization, gates, acceptance, and lifecycle reconciliation.
- Route tracked production work to a visible session worker by default.
- Preserve one task-local worker context across major phases when it remains trustworthy.
- Make phase transitions, direct human steering, parallel work, model routing, permissions, and recovery deterministic.
- Treat worker-local subagents as bounded session-internal implementation details.
- Remain a thin governance overlay rather than a runner, scheduler, queue, or second memory system.

## Non-Goals

- No scheduler, daemon, command bus, worker inbox, or autonomous worker queue.
- No persistent session registry, second task board, second planning directory, or new receipt dialect.
- No model-specific workflow branches in durable policy.
- No automatic release, publish, send, merge, deploy, archive, destructive operation, or external write.
- No requirement for Chief to absorb complete worker transcripts or raw subagent output.
- No attempt to make worktree isolation equivalent to a security sandbox.
- No implementation design for Codex internals or unsupported per-thread permission controls.

## Core Principles

### File Authority, Session Utility

The current bound trio is durable task authority:

- `planning/active/<task-id>/task_plan.md`
- `planning/active/<task-id>/findings.md`
- `planning/active/<task-id>/progress.md`

Execution receipts, diffs, tests, review output, source references, and publish evidence are evidence surfaces. They support decisions but do not independently redefine task scope, accepted decisions, proof status, or lifecycle.

Chief and worker sessions are control and working-context surfaces. Their chat histories may help explain provenance or diagnose inconsistency, but they are not task memory.

### Chief Governance, Worker Production

Tracked production work defaults to a visible worker. Chief-direct production is limited to:

- quick tasks that remain single-stage, low-context, and non-durable; and
- narrow checks required for Chief's gate, acceptance, or reconciliation responsibility.

Chief may reason deeply enough to frame the business problem, challenge assumptions, choose proof, assess risk, and accept or reject worker output. Chief should not pre-emptively reproduce the complete research, design, plan, implementation, or verification that the worker is assigned to produce.

### One Primary Visible Worker Per Tracked Task

A tracked task normally has one primary visible worker session across Discovery, Design, Execution, and Verification phases.

The worker session concentrates task-local exploration history and working context. It is a cache, not authority. Phase changes, long chat history, and normal context compaction do not by themselves require a replacement worker.

### Explicit Major-Phase Gates

The primary worker may continue autonomously within an approved major phase. At the end of that phase it must return a compressed checkpoint and wait for Chief's explicit gate before entering the next major phase.

Adjacent phases may be combined when risk is low, but every boundary declared as major remains a return-to-Chief gate.

## Roles And Authority

| Role | Owns | Does Not Own |
| --- | --- | --- |
| Human | final intent, priorities, risk acceptance, exceptional concurrency approval | routine worker bookkeeping |
| Chief | intake, task binding, business framing, authority filtering, authorization, phase gates, hybrid review, acceptance, reconciliation, lifecycle route | default tracked production work |
| Primary visible worker | discovery, research, analysis, design/plan drafting, approved execution, proof production, phase receipt | final scope, accepted proof, lifecycle authority |
| Visible parallel worker | one independently admitted bounded slice | second-primary status or unbounded continuation |
| Worker-local subagent | bounded phase-internal tactics | task authority, trio lifecycle, direct human/Chief outcome claims |
| Independent verifier | risk-triggered independent proof or audit | task lifecycle decision |

## End-To-End Phase Model

### 1. Intake And Bind

Chief owns:

- quick versus tracked classification;
- authority root and task ID selection;
- exact trio restoration;
- objective, non-goals, risk, proof target, stop conditions, and phase selection;
- Assignment Packet derivation.

Chief does not forward raw Chief chat history. Relevant recent human input first passes through authority filtering.

### 2. Discovery And Analysis

The primary worker owns research, source inspection, problem analysis, alternatives, and open-risk identification.

The phase returns to Chief for a direction gate. Chief may accept, reject, narrow, request evidence, or authorize Design and Planning.

### 3. Design And Planning

The primary worker owns the detailed design, plan, proof stack, risk controls, and rollback framing within the approved objective.

Chief owns the business, scope, risk, authority, and approval gate. Deep-reasoning plans follow the repository's reviewed-plan discipline before execution.

### 4. Execute

The primary worker executes autonomously inside the approved slice, file boundaries, permission class, proof contract, and stop conditions.

Material scope or authority change requires a safe-point stop and a return to Chief.

### 5. Verify

The worker produces the declared primary and backstop proof. An independent verifier is used when risk, evidence inconsistency, review policy, or an explicit proof contract requires independence.

Chief performs a hybrid evidence gate and does not substitute a quick smoke check for the declared primary proof.

### 6. Reconcile And Accept

Chief accepts or rejects the proposed outcome and reconciles accepted durable changes into the trio. Chief then selects the next phase, follow-up owner, lifecycle state, or stop condition.

Workers may append bounded factual progress or outcome evidence only when the Assignment Packet and repository policy allow it. Workers may not unilaterally change accepted scope, authority, proof status, or lifecycle.

## Authority Filtering And Context Transfer

Chief converts recent human conversation into task-bound deltas before worker handoff.

### Accepted Inputs

- current task objective changes;
- new constraints or non-goals;
- business decisions;
- proof or acceptance changes;
- safety or stop conditions;
- explicit source references;
- cross-task facts that have been restated as current-task facts or constraints.

### Rejected Inputs

- unrelated historical conversation;
- superseded decisions;
- speculative background that has not been accepted;
- raw transcripts passed only for convenience;
- facts that conflict with the bound trio without reconciliation.

Durable deltas are written to the trio before a new Assignment Packet is derived. The worker receives exact trio paths, a bounded packet, and necessary source references, not Chief's accumulated conversation.

## Assignment Packet Contract

The Assignment Packet is a derived prompt contract. It is not a new durable registry or queue item.

The fields below are logical contract requirements, not a declaration that every field already exists in the live Binding Packet schema. Planning Stage 4 must map them onto existing fields or propose the smallest compatible schema delta.

Packets and receipts minimize sensitive material. They reference sources and evidence instead of inlining secrets, credentials, private connector content, or unnecessary raw data. Private binding tokens and session handles must not be copied into human-visible summaries when a public binding version or receipt reference is sufficient.

### Authority And Identity

- `authorityTaskId`
- `planningRoot`
- exact trio paths
- binding identity and current observation
- visible worker identity or pending session handle

### Phase And Scope

- major phase and bounded current slice
- objective
- non-goals
- allowed and forbidden changes or surfaces
- source set and system of record when applicable
- stop conditions

### Proof And Return

- proof target
- primary proof
- backstop proof when needed
- evidence sink
- expected receipt
- return-to-Chief instruction
- expected check-in deadline class

### Runtime Execution Profile

- requested capability class
- reasoning demand
- cost preference
- latency class
- risk class
- upgrade trigger

### Permission Envelope

- permission class
- allowed operations
- network or external-action boundary
- approval gate
- publish target when applicable
- rollback reference when applicable

### Delegation Policy

- `prohibited`
- `worker_discretion`
- `encouraged`

Tracked phases default to `worker_discretion`.

The packet should not specify individual subagent IDs, counts, models, watchdogs, or lifecycle. It may provide bounded delegation hints when Chief has identified obviously independent slices.

`encouraged` asks the worker to prefer useful delegation; it does not require a spawn when the worker determines that delegation would add cost, latency, or coordination risk without material benefit.

## Worker Preflight

Before production work, the worker must:

1. Restore the exact trio paths from the authority root.
2. Verify task, binding, phase, slice, proof target, evidence sink, permission class, and delegation policy.
3. Restate the bounded objective and stop conditions.
4. Fail closed on missing, stale, ambiguous, or contradictory authority.

The worker must not infer authority from session title, directory proximity, previous chat, or a derived global view.

## Worker Return And Receipt

Major-phase return reuses the existing receipt and evidence surfaces.

The return must communicate:

- binding and worker identity;
- phase and current slice;
- outcome claim and status;
- evidence and source references;
- scope and non-goal check;
- material risks, blockers, and failed paths;
- relevant direct human input;
- proposed durable delta;
- requested Chief gate;
- next suggested action.

The visible session mirrors only the receipt identity, status, one-line outcome, and gate request. Detailed proof remains in referenced artifacts and existing evidence sinks.

A receipt records outcome evidence. It does not accept its own claim or determine task lifecycle.

The logical return requirements must be represented through the existing receipt schema, referenced evidence, and existing trio coordination notes. They do not authorize a new checkpoint or receipt dialect.

Planning Stage 4 must map the logical return into the live schema explicitly:

- binding and session identity use the existing identity fields;
- outcome, material risks, direct-human delta, and proposed durable delta may be summarized in `summary` or an existing trio coordination note;
- proof uses `evidenceRefs` and `sourceRefs`;
- scope uses `scopeCheck`;
- the gate request and next route use `nextSuggestedAction`;
- publish or blocker outcomes use the existing `publishRef` or `blockerReason` fields.

No implementation may add undeclared receipt fields merely to mirror the logical contract.

## Hybrid Gate Model

Chief uses `file-first, session-as-an-audit-source`.

### Level 0: Normal File Gate

Read the trio, phase receipt, and referenced evidence. This is the default path.

Before evaluating the outcome claim, Chief must identity-match the receipt to the authoritative binding, task, worker, and session handle. Identity mismatch is a stop condition, not a review warning.

### Level 1: Targeted Artifact Review

Inspect specific source material, diffs, test output, or proof artifacts when claims are incomplete, risk is elevated, or scope changed.

### Level 2: Targeted Session Audit

Inspect relevant worker turns when trio, receipt, and artifacts disagree, provenance is missing, or a direct human instruction may have changed authority.

### Level 3: Full Audit Or Independent Verification

Pause the phase when there is systemic inconsistency, selective reporting risk, invalid evidence references, irreversible impact, or repeated correction. Audit the relevant session or assign an independent verifier.

If Chief must redo the worker's core research to complete a gate, Chief should stop the narrow audit and assign verification work rather than expanding Chief-direct production.

## Direct Human Steering

Chief is the primary human instruction path. Direct input to a visible worker remains a low-frequency fallback.

The worker classifies direct input as:

- `stop_or_safety`: stop safely and report immediately;
- `in_slice_clarification`: continue within current authority and record the material delta;
- `authority_changing_instruction`: stop at a safe point and submit a pending change to Chief.

Authority-changing input must be reconciled into the trio and reissued in a new or revised Assignment Packet before execution continues. The worker must not execute first and rely on later backfilling.

## Worker Topology And Concurrency

### Active Tasks Versus Executing Lanes

Many tasks may remain active or waiting. By default, Chief manages at most two visible executing lanes globally.

Each lane may hold:

- a primary worker for a different task; or
- a primary worker plus one admitted visible parallel worker for the same task.

More than two visible executing lanes requires explicit human approval after Chief explains the independent benefit and reconciliation risk.

Planning Stage 4 must reconcile this global two-lane operating rule with older V0b per-task caps, hard-cap wording, parallel-approval rules, and spawn-authority conditions rather than leaving competing concurrency policies.

Worker-local subagents do not consume visible lanes unless they cross the promotion boundary.

### Visible Parallel Worker Admission

A visible parallel worker is allowed only when all conditions hold:

- independent objective and proof target;
- bounded, non-overlapping allowed surfaces;
- independent evidence sink;
- no dependency on another worker's unfinished intermediate result;
- no concurrent ownership of the same mutable state, or a deterministic merge order;
- real parallel benefit;
- one-slice return behavior;
- visible lane capacity or explicit human expansion approval.

Parallel status cannot be used to create a second primary worker or evade the lane ceiling.

## Worker-Local Subagent Governance

Subagents are session-internal autonomous implementation details with bounded auditability.

### Delegation Policy

- `prohibited`: use for small, strictly sequential, sensitive, shared-state, or conflict-prone slices.
- `worker_discretion`: the tracked-phase default; the worker evaluates whether bounded independent delegation materially improves the slice.
- `encouraged`: use when Chief has identified multiple independent read-heavy, review, test, or evidence slices.

There is no `required` state. A requirement for independent proof belongs in the proof contract. The execution topology is then selected under the normal subagent or visible-verifier boundary.

### Fixed Delegation Envelope

- Subagent authority is a strict subset of parent worker authority.
- Subagent runtime permissions cannot exceed the parent worker permission ceiling.
- Subagents receive only the necessary packet subset and source references.
- Subagents do not receive Chief chat history.
- Subagents do not write trio authority, decide lifecycle, publish, send, or cross major phases.
- Subagents do not independently own long-lived mutable state.
- Subagents return only to the primary worker.
- The primary worker owns integration, proof, cost, conflict handling, and the phase receipt.

### Promotion Boundary

A delegated slice must become a visible parallel worker when it becomes long-running, cross-phase, directly human-steered, independently user-visible, independently outcome-bearing, or the owner of distinct mutable state.

Promotion consumes a visible lane and requires normal binding, proof, return, and watchdog rules.

## Model And Reasoning Routing

Durable policy requests capabilities, not vendor SKU names.

### Requested Profile

- `capabilityClass`: frontier reasoning, balanced execution, economy mechanical, or fast check;
- `reasoningDemand`: light, standard, or deep;
- `costPreference`: economy, balanced, or quality-first;
- `latencyClass`: interactive, standard, or long-running;
- `riskClass` and `upgradeTrigger`.

### Runtime Resolution

The target operating model requires create or continue time to use a live model inventory and resolve the requested profile into:

- `resolvedModelAtRun`;
- `resolvedThinkingAtRun`;
- fallback or upgrade reason.

The requested profile belongs to binding intent. The resolved runtime choice belongs to execution evidence.

The resolver must not silently choose a model below the requested capability. If no available model satisfies the profile, the action fails closed with a resolver or capability blocker.

This target is not the current live implementation. The current resolver handles `capabilityClass`, model selection, and fallback only; the live Binding Packet schema does not yet carry the complete reasoning, cost, or latency profile, and resolver output is not yet wired into visible-thread creation or continuation. Planning Stage 4 must reconcile resolver inputs, schema representation, spawn/continue wiring, and resolved-choice evidence before this target can be claimed as operational.

### Current Non-Normative Mapping

- demanding ambiguity, architecture, critical planning, or critical review: Sol-class frontier model;
- approved-plan research, integration, execution, and verification: Terra-class balanced model;
- low-ambiguity mechanically verifiable work: Luna-class economy model.

Phase name alone does not determine the model. High-risk execution may require frontier capability, while a routine review may use balanced capability.

The same visible worker session may change model and reasoning at a major-phase gate when the platform supports continue-turn overrides. Model change alone is not a respawn condition.

## Permission Model

Model capability and runtime permission are independent.

Chief may use full or bypass access when the human explicitly chooses it. Visible workers should not automatically inherit full access as their default operating model.

### Permission Classes

| Class | Intended Work | Required Boundary |
| --- | --- | --- |
| `observe` | discovery, research, review, planning | read-only; source-specific network or app access only |
| `workspace` | coding, local documents, tests | isolated worktree plus workspace write; no external publish or send by default |
| `egress-gated` | dependency retrieval, source connection, narrow external write | explicit destination and tool; approval for new external action |
| `release` | push, PR, deploy, send, publish, irreversible operation | separate approved slice, rollback, publish evidence, immediate post-slice downgrade |

### Dual Gate

Safe work requires both:

`binding authorization AND runtime enforcement`

The binding explains what the worker is authorized to do. Sandbox, permission profile, tool policy, network controls, and credential scope enforce what the process can do.

Neither side substitutes for the other:

- `allowedOps` without a sandbox does not prevent an out-of-scope command;
- a sandbox without task binding does not prevent changes to the wrong in-scope file or objective.

Permission escalation may occur only at a major-phase or explicit approval gate. Workers and subagents cannot self-upgrade.

### Current Platform Gap

The current visible-thread creation control exposes project, environment, model, and reasoning selection, but it has not been proven to expose an atomic per-thread permission selection. The current local default is full access without approval, and the project has no worker-specific local permission override.

Project configuration, permission profiles, managed requirements, worktrees, credential minimization, and tool restrictions may provide parts of the boundary. A later implementation phase must verify which mechanisms can produce a genuinely restricted visible worker without also changing Chief's intended access.

Until that proof exists, worktree isolation plus a narrow packet is defense in depth, not a hard security boundary.

## Check-In And Watchdog

Worker return is event-driven.

Required events include:

- binding verified and started;
- blocked;
- pending authority change;
- safety issue or respawn recommendation;
- major phase ready for gate.

Normal execution does not send periodic still-working messages.

`expectedCheckInBy` is a milestone deadline, not a polling interval.

Default timing classes:

- startup acknowledgement: 2 minutes;
- quick read-only check: 5 minutes;
- standard research, coding, or review slice: 10 minutes;
- long build, full verification, or deep research: 20–30 minutes.

On the first miss, Chief performs one status probe and grants a minute-scale grace period.

After the grace period:

- a responsive worker with a valid binding and credible active milestone may receive one revised deadline appropriate to the slice;
- continued silence, an unavailable session, or a system error marks the worker stale and triggers the normal respawn assessment;
- a failed binding or context-integrity probe first triggers exact restore and rebind;
- a second failed probe after restore/rebind produces `respawn_recommended` or a blocker rather than another polling loop.

Busy polling at approximately 20-second intervals is prohibited as a lifecycle practice.

## Task Switching And Pending Priority

Chief attention switching does not pause workers that remain inside an approved phase.

Workers wait at major-phase boundaries. Chief restores exactly one task authority per gate round and processes pending checkpoints in this order:

1. safety, stop, or authority-changing human input;
2. blocker, external-write approval, or Chief decision;
3. major phase ready for gate;
4. watchdog miss;
5. ordinary started or check-in event.

Equal-priority items use observed time unless the human sets an explicit priority.

Pending state is derived from existing trio, receipt, and board surfaces. This design does not add a queue or session registry.

## Continue, Rebind, Respawn, And Abandon

### Continue

Continue the primary worker when:

- the task and binding remain the same;
- the worker can restore the trio and restate phase, slice, and proof;
- the session is available;
- no material authority or trust-boundary change occurred.

### Rebind Before Respawn

The first context inconsistency triggers exact trio restore, binding reissue, and a bounded integrity probe.

Normal context compaction, chat length, and phase transition are not respawn triggers.

### Respawn

Respawn when:

- the session is unavailable or has a system error;
- safe rebind is impossible;
- the user requests fresh context;
- the trust boundary materially changes; or
- observable context-integrity failure persists after restore and rebind.

Observable context-integrity failure includes repeated omission of recorded decisions, repeated reuse of already-failed paths, or inability to produce a consistent bounded handoff.

Respawn replaces the primary worker. It does not add concurrency.

### Abandon

Abandon the worker or slice when it is no longer needed, repeatedly off-scope, unverifiable, unsafe, or dependent on session memory that contradicts file truth.

### Stage 4 Reconciliation Requirements

Planning Stage 4 must audit and reconcile the approved operating model against the current V0b documents and runtime before planning implementation. At minimum it must resolve:

- logical Assignment Packet requirements versus the live Binding Packet schema;
- requested reasoning, cost, and latency profile versus the current capability-only resolver;
- resolver output versus visible-thread create and continue controls;
- global two-visible-lane policy versus older per-task, soft-max, hard-cap, parallel-approval, and spawn-authority wording;
- restore/rebind-first precedence versus older rules that directly respawn on material file drift, fresh model, source, or proof target;
- logical return requirements versus existing `WorkerReceiptSchema` fields and trio coordination notes;
- requested permission classes versus the currently provable visible-thread permission controls;
- sensitive-data minimization and redaction for packets, receipts, source references, session handles, and model inventory.

The result must be one coherent policy. Older V0b wording cannot remain as a competing authority after an implementation decision is accepted.

## Failure And Escalation Rules

Fail closed when:

- task binding is absent or ambiguous;
- the trio is missing or contradictory;
- proof target or evidence sink is missing for a tracked phase;
- required permission cannot be enforced;
- requested model capability is unavailable;
- worker output conflicts with authority or evidence;
- receipt identity does not match the authoritative binding, task, worker, or session;
- direct human input changes authority without reconciliation;
- parallel admission or visible lane capacity fails.

An ordinary execution failure remains a worker execution issue when the approved plan is still sound. A mismatch in scope, architecture, proof, permission, or authority is a plan or governance issue and returns to Chief.

## Mode-Aware Verification Contract

### Mode

Design and planning.

### Proof Target

The specification must define a coherent operating model that keeps trio authority, reduces Chief context pollution, preserves business governance, delegates tracked production, and closes context, phase, concurrency, subagent, model, permission, and recovery boundaries without creating a second control system.

### Primary Proof

Read-only review of this specification against the approved planning trio and the live ChiefOps/Codex control surfaces.

### Backstop Proof

Scenario audit of the acceptance cases below, plus placeholder, contradiction, ambiguity, and scope scans.

### Escalation Trigger

Stop Stage 3 if review finds a second durable authority, hidden runner, unsupported permission guarantee, conflicting worker ownership, model-specific durable policy, or an unclosed authority path.

### Evidence Sink

- this specification;
- `planning/active/chief-worker-operating-model-20260710/findings.md`;
- `planning/active/chief-worker-operating-model-20260710/progress.md`.

### Reconcile Rule

Reviewer verdict and accepted revisions are summarized back to the trio. The specification remains a companion artifact.

### Unacceptable Substitute

- green code tests without design review;
- a general statement that Chief manages and Worker executes;
- a platform feature claim that has not been verified;
- a worktree-only claim of permission isolation;
- a worker receipt that accepts its own task outcome.

## Acceptance Scenarios

The reviewed design must produce deterministic answers for these cases:

1. A quick, single-stage task remains Chief-direct without creating a trio or worker.
2. A tracked task receives one primary visible worker and a bounded Assignment Packet derived from the bound trio.
3. Chief switches to another task while the first worker remains inside an approved phase.
4. A worker finishes a major phase and waits for Chief instead of entering the next phase.
5. The user gives an in-slice clarification directly to the worker.
6. The user gives an authority-changing instruction directly to the worker.
7. A normal context compaction occurs without causing respawn.
8. A worker remains context-inconsistent after exact restore and rebind.
9. Two independent slices request parallel execution while one visible lane is available.
10. Two visible lanes are already occupied when another parallel slice is proposed.
11. A non-Ultra worker receives `worker_discretion` and explicitly evaluates bounded subagent use.
12. An Ultra worker receives `prohibited` and may not proactively delegate.
13. A delegated slice becomes cross-phase or owns distinct mutable state and is promoted to a visible worker.
14. A planning phase requests frontier capability, while a routine approved execution phase uses balanced capability in the same worker session.
15. A worker requires release authority but currently has workspace permission.
16. A receipt conflicts with referenced proof or the trio, triggering a deeper audit.
17. A receipt echoes the wrong task, worker, binding, or session identity and is rejected before outcome review.
18. The first watchdog miss receives one probe, but the worker remains silent after grace and enters stale/respawn assessment.
19. Chief chat contains a task delta that conflicts with the trio, so Chief reconciles authority before issuing a packet.
20. The live model inventory has no model satisfying the requested capability profile, so resolution fails closed.
21. A subagent requests higher permission or publish authority than its parent and is denied by the parent ceiling.
22. The visible-thread platform cannot enforce the requested restricted permission profile.

## Approved Decisions Summary

- Trio is the only durable task authority.
- Tracked production defaults to a visible worker.
- Chief-direct is limited to quick work and narrow governance verification.
- One tracked task normally uses one primary visible worker session across phases.
- Major phases require explicit Chief gates; within-phase execution is autonomous.
- File-first hybrid gating uses sessions only as escalation-driven audit sources.
- Chief does not forward raw chat history.
- Direct human steering is Chief-primary with a controlled visible-worker fallback.
- Default global visible executing capacity is two lanes.
- Check-ins are event-driven with minute-scale milestone deadlines.
- Normal compaction is not a respawn trigger.
- Worker-local subagents are bounded internal details with promotion triggers.
- Delegation policy is `prohibited`, `worker_discretion`, or `encouraged`; tracked default is `worker_discretion`.
- Durable model routing requests capability profiles rather than model names.
- Visible worker permissions follow least privilege and require both logical authorization and runtime enforcement.
- Unsupported per-thread permission guarantees remain an explicit implementation-phase gap.

## Stage Boundary

Planning Stage 3 ends after:

1. inline specification self-review passes;
2. one read-only reviewer returns an approval or bounded revision request;
3. accepted revisions are applied;
4. the verdict and durable conclusions are synchronized back to the trio; and
5. the user reviews the written specification.

No implementation plan or execution starts without a separate user decision to enter Planning Stage 4.
