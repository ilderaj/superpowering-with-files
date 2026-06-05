# Execution Contract Design

## Summary

Harness should introduce a first-class execution contract for heavy tracked tasks without creating a second durable task-memory system.

The recommended model is **Hybrid Authority + Receipts**:

- `planning/active/<task-id>/task_plan.md` remains the authoritative source for execution intent.
- unit-level JSON receipts provide execution evidence only.
- `progress.md`, `findings.md`, and `reconciliation.md` absorb unit outcomes into task-level integration truth.

This design intentionally separates:

1. what the task plans to execute,
2. what a specific execution unit actually did,
3. what the task now believes to be true after integrating those results.

## Problem

Harness already has strong planning authority, write-plan controls, approval tokens, audit receipts, and reconciliation policy. What it does not yet have is a first-class model for a heavy-task execution unit.

Today, heavy-task decomposition is mostly expressed through prose, skill discipline, or plan structure. That makes it harder to:

- express subtasks consistently across inline, manual, and future subagent execution;
- attach verification expectations to the same unit that owns the work;
- record blocked or partial outcomes without losing task-level clarity;
- route execution signals into summaries, reconciliation, and later automation without inventing a second memory layer.

## Goals

- Define a first-class execution contract for heavy tracked tasks.
- Preserve `planning/active/<task-id>/` as the only authoritative task-memory surface.
- Support execution via `inline`, `manual`, `subagent`, or `external` modes without changing the contract semantics.
- Make unit-level evidence durable and machine-readable.
- Keep task-level integration and archive readiness inside planning authority rather than receipt files.
- Support a staged rollout:
  1. define the contract,
  2. add receipts and integration signals,
  3. expand routing and orchestration later.

## Non-Goals

- Do not introduce a second JSON-first task-memory system.
- Do not build subagent orchestration runtime in this design.
- Do not require every quick task to use execution units.
- Do not move reconciliation down to per-unit journals.
- Do not let receipt mechanics redefine task authority.

## Confirmed Constraints

- `planning/active/<task-id>/` remains the only authoritative task memory.
- Companion plans remain secondary to authoritative planning.
- Reconciliation remains task-level, not unit-level.
- The first version should optimize for heavy coding tasks, but field names must remain neutral enough to support research, audit, and decision work later.
- New execution behavior must leave durable evidence.

## Design Principles

1. **Authority first, evidence second**
   The execution contract defines intent; receipts prove outcomes.

2. **One task memory, many evidence artifacts**
   Planning files stay authoritative even when execution emits multiple receipts.

3. **Contract before signals**
   Define execution units first, then attach receipts and surface-level signals.

4. **Integration is explicit**
   A unit is not fully absorbed until authoritative planning reflects its result.

5. **Mode-neutral execution**
   Inline, manual, and subagent paths should all map to the same contract object.

## Authority Split

Harness should explicitly separate three layers:

### 1. Execution Intent Authority

Authority:

- `planning/active/<task-id>/task_plan.md`

Responsibilities:

- define execution units;
- define scope boundaries;
- define allowed operations;
- define verification expectations;
- define return artifacts and integration targets.

### 2. Execution Evidence

Authority:

- unit-level JSON receipt files

Responsibilities:

- record what a unit actually did;
- record changed files, verification commands, produced artifacts, and follow-ups;
- provide a stable reference back into authoritative planning.

Receipts do **not** declare final task truth.

### 3. Task-Level Integration Truth

Authority:

- `progress.md`
- `findings.md`
- `reconciliation.md`

Responsibilities:

- record whether unit outcomes were absorbed into task authority;
- record deviations, tradeoffs, and follow-up obligations;
- record task-level readiness for reconciliation and archive.

## Execution Unit Lifecycle

Each execution unit should use a narrow lifecycle:

`planned -> in_progress -> blocked | done -> verified -> integrated`

### State meanings

- `planned`
  The unit exists in the execution contract but has not started.

- `in_progress`
  Work is actively being executed.

- `blocked`
  The unit cannot continue without missing context, an external decision, or another dependency.

- `done`
  The unit's direct action completed, but verification or integration may still be incomplete.

- `verified`
  The unit's verification plan has enough evidence to support its claimed result.

- `integrated`
  The verified result has been absorbed into authoritative task memory.

### Why `done`, `verified`, and `integrated` must stay separate

This separation prevents a common drift pattern:

- work happened,
- evidence may or may not exist,
- authoritative planning still does not reflect the result.

The system should not treat these as the same event.

## Execution Contract Placement

`task_plan.md` should gain a dedicated `## Execution Contract` section after phases and before question/discovery sections.

That section should define the planned execution model for heavy tracked tasks instead of scattering it across phases, notes, and progress prose.

## Execution Unit Schema

Each unit should minimally declare the following fields.

### Required fields

- `unit_id`
  Stable identifier for receipts, dependencies, and follow-up references.

- `kind`
  Neutral unit type such as:
  `implementation | verification | integration | research | decision | docs`

- `status`
  Unit lifecycle state:
  `planned | in_progress | blocked | done | verified | integrated`

- `scope`
  Must include both:
  - `Do`
  - `Not do`

  This prevents silent scope expansion.

- `owner_mode`
  Execution mode rather than tool branding:
  `inline | subagent | manual | external`

- `allowed_ops`
  Declares what this unit may do:
  - allowed file paths or path classes;
  - allowed commands;
  - whether external effects are permitted.

- `dependencies`
  Required prior units or evidence references.

- `verification_plan`
  Commands, checks, or evidence requirements that must exist before the unit can claim verification.

- `return_artifacts`
  Expected outputs such as:
  `patch | report | note | receipt | follow-up`

- `integration_target`
  Where the unit must sync back:
  `progress.md | findings.md | reconciliation.md | other declared task artifact`

- `exit_criteria`
  The concrete definition for when the unit may move from `done` toward `verified`.

### Example

```md
## Execution Contract

### Unit: unit-01
- Kind: implementation
- Status: planned
- Scope:
  - Do: introduce the execution contract template fields in task planning surfaces
  - Not do: add receipt persistence or summary integration signals
- Owner Mode: inline
- Allowed Ops:
  - Files: harness/core/templates/planning/**, tests/**
  - Commands: node --test
  - External effects: none
- Dependencies:
  - none
- Verification Plan:
  - `node --test tests/...`
- Return Artifacts:
  - patch
  - receipt
- Integration Target:
  - progress.md
  - findings.md
- Exit Criteria:
  - template fields exist, tests pass, planning notes are synced back
```

## Receipt Schema

Receipts should be evidence-only artifacts.

They must not become a second authority layer for task state.

### Receipt fields

```json
{
  "schemaVersion": 1,
  "taskId": "example-task",
  "unitId": "unit-01",
  "actor": "codex",
  "mode": "inline",
  "resultStatus": "done_with_evidence",
  "startedAt": "2026-06-04T04:00:00.000Z",
  "finishedAt": "2026-06-04T04:12:00.000Z",
  "changedFiles": [
    "harness/runtime/example.mjs",
    "tests/example.test.mjs"
  ],
  "verificationCommands": [
    {
      "command": "node --test tests/example.test.mjs",
      "status": "passed",
      "evidenceRef": "progress.md#verification-record"
    }
  ],
  "artifactsProduced": [
    {
      "type": "patch",
      "ref": "git-diff"
    }
  ],
  "followups": [
    {
      "type": "integration",
      "status": "open",
      "target": "progress.md"
    }
  ],
  "syncBackRef": "progress.md#unit-01",
  "notes": "Optional concise execution note"
}
```

### Receipt field semantics

- `taskId`, `unitId`
  Primary link back to authoritative planning.

- `actor`
  The executor identity, such as `codex`, `human-reviewer`, or `external-agent`.

- `mode`
  The actual execution mode used, aligned with `owner_mode`.

- `resultStatus`
  Suggested v1 values:
  `done_with_evidence | blocked | failed | abandoned`

  Do not use receipt status to declare task integration truth.

- `changedFiles`
  Actual changed file scope.

- `verificationCommands`
  Verification records with status and a deeper evidence reference if needed.

- `artifactsProduced`
  Outputs produced by the unit.

- `followups`
  Remaining obligations exposed by the unit result.

- `syncBackRef`
  Reference to where authoritative planning absorbed the unit result.

### Receipt boundary

Receipts may say:

- what happened,
- what evidence exists,
- what follow-up remains.

Receipts may **not** say:

- that the task is fully verified,
- that the task is integrated,
- that the task is archive-ready.

Those remain planning-level judgments.

## Planning File Responsibilities

### `progress.md`

Purpose:

- execution progress truth

Responsibilities:

- record unit state transitions;
- summarize receipt outcomes;
- record verification summary and integration results;
- record blocked obligations and pending follow-ups.

### `findings.md`

Purpose:

- execution judgment and deviation truth

Responsibilities:

- explain verification outcomes, not just name commands;
- record tradeoffs and intentional deviations;
- record why a unit was split, merged, downgraded, retried, or reassigned;
- record owner-mode changes and rationale.

### `reconciliation.md`

Purpose:

- task-level closure truth

Responsibilities:

- summarize which units are integrated;
- record accepted deviations;
- record open follow-ups;
- record whether the task is ready for archive.

`reconciliation.md` should not become a unit-by-unit journal.

## Goal Breakdown

This design should be implemented in two separate goals.

### Goal 2: Define Execution Contract

Objective:

- introduce the `Execution Contract` surface inside authoritative planning;
- establish the unit schema and lifecycle;
- establish stable planning-file absorption boundaries.

Completion signals:

1. task-scoped planning supports `Execution Contract`;
2. unit fields and lifecycle are a tested contract;
3. at least one real tracked task can express heavy-task execution truth through the model;
4. `summary`, `doctor`, and reconciliation authority semantics remain intact.

### Goal 3: Add Execution Receipts And Integration Signals

Objective:

- introduce unit-level receipt persistence and integration visibility.

Completion signals:

1. receipt schema and storage path are defined and tested;
2. receipts reconnect to `taskId + unitId + syncBackRef`;
3. at least one high-frequency surface can see integration state;
4. blocked, failed, and follow-up obligations are no longer prose-only.

## Evidence Gates

Neither goal should claim success without:

- template or implementation changes;
- targeted tests;
- at least one real tracked-task dry run or real task exercise;
- planning and reconciliation sync-back evidence.

## Rollout Order

1. Write and approve this design.
2. Implement Goal 2.
3. Verify Goal 2 against a real tracked task.
4. Implement Goal 3.
5. Attach integration signals to selected surfaces.
6. Only after that, evaluate routing, orchestration helpers, or broader automation.

## Risks

### Risk: receipts start behaving like a second task memory

Mitigation:

- keep receipts evidence-only;
- require `syncBackRef`;
- reserve task-level judgments for planning files.

### Risk: prose-only planning absorbs the new model unevenly

Mitigation:

- add a dedicated `Execution Contract` section;
- test at least one real tracked task;
- define clear field semantics before signals.

### Risk: receipt schema overfits coding tasks

Mitigation:

- keep `kind`, `owner_mode`, and `return_artifacts` neutral;
- validate first on coding work, but avoid coding-specific field names.

### Risk: integration becomes duplicated across progress and reconciliation

Mitigation:

- keep `progress.md` focused on execution progress;
- keep `reconciliation.md` focused on final closure.

## Out Of Scope For This Design

- token-routing policy changes;
- cloud-execution parity expansion;
- central-module refactors unrelated to the execution contract;
- host-specific subagent runtime integration.

## Final Recommendation

Proceed with **Hybrid Authority + Receipts**.

Implement the execution contract first.
Add receipt persistence and integration signals second.
Do not let receipt mechanics redefine authoritative task memory.
