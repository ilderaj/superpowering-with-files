# Decision-Control Runtime — Architecture, Migration and Operation

Operator-facing documentation for the decision-control runtime introduced by the 2026-09-19 initiative. Design authority is the [design spec](superpowers/specs/2026-09-19-decision-control-runtime-design.md); slice detail is in the [implementation plan](plans/2026-09-19-decision-control-runtime-plan.md); measurement is in the [baseline comparison](plans/2026-09-19-decision-control-runtime-baseline.md).

## What the runtime is

```text
Trio          = durable task truth (task_plan.md / findings.md / progress.md)
Lifecycle     = code-owned task control graph
Decision      = narrow semantic judgment at a phase boundary
Mode          = THINK / EXECUTE
Intensity     = low / medium / high / xhigh / max
Topology      = solo / delegated / parallel
ChiefOps      = governance, delegation and acceptance
Linear        = human-facing projection
Night         = bounded unattended EXECUTE lane
Morning       = reconciliation and human attention
Resolver      = concrete model, provider and tool selection
```

The runtime is vocabulary and contracts over machinery that already existed. It adds no scheduler, daemon, database, dashboard, web service or second task store, and it introduces no second state machine.

## What changed

| Surface | Change |
| --- | --- |
| `harness/trio/core/routing.mjs` | Additive vocabulary: `MODE_KINDS`, `INTENSITY_LEVELS`, `TOPOLOGY_CLASSES`, `modeOf`, `intensitySubsetOf`, `normalizeIntensity`, `topologyClassOf`, `EXECUTION_REQUIREMENT_FIELDS`, `ExecutionRequirement`, `resolveExecutionImplementation`. No existing export or behaviour changed. |
| `harness/trio/core/decision.mjs` | New. Provider-neutral decision contract: five frozen bundles (intake, plan, action, verify, release), request/response validation, pure composites (`intake_route`, `plan_ready`, `action_requires_policy_gate`, `next_state`, `release_state`), operator and deterministic backends, a local non-authoritative trace, and the infrastructure/cognitive failure taxonomy. The transition vocabulary is `continue | plan | repair | replan | retry | escalate | done`. |
| `harness/trio/core/evidence.mjs` | New. Deterministic evidence adapters: `devEvidence` (tests, build, lint, typecheck, git state) and `officeEvidence` (document structure, spreadsheet formulas, slide render, PDF structure, artifact facts). |
| `harness/trio/core/shadow.mjs` | New. Shadow gate recorder, the six priority shadow questions, agreement recording, a disagreement summary, and the gate activation switch. |
| `scripts/evaluate-decision-shadow.mjs` | New. Deterministic shadow replay over 27 fixtures covering every spec §19 area. |
| `tests/fixtures/decision/` | New. The 27-case fixture set and the recorded shadow result. |

Each new Trio core module is registered deliberately in `tests/trio/import-boundaries.test.mjs` and in the `verify:trio` file list. An unattended change that adds a module without registering it fails `verify:trio` rather than shipping silently.

## What deliberately did not change

* **Trio remains the only durable task authority** — exactly three files, no fourth state surface.
* **The three-route Decision-Plane Router stays retired.** `lean-direct` / `tracked-lean` / `deep-rich` are not reintroduced; `tests/trio/authority-parity.test.mjs` still asserts the module's absence.
* **The per-unit Execution Contract stays retired.** The live execution contract is the existing 8-field assignment packet.
* **Quick work gains no ceremony.** The mode/intensity/topology vocabulary is derived, not required.
* **ChiefOps governance, the Linear projection, the workspace guard, the night queue and the morning handoff are unchanged.**
* **No model name appears in any lifecycle semantic.** Provider and model stay registry entries resolved at runtime.
* **No provider fallback ladder.** `resolveExecutionImplementation` reports every satisfying candidate in a declared registry order and returns a structured unsatisfiable reason instead of silently downgrading capability.

## Migration and compatibility

Nothing must be migrated to keep working.

1. **Bounded behavior corrections.** J01 changes unknown-check handling and failure precedence; J02 adds isolated three-state shadow records; J03 requires scoped policy context for allowed. Legacy authorization records parse but no longer grant permission. These intentionally correct the new decision API; existing quick/tracked routing is unchanged.
2. **Route vocabulary is unchanged.** `ROUTE_KINDS` is still `['quick','tracked']`; `deep-reasoning` still normalizes to `tracked`. The new `mode`/`intensity`/`topology` names are derived views over the enums that already existed.
3. **Upstream compatibility is preserved.** The vendored upstream tree is untouched; the retired route vocabulary survives only there, which is upstream-owned content the SWF overlay already replaces.
4. **Installation and projection are unaffected.** The new modules are runtime code under `harness/trio/core/`, not projected skill surfaces, so the six-entry governance inventory and its reference manifest are unchanged.
5. **Existing evidence stays valid.** Unchanged tests keep their results; only newly added suites change the counts.

## Operation

### Shadow recording

A caller evaluates a priority question against the existing behaviour and records the result:

```js
import { recordShadowDecision, shadowRequestFor, summarizeShadow } from './harness/trio/core/shadow.mjs';

const request = shadowRequestFor('plan_ready', { subject, requirement });
const outcome = await recordShadowDecision({
  questionId: 'plan_ready', request, operator, currentBehaviour: 'proceed',
  phase: 'plan', directory: '.harness/decision-trace'
});
```

The recorder never blocks the existing path. A gate that throws, a bundle that cannot be answered, or an unwritable trace all return a structured result (`unevaluable`, `reason`) instead of propagating.

### Evidence adapters

```js
import { collectDevEvidence, collectOfficeEvidence } from './harness/trio/core/evidence.mjs';
```

Both adapters record observed facts only. A failing command is a fact with an exit code; a formula error is a fact with its range. Neither adapter makes a semantic judgement, and neither replaces an existing check or adds a test runner.

### Evaluation

```bash
node scripts/evaluate-decision-shadow.mjs
```

Deterministic replay over the 27 fixtures, written to `tests/fixtures/decision/observed-shadow-result.json`. Current contract replay: 27 cases, **15** comparable disagreements, 1 unevaluable (26 comparable). Null is not a disagreement; local legacy aliases are normalized.

The old count18 included two vocabulary aliases and one unevaluable case. Disagreement with an author-recorded historical column is not a quality measure. T1 conditional agreement is26/26; coverage and correct-over-all are26/27. Independent model accuracy and efficiency remain unproven. See the current evaluation contract in `tests/evals/decision-control/contract.md`.

### Repo-side checkpoint caller

For this initiative use `node scripts/render-decision-checkpoint.mjs --input <file|-> --trace-dir <local-dir>` with `{checkpoint, observations}`. The wrapper renders through the existing Linear renderer, records shadow observations, and returns exactly the old stdout. Task/bundle/phase mismatch, a failed gate or an unwritable trace cannot change the valid rendered result. The caller neither publishes to Linear nor changes Trio or transitions. This is opt-in for the current initiative; global skills are not repointed.

A real checkpoint of the 2026-09-22 remediation was invoked by the Chief: `reports/decision-resume-20260922/live-checkpoint-receipt.json` records byte identity and one persisted plan_ready observation. Answers came from the current operator; this establishes real checkpoint integration, not a Jev API call or savings.

### Gate activation

Every gate starts in `shadow` and stays there. `resolveGateActivations()` returns `shadow` for a gate with no record, and `resolveGateActivation()` refuses to promote a gate whose record lacks a measured benefit, a rollback condition, evidence, or a Chief/human authorization. **No gate is active in this milestone.** See the [baseline comparison](plans/2026-09-19-decision-control-runtime-baseline.md) for the decision and its conditions.

## Known limitations

1. **All gates remain shadow.** The repo-side opt-in checkpoint wrapper calls the recorder; no model output controls a lifecycle transition or release.
2. **Integration is bounded.** One real task checkpoint has been observed. Global adoption and independent semantic backend calls have not occurred.
3. **The replay is design evidence, not a model benchmark.** Fixture answers are operator inputs. The run proves the gates are internally consistent and total; it does not show how a live model would answer.
4. **No representative live disagreement rate exists yet,** so no gate has measured benefit on the spec §18 list and none may be activated.
5. **Trace storage is local and non-authoritative.** `.harness/decision-trace/` is gitignored, so a trace is intentionally not reviewable through git.
6. **`execute` intensity is not widened to `low|medium`.** That would change `validateModelEffort` behaviour and needs its own slice and evidence.
7. **The `host` and `external` decision backends are not implemented.** `external` throws by design; no network decision backend exists in this milestone.

## Release boundary

Restated from spec §21 for the operator:

* This runtime may be implemented, tested and checkpointed locally.
* **Night automation must never convert local verification into a release.**
* Commit, push, PR, merge, publish and deploy each follow current repository policy and explicit user authorization every time.
* `release_state = allowed` is a policy output, never a schedule output. A model may judge readiness; only policy and recorded authorization may permit a release action.

Readiness and permission are separated in the evaluator. Operator/model answers cannot set authorization. The dedicated legacy `{value, authority, evidence}` record remains readable but is not sufficient to grant permission. The caller supplies `policyContext: {decision, taskId, operation, evidenceRef}` and a separately selected `operation`; only an exact task/operation match may yield an `allowed` recommendation. Missing or mismatched policy yields `ready`, not permission. Bare `authorizationProvenance: 'policy'` is ignored. The Host must authenticate the source and enforce the permission again at the action boundary; this pure module cannot do that.

The backend declaration must match the answer path. `host` and `external` currently reject execution. An operator cannot label answers as model/policy/deterministic provenance. All authorization and provenance hardening is local; no release action is executed.

## Verification

```bash
npm run verify:trio
npm run verify:core
./scripts/harness sync --check
```

Plus the targeted suites: `tests/trio/decision.test.mjs`, `tests/trio/vocabulary.test.mjs`, `tests/trio/dev-evidence.test.mjs`, `tests/trio/office-evidence.test.mjs`, `tests/trio/shadow-gate.test.mjs`.

## Next phase

The user's Jev-primary/cheap-cloud-fallback and day/night proposals are in [2026-09-22 plan](plans/2026-09-22-jev-default-and-day-night-plan.md). Default provider selection, fallback capability, independent T1.5 and scoped T2 intervention are next-phase work; the availability of a paid API account alone is not an integrated backend or evidence of benefit.
