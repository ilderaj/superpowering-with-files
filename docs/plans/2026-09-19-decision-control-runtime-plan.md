# Decision-Control Runtime — Implementation Plan

> 2026-09-20审计更正：当前整改规格以 `docs/plans/jev-swf-audit-20260920/spec.md` 为准；执行见同目录plan.md。下文保留原设计历史，冲突处已被新规格取代。T1是契约回放，不是独立预测准确率；WP07保持shadow，不能单凭接入证明效率收益；outputTokens不等于freshTokens；成本按实测全量求和，不减avoidedCost。

Spec: [2026-09-19-decision-control-runtime-design.md](../superpowers/specs/2026-09-19-decision-control-runtime-design.md)
Local authority: `planning/active/swf-decision-control-runtime-20260919/`
Date: 2026-09-19.

## Rules for every work package

- One observable outcome each. No step may read "implement architecture".
- Every WP declares goal, surfaces, non-goals, dependencies, expected behaviour, tests, acceptance, rollback, night-safety, capability, mode, intensity, topology.
- Edit surfaces must stay disjoint from the sibling initiative's uncommitted work (`harness/core/skills/linear-work-control/**`, `harness/trio/governance/chiefops/SKILL.md`, `tests/core/linear-*.test.mjs`, `lib|scripts/night-queue.mjs`).
- Nothing in the first wave changes existing runtime behaviour. Every change is an added export, an added pure module, or an added fixture.

## Shared verification

- Targeted: `node --test tests/trio/<new>.test.mjs`
- Repository proof: `npm run verify:trio`, `npm run verify:core`, `./scripts/harness sync --check`
- Adding a Trio core module also requires updating `tests/trio/import-boundaries.test.mjs` (`FINAL_INVENTORY` + `FINAL_DIRECTION_MATRIX` + milestone lists) and the explicit file list in the `verify:trio` script.

## Dependency graph

```
WP-01 ──┬── WP-02 ──┬── WP-03 ──┐
        │           ├── WP-08   │
        │           └── WP-09   │
        └── WP-05                │
WP-04 (independent) ─────────────┴── WP-06 ── WP-07 ──┐
                                                     ├── WP-10 ── WP-11
                                    WP-08, WP-09 ────┘
```

---

## WP-00 — Audit, spec, plan, ticket projection

- **Goal:** source-backed current-state audit, implementation-grade spec, this plan, and projected Linear tickets.
- **Surfaces:** `docs/superpowers/specs/2026-09-19-decision-control-runtime-design.md`, this file, `planning/active/swf-decision-control-runtime-20260919/`, Linear `SWF — Agent Workbench MVP`.
- **Non-goals:** no runtime change, no release, no CI change.
- **Dependencies:** none.
- **Expected behaviour:** four deliverables exist and agree with each other.
- **Tests / verification:** spec/plan exist and cross-reference; Linear issues read back.
- **Acceptance:** spec passes the §22 acceptance gate; tickets exist with the required sections.
- **Rollback:** delete the two docs and close the tickets.
- **Night-safe:** no — Chief/THINK work.
- **Capability / Mode / Intensity / Topology:** dev / think / max / solo.

---

## WP-01 — Mode, Intensity and Topology vocabulary derivation

- **Goal:** name the existing implicit model. Add pure derivations over existing enums so a requirement can be expressed as `mode / intensity / topology` without a model name.
- **Surfaces:** `harness/trio/core/routing.mjs` (additive exports only), `tests/trio/routing.test.mjs` or a new `tests/trio/vocabulary.test.mjs`, and — only if a new module is used — `tests/trio/import-boundaries.test.mjs`.
- **New frozen names:** `MODE_KINDS = ['think','execute']`, `INTENSITY_LEVELS = ['low','medium','high','xhigh','max']`, `TOPOLOGY_CLASSES = ['solo','delegated','parallel']`, `modeOf(workRole)`, `intensitySubsetOf(mode)`, `normalizeIntensity(value, mode)`, `topologyClassOf(record)`.
- **Non-goals:** do **not** modify `classifyWorkRole`, `classifyComplexity`, `resolveModelEffort`, `validateModelEffort`, `topologyOf`, the assignment packet, or any existing exported behaviour; do not widen `execute` intensity to `low|medium`; do not add a second state machine.
- **Dependencies:** none.
- **Expected behaviour:** `modeOf` is total over `CHIEF_WORK_ROLES`/`EXECUTION_WORK_ROLES` and throws on an unknown role, matching existing fail-closed style. `normalizeIntensity('low','execute')` rejects; `normalizeIntensity('low','think')` accepts. `topologyClassOf` maps only from fields that already exist.
- **Tests / verification:** RED-before-GREEN unit tests for every exported name, including the unknown-role throw, the out-of-subset intensity rejection, and each topology branch. Then `npm run verify:trio`.
- **Acceptance:** all new tests pass; `verify:trio` and `verify:core` pass unchanged; no existing test expectation is edited except adding new cases.
- **Rollback:** revert the added export block and the new test file. No stored data depends on the new names.
- **Night-safe:** **yes.** Purely additive over a frozen enum table, gated by `verify:trio`.
- **Capability / Mode / Intensity / Topology:** dev / execute / high / solo.

---

## WP-02 — Decision contract module and bundle schemas

- **Goal:** a provider-neutral decision contract as a pure module: request/response schemas, the three kinds, the five bundles with frozen question ids, and pure composite resolvers.
- **Surfaces:** new `harness/trio/core/decision.mjs`, new `tests/trio/decision.test.mjs`, `tests/trio/import-boundaries.test.mjs`, the `verify:trio` script file list.
- **New frozen names:** `DECISION_KINDS = ['boolean','choice','score']`, `DECISION_BUNDLES` (intake/plan/action/verify/release), `DECISION_OUTCOMES = ['continue','plan','repair','replan','retry','escalate','done']`, `EVIDENCE_CLASSES = ['deterministic','semantic','composite']`, `RELEASE_STATES = ['not_ready','ready','allowed']`, `validateDecisionRequest`, `validateDecisionResponse`, `resolveIntakeRoute`, `resolvePlanReady`, `resolveActionGate`, `resolveNextState`, `resolveReleaseState`, `unresolvedDeterministicChecks`.
- **Non-goals:** no network call · no local inference · no third-party dependency · no wiring into any runtime path · no `external` backend implementation · no numeric confidence.
- **Dependencies:** WP-01 (the request carries `mode`/`intensity`).
- **Expected behaviour:** validation rejects unknown bundles, unknown question ids, wrong kinds, missing `confidence.provenance`, and out-of-scale scores. Composite resolvers are total and deterministic. `resolveReleaseState` never returns `allowed` from `readiness` alone.
- **Tests / verification:** schema rejection cases; one fixture per bundle; `resolveReleaseState` truth table; `resolveNextState` for each of the five outcomes; a case where `goal_satisfied=true` but a deterministic check failed and the result must not be `done`. Then `npm run verify:trio`.
- **Acceptance:** module is inert (no importer other than its test), all tests pass, `verify:trio` + `verify:core` + `sync --check` pass.
- **Rollback:** delete the module and test; revert the two inventory edits.
- **Night-safe:** yes. New file, no runtime import.
- **Capability / Mode / Intensity / Topology:** dev / execute / high / solo.

---

## WP-03 — Decision trace and observability

- **Goal:** a local, non-authoritative trace of shadow decisions that is sufficient to evaluate a gate later.
- **Surfaces:** new `harness/trio/core/decision-trace.mjs` or a section of `decision.mjs` if the module stays under a sensible size, new tests, and `.harness/decision-trace/` as the runtime location (gitignored, zero tracked files).
- **Recorded fields:** `ts, taskId, phase, bundle, bundleVersion, questionId, answer, confidenceProvenance, backendId, latencyMs|null, transitionRecommendation, override, eventualOutcome`.
- **Non-goals:** no chain-of-thought · no Linear telemetry · no new tracked artifact · no durable task state · never authoritative over Trio.
- **Dependencies:** WP-02.
- **Expected behaviour:** appending a record is atomic and never mutates Trio; a missing directory is created; a malformed record is rejected rather than written.
- **Tests / verification:** round-trip append/read; rejection of a record containing a forbidden field; rejection when a chain-of-thought-shaped field is present; no file is created under `planning/`. Then `npm run verify:trio`.
- **Acceptance:** tests pass; `git status` shows no new tracked file after a run; `verify:trio` passes.
- **Rollback:** delete the module and test; `.harness/decision-trace/` can be deleted with no effect on Trio.
- **Night-safe:** yes.
- **Capability / Mode / Intensity / Topology:** dev / execute / medium / solo.

---

## WP-04 — Failure taxonomy and classifier

- **Goal:** separate infrastructure failure from cognitive failure, and recommend the right response for each.
- **Surfaces:** new `harness/trio/core/decision.mjs` companion or `harness/trio/core/failure.mjs`, new tests.
- **New frozen names:** `FAILURE_CLASSES = ['infrastructure','cognitive']`, `classifyFailure(error)` → `{ class, code, retryable, suggestedTransition }`.
- **Non-goals:** no change to error messages or thrown codes in existing modules · no retry logic · no provider ladder.
- **Dependencies:** none.
- **Expected behaviour:** quota/429, timeout, provider unavailable, transport mismatch, unsupported tool, sandbox denial, context limit and provider mismatch map to `infrastructure` with `retryable: true` and a transition that is **not** an intelligence escalation. Incomplete plan, unresolved ambiguity, repeated failed repair, verification contradiction and wrong architecture map to `cognitive` with `replan` or a THINK escalation.
- **Tests / verification:** one case per listed condition; an explicit test that no `infrastructure` case returns an intelligence escalation. Then `npm run verify:trio`.
- **Acceptance:** all cases covered; the "no escalation on infrastructure failure" assertion is present and passing.
- **Rollback:** delete the module and test.
- **Night-safe:** yes.
- **Capability / Mode / Intensity / Topology:** dev / execute / medium / solo.

---

## WP-05 — Capability-first resolver requirement

- **Goal:** let the control plane express `{ mode, intensity, capabilities[] }` and receive an implementation, instead of naming a model.
- **Surfaces:** additive exports in `harness/trio/core/routing.mjs`, new tests.
- **New frozen names:** `ExecutionRequirement`, `resolveExecutionImplementation(requirement, registry)`.
- **Non-goals:** do not change `resolveModelEffort`, `validateModelEffort`, `RECOMMENDED_MODEL_SELECTIONS`, or any packet field · no fallback ladder · no model name in any lifecycle semantic.
- **Dependencies:** WP-01.
- **Expected behaviour:** an unsatisfiable requirement returns a structured failure rather than a wrong model; an unsatisfiable capability is never silently downgraded.
- **Tests / verification:** satisfiable, unsatisfiable and ambiguous-requirement cases; assert that no lifecycle-semantic string contains a model name. Then `npm run verify:trio`.
- **Acceptance:** tests pass; existing model-routing tests unchanged and passing.
- **Rollback:** revert the added exports.
- **Night-safe:** yes.
- **Capability / Mode / Intensity / Topology:** dev / execute / high / solo.

---

## WP-06 — Shadow replay fixtures and evaluation harness

- **Goal:** the §19 fixture set plus a deterministic runner that reports old-behaviour vs shadow-gate behaviour.
- **Surfaces:** new `tests/fixtures/decision/` tree, new `scripts/evaluate-decision-shadow.mjs`, new test wiring.
- **Non-goals:** do not extend `scripts/evaluate-trio-v2.mjs` or `tests/fixtures/trio-v2/` (their roots and proof allow-list are pinned) · no live model calls · no Host claim.
- **Dependencies:** WP-02, WP-03, WP-04.
- **Expected behaviour:** the runner replays every fixture deterministically and emits a result document that states it is deterministic shadow evidence, not a Host/model benchmark.
- **Tests / verification:** the fixture tree is complete for every §19 row; the runner is idempotent; the emitted document fails validation if the disclaimer is removed.
- **Acceptance:** all §19 rows have at least one case; runner output is reproducible byte-for-byte across two runs.
- **Rollback:** delete the fixture tree, script and test.
- **Night-safe:** yes (implementation and replay), because it performs no external action.
- **Capability / Mode / Intensity / Topology:** dev / execute / high / solo.

---

## WP-07 — Plan Gate and Verify Gate shadow integration

- **Goal:** attach the `plan` and `verify` bundles to the existing Trio + ChiefOps checkpoint as **shadow only**, recording the recommendation without acting on it.
- **Surfaces:** the decision trace writer call site, the checkpoint path, new tests.
- **Non-goals:** no transition is taken from a gate output · no change to ChiefOps governance · no change to completion semantics · no duplicate readiness check.
- **Dependencies:** WP-06.
- **Expected behaviour:** a checkpoint records the shadow recommendation alongside the current behaviour, including agreement or disagreement; a gate failure never blocks the existing path.
- **Tests / verification:** a shadow run where the gate disagrees with the current behaviour completes normally and records the disagreement; a gate crash cannot fail the checkpoint.
- **Acceptance:** no existing checkpoint test changes; shadow data appears in the trace; `verify:trio` + `verify:core` pass.
- **Rollback:** remove the shadow call site; the trace module and fixtures remain harmless.
- **Night-safe:** conditional. Only after the spec freezes exact transition behaviour; on its own it is additive and shadow-only, but it touches the checkpoint path, so the first execution should be watched.
- **Capability / Mode / Intensity / Topology:** dev / execute / high / solo.

---

## WP-08 — Coding evidence adapter

- **Goal:** collect deterministic dev evidence (tests, build, lint, typecheck, git/branch state) into `evidence.deterministic` for the `verify` bundle.
- **Surfaces:** a new adapter module and tests.
- **Non-goals:** do not replace or reimplement any existing check · do not add a new test runner · do not run release actions.
- **Dependencies:** WP-02.
- **Expected behaviour:** the adapter reports raw deterministic facts only; it makes no semantic judgement.
- **Tests / verification:** adapter output contains no opinion, only observed facts; a failing command is reported as a fact, not as a decision.
- **Acceptance:** tests pass; no existing check is altered.
- **Rollback:** delete the adapter and tests.
- **Night-safe:** yes.
- **Capability / Mode / Intensity / Topology:** dev / execute / medium / solo.

---

## WP-09 — Office evidence adapter

- **Goal:** the same for office artifacts: document structure, spreadsheet formula integrity, slide render, PDF structural checks.
- **Surfaces:** a new adapter module and tests; reuses the existing office capability references rather than duplicating them.
- **Non-goals:** do not duplicate any specialised artifact skill · no new renderer · no semantic scoring.
- **Dependencies:** WP-02.
- **Expected behaviour:** deterministic artifact facts only; a formula error or a failed render is a fact.
- **Tests / verification:** the §19 office pair (deterministic pass + semantic fail, and the converse) is reproducible.
- **Acceptance:** tests pass; `tests/trio/office-capability.test.mjs` unchanged and passing.
- **Rollback:** delete the adapter and tests.
- **Night-safe:** yes.
- **Capability / Mode / Intensity / Topology:** office / execute / medium / solo.

---

## WP-10 — Selective activation and baseline comparison

- **Goal:** decide, from recorded evidence, which gates (if any) may move from shadow to active, with a measured baseline comparison.
- **Surfaces:** the evaluation result document, the activation switch (configuration, not code), and the Trio decision record.
- **Non-goals:** activation of any gate is **not** automatic · no release action · no Linear telemetry.
- **Dependencies:** WP-07, WP-08, WP-09.
- **Expected behaviour:** each gate is reported with its measured effect on the §18 benefit list; a gate with no measured benefit stays in shadow.
- **Tests / verification:** the comparison document is reproducible; the activation switch defaults to shadow.
- **Acceptance:** a written activation decision per gate, with the evidence it rests on, and a recorded rollback condition.
- **Rollback:** flip the switch back to shadow; no data migration needed.
- **Night-safe:** the implementation and evaluation slices may run at night; the final activation decision is **not** automatic and is a Chief/human decision.
- **Capability / Mode / Intensity / Topology:** dev / think + execute / max / solo.

---

## WP-11 — Migration, documentation and release readiness

- **Goal:** document the runtime, its compatible migration path, its known limitations, and its rollout gates.
- **Surfaces:** `docs/` architecture and operations pages, `README` where operator-facing, and the Trio record.
- **Non-goals:** no commit, push, PR, merge, publish or deploy without explicit authorization · no retroactive edit of the two 2026-06-04 specs beyond adding a pointer to this reconciliation.
- **Dependencies:** WP-10.
- **Expected behaviour:** a reader can tell what changed, what deliberately did not, and what remains limited.
- **Tests / verification:** `tests/plugin-kit/docs-contract.test.mjs` and `tests/core/no-personal-paths.test.mjs` pass; `npm run verify:core` passes.
- **Acceptance:** docs complete, contract tests pass, and the release boundary in spec §21 is restated for the operator.
- **Rollback:** docs-only; revert the files.
- **Night-safe:** no for any external release action.
- **Capability / Mode / Intensity / Topology:** dev + office / think / high / solo.

---

## Night-queue sequencing

| Wave | Ticket | State | `nightly` |
| --- | --- | --- | --- |
| 0 | Parent initiative issue | Backlog | no |
| 1 | **WP-01** | Todo + `agent-ready` + `nightly` | **yes** |
| 2 | WP-02, WP-04, WP-05 | Backlog | eligible after WP-01 is accepted |
| 3 | WP-03 | Backlog | eligible after WP-02 is accepted |
| 3 | WP-08, WP-09 | Backlog | eligible after WP-02 is accepted |
| 4 | WP-06 | Backlog | eligible after WP-02/03/04 accepted |
| 5 | WP-07 | Backlog | eligible after WP-06, observed |
| 6 | WP-10 | Backlog | implementation slices only; activation is Chief/human |
| 7 | WP-11 | Backlog | no (external release gate) |

Only the next dependency-free, edit-disjoint slice is promoted into the night queue. Promotion requires: tracked task, bounded slice, written acceptance, closed dependencies, no pending human decision, no open blocker, explicit edit surface, no overlap with another night edit surface, unattended verification possible, and no external or destructive step.

The existing queue already contains other initiatives' eligible slices (`SUP-24`, `SUP-17`, `SUP-15`). WP-01's edit surface (`harness/trio/core/routing.mjs`, `tests/trio/**`) is disjoint from all of them.
