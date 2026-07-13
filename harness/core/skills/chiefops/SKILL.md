---
name: chiefops
description: Use when a tracked task needs a bounded governance lens over planning state and execution receipts, without creating a new runner or memory system
---

# ChiefOps

## Core Boundary

ChiefOps is a narrow governance skill for tracked execution. It does not create durable state, replace task memory, or act as a runner. The only durable task
memory is `planning/active/<task-id>/`; execution truth is
`.harness/execution/receipts/<taskId>/*.json` when receipts exist. Use the
existing derived board/readout rather than Chief chat history.

It is appropriate only for a tracked task needing one bounded governance
readout or next-slice contract. Do not use it for quick work, plan authoring,
or a new scheduler/daemon/session manager.

## Ordinary Intake

Restore `task_plan.md`, `findings.md`, and `progress.md` first. Name one
bounded next slice, its Proof Target/primary proof/evidence sink, the material
risk, and the return-to-Chief gate. Keep receipts as outcome evidence; Chief
alone accepts or rejects claims and reconciles durable task state. Route plan
or intake deficiencies to `plan` / `goal2plan`, release-closure to
`autonomous-release-closure`, and proof/closure to `verify`, `reconcile`,
`finish`, or `release`.

The concise return order is: conclusion, required evidence, material caveat,
and next action. Do not widen scope, copy/symlink/unignore the trio, or claim
native thread control: prompt caching, persisted reasoning, Programmatic Tool Calling, multi-agent, Pro mode, and max reasoning effort are not native Codex thread controls.
Route intake or plan deficiencies to `plan` / `goal2plan`; route release-closure work to `autonomous-release-closure`; route proof and closure work to `verify`, `reconcile`, `finish`, or `release`.

## Named Operation References

Ordinary intake, a bounded governance readout, and Chief return use this core
only. Load a named reference before performing its optional operation;
references expand an operation but never override this core or create durable
state.

- Historical routing, visible-worker requests, respawn, or handoff:
  `references/session-routing.md`.
- Assignment Packet/manual-handoff rendering or exact-trio observation:
  `references/assignment-packet.md`.
- Permission, delegation, model/thinking, or child returns:
  `references/permission-delegation.md`.
- Check-ins, watchdog probes/grace, or recovery:
  `references/checkin-watchdog.md`.

Historical `threadId` or `sessionId` values default to explicit worker/session routing. A user who explicitly asks for a visible Codex session worker has requested the execution route; a subagent, hidden/internal worker slice, or Chief-direct implementation is a downgrade and must state the downgrade reason, bounded slice, proof target and evidence sink, and return-to-Chief gate.

For compatibility: historical `threadId` or `sessionId` values default to explicit worker/session routing; `continue_worker`, `respawn_worker`, `handoff_worker`, and `chief_direct` are the only routes. Chief-direct remains allowed only with an explicit reason, stale/unsafe rationale, bounded slice, proof target, evidence sink, and return-to-Chief gate.
Use Codex thread/session tools when the requested visible route is available; otherwise produce a pending handoff or state the downgrade rather than claiming it was satisfied.
For a visible-route downgrade, state the downgrade reason, the bounded slice, the proof target and evidence sink, and the return-to-Chief gate.

## Assignment Packet Invariant

An Assignment Packet is a derived/ephemeral prompt contract, not a durable
object or worker database. Its stable governance prefix carries durable
authority, autonomy/approval boundaries, capability and child-envelope
constraints, and the return contract. Its dynamic execution delta carries
exact trio paths/hashes, current slice, allowed surfaces, proof/evidence,
deadline, and stop condition. Do not persist assignment intent in execution
receipts before work has actually been attempted or completed.

Workers verify exact authority truth before tracked edits and return
`binding_mismatch` for missing, stale, or contradictory bindings. Chief owns
planning writeback unless a packet grants a bounded planning edit. Tracked
production normally uses a visible session worker; Chief-direct work is only a
bounded gate/reconcile exception with an explicit reason.

Tracked worker Assignment Packets require `authorityRoot`, `authorityTaskId`, `taskPlanPath`, `findingsPath`, `progressPath`, and `bindingObservation`; exact authoritative files are checked before edits. Keep the packet derived/ephemeral by default.
Do not persist assignment intent in execution receipts before work has actually been attempted or completed.

## Guardrails

- Keep `planning/active/<task-id>/` authoritative and planning single-homed.
- Reuse existing receipt schemas and derived board surfaces; never invent a
  board file, receipt dialect, queue, registry, runner, or second planning
  directory.
- Binding authorization does not prove runtime enforcement; missing permission
  enforcement fails closed.
- A major phase or authority-changing instruction returns to Chief unless a
  reviewed, authoritative envelope permits continuation.

## Common Mistakes

- Treating ChiefOps as a runner, scheduler, or session manager.
- Turning an Assignment Packet into durable worker state.
- Using receipts for intent before an outcome.
- Treating a companion plan or chat history as durable task authority.
- Claiming a reference was automatically loaded by the host.
