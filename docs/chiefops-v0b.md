# ChiefOps V0b Overlay

`ChiefOps V0b` is a thin thread-control overlay for bounded worker coordination. It sits on top of the existing planning, receipt, and verification surfaces. It does not replace them.

## Core Contract

- planning/active/<task-id>/ remains the source of truth.
- Worker/session state is control plane only.
- Execution receipts, PR state, and verification output remain outcome evidence.
- The overlay may validate binding, derive index views, hand off manual work, and resolve a model profile, but it does not create a second durable memory root.

## Chief And Visible Worker Operating Model

- One tracked task normally uses one primary visible worker session.
- Chief owns intake, binding, business judgment, phase gates, acceptance, and reconciliation; tracked production work belongs in the visible worker lane.
- The default capacity is two Chief-managed visible executing lanes. More than two requires explicit human approval.
- Worker-local subagents remain session-internal details under the parent worker envelope; tracked phases default to `worker_discretion`.
- Session context is a cache and audit source, not task authority. The exact planning trio remains authoritative.

## Safe Defaults

- default global capacity: two Chief-managed visible executing lanes
- additional visible lanes require explicit human approval
- one primary visible worker per tracked task
- no scheduler
- no worker backlog
- no worker heartbeat runtime
- no external write/publish/send without approval and rollback path

These defaults keep V0b in a narrow governance role. If a workflow needs more concurrency or more automation, the task should first prove the need and record the upgrade path in the planning truth.

## Handoff And Gating

- Manual handoff output is pending only.
- A pasted-back worker receipt must identity-match the Binding Packet before Chief can gate it.
- A binding mismatch is a stop condition, not a hint.
- Context or material drift triggers exact restore and rebind before respawn; a persistent integrity failure after rebind may recommend respawn.
- Check-ins are event-driven with minute-scale deadlines rather than busy polling.
- If thread or session control is unavailable, fall back to manual handoff without pretending that execution already started.
- The operating envelope carries `permissionClass`, `delegationPolicy`, `reasoningDemand`, `costPreference`, and `latencyClass` as bounded intent fields.

## CLI Surfaces

Use the current overlay command set:

```text
./scripts/harness chiefops overlay index --task <task-id> --json
./scripts/harness chiefops overlay validate-binding --file binding.json
./scripts/harness chiefops overlay handoff --file binding.json
./scripts/harness chiefops overlay resolve-model --capability-class balanced_execution --reasoning-demand standard --cost-preference balanced --latency-class standard --available models.json
```

Keep the command semantics narrow:

- `index` derives a view; it does not become authority.
- `validate-binding` checks packet shape and minimum contract viability.
- `handoff` emits a pending manual packet; it does not emit a started receipt.
- `resolve-model` matches a requested capability and execution profile to an available runtime model without changing workflow ownership. Use `--upgrade-trigger` when recording a reason for a possible escalation.

This repository does not provide a native visible-thread spawn adapter or native continue adapter, nor atomic per-thread permission selection. Resolver output and manual handoff are advisory evidence only; they never imply that a model or restricted permission was actually applied.
