# Workflows

This page is the current operator guide for Trio v2 work.

## Route The Current Round

Classify the current round before choosing a model, effort, or worker topology.

- **Quick:** direct, single-stage work with a clear path. Do not create a Trio or add a worker by default.
- **Tracked:** multi-phase work, durable research, isolation, or recovery needs. Restore the bound Trio before acting.
- **Deep:** a current-round reasoning decision for material uncertainty, a non-obvious root cause, or high-risk judgment. It is not a durable task type and creates no additional authority.

## Durable Task Authority

For tracked work, the only durable task authority is:

```text
planning/active/<task-id>/task_plan.md
planning/active/<task-id>/findings.md
planning/active/<task-id>/progress.md
```

Restore these files at the start of a tracked round and write back meaningful decisions, evidence, and stop conditions there. Native Codex goal and continuation provide the long-task loop; this repository does not add a scheduler, daemon, poller, or second runner.

## Capability Packs

Select one capability pack: `dev`, `office`, or `safety`.

- `dev` defines implementation, test, debugging, review, and verification discipline.
- `office` defines source-backed document, spreadsheet, presentation, and PDF quality work.
- `safety` defines destructive, security-sensitive, credential, rollback, and external-action gates.

The selected pack governs quality behavior. It does not take ownership of task state or Host controls.

## Host And Worker Boundary

The Host owns worker and subtask lifecycle, permissions, continuation, and external or human gates. Root internal routing uses direct/native-first or `manual_pending`. A legacy `visible_worker_required` input returns `manual_pending` with `legacy_visible_worker_required_retired`; under the current Trio authority, explicitly rebind `primaryExecution=default` before resuming, with no Host bridge restoration or native fallback. A user explicitly requesting an independent visible task uses the Host's user-owned task workflow outside internal routing.

Main session responsibilities are planning, integration, risk judgment, and acceptance. A worker returns changed paths and fresh evidence. Worker completion is only a candidate pending Chief acceptance and Trio writeback.

Requested model and effort are intent. Without authenticated Host evidence, actual remains `unknown`.

## Public Commands

The public command surface is `install`, `sync`, `doctor`, `trio`, `verify`, `checkpoint`, and `token-audit`. Compatibility handlers that are not part of this public surface must not be documented as current Trio v2 workflow steps.

## Verification And Gates

Inspect the relevant artifact before changing it, use a focused proof first, and preserve the command exit and evidence before reporting completion. Run broader verification in proportion to risk. Destructive, external, credential, security-sensitive, merge, push, publish, release, deploy, send, and data-loss actions retain their applicable human gate.

## Coding Harness

The [Coding Harness SOP](coding-harness-sop.md) is the human-facing procedure. Routes are **Quick direct**, **Tracked direct**, and **Chief-governed**. `dev` selects `domain-modeling`, `codebase-design`, `diagnosing-bugs`, and `code-review` from task evidence; `change-quality-gate` runs at integration boundaries; `pr-feedback-loop` is opt-in on a bound PR. Tracked direct execution establishes its own technical verification; Chief independent acceptance applies when a delegated worker is primary or the chosen governance lane requires it.

The read-only change-quality convenience is `npm run verify:pr-quality -- <packet.json>` (use npm's `--silent` option when stdout must contain JSON only). It validates a supplied `swf/change-quality-gate-packet` and emits machine-readable JSON; it does not create task state or perform Git, PR, review, or background actions.

## Optional Contracts

When a Host provides browser or evaluation capabilities, keep their inputs, evidence, and safety boundary explicit. Optional capabilities supplement repository verification; they do not become task authority or replace the Host gate.
