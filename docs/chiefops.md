# ChiefOps

`ChiefOps` is a narrow governance capability for tracked tasks in SWF.

For the V0b thread-control overlay contract, see `docs/chiefops-v0b.md`.
For case-backed Chief/Worker starting patterns, see
`docs/chief-worker-workflows.md`.

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

## Chief And Worker Control

ChiefOps keeps the Chief as the only human-facing owner. The Chief restores the
planning trio, reads the current board/readout, chooses one bounded next slice,
and decides whether that slice is Chief-direct, routed to a visible Codex
session worker, handed off manually, or handled by a narrow subagent tactic.

That choice is a control decision, not a second workflow lane. It must stay
grounded in the current task authority, proof target, evidence sink, and
lifecycle state.

Tracked production work defaults to a visible session worker. Chief-direct is
limited to quick, single-stage work and narrow gate or reconcile verification.
Use one primary visible worker session per tracked task across major phases
while its binding and context remain trustworthy. Reuse an existing worker only
when it is current, bound to the same task authority, and still has a safe stop
condition. Respawn only after the approved restore/rebind rules or another
explicit trust-boundary reason applies. Worker-local subagents are
session-internal tactics, not hidden substitutes for a visible worker.

Route plan deficiencies to `plan` / `goal2plan`. Route release closure to
`autonomous-release-closure` when that is the real slice. Route proof,
reconcile, finish, release, and archive decisions through their existing lanes.
ChiefOps may name the next slice; it does not own that slice forever.

## Worker Lifecycle Control

A worker starts from a bounded Assignment Packet and ends by returning to the
Chief. The packet names the objective, non-goals, allowed surfaces, proof
target, evidence sink, stop condition, and sync-back requirement. It is enough
to make the worker recoverable without turning workers into a registry.

The default global capacity is two Chief-managed visible executing lanes.
More than two visible lanes requires explicit human approval after Chief
explains the parallel benefit, ownership, gate, and reconciliation risk.
Active or waiting tasks do not consume a lane, and worker-local subagents do
not consume a visible lane unless they cross the promotion boundary.

Workers do not close, archive, release, merge, or publish. They may produce
proof, receipts, diffs, or handoff notes, but lifecycle decisions return to the
Chief. The Chief gates the result, reconciles evidence into
`planning/active/<task-id>/`, and decides whether the next state is another
slice, review, integration, blocked, close, or archive.

## Historical Session Routing

When a user provides historical `threadId` or `sessionId` values and asks the
Chief to continue, handle, or carry forward that work, those values are routing
cues. The Chief must choose and explain one route before doing inline work:

- `continue_worker`: the referenced worker/session is current enough, bound to the same task authority, and safe to continue.
- `respawn_worker`: the old session is stale, unavailable, or unsafe, but the bounded slice still matters.
- `handoff_worker`: direct continuation is unavailable and a pending handoff or message path is safer.
- `chief_direct`: the Chief intentionally owns a bounded slice inline.

Chief-direct remains valid only when the reason is explicit. The explanation
must name the stale/unsafe rationale when relevant, bounded slice, proof target,
evidence sink, and return-to-Chief gate.

## Visible Codex Session Worker Requests

When the user explicitly asks for a visible Codex session worker, that is the
requested execution route. The Chief should use available Codex thread/session
tools to create, continue, hand off, or message the worker session.

If that route is gated or unavailable, say so directly. A fallback to
Chief-direct, subagent, or hidden/internal worker execution is a downgrade, not
equivalent fulfillment. A valid downgrade names the requested visible route,
tool path attempted or missing gate, downgrade reason, bounded slice, proof
target, evidence sink, and return-to-Chief gate.

Subagent/internal worker wording alone must not be presented as satisfying an explicit visible Codex session worker request.

This rule does not add a scheduler, daemon, worker registry, durable session
database, second board, receipt dialect, lifecycle authority, or automatic
external-thread write behavior.

## Derived Assignment Packet

When the Chief hands off or frames one worker slice, derive an Assignment Packet
from existing planning and receipt truth. The packet is a prompt contract, not
a durable worker database.

Tracked worker Assignment Packets use existing V0b runtime field names:

- `authorityTaskId`
- `planningRoot`: the absolute path to the single authority checkout; a manual prompt may render this as `authorityRoot`
- `taskPlanPath`, `findingsPath`, and `progressPath`: exact absolute paths to the authoritative trio
- `bindingObservation`: current hashes for the exact trio files, or another observation the worker can actually verify
- `majorPhase`
- `currentSlice`: the bounded objective
- `nonGoals`
- `proofTarget`
- `primaryProof`
- `evidenceSink`
- `capabilityClass`
- `reasoningDemand`
- `costPreference`
- `latencyClass`
- `riskClass`
- `permissionClass`
- `allowedOps`
- `delegationPolicy`
- `upgradeTrigger`
- `expectedCheckInBy`
- `stopCondition`
- `expectedReceipt`
- `returnToChiefInstruction`

Exact trio paths are derived from `planningRoot` plus `authorityTaskId`, while
`bindingObservation` remains transient handoff evidence. Tracked phases use
`worker_discretion` as the tracked-phase default; `encouraged` never means a
mandatory spawn. Do not forward Chief chat history. Derive the packet from the
current trio and necessary source references.

The packet is derived and ephemeral by default. It is not a durable worker database, not a queue file, and not a new registry.

Packet context contract:

- **Stable governance prefix:** durable authority, autonomy/approval boundaries, capability and child-envelope constraints, and the required return contract.
- **Dynamic execution delta:** exact trio paths and hashes, current slice, allowed surfaces, proof target/evidence sink, deadline, and stop condition.
- Return concise status in this order: conclusion, required evidence, material caveat, and next action.
- Prompt caching, persisted reasoning, Programmatic Tool Calling, multi-agent, Pro mode, and max reasoning effort are API practices, not native Codex thread controls.

This is prompt shaping only; it is not cache configuration or a persisted packet schema.

## Worker Prompt Contract

The worker side should stay equally narrow:

- read `taskPlanPath`, `findingsPath`, and `progressPath` from the exact `authorityRoot` before tracked edits
- compare the exact file hashes with `bindingObservation`, and return `binding_mismatch` when they are missing, stale, or contradict the packet
- set `HARNESS_PROJECT_ROOT` to `authorityRoot`, or pass explicit `--root` when the Harness command supports it
- read only the bounded files or surfaces named by the packet
- keep the slice limited to one bounded action
- use the current `Proof Target`, `Primary Proof`, and `Evidence Sink`
- verify `majorPhase`, `currentSlice`, `permissionClass`, and `delegationPolicy`
- return status and evidence to the Chief; Chief owns planning writeback into `planning/active/<task-id>/` unless the packet separately grants a bounded planning edit
- return to the chief after the single slice
- use execution receipts only when work was actually attempted and reached an outcome
- keep planning single-homed; do not copy, symlink, or unignore the trio in the worker worktree, and do not treat an unbounded home-directory search as absence proof

## Phase Gate, Audit, Delegation, And Watchdog

Every declared major phase must return to Chief before the next phase begins.
Within the approved phase, the primary worker proceeds autonomously. Chief uses
file-first, session-as-an-audit-source review: start with trio, receipt, and
referenced proof, then inspect targeted artifacts or session turns only when a
risk or contradiction requires it. Receipts are evidence, not acceptance.

Direct human input is classified as `stop_or_safety`,
`in_slice_clarification`, or `authority_changing_instruction`. An authority
change stops at a safe point until Chief reconciles the trio and reissues the
packet.

Delegation uses `prohibited`, `worker_discretion`, or `encouraged`. Subagents
remain session-internal, return only to the primary worker, and may never exceed
the parent permission ceiling. Promote work to a visible parallel worker when
it becomes cross-phase, long-running, independently human-steered,
independently outcome-bearing, or the owner of distinct mutable state.

Check-ins are event-driven. `expectedCheckInBy` is a milestone deadline, not a
poll interval: startup uses 2 minutes, quick checks 5 minutes, standard slices
10 minutes, and long slices 20 to 30 minutes. The first miss receives one probe
and a minute-scale grace period; do not busy poll.

## Minimal Packet Template

Use this when the chief wants one copy-pasteable worker slice without overdesigning a mini-system:

```text
Assignment Packet
- authorityTaskId: <bound authority task id>
- planningRoot: <absolute authority root; manual prompt label: authorityRoot>
- taskPlanPath: <absolute authority task_plan.md path>
- findingsPath: <absolute authority findings.md path>
- progressPath: <absolute authority progress.md path>
- bindingObservation: <current hashes for taskPlanPath, findingsPath, and progressPath>
- majorPhase: <discovery | design | execute | verify | reconcile>
- currentSlice: <one bounded objective>
- nonGoals: <what must not widen>
- proofTarget: <target>
- primaryProof: <proof surface>
- evidenceSink: <where the result should be recorded>
- capabilityClass: <frontier_reasoning | balanced_execution | economy_mechanical | fast_check>
- reasoningDemand: <light | standard | deep>
- costPreference: <economy | balanced | quality_first>
- latencyClass: <interactive | standard | long_running>
- riskClass: <low | medium | high>
- permissionClass: <observe | workspace | egress_gated | release>
- allowedOps: <existing V0b operations>
- delegationPolicy: <prohibited | worker_discretion | encouraged>
- upgradeTrigger: <condition that forces a stronger route or stop>
- expectedCheckInBy: <ISO milestone deadline>
- stopCondition: <when to stop and return>
- expectedReceipt: <existing receipt outcome>
- returnToChiefInstruction: <major-phase gate request>
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
