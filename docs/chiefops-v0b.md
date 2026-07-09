# ChiefOps V0b Overlay

`ChiefOps V0b` is a thin thread-control overlay for bounded worker coordination. It sits on top of the existing planning, receipt, and verification surfaces. It does not replace them.

## Core Contract

- planning/active/<task-id>/ remains the source of truth.
- Worker/session state is control plane only.
- Execution receipts, PR state, and verification output remain outcome evidence.
- The overlay may validate binding, derive index views, hand off manual work, and resolve a model class, but it does not create a second durable memory root.

## Safe Defaults

- default active worker ceiling: `1`
- approved soft max: `2`
- V0b hard max: `3`
- no scheduler
- no worker backlog
- no worker heartbeat runtime
- no external write/publish/send without approval and rollback path

These defaults keep V0b in a narrow governance role. If a workflow needs more concurrency or more automation, the task should first prove the need and record the upgrade path in the planning truth.

## Handoff And Gating

- Manual handoff output is pending only.
- A pasted-back worker receipt must identity-match the Binding Packet before Chief can gate it.
- A binding mismatch is a stop condition, not a hint.
- If thread or session control is unavailable, fall back to manual handoff without pretending that execution already started.

## CLI Surfaces

Use the current overlay command set:

```text
./scripts/harness chiefops overlay index --task <task-id> --json
./scripts/harness chiefops overlay validate-binding --file binding.json
./scripts/harness chiefops overlay handoff --file binding.json
./scripts/harness chiefops overlay resolve-model --capability-class balanced_execution --available models.json
```

Keep the command semantics narrow:

- `index` derives a view; it does not become authority.
- `validate-binding` checks packet shape and minimum contract viability.
- `handoff` emits a pending manual packet; it does not emit a started receipt.
- `resolve-model` maps a requested capability class to an available runtime model without changing workflow ownership.
