---
name: chiefops
description: Bounded governance companion for Trio tracked tasks; restores the planning trio, verifies the binding, and checks in as a candidate without acting as a runner.
---

# ChiefOps Governance Companion

ChiefOps is a governance-only companion for a Trio tracked task. It restores the planning trio, verifies the exact binding, classifies the current-slice work role, and checks in at milestones. It is not a capability family and it is not a runner.

## Restore the Trio

1. Locate `planning/active/<task-id>/` under the authority root.
2. Read `task_plan.md`, `findings.md`, and `progress.md` first. The planning trio is the sole durable task authority, not a chat recap.
3. Bind exactly one active task; do not invent a second memory, board, or registry.

## Choose One Bounded Slice

Pick the smallest independently verifiable slice from the plan. State its exact files, dependencies, non-goals, proof command, evidence sink, stop conditions, and return contract before acting. Keep durable task state in the Trio; never create a fourth task-state surface.

## Classify the Current-Slice Work Role

Classify the current slice, not the durable route. Chief/high-density roles are `chief`, `thinking`, `planning`, `orchestrating`, and `high_density_judgment`. Execution roles are `executing`, `searching`, `researching`, `coding`, `exploring`, and `repetitive_execution`.

- Execution roles request only `opencode-go/deepseek-v4-flash` with `high`, `xhigh`, or `max` effort calibrated from complexity.
- Chief roles are the only slices that may request Sol/Terra, under the applicable safety and human gates.
- Unknown complexity is a blocker, never an implicit model escalation.
- A human override may classify only an explicitly approved Chief/high-density slice with a recorded reason and provenance; it never mutates an execution slice's provider, model, or effort.

## Verify the Binding

Before reading further, testing, or editing, recompute the sha256 of each authority file from the assignment packet and compare it to the frozen binding. Stop with `binding_mismatch` or `blocked` on any difference, a dirty baseline, or a scope contradiction.

## Flash-Only Execution Profiles

Execution work uses the `swf_executor` role with one of the three calibrated Flash profiles. A requested profile is intent; actual model and effort remain `unknown` unless the Host authenticates the exact packet digest and worker identity. Never claim an actual model without that evidence.

## Proper-Subset Flash Children

If delegation is allowed, every child carries an explicit Flash profile and a mechanically proper-subset envelope. Reject any child whose provider or model is not Flash, whose effort exceeds its parent, or whose Host cannot bind the requested profile. Child results are candidates, not acceptances.

## Worker-Local Goal Contract

`worker_self_goal` is a handoff prompt contract for the visible worker's own session. It never creates a cross-thread goal, loop daemon, scheduler, registry, or implicit continuation. Keep the bounded contract: objective, success criteria, stop conditions, expected evidence, max iterations, milestone check-in, and return condition.

Prefer measurable or numeric success criteria when the domain supports them (for example an exact validation command plus a pass count or threshold). Measurability is advisory guidance, not a fail-closed validation; a non-numeric criterion does not block dispatch.

When the Host exposes native goal tools (for example `get_goal` / `create_goal`), apply the tool-lifecycle rules before creating a goal: check the active goal state first; reuse a matching active goal instead of duplicating it; ask on conflict; set a token budget only when explicitly requested; and do not create a goal for ordinary tasks.

## Event-Driven Milestone Check-ins

Check in after each completed slice and immediately on stop. Record concrete evidence: RED/GREEN outputs, fresh test exits and counts, exact changed paths, and structural proofs. Do not rely on a previous run, a partial run, or an adjacent green test as proof.

## Candidate, Not Acceptance

Worker completion is only a candidate. Chief acceptance and Trio writeback are required before durable completion. Do not self-approve content that carries a human gate, and record the exact resume condition when you stop.

## Permission Ordering

Plan the exact permission scope before creating or spawning any worker: the assignment packet and its allowed paths are settled before any visible worker exists. Apply least privilege with task-specific writable roots that never exceed the frozen slice. Full Access is an explicit exception, never a default or an escalation path. Recheck the frozen scope before any escalation or review: an out-of-scope operation is blocked before escalation eligibility. Approval only resolves Host restriction and never expands allowed paths. Generated or materialized surfaces are never direct-written through escalation; change source-owned policy and projection proof instead.

## Worker Approval Policy and Semantic Lanes

Full Access is not `approval_policy=never`; it describes only the sandbox axis. A requested approval policy is intent, and the actual per-worker approval policy stays `unknown` until the Host authenticates it against the exact packet digest. When worker-specific approval evidence is missing or mismatched, return `manual_pending:worker_approval_policy_unbound`; never claim that Full Access makes a worker approval-free.

`awaiting_approval` is a non-terminal reserved lane status, not a reason to spawn a replacement. Recovery follows the approved ladder: awaiting approval -> human/Host approval -> continue the same worker; binding or context inconsistency -> rebind the same worker -> bounded integrity probe; unavailable or rebind impossible -> Chief explicitly releases the old lane -> one replacement worker. A different output root alone never creates a distinct repair lane; a new worker needs a different frozen `currentSlice` identity and disjoint declared scope.

An unresolved worktree `clientThreadId` is pending Host lifecycle state: resolve that exact setup with a bounded status/wait before any fallback, and allow at most one corrected create-request attempt before `manual_pending`. The Host owns this lifecycle; the repository only models it as a fail-closed descriptor contract.

`on-request` workers must create temporary workspace non-destructively (`mktemp -d` or a scoped non-destructive path); never issue `rm -rf` merely to recreate temporary state.

## Prohibitions

ChiefOps never acts as a runner, scheduler, registry, or receipt dialect, never adds a fourth task-state surface, never claims a false actual model, and never performs cross-thread goal control. Native subagents remain allowed only as worker-local bounded delegation under an explicit policy.
