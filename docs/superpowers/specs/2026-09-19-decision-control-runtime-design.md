# Decision-Control Runtime Design

> 2026-09-20审计更正：当前整改规格以 `docs/plans/jev-swf-audit-20260920/spec.md` 为准；执行见同目录plan.md。下文保留原设计历史，冲突处已被新规格取代。T1是契约回放，不是独立预测准确率；WP07保持shadow，不能单凭接入证明效率收益；outputTokens不等于freshTokens；成本按实测全量求和，不减avoidedCost。

Status: proposed (Chief-authored, awaiting spec acceptance gate).
Date: 2026-09-19. Repository state audited: `dev` at `ad3c8b30` (merge of PR #184), dirty working tree owned by the sibling task `linear-multiproject-isolation-20260918`.

## 0. Relationship to prior specs

This spec **reconciles** three earlier design documents rather than replacing them blindly:

| Prior spec | Current code reality | This spec's disposition |
| --- | --- | --- |
| `2026-06-04-decision-plane-router-design.md` | Module `harness/runtime/decision-plane-router.mjs` was implemented then deleted in `cad10cd9`; its absence is now asserted by `tests/trio/authority-parity.test.mjs` (`RETIRED_RUNTIME_MODULES`). Current routes are `ROUTE_KINDS = ['quick','tracked']`. | Retire the three-route vocabulary. Keep the *question* the spec asked ("which path should this task be on right now?") as Decision Bundles §9. |
| `2026-06-04-execution-contract-design.md` | `harness/runtime/execution-contract.mjs`, receipts, approval tokens, write plans are deleted and asserted absent in `tests/installer/record-command.test.mjs`. The surviving, live contract is the 8-field assignment packet in `harness/trio/core/routing.mjs`. | Do not reintroduce per-unit execution contracts or receipts. The assignment packet **is** the execution contract. |
| `2026-07-09-chiefops-v0b-thread-control-overlay-design.md` | Thread-control overlay runtime is retired; legacy `visible_worker_required` fails closed to `manual_pending` with blocker `legacy_visible_worker_required_retired`. | ChiefOps stays governance-only. No new receipts, binding packets, or Chief Gate state. |

## 1. Executive summary

SWF does not need a new orchestration stack. It needs three things it currently lacks, and it already has everything else.

The north star, restated for implementation:

> Trio owns truth. Code owns lifecycle. Decision Gates judge narrow semantics. ChiefOps owns governance. Linear exposes human attention. Night executes frozen slices. Morning reconciles evidence. Models provide capabilities, not identities.

What already satisfies that north star and must not be rebuilt:

- **Trio** is already the sole durable task authority: exactly `task_plan.md`, `findings.md`, `progress.md` under `planning/active/<task-id>/`, enforced to exactly three files (`ERR_TRIO_EXTRA_STATE`, `harness/trio/core/store.mjs`).
- **Quick/Tracked is already the reconciled intake taxonomy.** `ROUTE_KINDS = ['quick','tracked']`; `deep-reasoning` is accepted as an alias and normalized to `tracked`; the Trio skill already states "Deep: a current-round reasoning choice for material uncertainty, not a durable task type."
- **Provider-neutral execution already exists in shape**: `resolveModelEffort` demands a declared `workRole` and refuses to imply one; provider is *derived* from the model identity, not selected as architecture.
- **The execution contract already exists** as the frozen 8-field assignment packet (`ASSIGNMENT_PACKET_FIELDS`).
- **The human control plane already exists**: Linear projection, workspace guard, nine runtime states, night queue, night executor and morning handoff, all live.

The three genuine gaps:

1. **No explicit mode/intensity/topology vocabulary.** `CHIEF_WORK_ROLES` and `EXECUTION_WORK_ROLES` *are* THINK and EXECUTE, and `CHIEF_REQUESTED_EFFORTS` / `COMPLEXITY_KINDS` *are* intensity, but nothing names them, nothing unifies them, and no consumer can express a requirement as "mode = EXECUTE, intensity = medium".
2. **No semantic decision layer at all.** Every gate in the code path is deterministic (`adjudicatePermission`, `PERMISSION_STAGES = ['scope','sandbox','approval']`) or is prose inside a prompt. There is no provider-neutral way to ask "is this plan ready?" or "is verification sufficient?" and record the answer.
3. **No failure taxonomy.** Infrastructure failure (429, timeout, provider unavailable) and cognitive failure (wrong architecture, repeated failed repair) both currently surface as undifferentiated errors, which invites the wrong response — escalating intelligence because a provider timed out.

## 2. Current-state architecture

### 2.1 Routing and durability

| Surface | Current reality | Evidence |
| --- | --- | --- |
| Route kinds | `['quick','tracked']` | `harness/trio/core/routing.mjs` `ROUTE_KINDS` |
| Task classification | explicit class, else heuristic over `multiplePhases/worktree/crossSession/durableResearch/durableDecisions/requiresRecovery/tracked/phases` | `classifyTask`, `hasTrackedSignal` |
| Durable authority | exactly three files | `TRIO_FILE_NAMES` (`read.mjs`), `TRIO_FILE_ENTRIES` (`store.mjs`) |
| Authority root | `--root` → `HARNESS_PROJECT_ROOT` → `.harness/authority-root.json` → git toplevel → ancestor markers → cwd | `discoverAuthorityRoot` (`authority.mjs`) |

### 2.2 Task lifecycle (the only real state machine)

The one existing code-owned lifecycle is the **task** lifecycle in `store.mjs`, driven by `Status:` in `task_plan.md`:

```
init -> active --accept--> (progress event) --close--> closed --archive--> planning/archive/...
                        \--stop--> (progress event)
```

- Every transition requires `actor === 'chief'` (`ERR_TRIO_CHIEF_REQUIRED`).
- Writes require `Status === 'active'` (`ERR_TRIO_LIFECYCLE`).
- `close` requires durable chief accepted-or-stopped evidence (`ERR_TRIO_ACCEPTANCE_REQUIRED`).

There is **no** code state machine for INTAKE → PLAN → EXECUTE → VERIFY → RELEASE. Those phases exist only as planner prose in `task_plan.md`.

### 2.3 Execution topology

Topology is expressed by frozen enums, never by a single term:

```
PRIMARY_EXECUTION_KINDS = ['default','visible_worker_required']   // the second is retired and fails closed
CHILD_DELEGATION_KINDS  = ['prohibited','worker_discretion','encouraged']
EXECUTION_MODE_KINDS    = ['bounded_slice','worker_self_goal']
HOST_ROUTE_KINDS        = ['visible_worker','native_subagent','manual_pending']
HOST_WORKER_STATUSES    = planned|observed|idle|executing|awaiting_approval|candidate_done|stopped|blocked
```

`topologyOf()` only echoes `primaryExecution` and `executionMode` back into the routing record; it performs no classification.

### 2.4 Model and effort

- `resolveModelEffort` throws without a declared `workRole`: "A requested model decision requires a declared workRole."
- Chief catalog: `gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna` with efforts `low|medium|high|xhigh|max`.
- Execution uses `FLASH_EXECUTION_MODEL` with `COMPLEXITY_KINDS = ['high','xhigh','max']`.
- `ultra` is gated on authenticated Host `supportedModelEfforts` evidence.
- `RECOMMENDED_MODEL_SELECTIONS` are opt-in presets, not a fallback ladder.

### 2.5 Human control plane

| Layer | State |
| --- | --- |
| Linear workspace | `superpoweringwithfiles` (id `dcaa7009-b84b-49ba-ab84-de1f0c46ba51`) |
| Team / project | `SUP` / `SWF — Agent Workbench MVP` (`fbabc28b-ff1b-4e06-9786-058dbc3ed36d`) |
| Runtime states | `planned, ready, running, waiting_human, blocked, review, failed, done, canceled` |
| Labels | `swf-managed`, `executor:codex-local`, plus state label; `nightly` is queue admission only |
| Guard | `ok | workspace-mismatch | workspace-unknown | binding-disabled | binding-invalid` |
| Night executor | Host cron `swf-night-executor`, ACTIVE, 01:30 Asia/Shanghai, `opencode-go/deepseek-v4.1-flash`, reasoning `high`, cwd repo root, concurrency 1 |
| Morning handoff | Host cron `swf-morning-handoff`, ACTIVE, 07:30 Asia/Shanghai, same model |
| Queue | `night-queue.mjs` (in-flight, untracked): bounded serial queue, 3 attempts / 45 minutes, priority `1,2,3,4,0` then oldest `updatedAt` then ID |
| Configured vs triggered vs observed | configured + triggered are recorded for 2026-09-19 01:31/07:33; the *next* automatic trigger remains unobserved |

### 2.6 Working-tree caveat

The tree carries uncommitted work from the sibling initiative (`harness/core/skills/linear-work-control/*`, `harness/trio/governance/chiefops/SKILL.md`, untracked `night-queue.mjs` and three `tests/core/linear-*.test.mjs`). Any slice in this initiative must be edit-disjoint from that surface. No slice below touches those files.

## 3. Reconciliation ledger

| Existing mechanism | Disposition | Reason |
| --- | --- | --- |
| Trio three files | **Keep** | Sole durable authority; already enforced. |
| `quick/tracked` routes | **Keep** | Already the reconciled answer to the June router taxonomy. |
| `deep-reasoning` alias | **Keep** | Backward-compatible alias normalized to `tracked`. |
| `lean-direct/tracked-lean/deep-rich` | **Deprecate residue** | No code path emits or consumes them. The only in-repo occurrence is the vendored upstream tree `harness/upstream/planning-with-files/templates/task_plan.md`, which is **upstream-owned content** that the SWF overlay (`harness/core/upstream-overlays/planning-with-files/templates/task_plan.md`) already replaces. Editing vendored upstream is wrong; the disposition is a *documented* deprecation plus a contract test that asserts these tokens never appear in SWF-owned runtime or skill surfaces. |
| Task lifecycle (`active/closed/archive`) | **Keep, do not extend** | It is the only state machine that needs to exist. |
| Execution phase lifecycle | **Express as vocabulary, not a state machine** | A second state machine would duplicate planner phases and ChiefOps readiness. See §5. |
| `CHIEF_WORK_ROLES` / `EXECUTION_WORK_ROLES` | **Generalize into `MODE`** | Additive derivation only; the role enums stay authoritative. |
| `CHIEF_REQUESTED_EFFORTS` / `COMPLEXITY_KINDS` | **Generalize into `INTENSITY`** | Additive; per-mode supported subsets preserved so `validateModelEffort` behavior does not change. |
| `topologyOf` envelope | **Add `topologyClass`** | Additive derived label; the envelope is unchanged. |
| 8-field assignment packet | **Keep as the execution contract** | The June execution-contract spec's unit-level contracts/receipts stay retired. |
| Decision-plane-router module | **Reject reintroduction** | Its question survives as Decision Bundles; its three-route model does not. |
| `adjudicatePermission` / `PERMISSION_STAGES` | **Keep as the Action Gate's deterministic half** | Policy, not semantics. |
| `resolveModelEffort` | **Keep; wrap with capability-first requirements** | Provider neutrality is preserved; requirements stop naming models. |
| ChiefOps governance | **Keep unchanged** | Governance only; no new state. |
| Linear control plane + night queue + night/morning automations | **Reuse unchanged** | No new dashboard, scheduler, daemon, database, or store. |
| Decision Layer / Bundles / trace / failure taxonomy | **Genuine gap — build (shadow first)** | See §9–§12. |

## 4. Target architecture

Minimum stable concepts. Nothing outside this list becomes lifecycle semantics:

```
Lifecycle    code-owned task control graph (existing active/closed/archive + named phases)
Mode         think | execute
Intensity    low | medium | high | xhigh | max
Decision     a narrow semantic judgment at a phase boundary
Topology     solo | delegated | parallel
Capability   dev | office | safety
Policy       deterministic authorization (scope / sandbox / approval / release)
```

Hard rule: **no concrete provider or model name may appear in lifecycle semantics.** Models appear only in the resolver registry and in validated request records.

## 5. Lifecycle

The generic superset, as a *vocabulary* the planner and the gates share:

```
INTAKE -> [PLAN?] -> EXECUTE -> VERIFY -> [RELEASE?] -> DONE
```

- Not every task traverses every phase. A quick edit is `INTAKE -> EXECUTE -> VERIFY -> DONE`.
- `PLAN?` is entered when the intake bundle says `plan_needed = true`.
- `RELEASE?` is entered only when a release-shaped outcome is in scope; it is never implied by completed implementation.

Phase outcomes are **transitions, not identities**:

```
continue | plan | repair | replan | retry | escalate | done
```

`plan` is the INTAKE -> PLAN transition and `retry` is the response to an
infrastructure failure. Both were absent from the first frozen vocabulary, which
made the intake transition unrepresentable and made a recorded infrastructure
failure inert; the T1 accuracy run measured the cost of that and both were added.
The vocabulary is deliberately the same set everywhere a transition is named, so
no two surfaces translate between private languages.

Reconciliation with existing state, so no second state machine is introduced:

| New phase | Existing carrier | No new artifact |
| --- | --- | --- |
| INTAKE | `classifyTask` + `routeTask` + the `Status: active` task file | — |
| PLAN | `task_plan.md` Phases / Current Phase | — |
| EXECUTE | `progress.md` Work and Results | — |
| VERIFY | `progress.md` Verification Evidence | — |
| RELEASE | lifecycle `accept`/`close` + release policy | — |
| DONE | `Status: closed` + `Archive Eligible: yes` | — |

The phase name is **derived**, not stored as a new field, until a slice proves a consumer needs it durable. The classification helper is `lifecyclePhaseOf(taskRead, routingRecord)` and it must be a pure function over already-read state.

## 6. Behavioral modes

```
MODE_KINDS = ['think','execute']
```

| Mode | Purpose | Existing carrier |
| --- | --- | --- |
| `think` | analysis, research, architecture, spec/PRD, ambiguity resolution, planning, brainstorming, replanning, semantic verification | `CHIEF_WORK_ROLES = [chief, thinking, planning, orchestrating, high_density_judgment]` |
| `execute` | coding, editing, tests, artifact production, mechanical implementation, migrations, bounded office work, authorized release operations | `EXECUTION_WORK_ROLES = [executing, searching, researching, coding, exploring, repetitive_execution]` |

`modeOf(workRole)` is total over the existing role enums and throws for an unknown role, matching `classifyWorkRole`'s existing fail-closed behavior. No model is bound to a mode; `resolveModelEffort` continues to decide the model.

## 7. Intensity

```
INTENSITY_LEVELS = ['low','medium','high','xhigh','max']
```

Intensity is a **requirement on the request**, expressed independently of model identity.

Per-mode supported subsets in this milestone (deliberately unchanged from today's behavior):

| Mode | Supported intensity | Source of truth |
| --- | --- | --- |
| `think` | `low, medium, high, xhigh, max` | `CHIEF_REQUESTED_EFFORTS` |
| `execute` | `high, xhigh, max` | `COMPLEXITY_KINDS` |

`normalizeIntensity(value, mode)` validates against the mode's subset and rejects out-of-subset values. Widening execution to `low|medium` would change `validateModelEffort` behavior and is explicitly **deferred**; it is not part of any slice in this initiative's first wave.

## 8. Topology

```
TOPOLOGY_CLASSES = ['solo','delegated','parallel']
```

`topologyClassOf(packetOrRecord)` is a pure derivation over existing fields:

| Condition | Class |
| --- | --- |
| `childDelegation === 'encouraged'` | `parallel` |
| `hostRoute === 'native_subagent'` or `executionMode === 'worker_self_goal'` | `delegated` |
| `primaryExecution === 'visible_worker_required'` | `delegated` **and** already fails closed to `manual_pending` |
| otherwise | `solo` |

Trio is **not** topology. The derivation never writes back into Trio.

## 9. Decision Layer

A provider-neutral semantic decision contract. It is a *contract and a set of pure functions*, not a service.

```js
DECISION_KINDS = ['boolean', 'choice', 'score']
```

### DecisionRequest

```
schemaVersion  1
bundle         intake | plan | action | verify | release
bundleVersion  1
subject        { taskId, phase, capability }
requirement    { mode, intensity }
evidence       { deterministic: {...}, semanticContext: <string> }
questions      [ { id, kind, options? , scale? } ]
```

### DecisionResponse

```
schemaVersion  1
bundle, bundleVersion
answers        [ { id, value, kind,
                   confidence: { level: 'unknown'|'low'|'medium'|'high',
                                 provenance: 'deterministic'|'operator'|'model'|'policy' } } ]
backend        { id: 'deterministic'|'operator'|'host'|'external', version }
```

`confidence.provenance` is mandatory and `confidence.level` is a **level, never a numeric probability**. Uncalibrated probability masquerading as calibrated confidence is an explicit anti-goal.

### Backends in this milestone

| Backend id | Behaviour | Network | Available now |
| --- | --- | --- | --- |
| `deterministic` | answers derived only from explicit booleans/values in `evidence.deterministic`; unknown evidence yields `level: 'unknown'` | none | yes |
| `operator` | answers supplied explicitly inside the request payload (fixtures, human shadow run) | none | yes |
| `host` | answers supplied as a validated JSON answer block by the calling session | none in code | yes |
| `external` | future: cheap structured cloud LLM, TypeSafe/Jev, OpenJev-style logits, or a small specialised model | yes | **no — out of scope** |

No network call, no local inference, and no third-party framework dependency is introduced by this milestone. The `external` backend is an interface only.

## 10. Decision Bundles

Five bundles, each a small set of narrow questions over one state. Question ids and kinds are frozen here because they are architecture decisions.

### intake

| id | kind | options / scale |
| --- | --- | --- |
| `goal_clarity` | score | `1..5` (1 = unclear, 5 = unambiguous) |
| `plan_needed` | boolean | drives the `intake_route` composite |
| `tracked_state_value` | boolean | |
| `risk_level` | choice | `low | medium | high` |
| `intelligence_demand` | choice | `low | medium | high | max` |
| `parallel_benefit` | boolean | |

Composite: `intake_route` | choice | `plan | continue` — `plan` when `plan_needed` is true,
otherwise `continue`. This is the runtime output of the lifecycle's `INTAKE -> PLAN?` step.

### plan

| id | kind |
| --- | --- |
| `requirements_covered` | boolean |
| `solution_coherent` | boolean |
| `dependencies_resolved` | boolean |
| `implementation_specific` | boolean |
| `acceptance_defined` | boolean |
| `verification_defined` | boolean |
| `blocking_unknowns_remain` | boolean |

Composite: `plan_ready` (see §11).

### action

Only evaluated at a meaningful risk boundary, never before every command.

| id | kind |
| --- | --- |
| `destructive` | boolean |
| `irreversible` | boolean |
| `privileged` | boolean |
| `high_impact` | boolean |
| `external` | boolean |
| `security_sensitive` | boolean |

Composite: `action_requires_policy_gate` = OR over the six. The composite only *escalates to policy*; it never authorises. `adjudicatePermission` remains the decision-maker.

### verify

| id | kind |
| --- | --- |
| `goal_satisfied` | boolean |
| `requirements_covered` | boolean |
| `semantic_correctness` | boolean |
| `scope_preserved` | boolean |
| `verification_sufficient` | boolean |
| `regression_risk` | score `1..5` |
| `more_work_required` | boolean |

Composite: `next_state` | choice | `continue | plan | repair | replan | retry | escalate | done`.

Deterministic inputs to `verify` (tests, build, lint, typecheck, file validity, formula integrity, render validity) are recorded in `evidence.deterministic` and are **never** replaced by a semantic answer. A semantic `goal_satisfied = true` with a failed deterministic check is a fixture case (§19), and the composite must resolve to `repair` or `replan`, not `done`.

A deterministic check with status `unknown` is a third condition: it did not
fail, but it also never reported, so verification is unproven and the composite
resolves to `retry`. A recorded infrastructure failure resolves to `retry` as
well, before any semantic answer is consulted.

### release

| id | kind | options |
| --- | --- | --- |
| `readiness` | choice | `not_ready | ready` |
| `authorization` | choice | `not_authorized | allowed` |

**READY and ALLOWED are strictly separate.** A semantic answer may set `readiness`. Only policy and recorded human authorization may set `authorization`. The composite `release_state` is:

| readiness | authorization | release_state |
| --- | --- | --- |
| not_ready | either | `not_ready` |
| ready | not_authorized | `ready` |
| ready | allowed | `allowed` |

Only `allowed` may permit commit / push / PR / publish / send / merge / release / deploy.

## 11. Deterministic / semantic / composite separation

First-class labelling on every question and every evidence item:

```js
EVIDENCE_CLASSES = ['deterministic', 'semantic', 'composite']
```

| Class | Examples | Rule |
| --- | --- | --- |
| `deterministic` | exit code, file exists, branch state, build result, binding validity, workspace guard, formula error, test result | Observed, never inferred. Must be obtainable without a model. |
| `semantic` | plan coherent, output satisfies intent, evidence supports claim, scope creep, artifact quality, verification sufficiency | Judged. Must carry `confidence.provenance`. |
| `composite` | execution ready, PR ready, task done, night-ready | Deterministic combination of the two; must be a pure function of the answers, never a free-form judgement. |

The composite resolution functions are pure and unit-tested. They are the reason a gate can be replayed deterministically from a recorded response.

## 12. Failure taxonomy

```js
FAILURE_CLASSES = ['infrastructure', 'cognitive']
```

### Infrastructure / runtime

quota or 429 · timeout · provider unavailable · transport or API incompatibility · unsupported tool · sandbox denial · context limit · provider/model mismatch against the registry.

Response: **retry, or resolve another compatible execution implementation.** Intelligence is never escalated because infrastructure failed. Escalation on an infrastructure failure is recorded as a defect.

### Cognitive / task

incomplete plan · unresolved ambiguity · repeated failed repair · verification contradicts implementation · architecture is wrong.

Response may include: `EXECUTE -> THINK`, `medium -> high`, `high -> max`, or `REPLAN`.

`classifyFailure(error)` maps an error or a recorded condition to `{ class, code, retryable, suggestedTransition }`. The classifier is deterministic and table-driven; it is not a model call.

## 13. Runtime Resolver

The upper control plane expresses **requirements**, never model names:

```
{ mode: 'execute', intensity: 'medium', capabilities: ['coding','filesystem','test'] }
```

`resolveExecutionImplementation(requirement, registry)` returns `{ implementation, reason, fallbackReason }`.

Registry inputs may include: capability support · provider availability · quota · health · latency · cost · context support · tool support · transport support · privacy constraints.

The registry is **configuration**, and the existing code is already the right shape: `RECOMMENDED_MODEL_SELECTIONS` and `validateModelEffort` are presets and validation, not a hardcoded chain. This milestone does not introduce a fallback ladder, and it does not encode `Planner = Sol / Reviewer = Luna / Executor = DeepSeek`.

The Host still owns actual model and effort; `actualModel`/`actualEffort` remain `unknown` without authenticated Host evidence.

## 14. Coding and Office

One control plane, no separate top-level harnesses. Domain evidence lives in capability adapters.

| Capability | Deterministic evidence | Semantic judgement |
| --- | --- | --- |
| dev | tests, build, lint, typecheck, git/branch state, diff correctness inputs | requirement coverage, regression risk, verification sufficiency |
| office | document structure, spreadsheet formula integrity, slide render, PDF structural/render checks | semantic completeness, analytical validity, storyline and audience fit |

Both feed the same `verify` bundle. `tests/trio/dev-capability.test.mjs` and `tests/trio/office-capability.test.mjs` already pin the capability contracts and must keep passing unchanged.

## 15. Linear, night, morning

Preserved exactly as they are:

Linear is a projection; Trio is local authority · workspace guard · one issue per task · one status comment rewritten in place · state/label mapping · `agent-ready` · `nightly` · `waiting-human` · `blocked` · `ready-review` · `agent-failed` · `executor:codex-local` · `swf-managed`.

Not built: dashboard · scheduler · daemon · database · web service · second task store.

New behaviour is limited to what the decision layer adds to an *existing* checkpoint:

1. A slice may record a `decision` block (bundle, question ids, answer, confidence provenance, backend id, transition recommendation, override) in the local trace store.
2. The night executor's admission rule is unchanged: `nightly` is the only switch. The readiness checklist is unchanged.
3. Morning handoff reconciles Linear against local Trio, and additionally may surface a *disagreement* count from shadow decisions.

Trace storage is local and non-authoritative: `.harness/decision-trace/<task-id>.jsonl` (`.harness/` is gitignored and has zero tracked files). It is never mirrored into Linear, and it never contains chain-of-thought — only question ids, answers, provenance, backend, latency and the recommended transition.

## 16. External design absorption

Every adopted idea needs an explicit positive benefit. Nothing is adopted for interest value.

| Source | Pattern | Existing SWF gap | Expected positive benefit | Measurement / acceptance | Maintenance cost | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| TypeSafe Jev / System One | narrow typed semantic decisions instead of one big prompt | no semantic judgments exist at all | replaces ad-hoc "the Chief thinks about it" with a recorded, testable question | 7 frozen question sets; unit tests per bundle; shadow disagreement count | one pure module + fixtures | **adapt** |
| TypeSafe workflow eval | software owns the compute graph; judgments are leaves | phase control lives in prompt prose | more explicit transitions; fewer implicit ones | phase derivations unit-tested; no prompt-only gate for verify | small | **adapt** |
| TypeSafe / Jev | multiple questions over one state in one bundle | none | one evidence payload, many narrow answers; cheaper than one broad judgement | bundle-level fixtures | low | **adopt** |
| LangChain Jev harness | action guardrail before consequential tool execution | `adjudicatePermission` covers scope/sandbox/approval deterministically, but nothing labels risk classes | risk class visible before a destructive/external step | action bundle fixtures; no per-command calls | low | **adapt** |
| LangChain Jev harness | model/capability routing | routing exists but requirement vocabulary is implicit | requirements independent of provider | resolver fixtures, no model names in lifecycle semantics | low | **adapt** |
| OpenJev | shared-state bundles, auditability, cheap narrow judgments | no audit trail of judgements | replayable decisions | trace record schema + replay | low | **adapt** |
| NanoJev | local semantic judgment; code owns long-horizon state | n/a | none in this milestone | — | — | **reject now** (no local inference hardware; would add a runtime dependency) |
| TypeSafe System One adapter | pluggable LLM adapter | none | future backend path | interface only | none until adopted | **adapt (interface only)** |
| Any | local model deployment | n/a | none | — | high | **reject** |
| Any | model-specific architecture or fixed provider ladder | n/a | negative | — | high | **reject** |
| Any | uncalibrated numeric probability as confidence | n/a | negative | — | — | **reject** |
| Any | a new framework dependency for decisions | n/a | none in milestone | — | high | **reject** |

## 17. Shadow-first rollout

The Decision Layer does not control any transition in this initiative's first wave.

Priority shadow questions, in order:

```
plan_needed
plan_ready
execution_ready
verification_sufficient
next_action
goal_complete
```

Shadow records: what the current behaviour did · what the gate recommended · whether they disagreed · the eventual result. A gate is activated only after recorded evidence shows a clear positive value. High-risk actions remain policy- and human-gated regardless of any gate output.

## 18. Positive-benefit gate

Every new abstraction must answer, in its plan entry and its ticket:

1. What existing failure or cost does this remove?
2. How will we measure that?
3. What is the maintenance cost?
4. What is the fallback if it fails?

"Cleaner architecture" is not sufficient evidence on its own.

The candidate measurable benefits are: fewer false DONE decisions · fewer premature executions · fewer unnecessary plans · fewer repeated repair loops · better repair-vs-replan choice · lower Chief token usage · lower orchestration latency · better provider failover · less provider coupling · simpler recovery · better unattended reliability.

## 19. Evaluation

Before any gate is activated, representative replay fixtures must exist under `tests/fixtures/decision/`:

| Area | Cases |
| --- | --- |
| Intake | trivial quick edit · multi-step tracked coding task · plan-only task · execute-existing-plan task · office artifact task · high-uncertainty architecture task |
| Plan Gate | genuinely ready plan · incomplete requirements · unresolved dependency · vague acceptance criteria |
| Verify Gate | tests pass but goal not satisfied · goal satisfied with sufficient evidence · implementation needs local repair · architecture requires replan · infrastructure failure |
| Night | clean unattended success · technical/provider failure · blocker requiring a human · unexpected scope expansion · verification failure |
| Office | deterministic artifact checks pass but semantic quality fails · semantic quality passes but deterministic validation fails |

Each case is evaluated under the old behaviour and under the shadow gate, and the difference is recorded. The existing `scripts/evaluate-trio-v2.mjs` pattern (fixture root + deterministic replay + `observed-shadow-result.json` + explicit "deterministic shadow evidence, not a matched Host/model benchmark" disclaimer) is the model to follow; it is **not** extended in place, because its fixture root and proof allow-list are pinned to the v2 evaluation tree.

## 20. Verification

Repository proof for any slice in this initiative:

```
npm run verify:trio
npm run verify:core
./scripts/harness sync --check
```

plus the new targeted suite for the decision runtime.

`tests/trio/evaluation.test.mjs` is **not** part of `verify:trio` (it runs only under bare `npm test`); the new decision suite must be added to `verify:trio`'s explicit file list and to `tests/trio/import-boundaries.test.mjs` if it adds a Trio core module.

Partial tests never justify a full-verification claim.

## 21. Release boundary

This initiative may implement, test, and checkpoint locally. It does not infer external authorization.

- Night automation must never convert local verification into a release.
- Commit / push / PR / merge / publish / deploy follow current repository policy and explicit user authorization each time.
- `release_state = allowed` is a policy output, not a schedule output.

## 22. Spec acceptance gate and anti-goals

Standards axis: compatible with current SWF structure · no parallel authority · provider neutral · no new agent personas · no new scheduler/dashboard/storage · upstream compatibility maintained.

Requirements axis: lifecycle covered · THINK/EXECUTE covered · topology covered · decision gates covered · fallback covered · coding and office covered · Linear/night/morning covered · measurement and rollout covered.

Overengineering review outcome (recorded as a decision, not a promise): the June design's two centrepieces — the three-route Decision-Plane Router and the per-unit Execution Contract with receipts — are **not** reintroduced. Their surviving question is answered by Decision Bundles and by the existing assignment packet. No second state machine is introduced; the execution phase lifecycle is vocabulary over existing artifacts.

Anti-goals honoured: no dashboard; no scheduler; no daemon; no database; no second durable task store; no model-per-role architecture; no new personas; no forced Trio on quick work; no local LLM; no NanoJev training; no LLM call before every command; no deterministic check replaced by a semantic guess; no fixed provider fallback ladder; no auto-release from a night run; no duplicated ChiefOps/Linear/execution-contract mechanism; no abstraction without measurable benefit.

## 23. Open questions

1. **Execution intensity widening.** Should `execute` support `low|medium`? It would change `validateModelEffort` behaviour and needs its own slice and evidence. Deferred.
2. **Durable phase.** Should the derived lifecycle phase be persisted in `task_plan.md`? Only if a consumer needs it across sessions. Not yet.
3. **`host` backend shape.** Whether the calling session answers a bundle inline or via the trace file is settled in the decision-contract slice, not here.
4. **Gate activation evidence bar.** The numeric bar (how many shadow agreements before activation) is deliberately left to the evaluation slice, because a number chosen now would be uncalibrated.
