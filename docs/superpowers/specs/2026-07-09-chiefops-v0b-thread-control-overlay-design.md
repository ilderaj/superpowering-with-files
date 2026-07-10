# ChiefOps V0b Thread Control Overlay Design

## Status

Historical V0b design record, superseded by the user-approved 2026-07-10 Chief/visible-worker operating model design and current operator documentation. The historical decisions remain preserved; concurrency, respawn precedence, model-profile, and permission semantics follow the approved design.

Implementation reference: `docs/superpowers/specs/2026-07-10-chief-worker-operating-model-design.md` and `docs/chiefops-v0b.md`.

This is a constrained design spec, not an implementation plan. It records the V0b product and protocol boundaries that must be preserved before planning implementation work.

## Goal

ChiefOps V0b gives a chief session a capability-adaptive way to observe, spawn, continue, hand off, abandon, or respawn worker sessions where platform capabilities exist, and otherwise degrade honestly to manual handoff or blocker receipts while keeping durable truth in the existing planning trio.

The design must support coding and office work, reduce wrong-trio and wrong-source failures, and stay economical by routing work to the cheapest safe model capability.

## Non-Goals

- Do not replace `planning/active/<task-id>/` as the source of truth.
- Do not create a second durable task registry.
- Do not introduce worker heartbeat runtime.
- Do not auto-publish, release, merge, deploy, archive, or write external systems without an approval gate.
- Do not rely on fixed model names in durable workflow rules.
- Do not pretend thread control succeeded when the platform cannot perform it.
- Do not create an always-on scheduler, autonomous worker queue, or separate worker backlog.

## Selected V0b Shape

V0b targets a real thread control overlay, with honest fallback.

- `native_control`: use platform-supported create, observe, message, continue, and handoff.
- `partial_control`: use supported actions and degrade missing actions individually.
- `manual_handoff`: generate a ready-to-paste worker prompt plus expected receipt shape, then wait for a real paste-back receipt.
- `unsupported`: stop with a blocker receipt.

In every mode, the same binding packet and receipt shape must be written back to the authoritative trio.

Manual handoff prompt generation is a pending state only. It may write `manual_handoff_required` or `handoff_pending`, but it must not write `started`, `binding_verified`, `done`, or acceptance evidence until a worker receipt is pasted back and identity-matched.

## Authority Binding Resolution

Before any tracked or worker flow, chief must resolve the target authority explicitly.

Allowed authority sources:

- explicit `authorityTaskId + planningRoot`
- a previously verified Binding Packet for the same worker and task
- human confirmation of the target trio

Fail-closed conditions:

- multiple active tasks exist and no explicit authority is provided
- `planningRoot` is missing or points outside the expected authority root
- `task_plan.md`, `findings.md`, and `progress.md` do not belong to the same `planning/active/<task-id>/`
- the selected trio title, status, source surface, or proof target contradicts the requested work
- an index entry points to a different trio than the per-trio coordination note

Quick/direct tasks may answer without a trio when no durable task state is needed. Once a task enters tracked, worker, cross-trio, office-source, or release/publish flow, the authority must be resolved before building a Binding Packet.

## Authority Model

The authoritative state remains file-truth:

- `planning/active/<task-id>/task_plan.md`
- `planning/active/<task-id>/findings.md`
- `planning/active/<task-id>/progress.md`
- optional receipts, PRs, approvals, release evidence, or publish evidence

Thread/session state is control plane only. It can help chief communicate with workers, but it cannot redefine scope, lifecycle, proof status, source authority, or acceptance.

## Mapping Storage

V0b uses per-trio authoritative mapping plus a generated global index.

- Source of truth: coordination notes in the target trio, especially `progress.md`.
- Derived view: generated global index for chief overview.
- Conflict rule: if index and trio disagree, the trio wins and chief must reconcile.
- Forbidden: lifecycle decisions, proof acceptance, or worker authority written only into the index.

The generated index should be rebuildable from trio records.

Minimum index fields:

- `authorityTaskId`
- `planningRoot`
- `workerId`
- `threadId` or `sessionId`
- `status`
- `lastCheckInAt`
- `currentSlice`
- `proofTarget`
- `evidenceSink`
- `indexGeneratedAt`
- `sourceProgressRef`

The index may only be generated from parseable per-trio coordination blocks. It must not be hand-edited into a competing registry.

Coordination blocks are the durable serialization of the canonical Binding Packet and Receipt schemas. They must not use a smaller or divergent schema.

Minimum coordination block types:

```yaml
type: ChiefOpsWorkerBinding
schemaVersion: chiefops.v0b
bindingId: ...
action: ...
authorityTaskId: ...
planningRoot: ...
chiefThreadId: ...
workerId: ...
threadId: ...
bindingToken: ...
currentSlice: ...
proofTarget: ...
evidenceSink: ...
capabilityClass: ...
riskClass: ...
workType: ...
authorityMode: ...
allowedOps: []
requiresHumanApproval: ...
status: bound
sourceProgressRef: ...
observedAt: ...
createdAt: ...
```

```yaml
type: ChiefOpsWorkerReceipt
schemaVersion: chiefops.v0b
receiptId: ...
receiptType: ...
authorityTaskId: ...
workerId: ...
threadId: ...
bindingToken: ...
currentSlice: ...
proofTarget: ...
evidenceSink: ...
capabilityClass: ...
riskClass: ...
status: ...
summary: ...
evidenceRefs: []
nextSuggestedAction: ...
supersedesReceiptId: null
sourceProgressRef: ...
observedAt: ...
createdAt: ...
```

Duplicate `workerId`, `bindingId`, `receiptId`, or `bindingToken` conflicts must trigger reconcile. Abandoned or replaced workers need a superseding receipt instead of deleting history.

## Spawn Authority

Chief may auto-spawn low-risk workers only when every condition is true:

- same repo and same authority root
- existing bound trio or explicitly bound current unit
- one bounded slice
- clear `currentSlice`, `proofTarget`, and `evidenceSink`
- non-destructive
- non-publish
- non-release
- no external system write
- concurrency stays within the current ceiling
- model resolver can satisfy the requested capability class
- worker can complete binding handshake before work

Chief must ask the human before:

- creating a new trio from discovery
- exceeding concurrency ceiling
- crossing repo or authority root
- release, publish, send, merge, deploy, archive, or destructive operations
- external system writes
- ambiguous source of truth, publish target, or approval gate
- high-cost model escalation beyond the declared budget
- resurrecting a stale worker when file truth conflicts with old session context

Chief must stop for review when binding fails, source truth is unclear, index and trio conflict, deep work lacks a reviewed plan, or the worker would need to improvise architecture, compliance, publication, or release judgment.

## Concurrency

Default V0b concurrency is one active worker per authority task.

- Default: `1`
- Soft max with approval: `2`
- Hard max for V0b: `3`

Parallel workers require explicit approval through the configured gate. A reviewed plan may justify or propose concurrency, and may authorize it only when the configured approval gate allows plan-based authorization. If the configured gate is human approval, raising the active ceiling still requires that human approval. Each worker must have a non-overlapping slice, separate proof target, separate evidence sink, visible index entry, and enough chief context budget for reconciliation.

A reviewed plan may authorize concurrency only. It does not authorize release, publish, send, merge, deploy, archive, destructive operations, or external system writes. Those actions still require the relevant human or approval gate.

If more than three workers seem necessary, split work into multiple trios or write a deeper plan.

## Inactive Worker Handling

Chief should continue a worker only when it is safe.

Continue requires:

- valid platform control handle
- matching `authorityTaskId` and `workerId`
- no material trio drift since last check-in
- no contradictory receipt, PR state, approval state, or lifecycle state
- next instruction is a bounded continuation of the same slice

Respawn is required when the thread is unavailable, old context may be stale, file truth materially changed, ambiguity was resolved in the trio, the task needs a fresh model/source/proof target, or binding/index/cross-trio conflict appears.

Abandon is required when the slice is no longer needed, the worker went off-scope, output is unverifiable or unsafe, or continuing would trust session memory over file truth.

Material trio drift includes changes to lifecycle status, `currentSlice`, `proofTarget`, `evidenceSink`, `approvalGate`, `sourceSet`, `systemOfRecord`, `publishTarget`, or any superseding receipt. Binding and receipt records should include `sourceProgressRef` and `observedAt` so continue decisions can compare what the worker last saw against current file truth.

Minimum `sourceProgressRef` shape:

```yaml
sourceProgressRef:
  file: planning/active/<task-id>/progress.md
  blockId: ...
  startLine: null
  contentHash: sha256:...
  observedAt: ...
```

Continue gate must compare the current block hash with the observed hash. A line move alone is not drift if the block id and content hash still match. A hash mismatch, missing block, superseding receipt, lifecycle change, or source-authority field change is material drift.

## Binding Packet

The Binding Packet is chief's contract to the worker.

Required fields:

- `schemaVersion`
- `bindingId`
- `action`
- `authorityTaskId`
- `planningRoot`
- `chiefThreadId`
- `workerId`
- `threadId` or `sessionId`, nullable only before spawn returns a handle
- `currentSlice`
- `proofTarget`
- `evidenceSink`
- `capabilityClass`
- `riskClass`
- `workType`
- `authorityMode`
- `allowedOps`
- `requiresHumanApproval`
- `createdAt`
- `bindingToken` or `bindingVersion`
- `sourceProgressRef`
- `observedAt`

Optional fields:

- `parentTaskId`
- `sourceSet`
- `systemOfRecord`
- `publishTarget`
- `approvalGate`
- `nonGoals`
- `upgradeTrigger`
- `expectedCheckInBy`
- `rollbackPlanRef`

Worker must verify the binding before work. If verification fails, worker returns `binding_mismatch` and stops.

Conditional office-work requirements:

- `workType: office` or `authorityMode: source_authority` requires `sourceSet` and `systemOfRecord` before asserting final truth.
- `allowedOps` containing `write`, `publish`, or `send` requires `publishTarget`, `approvalGate`, and `rollbackPlanRef`.
- `allowedOps` containing only `inspect`, `draft`, or `propose` may leave `publishTarget` null.

## Receipts

Worker receipts must echo the binding identity.

Required fields:

- `schemaVersion`
- `receiptId`
- `receiptType`
- `authorityTaskId`
- `workerId`
- `threadId` or `sessionId`
- `bindingToken` or `bindingVersion`
- `currentSlice`
- `proofTarget`
- `evidenceSink`
- `capabilityClass`
- `riskClass`
- `sourceProgressRef`
- `observedAt`
- `status`
- `summary`
- `evidenceRefs`
- `nextSuggestedAction`
- `createdAt`

Standard receipt types:

- `binding_verified`
- `binding_mismatch`
- `started`
- `check_in`
- `blocked`
- `done`
- `new_trio_candidate`
- `abandoned`
- `respawn_recommended`
- `manual_handoff_required`
- `handoff_pending`
- `capability_unavailable`
- `resolver_failed`

Markdown coordination notes may wrap these fields, but the key/value shape must remain parseable enough for index generation.

## Office Work Authority

Office work requires source authority, not just task authority.

Office-work authority fields:

- `sourceSet`: materials the worker may inspect or cite
- `systemOfRecord`: authoritative source when materials disagree
- `publishTarget`: declared final destination, nullable in draft-only work
- `allowedOps`: `inspect`, `draft`, `propose`, `write`, `publish`, or `send`

Schema enums:

- `workType`: `coding`, `office`, `release`, `review`, `research`
- `authorityMode`: `task_authority`, `source_authority`, `release_authority`
- `allowedOps`: one or more of `inspect`, `draft`, `propose`, `write`, `publish`, `send`

Rules:

- no `publishTarget`: draft only
- no `systemOfRecord`: summarize uncertainty, do not assert final truth
- conflicting sources: return conflict and ask chief to reconcile
- stakeholder-visible or external-facing output: require `approvalGate`
- `publishTarget` is not write permission
- `write`, `publish`, or `send` require `allowedOps`, `approvalGate`, and `rollbackPlanRef`
- office receipts in `source_authority` mode must include `sourceRefs`
- office receipts for `write`, `publish`, or `send` must include `publishRef` or a blocker reason

Receipts should include `sourceRefs` and `publishRef` when applicable, without inlining sensitive material.

## Model Resolver

V0b includes a lightweight model resolver CLI.

Resolver inputs:

- `capabilityClass`
- `reasoningEffort`
- `budgetReason`
- `upgradeTrigger`

Resolver outputs:

- `requestedCapabilityClass`
- `resolvedModelAtRun`
- fallback or downgrade explanation when needed

Resolver non-goals:

- no autonomous cost optimizer
- no hidden dynamic escalation
- no model-specific workflow branches in the core protocol
- no hard dependency on one vendor SKU or future model name

If no available model satisfies the requested capability class, spawn or continue stops with `resolver_failed` or `blocked`.

## Platform Capability Matrix

| Requested action | Native capability present | Partial capability fallback | No capability fallback | Deterministic receipt rule |
|---|---|---|---|---|
| `spawn_worker` | create worker thread/session | generate handoff prompt when manual handoff is allowed | block when manual handoff is not allowed | `started` only after real worker receipt; otherwise `handoff_pending` or `capability_unavailable` |
| `observe_worker` | read thread/session state | use last per-trio receipt and index entry when receipt identity matches | mark observation unavailable | `check_in` only from real worker observation; otherwise `capability_unavailable` |
| `send_instruction` | send message to worker | produce manual continue prompt when binding is valid and no material drift exists | block if binding is invalid or material drift exists | `manual_handoff_required`, `handoff_pending`, or real worker receipt |
| `continue_worker` | resume existing handle when binding is valid and no material drift exists | manual continue prompt when binding is valid and no material drift exists | recommend respawn when slice still matters; abandon when slice no longer matters or is unsafe | `handoff_pending`, `respawn_recommended`, `abandoned`, or real worker receipt |
| `handoff_worker` | platform handoff support | manual handoff prompt when safe transfer is possible | block when safe transfer is impossible | `manual_handoff_required` or `capability_unavailable` |

`manual_handoff_required` and `handoff_pending` are not evidence that a worker has started or completed work.

## Chief Gate

Worker receipts are evidence, not acceptance.

Chief gate is reached only after intake and route, and every accepted outcome must reconcile back to the authoritative trio.

After receiving a worker receipt, chief must gate it against:

- Binding Packet identity
- `proofTarget`
- `evidenceSink`
- `nonGoals`
- `allowedOps`
- `approvalGate`
- source authority
- lifecycle state
- risk class

Gate outcomes:

- `accept`: write accepted evidence and reconcile trio
- `request_changes`: continue or respawn worker with a bounded correction
- `block`: record blocker and stop
- `respawn`: abandon stale or polluted context and create a fresh worker packet
- `abandon`: mark the slice unnecessary or unsafe
- `new_trio_candidate`: record discovery and route through chief decision

Only a gated outcome may update acceptance, lifecycle, publish, release, or close state.

## Redaction And Privacy

Packets, receipts, indexes, and review artifacts must avoid unnecessary sensitive data.

Forbidden in durable records:

- secrets, tokens, API keys, session secrets, or auth headers
- raw PII unless explicitly required by the task and approved
- full personal local paths when repo-relative paths are enough
- private external document URLs when an opaque ref or short citation is enough
- raw thread/session handles when a redacted handle or short hash is enough

Generated indexes that may be committed must be sanitized. External source references should record only the minimum citation/ref and access scope needed for audit.

## Lifecycle Boundaries

Session state, index state, and worker receipts cannot close, archive, release, publish, or accept a task by themselves.

Rules:

- close/archive must use the existing lifecycle gate for `planning/active/<task-id>/`
- archive requires the task to be explicitly closed and archive eligible
- erroneous receipts are superseded by correction notes, not deleted
- external write/publish/send requires approval and rollback/undo path
- if rollback/undo is unavailable, chief must downgrade to draft or propose mode
- reconcile must record how worker evidence changed task state, or why it did not

## Core Flow

```mermaid
flowchart TD
  A["Chief receives work"] --> AB{"Authority resolved?"}
  AB -->|no| AX["Fail closed or ask human"]
  AB -->|yes| B["Restore target trio"]
  B --> C{"Quick/direct?"}
  C -->|yes| D["Chief answers or executes inline"]
  C -->|no| E{"Tracked bounded slice?"}
  E -->|no| F["Route to planning or reviewed plan"]
  E -->|yes| G["Build Binding Packet"]
  G --> H["Resolve model capability"]
  H --> I["Check platform thread capability"]
  I --> J{"Native or partial control?"}
  J -->|yes| K["Spawn or continue worker"]
  J -->|no| L["Create manual handoff prompt"]
  K --> M["Worker binding handshake"]
  L --> LH["Receipt: handoff_pending or manual_handoff_required"]
  LH --> LP["Wait for pasted worker receipt"]
  LP --> LI{"Identity matches packet?"}
  LI -->|no| O["Receipt: binding_mismatch"]
  LI -->|yes| Q
  M --> N{"Binding valid?"}
  N -->|no| O["Receipt: binding_mismatch"]
  N -->|yes| P["Worker performs bounded slice"]
  P --> Q["Worker receipt"]
  Q --> RG{"Chief gate passes?"}
  RG -->|no| RX["Request changes / block / respawn / abandon"]
  RG -->|yes| R["Chief reconciles gated outcome into trio"]
  R --> S["Regenerate index"]
```

## Error Handling

- Binding mismatch stops worker execution.
- Index/trio conflict triggers reconcile and trio wins.
- Capability unavailable produces blocker or manual handoff receipt.
- Resolver failure stops model-dependent worker actions.
- Stale worker may be continued once only if binding and file truth still match.
- Wrong source authority blocks publish/write in office work.
- Deep or ambiguous work without a reviewed plan routes back to planning.
- Manual handoff prompt generation is pending only until a real worker receipt is pasted back and identity-matched.
- Receipt identity mismatch blocks gate acceptance.
- Missing redaction boundary blocks durable index or receipt publication.
- Lifecycle transition without lifecycle gate is invalid.

## Verification Contract

Primary proof for this design is review proof: the spec must preserve authority boundaries, routing gates, and failure behavior.

Backstop proof for implementation planning should include:

- schema validation for packets and receipts
- fixture tests for index rebuild from per-trio notes
- dry-run tests for capability fallback
- dry-run tests for model resolver failure
- manual fallback prompt inspection
- office source authority guard checks
- authority binding fail-closed tests
- receipt identity mismatch tests
- Chief gate accept/request-changes/block tests
- redaction/sanitization tests
- lifecycle boundary tests

Unacceptable substitutes:

- green unit tests that do not exercise wrong-trio prevention
- generated index working while trio sync is wrong
- worker output accepted without matching receipt identity
- model resolver silently choosing an underpowered model
- manual handoff treated as native thread control

## Design Review Gate

This spec is ready for user review. After approval, the next step is to write an implementation plan that decomposes V0b into narrow build units.
