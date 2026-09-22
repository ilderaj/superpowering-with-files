# Decision-Control Runtime — Baseline Comparison and Gate Activation Decision

> Current2026-09-22: J01–04 corrected contract replay.27 total,26 answered,26 correct; conditionalAgreement100%,coverage/correctOverAll96.3%; shadow15 disagreements among26 comparable. Risk: falseDone0/23 answered non-done cases (eligible24;coverage23/24); premature0/7. Old metrics below are historical, not live predictive evidence. WP07 now has a real operator checkpoint receipt, not a Jev inference receipt. WP10 remains incomplete until independent paired model/usage evidence exists.

Companion to the [design spec](../superpowers/specs/2026-09-19-decision-control-runtime-design.md) and the [implementation plan](2026-09-19-decision-control-runtime-plan.md). This document is the reproducible comparison the activation decision rests on (plan WP-10).

## What was measured

The only reproducible comparison available at this milestone is the deterministic shadow replay:

```bash
node scripts/evaluate-decision-shadow.mjs
```

It replays 27 fixture cases under the old behaviour and under the shadow gate and records every difference to `tests/fixtures/decision/observed-shadow-result.json`. The run is deterministic: no model call, no network call, no clock dependency. Two consecutive runs produce byte-identical output.

| Area | Cases | Source row (spec §19) |
| --- | --- | --- |
| intake | 6 | trivial quick edit · multi-step tracked coding · plan-only · execute-existing-plan · office artifact · high-uncertainty architecture |
| plan | 4 | genuinely ready · incomplete requirements · unresolved dependency · vague acceptance criteria |
| verify | 6 | tests pass but goal not satisfied · goal satisfied with sufficient evidence · needs local repair · architecture requires replan · infrastructure failure · one composite check |
| night | 5 | clean unattended success · technical/provider failure · blocker requiring human · unexpected scope expansion · verification failure |
| office | 2 | deterministic pass + semantic fail · semantic pass + deterministic fail |
| action | 1 | risk class visible before a consequential step |
| release | 3 | READY vs ALLOWED separation |

Recorded result: **27 cases, 15 disagreements against the old behaviour, 1 unevaluable** (15 before the
F23/F24 fix; see the T1 accuracy addendum below for the three-case decomposition).

## What this evidence is not

The fixture answers are operator inputs, not model outputs. The replay therefore shows that the gates are internally consistent, that the frozen question sets are total, and that each spec §19 case produces a definite recommendation. It does **not** show how a live model would answer, and it is not a matched Host/model benchmark. The runner's own disclaimer states this and is preserved in the result document.

This is the honest limit of the milestone: the decision layer is inert, so no live disagreement rate exists yet.

## Baseline comparison against the spec §18 benefit list

| Spec §18 measurable benefit | Baseline evidence available | Measured effect at this milestone |
| --- | --- | --- |
| fewer false DONE decisions | T1 ground-truth scoring of the 27-case fixture set (`scripts/evaluate-decision-accuracy.mjs`) | **measured (offline): `falseDoneRate 0` (0/23)** — was 0.043 before the F24 fix |
| fewer premature executions | T1 ground-truth scoring, intake area | **measured (offline): `prematureExecutionRate 0` (0/4)** — was 1.00 before the F23 fix |
| fewer unnecessary plans | T1 ground-truth scoring, intake area | **measured (offline): the intake gate now emits `plan` exactly when `plan_needed` is true** (6/6) — the label and the composite read the same question, so this is expressiveness, not independent accuracy |
| fewer repeated repair loops | verify-area repair vs replan split recorded | **not measured** — needs live trajectory counting of `repairLoops` |
| better repair-vs-replan choice | T1 ground-truth scoring, verify area (12 cases, covering verify/night/office) | **measured (offline): 12/12 verify-area gate verdicts correct** after the F24 fix (11/12 before); the single miss was the retry case, not a repair-vs-replan confusion |
| lower Chief token usage | no instrumentation | **not measured** |
| lower orchestration latency | no instrumentation | **not measured** |
| better provider failover | failure taxonomy unit-tested; no fallback ladder exists by design | **not measured** |
| less provider coupling | 0 model names in every new runtime module | **structurally true, not a measured benefit** |
| simpler recovery | trace records are append-only and re-readable | **not measured** |
| better unattended reliability | night cases replay deterministically | **not measured** |

## Activation decision

No gate is activated.

| Gate | State | Reason | Rollback condition |
| --- | --- | --- | --- |
| `plan_needed` | **shadow** | no live shadow evidence; the fixture replay is design evidence only | n/a — already shadow |
| `plan_ready` | **shadow** | no live shadow evidence | n/a |
| `execution_ready` | **shadow** | no live shadow evidence | n/a |
| `verification_sufficient` | **shadow** | no live shadow evidence | n/a |
| `next_action` | **shadow** | no live shadow evidence | n/a |
| `goal_complete` | **shadow** | no live shadow evidence | n/a |

The switch itself is data, not code. `resolveGateActivations()` returns `shadow` for every gate when no record exists, and `resolveGateActivation()` refuses to promote a gate whose record lacks a measured benefit, a rollback condition, evidence, or a Chief/human authorization. A gate therefore cannot drift into active control by configuration accident.

## What would change this decision

1. A checkpoint producer calls `recordCheckpointShadow()` from `harness/trio/core/shadow.mjs` on the live path. The attachment point exists and is tested; what is missing is a producer, since the current checkpoint path is a CLI given a hand-authored JSON file.
2. Real shadow records accumulate for the priority questions.
3. The disagreement rate and the eventual outcomes are compared against the baseline above.
4. A gate with a measured benefit on at least one spec §18 row, plus a written rollback condition, may then be promoted by an explicit Chief/human decision.

Until then every gate stays in shadow and the existing path remains authoritative.

## T1 accuracy addendum (2026-09-19)

The first measurable comparison is entirely offline: the T1 runner
`scripts/evaluate-decision-accuracy.mjs` scores the 27-case fixture set against author-authored
ground truth and writes `tests/fixtures/decision/observed-accuracy-result.json`. It makes no model
or network call and is deterministic. The table below is the **post-fix rerun**; the pre-fix column is the
run recorded in F22 of `findings.md` and in §12 of the evaluation design.

| Metric | Pre-fix | Post-fix | Note |
| --- | --- | --- | --- |
| `gateAccuracy` (runtime transition field) | 0.808 (21/26) | **1.000 (26/26)** | the headline surface; 1 case unevaluable |
| `answerAccuracy` (bundle answers) | 0.962 (25/26) | **1.000 (26/26)** | now the same surface by construction |
| `oldAccuracy` (fixture old-behaviour column) | 0.423 (11/26) | 0.423 (11/26) | **indicative only** — author-authored, not observed production behaviour |
| `falseDoneRate` | 0.043 (1/23) | **0 (0/23)** | the single false DONE is gone |
| `prematureExecutionRate` | 1.00 (4/4) | **0 (0/4)** | all four "should plan" intake cases are now correct |
| `structuralGapCases` | 7 | **0** | 6 intake + 1 retry |
| `expressibleTruthRate` | — | **1** | every fixture truth is now in the runtime vocabulary |
| unevaluable | 1 | 1 | `night-technical-provider-failure` — the fixture deliberately omits an answer and the gate correctly refuses to guess |

Reading: both gaps recorded as F23 and F24 are closed in the runtime, so the transition field now agrees
with the answer layer the gates were designed around.

- **F23 (fixed)** — `DECISION_BUNDLES.intake.composites` carries `intake_route`, which reads `plan_needed`,
  so `transitionRecommendationOf('intake')` returns `plan` or `continue` and INTAKE -> PLAN is representable
  in the transition field. This removed `prematureExecutionRate 1.00`.
- **F24 (fixed)** — `plan` and `retry` are now in `DECISION_OUTCOMES`, `resolveNextState` consumes an
  infrastructure failure instead of judging the work, and a deterministic check that never reported
  (`status: unknown`) also returns `retry` rather than passing silently. This removed the single false DONE.

**Honest limit.** Every fixture label is derived from the same evidence the matching composite reads — the
intake label comes from `plan_needed`, and `resolveIntakeRoute` also reads `plan_needed`. 1.000 therefore
proves **expressiveness and internal consistency**, not independent predictive accuracy. The runner states
this in `labelDerivationCaveat` and in the `labelDerivation` map. Proving independent accuracy needs held-out
cases labelled before the composite was written; that is T1.5, and it is not measured here.

Fixing F23/F24 was a runtime change done under separate authorization. It changed the runtime vocabulary
and the two gaps it closed; **no gate is activated on this evidence**, and the activation decision above
is unchanged.

## Review addendum (2026-09-19)

Ground truth was labelled by the Chief and reviewed by two independent read-only subagents with
disjoint scopes (intake/plan/action/release and verify/night/office). Outcome: **25 of 27 labels
agreed, 0 overturned, 3 flagged ambiguous** (`intake-office-artifact`, `release-ready-not-authorized`,
`verify-tests-pass-goal-not-satisfied`).

Both reviewers independently found the same methodology defect in the first runner: it derived the
intake ground truth from `plan_needed` and then scored the gate against that derived truth, which is
circular. The runner was rewritten for that during the T1 work, and after the F23/F24 fix it reports a
single transition surface (`gateTransitionVerdict`, with `gateAnswerVerdict` retained only so a divergence
would be visible) together with the `labelDerivation` map and the `labelDerivationCaveat`.
`tests/fixtures/decision/observed-accuracy-result.json` records all of it, so the circular comparison can no
longer be mistaken for a result.

One consistency question from the review is **still open** and is not a defect in the transition field.
`plan_ready` is read by two surfaces with different vocabularies: the shadow gate compares against the
existing path's behaviour tokens (`proceed` / `execute`, from `CHECKPOINT_BEHAVIOURS`), while
`transitionRecommendationOf('plan')` emits the transition vocabulary (`continue` / `replan`). The two enums are
distinct by design — one describes what the existing path did, the other what the runtime would do — but
the shared token `continue` means "proceed to the next phase" for intake/plan and "keep working" for
verify, so the naming can be misread until a bundle-qualified vocabulary or an explicit translation table
exists. Recorded as F27 in `findings.md`; nothing was changed for it here.


## Historical report preservation (2026-09-22)

The pre-J04 committed report bytes are preserved as `tests/fixtures/decision/historical-observed-accuracy-result.json` and `historical-observed-shadow-result.json`. Current reports are deterministic offline replays after J04/J03 policy-context support. Neither report is live model accuracy, production behavior, or an authorization receipt.


## J04 scoped remediation metadata (2026-09-22)

The accuracy runner owns an independent truth vocabulary, not derived from runtime enums; new nonempty truth labels are retained and classified as unsupported by the implementation rather than rejected. All answered outputs count in coverage; unsupported predictions cannot count as correct. Risk reports expose eligible, evaluated, numerator, denominator, and evaluated coverage separately. Premature execution eligibility includes intake cases requiring `plan` and plan bundle cases whose readiness truth is `replan`. Shadow `null` recommendations are unevaluable and never disagreements. These are offline contract metrics only; they do not establish live model accuracy or production behavior.
