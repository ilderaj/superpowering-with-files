# ChiefOps Examples

## Example 1: Runtime/MCP execution slice

```text
ChiefOps Readout
Task: chiefops-implementation-plan-20260705
Objective: ship the runtime-derived board and read-only MCP tool
Current truth:
- Planning authority: planning/active/chiefops-implementation-plan-20260705/
- Execution receipts: none yet
- Proof target: operators can read a truthful ChiefOps board
- Open blockers: no runtime board service yet

Next slice:
- Scope: implement `harness/runtime/chiefops-service.mjs` and register `harness_chiefops_board`
- Files/surfaces: harness/runtime/summary-service.mjs, harness/runtime/execution-receipt.mjs, harness/mcp/tools/read-only.mjs, tests/installer/*.test.mjs, tests/mcp/read-only-tools.test.mjs
- Primary proof: focused runtime and MCP tests
- Backstop proof: existing read-only MCP registration test
- Sync-back: record design decisions and verification results in planning/active/chiefops-implementation-plan-20260705/

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

Next slice:
- Scope: inspect the blocked unit, its followups, and the current verification contract
- Files/surfaces: planning/active/some-tracked-task/*, .harness/execution/receipts/some-tracked-task/*.json
- Primary proof: receipt + planning contract review
- Backstop proof: focused reproducer if the blocker looks like an execution issue
- Sync-back: log whether the blocker is execution, plan, or proof related

Forbidden moves:
- no second durable memory
- no new runner or scheduler
- no ChiefOps-specific receipt dialect
```
