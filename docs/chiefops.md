# ChiefOps

`ChiefOps` is a narrow governance capability for tracked tasks in SWF.

It adds:

- a local skill: `harness/core/skills/chiefops/`
- a derived runtime reader: `harness/runtime/chiefops-service.mjs`
- a read-only MCP tool: `harness_chiefops_board`
- a thin read-only CLI surface: `./scripts/harness chiefops board --task <task-id>`

It does not add:

- a second durable memory system
- a new workflow lane or mode family
- a runner, scheduler, daemon, or long-lived manager
- a ChiefOps-specific receipt dialect

## Authority And Truth

ChiefOps stays grounded in the same truth surfaces that already exist:

- `planning/active/<task-id>/` is the only durable task-memory root
- `.harness/execution/receipts/<taskId>/*.json` remains execution truth
- follow-up closures remain the source for resolved or waived receipt followups
- the existing Mode-Aware Verification Contract vocabulary remains the proof language

The runtime board is fully derived. It does not persist `chiefops-status.json`, board markdown, or any task-local cache.

## Current V1 Surfaces

### Skill

Use the `chiefops` skill when a tracked task needs a bounded governance pass before the next execution slice. The skill is for readout and framing, not orchestration automation.

### Runtime Board

`getChiefOpsBoard({ root, taskId })` derives a task-scoped governance view from:

- active-task summary data
- execution receipt summaries
- the current task plan's recorded proof target, when available

The board currently returns:

- `taskId`
- `status`
- `chiefOpsDeclared`
- `lane`
- `proofTarget`
- `latestReceipt`
- `executionSignals`
- `blockedSignals`
- `reconciliationStatus`
- `derivedRisk`
- `recommendedNextAction`

### MCP

Use the read-only MCP tool:

```text
harness_chiefops_board
```

with:

```json
{ "taskId": "<task-id>" }
```

It returns the structured board plus a compact text summary.

### CLI

Use the thin command surface:

```text
./scripts/harness chiefops board --task <task-id>
```

Optional JSON output:

```text
./scripts/harness chiefops board --task <task-id> --json
```

The CLI is intentionally thin:

- it resolves the authority root using existing harness command rules
- it calls `getChiefOpsBoard(...)` directly
- it prints runtime-derived output only
- it does not write files or create a second reader path

## Current Limits

V1.1 is still intentionally narrow.

- `swf-simplify: no write-mode ChiefOps surface in V1.1; ceiling=read via runtime service, read-only MCP, or thin CLI only; upgrade trigger=multiple real operator workflows need stateful governance actions that cannot be expressed as bounded next-slice guidance`

That means:

- write-mode MCP tools remain out of scope
- board state must stay traceable to planning files, receipts, and closures
- no worker spawning, scheduler loop, heartbeat runtime, or second durable board state may be introduced

## Recommended Use

Reach for ChiefOps when you need to answer:

- What is the current governance state of this tracked task?
- Is the next problem an execution issue, plan issue, or proof issue?
- What is the next bounded slice that still respects current authority and receipt truth?

Do not use ChiefOps to replace `goal-writer`, `goal2plan`, `autonomous-release-closure`, or the existing workflow lanes.

## Practice Validation Protocol

ChiefOps usefulness should be checked as an operator protocol, not guessed from implementation alone.

Use three repeatable readout modes:

### Opening readout

`Do a ChiefOps readout for <task-id>. Only use planning trio, execution receipts, and existing summary/verify signals. Do not modify files. Return one bounded next slice.`

Success target:

- names the current risk correctly
- returns one bounded next action
- stays within current planning and receipt truth

### Blocker diagnosis

`Determine whether the current issue is a plan issue, execution issue, proof issue, reconciliation issue, or external blocker. Return one bounded next slice.`

Success target:

- distinguishes execution/proof/reconciliation clearly
- does not widen into broader orchestration
- does not invent worker state beyond receipts and current planning artifacts

### Closure readiness

`Determine whether this task is ready for verify, reconcile, finish, release, or archive. Do not execute closure. Return only the next required action.`

Success target:

- does not bypass verify, reconcile, finish, or release lanes
- does not recommend finish while reconciliation or receipt followups remain open

### Failure signals

Treat any of these as a validation miss:

- recommends implementation while proof is still missing
- recommends finish while reconciliation is open
- ignores blocked or failed receipts
- treats closed or missing tasks as if they were active
- suggests durable ChiefOps-specific state files
- expands from one bounded slice into a wider manager runtime

### Validation mix

Use a hybrid proof stack:

- deterministic fixtures are the primary proof for blocked, failed, no-receipt, followup-open, and reconciliation-open cases
- real active tasks are smoke checks only after fixture coverage is stable
- compare ChiefOps output against `active-summary` to confirm it adds a bounded next action rather than only restating lifecycle state
