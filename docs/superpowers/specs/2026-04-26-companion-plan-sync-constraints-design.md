# Companion Plan Sync Constraints Design

## Summary

Harness currently treats companion-plan consistency as a read-only health concern. `readHarnessHealth()` can detect missing references, missing back-links, and orphan companion artifacts, but the lifecycle tools that actually close and archive tasks do not participate in that contract. As a result, a task can be closed or archived even when its companion artifact still points at stale lifecycle state or still lives in the active companion directory.

This design adds a lifecycle-aware companion consistency gate for tasks that declare a companion plan. The first version is intentionally narrow and machine-readable: it validates structural metadata and lifecycle alignment rather than trying to diff prose across active planning files and the companion artifact.

The user-selected behavior is:

- `close-task` must hard-block when a declared companion plan is unsynced.
- `archive-task` must also hard-block on unsynced companion state.
- once archive preconditions pass, `archive-task` should automatically migrate the companion artifact into the owning archive task directory and rewrite the relevant references.

## Goals

- Prevent `close-task` from marking a task closed while its companion artifact still reflects stale lifecycle or sync-back metadata.
- Prevent `archive-task` from archiving a task while its companion artifact still behaves like an active companion under `docs/superpowers/plans/`.
- Keep the first version deterministic and low-noise by validating structured fields only.
- Reuse the existing planning-with-files lifecycle flow instead of introducing a second close/archive path.
- Preserve `doctor` / `adoption-status` as read-only early-warning surfaces even after lifecycle gates exist.

## Non-Goals

- v1 will not compare natural-language summaries, findings, or progress prose between active planning files and the companion artifact.
- v1 will not try to intercept every manual markdown edit as it happens.
- v1 will not require a companion artifact for tasks that do not declare one.
- v1 will not move historical human-facing docs from `docs/plans/**` or other non-companion paths.

## Confirmed Constraints

- `planning/active/<task-id>/` remains the authoritative task memory.
- `docs/superpowers/plans/**` remains the active-task companion artifact path for deep-reasoning work.
- archived tasks should not keep their companion artifact in the active companion directory once archive completes.
- lifecycle enforcement must happen in the planning-with-files close/archive toolchain, not only in health reporting.
- the gate should rely on stable, machine-readable metadata so it can block reliably without semantic guesswork.

## Problem Statement

Current behavior has three gaps:

1. `close-task.py` only rewrites `task_plan.md` lifecycle state. It does not check or update the companion artifact.
2. `task-status.py --require-safe-to-archive` only knows whether the active task is explicitly closed and archive eligible. It does not know whether the companion artifact is still active, stale, or orphaned.
3. `planning_paths.py archive-active` only moves `planning/active/<task-id>/`. It does not migrate the companion artifact or rewrite archived references.

This creates a drift window where the active task and companion artifact stop mutually proving each other exactly when lifecycle transitions matter most.

## Design Principles

- Block at lifecycle boundaries, not on every edit.
- Auto-fix mechanical path moves during archive.
- Fail only on facts that can be parsed deterministically.
- Keep read-only health audits and lifecycle mutation logic separate.
- Prefer one shared consistency checker for close and archive rather than duplicating logic.

## Option Comparison

### Option A: Health Warnings Only

Continue relying on `doctor` and `adoption-status` warnings.

Why not:

- it does not protect the close/archive boundary;
- users can still produce stale lifecycle transitions;
- archived tasks can still leave historical companion artifacts under the active companion directory.

### Option B: Hard-Block Close And Archive, Manual Archive Migration

Add a companion consistency gate, but require users to move the companion artifact themselves before archive.

Why not:

- it blocks correctly, but leaves a repetitive and error-prone mechanical cleanup step in user hands;
- the same migration mistake will recur even though the target path is deterministic.

### Option C: Hard-Block Close And Archive, Auto-Migrate During Archive

Add a shared consistency gate for both lifecycle commands, then let archive perform the deterministic companion move and reference rewrite.

Recommendation: use this option.

It matches the selected policy strength while keeping archive ergonomics reasonable. Close remains a strict gate. Archive remains a strict gate plus an automatic mechanical relocation step.

## v1 Sync Model

### Tasks Without A Companion Plan

If a task does not declare a companion plan in its active planning files, lifecycle behavior stays unchanged.

### Tasks With A Declared Companion Plan

If any canonical active planning file declares a companion plan, the lifecycle commands must treat the task as companion-bound and run the consistency gate.

### Unsynced Definition In v1

`Unsynced` means any of the following is true:

#### Active-side metadata is incomplete

The active planning files do not expose all required companion metadata:

- `Companion plan`
- `Companion summary`
- `Sync-back status`

The companion path must resolve to an existing markdown file.

#### Companion-side metadata is incomplete

The companion artifact does not expose all required metadata:

- `Active task path`
- `Lifecycle state`
- `Sync-back status`

#### Lifecycle states are inconsistent

For v1, lifecycle consistency is narrow and explicit:

- before `close-task` completes, the companion may still be `active`, but it must be structurally valid;
- after `close-task` mutates the task, the command must also update the companion metadata so both sides say `closed`;
- before `archive-task` mutates paths, both sides must already agree that the task is `closed` and archive-eligible;
- after archive completes, the archived task and the archived companion metadata must both say `archived`.

This keeps the gate machine-readable without requiring prose comparison.

## Lifecycle Behavior

### Close Flow

`close-task` should become a two-stage command:

1. Validate active task lifecycle preconditions as it does today.
2. If the task declares a companion plan, run the companion consistency gate.

If the gate fails, `close-task` exits non-zero and prints actionable reasons.

If the gate passes, `close-task` mutates both sides:

- update active `Current State` to `closed` / `Archive Eligible: yes`
- update companion `Lifecycle state` to `closed`
- update active and companion `Sync-back status` to the same close-time stamp/message

This makes close itself the point where lifecycle state becomes synchronized.

### Archive Flow

`archive-task` should become a three-stage command:

1. Re-run the lifecycle safety check.
2. Re-run the companion consistency gate.
3. If both pass, archive the active task and automatically migrate the companion artifact.

Archive-time migration should do all of the following in one operation:

- move the companion artifact from `docs/superpowers/plans/<date>-<task-id>.md` to `planning/archive/<timestamp>-<task-id>/companion_plan.md`
- rewrite archived planning references to the new archive-local companion path
- rewrite the companion back-reference from the active task path to the archive task path
- update the companion `Lifecycle state` to `archived`
- update active and companion `Sync-back status` to an archive-time record

If any migration step fails, the command should exit non-zero and leave a clear rollback message.

## Responsibilities By Surface

### Health / Inspection

`plan-locations.mjs` and `readHarnessHealth()` remain read-only.

They should continue to:

- detect missing references;
- detect missing back-links;
- detect orphan companion artifacts;
- expose warnings before lifecycle commands are invoked.

They should not be responsible for lifecycle mutation.

### Lifecycle Checker

A new shared planning-with-files checker should own companion lifecycle consistency rules.

It should:

- resolve the active task directory;
- discover whether the task declares a companion plan;
- parse required active and companion metadata;
- return structured failure reasons for close/archive callers.

### Close Command

`close-task.py` should call the checker and then perform synchronized close-time metadata updates.

### Archive Command

`archive-task.sh` / `planning_paths.py` should call the checker and then perform synchronized archive-time migration and metadata updates.

## File-Level Direction

The design implies changes in these areas:

- `harness/upstream/planning-with-files/scripts/close-task.py`
- `harness/upstream/planning-with-files/scripts/archive-task.sh`
- `harness/upstream/planning-with-files/scripts/planning_paths.py`
- `harness/upstream/planning-with-files/scripts/task-status.py`
- a new shared planning-with-files companion consistency helper under the same script set
- tests covering close blocking, archive blocking, and archive auto-migration

## Failure Modes And Operator Experience

### Close Blocking Message

When close fails, the output should say exactly which requirement is missing, for example:

- companion plan declared in active task but missing `Sync-back status`
- companion plan missing `Active task path`
- companion lifecycle metadata is malformed

### Archive Blocking Message

When archive fails before migration, the output should say whether the issue is:

- task not safe to archive;
- companion metadata unsynced;
- companion lifecycle not yet `closed`.

### Archive Migration Failure

If the archive move fails mid-flight, the command should exit non-zero and print the affected paths. The implementation plan should add an explicit rollback strategy for partially moved companion artifacts.

## Verification Strategy

The implementation plan should require tests for:

- `close-task` succeeds for tasks without companion plans;
- `close-task` blocks when declared companion metadata is incomplete;
- `close-task` updates companion lifecycle metadata when it succeeds;
- `archive-task` blocks when companion metadata is unsynced;
- `archive-task` automatically relocates the companion artifact into the archive task directory;
- archived references and back-links point to archive paths after migration;
- health remains warning-based outside lifecycle execution.

## Recommended Outcome

Implement Option C in two layers:

1. add a shared, machine-readable companion consistency checker used by close and archive;
2. add archive-time automatic companion migration and path rewriting.

This gives Harness a strong lifecycle boundary without turning everyday markdown editing into a brittle enforcement problem.