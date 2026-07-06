---
name: chiefops
description: Use when a tracked task needs a bounded governance lens over planning state and execution receipts, without creating a new runner or memory system
---

# ChiefOps

## Overview
ChiefOps is a narrow governance skill for tracked execution. It helps a controller read the current task state, execution receipts, and proof obligations, then produce bounded chief and worker prompt contracts for the next slice. It does not create durable state, replace task memory, or act as a runner.

## Outcome Contract

- **Outcome:** the user gets a bounded ChiefOps readout plus, when needed, a chief prompt and worker prompt contract that stay anchored to the existing planning and receipt surfaces.
- **Done when:** the output keeps `planning/active/<task-id>/` as the only durable task memory, treats `.harness/execution/receipts/<taskId>/*.json` as execution truth, cites the current `Proof Target` or primary proof surface, names the next bounded execution slice, and avoids forbidden artifacts such as a new board file, runner, or receipt dialect.
- **Evidence:** current task planning files, existing execution receipts and follow-up closures, and any derived runtime board surface already produced by Harness.
- **Output:** a governance readout and bounded prompt contract, not orchestration automation.

## When to Use
- A tracked task is already in execution and needs a concise governance snapshot before the next slice.
- You need to decide whether the next issue is an execution issue, plan issue, or proof issue using existing planning and receipt truth.
- You want a chief/worker prompt contract that stays inside current authority, receipt, and proof boundaries.

Do not use this skill when:
- the task is quick enough for direct execution without a governance pass;
- the main need is intake shaping or writing a reviewed implementation plan;
- the work needs a new runner, scheduler, daemon, or long-lived manager;
- the task lacks `planning/active/<task-id>/` or enough receipt/proof context to support a grounded governance readout.

## Required Truth Surfaces
- `planning/active/<task-id>/task_plan.md`
- `planning/active/<task-id>/findings.md`
- `planning/active/<task-id>/progress.md`
- `.harness/execution/receipts/<taskId>/*.json` when execution receipts exist
- follow-up closure state, if the task uses execution follow-ups

If the current round depends on a companion plan, read only the relevant section needed for the current slice. Do not promote the companion plan into a second durable memory system.

## Chief Prompt Contract
The chief prompt should stay compact and grounded in existing truth:

```text
ChiefOps Readout
- Task: <task-id>
- Current route/lane: <tracked route or execution context>
- Proof target: <copied from the current verification contract when available>
- Execution truth: <receipt summary or "no receipts yet">
- Risk focus: <highest current blocker or drift risk>
- Recommended next slice: <one bounded slice>
- Sync-back requirement: update planning/active/<task-id>/ after meaningful progress
```

## Worker Prompt Contract
When delegating or framing the next slice, the worker prompt should include:

- the bounded file or surface list;
- the expected proof for that slice;
- the requirement to reference the existing execution-receipt schema if a receipt is written;
- the instruction not to create `release_board.md`, `worker_checkins.md`, `pr_truth.md`, a new receipt dialect, or any second planning directory.

## Guardrails
- Keep `planning/active/<task-id>/` authoritative.
- Treat execution receipts as immutable truth, not as a format to reinterpret or replace.
- Reuse the existing Mode-Aware Verification Contract vocabulary exactly.
- Prefer the already-derived runtime board if available; otherwise derive only from existing planning and receipt surfaces.
- Stay read-only unless the enclosing task already calls for implementation work.
- `ChiefOps` may coordinate bounded next-step reasoning, but it does not own execution routing.

## Common Mistakes
- treating ChiefOps as a new runner, scheduler, or session manager
- inventing a ChiefOps-specific receipt schema or board file
- using the companion plan as the primary durable memory instead of `planning/active/<task-id>/`
- producing a broad management plan instead of one bounded next execution slice
