# ChiefOps Examples

## Example 1: Chief-routed runtime/MCP execution slice

```text
ChiefOps Readout
Task: chiefops-implementation-plan-20260705
Objective: ship the runtime-derived board and read-only MCP tool
Current truth:
- Planning authority: planning/active/chiefops-implementation-plan-20260705/
- Execution receipts: none yet
- Proof target: operators can read a truthful ChiefOps board
- Open blockers: no runtime board service yet

Chief Prompt Contract:
- Restore planning/active/chiefops-implementation-plan-20260705/ first
- Choose exactly one bounded next action
- Keep proof work in focused runtime/MCP verification rather than broader orchestration
- Do not widen into CLI or write-mode MCP from this slice

Next slice:
- Scope: implement `harness/runtime/chiefops-service.mjs` and register `harness_chiefops_board`
- Files/surfaces: harness/runtime/summary-service.mjs, harness/runtime/execution-receipt.mjs, harness/mcp/tools/read-only.mjs, tests/installer/*.test.mjs, tests/mcp/read-only-tools.test.mjs
- Primary proof: focused runtime and MCP tests
- Backstop proof: existing read-only MCP registration test
- Sync-back: record design decisions and verification results in planning/active/chiefops-implementation-plan-20260705/

Assignment Packet:
- unitId: unit-runtime-board
- Non-goals: no new receipt dialect, no stateful CLI, no write-mode MCP
- Allowed changes: runtime board derivation, read-only MCP registration, focused tests
- Expected receipt: done_with_evidence or blocked after the slice is attempted
- Return to chief: summarize proof result and next blocker

Worker Prompt Contract:
- Use planning/progress for assignment intent
- Write an execution receipt only after the slice has an outcome
- Return after this runtime/MCP slice

Forbidden moves:
- no second durable memory
- no new runner or scheduler
- no ChiefOps-specific receipt dialect
```

## Example 2: Receipt-aware blocker triage

```text
ChiefOps Readout
Task: some-tracked-task
Objective: decide whether the blocked state is an execution issue or a plan issue
Current truth:
- Planning authority: planning/active/some-tracked-task/
- Execution receipts: 3 receipts, 1 blocked unit, 2 open followups
- Proof target: the next slice should close the blocked execution unit without widening scope
- Open blockers: blocked receipt on unit `verify-fixture`

Chief Prompt Contract:
- Restore planning/active/some-tracked-task/ first
- Treat the receipt plus planning contract as truth
- Route proof/closure work to verify or reconcile rather than widening into a new implementation track

Next slice:
- Scope: inspect the blocked unit, its followups, and the current verification contract
- Files/surfaces: planning/active/some-tracked-task/*, .harness/execution/receipts/some-tracked-task/*.json
- Primary proof: receipt + planning contract review
- Backstop proof: focused reproducer if the blocker looks like an execution issue
- Sync-back: log whether the blocker is execution, plan, or proof related

Assignment Packet:
- unitId: verify-fixture
- Non-goals: no new work lane, no new worker registry, no receipt rewrite
- Allowed changes: planning/progress/reconciliation follow-through only if needed
- Expected receipt: none yet; this slice may stay read-only
- Return to chief: classify the blocker and name one next slice

Worker Prompt Contract:
- If no work is attempted, do not emit a receipt
- If durable intent needs recording, use planning/progress rather than a pre-outcome receipt
- Return after one blocker-classification slice

Forbidden moves:
- no second durable memory
- no new runner or scheduler
- no ChiefOps-specific receipt dialect
```
