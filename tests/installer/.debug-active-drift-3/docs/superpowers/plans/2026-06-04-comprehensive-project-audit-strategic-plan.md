# Harness Strategic Execution Plan

## Active Task Path

`planning/active/comprehensive-project-audit-20260603/`

## Lifecycle State

- Status: draft-approved-by-context
- Sync-back Status: in_progress
- Scope: strategy and execution-governance plan

## Goal

Turn Harness from a strong governance substrate into a more complete local task operating system that:

1. keeps `planning/active/<task-id>/` authoritative with minimal drift,
2. supports lightweight tasks with low token overhead by default,
3. supports heavy tasks with explicit orchestration, durable state, verification, and recovery,
4. evolves without collapsing under central-module complexity.

This plan intentionally deprioritizes `cloud-dev` expansion for now. Cloud and broader compatibility work stay in backlog unless they directly unblock the local execution core.

## What This Plan Is

This is not a line-by-line implementation plan.

This is a strategic execution framework that is:

- specific enough to break into future `/goal` runs,
- constrained enough to keep work on the mainline,
- flexible enough to allow execution-time judgment,
- evidence-oriented enough to prevent drift into vague refactoring or speculative expansion.

## North Star

Harness should eventually behave like this:

- a small, clear task goes down a low-cost path automatically,
- a deep task enters a richer orchestration path automatically,
- both paths still write durable task memory into the same authoritative planning model,
- execution, verification, reconciliation, and recovery all leave explicit evidence,
- the system does not rely on personal discipline alone to stay aligned.

## Non-Goals For This Program

- Do not prioritize cloud-agent parity as a mainline milestone.
- Do not add a second durable planning system.
- Do not optimize for multi-platform breadth before the local execution core is stronger.
- Do not start with broad refactors that are not directly tied to memory authority, orchestration, token economy, or boundary hardening.
- Do not let implementation convenience override the authoritative role of `planning/active/<task-id>/`.

## Approach Options

### Option A: Governance-First

Sequence:

1. Close planning drift and companion-plan inconsistencies.
2. Tighten reconciliation and archive discipline.
3. Improve token defaults.
4. Add execution orchestration later.

Pros:

- Lowest immediate risk.
- Fastest way to improve consistency.
- Strengthens current core promises.

Cons:

- Does not quickly move Harness toward a true execution operating system.
- Risks extending the current "good governance, weak execution kernel" state.

### Option B: Executor-First

Sequence:

1. Build a task execution/orchestration contract immediately.
2. Add subtask/subagent flows early.
3. Patch planning drift and token defaults after the new execution surface exists.

Pros:

- Fastest path toward the user's target end state.
- Gives the project a stronger product center.

Cons:

- High risk of building orchestration on top of still-leaky task-memory semantics.
- Likely to create more drift before reducing drift.

### Option C: Balanced Kernel-First

Sequence:

1. Close authoritative-memory drift enough that planning can be trusted.
2. Introduce a minimal orchestration contract and execution receipts.
3. Move token economy from diagnostics into default routing behavior.
4. Refactor central modules only when it supports the first three goals.

Pros:

- Best balance between ambition and system stability.
- Keeps work aligned with the user's stated priorities.
- Creates a clear spine for later cloud and compatibility expansion.

Cons:

- Requires discipline in sequencing.
- Some attractive refactors will need to wait.

## Recommended Approach

Choose **Option C: Balanced Kernel-First**.

Why:

- The audit showed Harness already has strong governance, verification, and projection machinery.
- The biggest gap is not "more docs" or "more targets"; it is the absence of a stronger local execution kernel.
- That kernel cannot be built safely if planning authority still depends too heavily on correct human behavior.
- Therefore the correct move is to improve trust in task memory first, then layer orchestration, then make lightweight behavior automatic, then reshape internals around the proven path.

## Program Invariants

These are not optional during later `/goal` execution.

1. `planning/active/<task-id>/` remains the only authoritative task memory.
2. Deep-reasoning artifacts may exist, but they must sync back cleanly.
3. Any new execution flow must emit durable evidence.
4. Any lightweight path must still leave enough evidence for recovery.
5. Reconciliation remains a gate for tracked coding work.
6. No new feature may force the whole system into a permanently heavier default prompt footprint.
7. Structural refactors must serve product behavior, not architecture aesthetics alone.

## Program Structure

The strategy is organized into four main tracks plus one cross-cutting governance layer.

### Track 0: Program Guardrails

Purpose:
Keep all later goals aligned with the same definition of success.

Expected outcomes:

- a stable vocabulary for quick task vs tracked task vs deep task execution,
- explicit decision rules for when a task may stay lightweight,
- explicit evidence requirements for claiming orchestration, recovery, or memory closure is complete.

Primary artifacts:

- strategy plan updates,
- planning-file conventions,
- verification and reconciliation criteria for the new execution surfaces.

### Track 1: Authoritative Memory Closure

Purpose:
Reduce the gap between "planning is authoritative in policy" and "planning is authoritative in actual use."

Problems it addresses:

- orphan companion plans,
- sync-back discipline depending too much on user behavior,
- lifecycle artifacts that can be valid in structure but incomplete in meaning.

Desired end state:

- companion artifacts are either correctly linked and synced, or they are blocked from claiming completion,
- active task summaries are trustworthy enough to act as operational state,
- archive-readiness and reconcile-readiness reflect reality, not just formatting.

### Track 2: Execution Orchestration Core

Purpose:
Make heavy-task execution a first-class product capability instead of an emergent pattern from skills and prompts.

Problems it addresses:

- no unified execution contract for subtasks,
- subagent/task decomposition is process knowledge rather than product behavior,
- verification and receipt generation are uneven across execution styles.

Desired end state:

- heavy work can be represented as an execution graph or equivalent structured flow,
- each execution unit has scope, owner, allowed operations, verification steps, and return format,
- integration and rollback become part of the execution surface rather than ad hoc decisions.

### Track 3: Default Token Economy

Purpose:
Move from "context costs are measured" to "the system defaults to the cheaper correct path."

Problems it addresses:

- cost governance exists mostly as diagnostics,
- heavy profiles can remain enabled even when the task mix does not justify them,
- routing between quick and deep work is still too dependent on manual judgment.

Desired end state:

- lightweight work takes the leanest safe path by default,
- richer task context is loaded only when task shape justifies it,
- budget policy becomes an execution input, not just an audit output.

### Track 4: Structural Boundary Hardening

Purpose:
Keep the system evolvable as Tracks 1-3 add real product behavior.

Problems it addresses:

- central modules accumulating policy, diagnostics, and projection logic,
- future execution-core work risking further concentration into already-large files,
- difficulty validating change impact when too much behavior is centered in a few modules.

Desired end state:

- clearer separations among policy evaluation, planning diagnostics, projection planning, and execution coordination,
- smaller failure domains,
- better ability to evolve one subsystem without hidden regressions in another.

## Sequencing Strategy

### Stage 1: Trust The Memory

Theme:
Before Harness can orchestrate work better, it must make the current task state harder to misrepresent.

Focus:

- companion-plan authority rules,
- sync-back enforcement points,
- planning lifecycle consistency,
- stronger anomaly surfacing in operator flows.

Exit criteria:

- orphan companion plans have a clear remediation path and reduced recurrence,
- active task summaries are strong enough to support later orchestration routing,
- archive/reconcile state can be treated as operational truth.

### Stage 2: Define The Execution Contract

Theme:
Do not build subagent automation first. Build the execution contract first.

Focus:

- task unit model,
- execution receipt model,
- verification attachment model,
- integration and failure-handling model.

Exit criteria:

- a heavy task can be described in a stable structured execution format,
- the format is rich enough to support manual, inline, or future subagent execution,
- planning/progress files and receipts can represent the same execution truth.

### Stage 3: Make Lightweight The Default

Theme:
Once task shape can be recognized more explicitly, lightweight routing can become more reliable.

Focus:

- skill/profile/routing defaults,
- compact context selection,
- default profile hygiene,
- measurable cost-vs-capability decisions.

Exit criteria:

- user-global defaults match expected light-task behavior more consistently,
- rich paths are triggered intentionally rather than accidentally,
- context cost reports correspond to actual routing strategy.

### Stage 4: Refactor Around Proven Behavior

Theme:
Refactor after the product behavior is clearer, not before.

Focus:

- split `health`, `sync`, and adjacent heavy coordinators where justified,
- isolate projection logic from health inspection and execution-state concerns,
- reduce central-module growth around the newly introduced execution contract.

Exit criteria:

- module responsibilities are clearer than they are today,
- execution-core work no longer depends on oversized coordination files,
- test surfaces align better with subsystem boundaries.

## Suggested `/goal` Breakdown

These are the future goals this strategy is designed to support.

### Goal 1: Close Companion-Plan Drift

Objective:
Reduce the gap between companion-plan policy and real repository usage.

Completion signals:

- orphan companion plans are either linked, archived, or intentionally waived,
- sync-back status becomes explicit and auditable,
- completion/close/archive flows surface missing sync-back as a first-class problem.

Allowed flexibility:

- exact enforcement point may be `record`, `summary`, `close`, `archive`, or a combination,
- exact artifact wording may change,
- detection may start advisory and later become stricter.

Not allowed:

- introducing another plan location as a workaround,
- treating orphan plans as acceptable steady-state behavior.

### Goal 2: Define Heavy-Task Execution Contract

Objective:
Create a structured model for decomposition, ownership, verification, and return artifacts.

Completion signals:

- heavy work can be expressed in a consistent contract,
- the contract integrates with planning/progress/reconciliation,
- at least one realistic tracked task can move through the model end to end.

Allowed flexibility:

- the contract may begin as markdown + structured sections, JSON, or a hybrid,
- subagent execution may remain manual or semi-manual at first.

Not allowed:

- coupling the first version directly to one host-specific multi-agent runtime,
- skipping durable receipt/evidence expectations.

### Goal 3: Add Execution Receipts And Integration Signals

Objective:
Make each execution unit leave an auditable result that can be summarized back into authoritative planning.

Completion signals:

- subtasks or execution units emit durable receipts,
- integration state becomes visible in planning summaries,
- failed branches and follow-up obligations are recordable without ambiguity.

Allowed flexibility:

- receipt format can start simple,
- first version can target local inline execution before broader automation.

### Goal 4: Turn Token Economy Into Routing Policy

Objective:
Use budget and task shape to drive default behavior.

Completion signals:

- lightweight tasks use lean defaults automatically,
- deep paths are clearly triggered by tracked/deep task criteria,
- doctor/verify outputs reflect the same policy actually used in routing.

Allowed flexibility:

- routing may be implemented through install defaults, runtime policy, hook behavior, or a mix,
- some targets may reach parity later than others.

Not allowed:

- hiding cost in new defaults without measurement,
- making all targets uniformly heavy to simplify implementation.

### Goal 5: Split Central Modules Along Behavior Boundaries

Objective:
Reduce long-term complexity concentration in `health`, `sync`, and related coordinators.

Completion signals:

- at least the most overloaded modules have clearer internal seams,
- tests can target smaller subsystems with less fixture duplication,
- new execution-core features land without expanding the same hot spots further.

Allowed flexibility:

- actual split order should follow whichever refactor most directly unblocks active goals,
- some files may remain large if their boundaries become clearer internally first.

Not allowed:

- aesthetic splitting with no product or testability gain,
- refactors that delay the core strategy for too long.

## Decision Framework During Execution

This is the most important section for keeping future `/goal` runs both aligned and flexible.

### Questions An Executor Must Ask Before Making A Local Decision

1. Does this move strengthen authoritative task memory, or bypass it?
2. Does this move make heavy-task execution more explicit, or just more magical?
3. Does this move reduce routine token cost, or merely relocate it?
4. Does this move simplify future evolution, or increase concentration in the same hot spots?
5. Is this change proving a real behavior, or only improving documentation around the current behavior?

If the answer pattern is weak, the decision is probably off the mainline.

### What Future `/goal` Runs May Change Without Re-asking Strategy

- concrete file boundaries,
- exact API names,
- exact receipt shapes,
- whether a feature begins advisory-first or strict-first,
- the order of small sub-steps inside a stage,
- whether a given stage is proven through one realistic task or several narrow fixtures.

### What Future `/goal` Runs Should Not Change Without Strategic Realignment

- the four-track priority order,
- the decision to keep cloud-dev expansion in backlog for now,
- the authority of `planning/active/<task-id>/`,
- the requirement that orchestration must produce durable evidence,
- the requirement that token economy become default behavior rather than a reporting-only layer.

## Evidence Gates

No later goal should claim strategic success without evidence from at least some of these surfaces:

- repository tests,
- `./scripts/harness verify`,
- `./scripts/harness doctor --check-only`,
- task-scoped planning artifacts,
- one or more realistic task dry runs,
- reconciliation notes when behavior or workflow claims change.

Different goals may emphasize different evidence, but none should rely on prose-only claims.

## Mainline Drift Signals

If one of these starts happening, the work is drifting:

- cloud-agent parity becomes the focus before local execution-core gains are proven,
- companion-plan hygiene remains advisory while new orchestration layers are added,
- token-budget work produces more measurement but not better defaults,
- refactor work expands faster than product behavior hardening,
- execution features rely on implied behavior not reflected in planning or receipts.

## Backlog Placement For Deferred Cloud Work

Cloud and broader compatibility work is not rejected.
It is intentionally repositioned.

Keep these items in backlog:

- cloud-dev parity productization,
- multi-agent cloud support,
- direct repo-entry cloud launch,
- broader MCP/write expansion beyond what the local execution core requires.

They should be revisited after:

1. authoritative memory closure is materially stronger,
2. a first-class local execution contract exists,
3. lightweight routing is more automatic,
4. structural pressure around central modules is reduced.

## Recommended Near-Term Program Order

If I were turning this strategy into actual execution, I would use this order:

1. Goal: close companion-plan drift and sync-back ambiguity.
2. Goal: define the heavy-task execution contract.
3. Goal: add execution receipts and integration visibility.
4. Goal: move token economy into default routing behavior.
5. Goal: split central modules where the new contract and routing now justify it.

This order keeps every later step standing on firmer ground than the previous one.

## Final Recommendation

Treat the next phase of Harness as **local execution-core consolidation**.

That means:

- trustable memory first,
- explicit orchestration second,
- automatic lightweight defaults third,
- structural hardening fourth,
- cloud/back-compat expansion later.

That is the shortest route from the current project to the project you actually want.
