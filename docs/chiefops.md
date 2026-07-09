# ChiefOps

`ChiefOps` is a narrow governance capability for tracked tasks in SWF.

For the V0b thread-control overlay contract, see `docs/chiefops-v0b.md`.

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

## Operator Quick Pack

Use this lightweight loop when a tracked task needs governance, not a new manager:

1. restore `task_plan.md`, `findings.md`, and `progress.md`
2. read the ChiefOps board/readout
3. classify the issue as `plan`, `execution`, `proof`, `reconcile`, or `release`
4. choose exactly one bounded next slice
5. record durable progress back into the planning trio
6. route outward to `goal2plan`, `verify`, `reconcile`, `finish`, `release`, or `autonomous-release-closure` when that is the real next step

Useful command surfaces:

```text
./scripts/harness chiefops board --task <task-id>
./scripts/harness chiefops board --task <task-id> --json
./scripts/harness lifecycle-sweep --task <task-id> --json
```

Keep the discipline simple:

- assignment intent belongs in `task_plan.md` and `progress.md`
- execution receipts stay outcome-only
- lifecycle anchor receipts are review hints, not worker control state
- the board is derived, never persisted
- ChiefOps names the next slice; it does not become the slice owner forever

## Lifecycle Sweep Boundary

`lifecycle-sweep` is a Chief-owned review aid for planning hygiene. It reads
task lifecycle state, execution receipts, follow-up closures, and lifecycle
anchor receipts under `.harness/lifecycle/anchors/<taskId>/`.

Use it when the Chief needs to decide whether a task should stay active, move
to review/integration, or enter an explicit close/block/reconcile path:

```text
./scripts/harness lifecycle-sweep --task <task-id>
./scripts/harness lifecycle-sweep --task <task-id> --json
```

Workers may write anchor receipts after real events, such as PR creation,
PR merge, release proof, or a blocker discovery. Workers must not run
`lifecycle-sweep --apply-safe`, close or block their own task, set
`Archive Eligible: yes`, or treat anchors as a worker registry.

The Chief may run `--apply-safe` only for the narrow non-terminal transitions
reported as apply-eligible. Close, block, and archive remain explicit workflow
decisions routed through `reconcile`, `finish`, `release`, `close-task`, or
`archive-task`.

## Human-Friendly Chief Talk Track

When you want a compact human/agent prompt instead of a formal contract, this talk track is enough:

```text
Give me the current truth for <task-id>.
Restore the planning trio first.
Use the existing board/readout and receipts only.
Tell me whether this is a plan, execution, proof, reconcile, or release problem.
Return one bounded next slice.
Do not widen scope.
```

For a manual handoff:

```text
Take one bounded slice for <task-id>.
Read only the listed files.
Do not widen scope.
Keep assignment intent in task_plan/progress.
Write a receipt only if work was actually attempted and reached an outcome.
Return after that one slice.
```

## Chief Prompt Contract

The Chief side of ChiefOps is a prompt contract over existing truth, not a new runtime.

The chief should:

- restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md` first
- use the existing ChiefOps board/readout instead of chat history as state
- avoid direct implementation unless that slice is explicitly assigned
- choose exactly one bounded next action
- avoid scope expansion
- route intake or plan deficiencies to `plan` / `goal2plan`
- route release-closure work to `autonomous-release-closure`
- route proof and closure work to `verify`, `reconcile`, `finish`, or `release`
- request or record outcome evidence through existing progress/receipt surfaces instead of inventing a ChiefOps-specific state file

## Historical Session Routing

When a user provides historical `threadId` or `sessionId` values and asks the chief to continue, handle, or carry forward that work, those historical `threadId` or `sessionId` values default to explicit worker/session routing. The chief must treat the IDs as a routing cue before doing inline work.

The chief must explicitly choose and explain one route:

- `continue_worker`: continue the referenced worker/session only when it is current enough, authority-bound, and safe.
- `respawn_worker`: issue the same bounded slice to a fresh worker when the old session is stale, unavailable, or unsafe but the work still matters.
- `handoff_worker`: produce a pending handoff or message path when direct continuation is unavailable and manual routing is safer.
- `chief_direct`: execute inline only when the chief has a specific reason to own a bounded slice.

Chief-direct remains allowed only with an explicit reason. The explanation must include any stale/unsafe rationale, bounded slice, proof target, evidence sink, and return-to-Chief gate. If those fields are missing, do not silently execute inline; narrow the intake or route to a worker/session path.

This is only an intake and routing rule. It must not create a scheduler, worker registry, durable session database, second board, new receipt dialect, or external-thread write behavior.

## Derived Assignment Packet

When the chief needs to hand off or frame one manual worker slice, derive an Assignment Packet from existing planning and receipt truth.

Recommended fields:

- `taskId`
- `unitId`
- `lane`
- `workerRole`
- `objective`
- `nonGoals`
- `filesToRead`
- `allowedChanges`
- `forbiddenChanges`
- `proofTarget`
- `primaryProof`
- `evidenceSink`
- `stopCondition`
- `expectedReceipt`
- `returnToChiefInstruction`
- `syncBackRequirement`

The packet is derived and ephemeral by default. It is not a durable worker database, not a queue file, and not a new registry.

## Worker Prompt Contract

The worker side should stay equally narrow:

- read only the bounded files or surfaces named by the packet
- keep the slice limited to one bounded action
- use the current `Proof Target`, `Primary Proof`, and `Evidence Sink`
- sync durable progress back to `planning/active/<task-id>/`
- return to the chief after the single slice
- use execution receipts only when work was actually attempted and reached an outcome

## Minimal Packet Template

Use this when the chief wants one copy-pasteable worker slice without overdesigning a mini-system:

```text
Assignment Packet
- taskId: <task-id>
- unitId: <existing unit or prompt-only id>
- objective: <one bounded objective>
- nonGoals: <what must not widen>
- filesToRead: <small list>
- allowedChanges: <bounded surfaces>
- proofTarget: <target>
- primaryProof: <proof surface>
- evidenceSink: <where the result should be recorded>
- stopCondition: <when to stop and return>
- expectedReceipt: <none yet | blocked | failed | done_with_evidence>
```

## Recording Manual Assignment Intent

Chief-first manual orchestration does not currently need a new persistence model.

If a manual assignment needs a durable trace before work starts:

- record the intended execution unit, non-goals, and proof target in `task_plan.md`
- add a timestamped coordination note in `progress.md`

Do **not** record pre-outcome assignment intent in `.harness/execution/receipts/<taskId>/*.json`.

Receipts remain for outcome evidence only:

- `done_with_evidence`
- `blocked`
- `failed`
- `abandoned`

If the work later reaches an outcome, then use the existing receipt path. If follow-up closure is needed, use the existing follow-up closure path. No ChiefOps-specific write tool is required for this workflow today.

The current governed write surfaces already cover the durable cases:

- `harness_record_progress`
- `harness_record_execution_receipt`
- `harness_record_followup_closure`

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
- routes a plan deficiency into ad hoc implementation instead of `plan` / `goal2plan`
- routes release closure without using `autonomous-release-closure` discipline when that is the real next slice
- recommends finish while reconciliation is open
- ignores blocked or failed receipts
- treats closed or missing tasks as if they were active
- stores assignment intent in a ChiefOps-specific file or in a pre-outcome receipt
- suggests durable ChiefOps-specific state files
- expands from one bounded slice into a wider manager runtime

### Validation mix

Use a hybrid proof stack:

- deterministic fixtures are the primary proof for blocked, failed, no-receipt, followup-open, and reconciliation-open cases
- real active tasks are smoke checks only after fixture coverage is stable
- compare ChiefOps output against `active-summary` to confirm it adds a bounded next action rather than only restating lifecycle state
