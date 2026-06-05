# Follow-Up Resolution Design

## Summary

Harness should add a first-class follow-up resolution path that closes execution receipt obligations without rewriting historical receipts and without moving task authority out of `planning/active/<task-id>/`.

The recommended model is:

- original execution receipts remain immutable evidence;
- follow-up closure emits new durable evidence;
- authoritative planning and reconciliation continue to declare current task truth.

This keeps the existing **Hybrid Authority + Receipts** split intact while solving the current gap:
open follow-ups can block archive readiness, but there is not yet a first-class way to resolve or waive them.

## Problem

Harness now has:

- task-scoped execution receipts;
- `execution_followup_open` anomalies in `active-summary`;
- receipt-aware reconciliation that keeps `reconciliation_status=open` when receipts still leave open follow-ups.

What it does not yet have is a durable closure model for those follow-ups.

That creates three risks:

1. open follow-ups can be detected but not cleanly resolved;
2. operators may be tempted to mutate historical receipts in place;
3. reconciliation may stay open for the right reason, but with no structured path to become complete or waived.

## Goals

- Add a durable way to resolve or waive receipt follow-ups.
- Preserve immutable historical execution receipts.
- Keep `planning/active/<task-id>/` authoritative for current task state.
- Allow reconciliation to become complete or waived only when follow-up evidence supports it.
- Support both:
  - real resolution;
  - explicit waiver with owner/reviewer intent.

## Non-Goals

- Do not rewrite historical execution receipts in place.
- Do not move follow-up truth into a second JSON task-memory ledger.
- Do not make follow-up closure depend only on prose with no new evidence.
- Do not let follow-up resolution silently bypass reconciliation.

## Current State Evidence

- Execution receipts currently store `followups` arrays and `syncBackRef`.
- `active-summary --json` already exposes `execution_followup_open`.
- `task_lifecycle.py` now treats open follow-ups as reconciliation-blocking evidence.
- The current real tracked task still reports:
  - `execution_followup_open`
  - `reconciliation_reason: execution receipts leave open followups`

## Approaches

### Option 1: Append New Closure Evidence

Model:

- keep the original receipt unchanged;
- write a new receipt-like evidence artifact that records:
  - which original follow-up it closes;
  - whether the closure is `resolved` or `waived`;
  - who closed it;
  - what planning artifact now reflects that closure.

Pros:

- preserves receipt immutability;
- keeps a clear historical chain;
- aligns with Hybrid Authority + Receipts;
- supports auditability and later replay.

Cons:

- requires a new schema shape or receipt subtype;
- receipt aggregation becomes slightly more complex.

### Option 2: Mutate The Original Receipt

Model:

- update the existing receipt in place;
- change follow-up status from `open` to `resolved` or `waived`.

Pros:

- implementation is simpler;
- aggregation stays straightforward.

Cons:

- destroys historical evidence;
- weakens the meaning of receipts as immutable execution facts;
- conflicts with the direction already established in Goal 3.

### Option 3: Planning-Only Closure

Model:

- do not add any new receipt evidence;
- treat `reconciliation.md` or `progress.md` as the only place where follow-ups become resolved or waived.

Pros:

- minimal implementation cost;
- keeps authority in planning.

Cons:

- loses machine-readable closure evidence;
- makes receipt-level follow-ups harder to trace and audit;
- weakens the “receipts are durable evidence” part of the model.

## Recommended Approach

Choose **Option 1: Append New Closure Evidence**.

Why:

- it best preserves the existing authority/evidence split;
- it gives open follow-ups a real lifecycle without rewriting history;
- it keeps planning authoritative while still allowing machine-readable closure evidence;
- it creates a clean bridge to future receipt-aware automation.

## Design Principles

1. **Immutable execution history**
   Original execution receipts should remain factual records of what happened at execution time.

2. **Closure is new evidence**
   Resolving a follow-up is a new event, not a rewrite of the old event.

3. **Planning declares present truth**
   Receipts can prove closure actions happened, but planning and reconciliation still declare whether the task is currently resolved or waived.

4. **Waiver is explicit**
   Waiver must record owner or reviewer intent, not just flip a status.

## Recommended Data Model

Harness should introduce a second evidence type for execution follow-up closure.

Suggested shape:

```json
{
  "schemaVersion": 1,
  "taskId": "example-task",
  "unitId": "goal-3-receipts",
  "followupId": "goal-3-receipts:reconciliation:progress.md",
  "closureStatus": "resolved",
  "actor": "codex",
  "mode": "inline",
  "closedAt": "2026-06-04T10:00:00.000Z",
  "reason": "reconciliation.md now records the accepted closure path",
  "evidenceRef": "reconciliation.md#followup-closure",
  "syncBackRef": "progress.md#followup-closure"
}
```

### Required fields

- `taskId`
- `unitId`
- `followupId`
- `closureStatus`
  - `resolved | waived`
- `actor`
- `closedAt`
- `reason`
- `evidenceRef`
- `syncBackRef`

## Follow-Up Identity

Open follow-ups should gain a stable identity derived from the original receipt context.

Recommended v1 rule:

- synthesize `followupId` from:
  - `unitId`
  - follow-up `type`
  - follow-up `target`

Example:

- `goal-3-receipts:reconciliation:progress.md`

This avoids needing a retroactive schema migration for the original receipt file while still providing a stable closure handle.

## Authority Split

### Original execution receipt

Authority:

- immutable execution evidence

### Follow-up closure evidence

Authority:

- immutable closure evidence

### Planning / reconciliation

Authority:

- current task truth:
  - whether the obligation is still open;
  - whether the closure was accepted;
  - whether the waiver is accepted;
  - whether the task is reconcile-ready.

## Reconciliation Semantics

Recommended v1 rule:

- if any open follow-up lacks closure evidence, keep `reconciliation_status=open`;
- if every open follow-up is covered by accepted closure evidence, allow reconciliation to become `complete`;
- if a follow-up is intentionally waived, allow reconciliation to become `waived` or `complete` depending on the task-level decision already recorded in planning.

Important:

- receipts alone do not declare reconciliation complete;
- they only remove the evidence deficit that kept reconciliation open.

## Surface Integration

### `active-summary`

Should eventually show:

- `execution_followup_open` only for unresolved follow-ups;
- a count of resolved or waived closures if present.

### `doctor`

Should continue to pass for active tasks, but its reasoning should become more precise once closure evidence exists.

### `reconciliation.md`

Should record the accepted task-level interpretation:

```md
## Drift / Follow-Up Required
- Original follow-up: `goal-3-receipts:reconciliation:progress.md`
- Status: resolved
- Evidence: `.harness/execution/followup-closures/<task-id>/...json`
```

## Rollout Strategy

### Stage 1

- define closure evidence schema;
- define follow-up identity derivation;
- add targeted tests.

### Stage 2

- teach lifecycle / reconciliation logic to subtract resolved or waived follow-ups from the open set;
- keep close/archive semantics unchanged except for the improved follow-up handling.

### Stage 3

- expose richer closure signals in `active-summary` and related surfaces.

## Risks

### Risk: Closure evidence becomes a second task-memory system

Mitigation:

- keep closure evidence narrowly scoped;
- keep planning authoritative;
- require `syncBackRef`.

### Risk: Waiver becomes a silent escape hatch

Mitigation:

- require explicit `closureStatus=waived`;
- require `reason`;
- require planning/reconciliation acknowledgment.

### Risk: Follow-up identity is unstable

Mitigation:

- derive it from existing receipt fields with a deterministic v1 rule.

## Next Step

If this design is approved, the next implementation plan should define:

1. the closure evidence path and schema;
2. the lifecycle rule for subtracting resolved/waived follow-ups;
3. the minimal planning/reconciliation sync-back surface for real tasks.
