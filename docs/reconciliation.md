# Post-Implementation Reconciliation And SOT Policy

This document captures the Harness direction for keeping coding projects traceable after implementation. It is intentionally small: reconciliation is a control point, not a new documentation tax.

## Problem

Harness already has durable task memory in `planning/active/<task-id>/`, companion deep-reasoning plans in `docs/superpowers/plans/`, workflow lanes, verification evidence, and roadmap/backlog intent. Coding work still has a common failure mode: after implementation, the actual code, the original spec, the active plan, verification evidence, and roadmap/backlog status can drift apart.

The drift is harmful for both humans and agents:

- humans lose an easy review and handoff trail;
- agents may read stale intent and make incorrect follow-up decisions;
- roadmap/backlog can claim work is pending while planning says it is complete;
- specs can preserve old desired behavior while code implements a different accepted behavior;
- cloud-agent work can complete remotely without a durable local explanation of what actually changed.

## Decision

Add a `reconcile` workflow gate after implementation and verification, before finish/archive. It may be presented as an operator-facing lane only after `docs/workflows.md`, README, maintenance docs, and lifecycle tooling are updated together. Until then, treat it as a required gate in the verify-to-finish transition, not as a silently added eighth workflow lane.

Reconciliation is the step that compares intended behavior, actual implementation, and evidence, then records the result in durable task memory.

It should answer:

1. What was the planned intent?
2. What actually changed?
3. Which acceptance criteria are satisfied, changed, or not satisfied?
4. What verification evidence exists?
5. What deliberate deviations from the plan/spec occurred?
6. Which docs, specs, roadmap items, or backlog items need updates?
7. Is this task ready for finish/archive, or does unresolved drift remain?

## Source-Of-Truth Map

Harness artifacts are authoritative for different questions:

| Artifact | Authority |
| --- | --- |
| `harness/core/**`, templates, adapter metadata | Runtime and projection policy source of truth. |
| Code and tests | Actual implemented behavior. |
| Verification artifacts and command output | Evidence that behavior was checked. |
| `planning/active/<task-id>/` | Durable active task memory and current task state. |
| `planning/archive/<timestamp>-<task-id>/` | Durable completed task history. |
| `docs/superpowers/plans/**` | Companion deep-reasoning implementation plans; secondary to active task state. |
| Specs/design docs | Intended behavior, product/design decisions, and rationale. |
| `docs/roadmap.md` | Product direction and sequencing. |
| `docs/backlog.md` | Executable backlog items and readiness. |

When these conflict, do not silently pick one. Reconciliation should make the conflict explicit and record the proposed fix. Actual implementation plus verification evidence describes what is true now; specs and roadmap/backlog describe what was intended or what should happen next.

## Conflict Resolution Ownership

Actual implementation is factual state, not automatic product approval. Use this ownership model:

| Conflict | Default decision owner | Allowed outcomes | Cannot mark reconcile complete until |
| --- | --- | --- | --- |
| Code/tests differ from approved spec | Product owner or task owner | accept implementation and update spec; fix code; create follow-up with explicit owner | owner decision or follow-up is recorded |
| Roadmap/backlog status differs from active task evidence | Product owner | update status; keep status with reason; create backlog cleanup item | status decision is recorded |
| Cloud task output differs from local planning state | Human promotion reviewer | accept with local reconciliation; request cloud PR changes; block promotion | issue/PR/evidence and decision are recorded |
| Verification evidence is missing or failed | Task owner/reviewer | run verification; mark blocked; reduce claim scope | passing evidence exists or claim is downgraded |
| Spec/doc update is needed but not in scope | Task owner + reviewer | update now; create explicit follow-up; mark not needed with reason | follow-up path or waiver is recorded |

## Reconciliation Artifact

Tracked coding work should produce one of these before finish/archive:

- `planning/active/<task-id>/reconciliation.md`; or
- a clearly labeled `## Reconciliation` section in `progress.md` for very small tracked tasks.

Use `./scripts/harness record --file reconciliation --task <task-id>` to create or append the standalone artifact. A reusable template also lives at `harness/core/upstream-overlays/planning-with-files/templates/reconciliation.md`.

Recommended artifact shape:

```markdown
# Reconciliation: <task-id>

## Planned Intent
- ...

## Actual Changes
- ...

## Acceptance Status
- [x] ...
- [ ] ...

## Verification Evidence
- `<command>` — pass/fail, timestamp, relevant artifact path

## Intentional Deviations
- ...

## Drift / Follow-Up Required
- ...

## Docs / Roadmap / Backlog Updates Needed
- ...

## Archive Readiness
- Ready / Not ready, with reason
```

## Scope Control

Reconciliation is required for:

- tracked coding tasks;
- cloud-dev or cloud-agent work;
- multi-file implementation work;
- behavior changes that affect user-facing docs, adapters, workflows, safety policy, or MCP contracts;
- tasks that started from a spec, roadmap item, backlog item, or GitHub issue.

Reconciliation may be marked `not required` for:

- typo fixes;
- typo/copy-only docs edits that do not change governance, roadmap, backlog, architecture, workflow, safety, MCP, cloud-dev, or maintenance behavior;
- throwaway exploration with no durable product decision;
- tasks where the active task plan explicitly records why reconciliation adds no value.

Docs-only changes that alter governance, roadmap, backlog, architecture, workflow, safety, MCP, cloud-dev, or maintenance behavior require reconciliation or an explicit owner waiver.

## Non-Goals

- Do not generate large specs for every small code edit.
- Do not automatically rewrite roadmap/backlog without explicit owner review.
- Do not treat old specs as more authoritative than verified implementation facts.
- Do not make MCP a platform-specific adapter; MCP remains the compatibility facade.

## Lifecycle Signals

Planning lifecycle tooling recognizes these status values:

- `complete`: standalone `reconciliation.md`, a `## Reconciliation` section in `progress.md`, or `Reconcile: complete` in task lifecycle text.
- `not_required`: `Reconcile: not_required` or `Reconcile: not required` with a reason.
- `waived`: `Reconcile: waived` with the owner/reviewer decision.
- `open`: archive-eligible/closed work without an accepted readiness signal.
- `unknown`: active/incomplete work where reconciliation has not started.

`active-summary` reports `reconciliationStatus` / `reconciliation_status`, `reconciliationReady` / `reconciliation_ready`, counts by status, and a `reconciliation_open` anomaly for archive-ready work that still lacks readiness.

## Validation Expectations

A reconciliation-capable Harness change is valid only when:

- docs describe when reconciliation is required;
- backlog items include concrete acceptance criteria;
- at least one tracked task can move through `plan -> implement -> verify -> reconcile -> finish/archive`;
- archive tooling or manual archive rules preserve reconciliation artifacts;
- cloud-dev parity includes the reconciliation path for remote work;
- agents can find this policy from roadmap/backlog/workflow docs.
