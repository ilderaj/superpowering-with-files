# Goal 4 Completion Slice Design

## Summary

Harness should add a narrow `Decision-Plane Completion Slice` that closes the remaining evidence gap in Track 3 without prematurely jumping into Track 4 structural refactoring and without violating the existing router non-goal against silently rewriting install-time state.

This slice should do two things together:

1. clarify the relationship between install-time profile state and runtime route truth;
2. prove `lean-direct` with the same level of credibility already achieved for `tracked-lean` and `deep-rich`.

The goal is not to redesign the router.
The goal is to make Goal 4 honestly completable.

## Problem

Harness already has:

- a three-route decision-plane model:
  - `lean-direct`
  - `tracked-lean`
  - `deep-rich`
- route-aware hook behavior;
- route-aware `summary` / `active-summary`;
- durable route evidence for tracked work;
- live proof for the current tracked task;
- follow-up closure and receipt-aware reconciliation that now leave the active task free of `execution_followup_open`.

What it does not yet have is a fully closed Goal 4 completion story.

Two gaps remain:

1. live install state still reports a heavier baseline:
   - `.harness/state.json` currently records `skillProfile=full`
   - `doctor --check-only` still warns that user-global installs should default to a lighter baseline
2. the router has strong tracked/deep proof, but it does not yet have a same-class real `lean-direct` proof for quick-task behavior

That creates a completion problem:

- runtime routing has become more real than install defaults,
- but the system has not yet clearly separated those two truths,
- and the lightest route is not yet proven with live behavior evidence at the same standard as the other routes.

## Goals

- Clarify that install-time state is a capability baseline, not the same thing as current task route truth.
- Preserve the non-goal that router behavior must not silently rewrite install-time state.
- Add a real quick-task proof for `lean-direct`.
- Make operator surfaces distinguish:
  - heavier install baseline,
  - lightweight runtime routing behavior.
- Close Goal 4 with evidence that covers all three route states and the baseline-vs-route distinction.

## Non-Goals

- Do not silently mutate `.harness/state.json` as a side effect of runtime routing.
- Do not redefine install-time `skillProfile` as route truth.
- Do not force quick tasks to create `planning/active/<task-id>/`.
- Do not begin Track 4 structural refactoring inside this slice.
- Do not turn baseline hygiene warnings into false completion by simply suppressing them.

## Current State Evidence

Current live evidence already proves:

- `tracked-lean` is durable and visible through:
  - `task_plan.md`
  - `summary --task`
  - `active-summary --json`
- `deep-rich` promotion logic exists in `decision-plane-router.mjs` and is covered by router tests
- follow-up closure has removed the current task's receipt-level anomaly:
  - `executionSignals.openFollowups=0`
  - `executionSignals.resolvedFollowups=1`

Current live evidence also proves what is still incomplete:

- `.harness/state.json` still records:
  - `scope=user-global`
  - `skillProfile=full`
- `doctor --check-only` still warns that this baseline is heavier than the expected default
- there is no same-grade real quick-task proof showing that:
  - no tracked planning is created,
  - no tracked-task hot-context behavior is forced,
  - no durable route evidence is emitted,
  - runtime behavior stays `lean-direct`

## Design Principles

1. **Baseline is not route**
   Install state describes available capability and deployment posture.
   Route describes current task-time execution behavior.

2. **Warnings should explain, not blur**
   Operator surfaces should distinguish install heaviness from task-time routing success.

3. **Quick-task proof must stay cheap**
   `lean-direct` proof should demonstrate behavior without accidentally turning the quick task into tracked work.

4. **Completion requires parity of evidence**
   The lightest route should not be considered complete at a weaker evidentiary standard than the heavier routes.

## Recommended Model

### 1. Install/Profile Semantics

Harness should explicitly treat:

- install-time profile state
- runtime route state

as related but non-identical concepts.

Recommended v1 interpretation:

- install state answers:
  - what capability package is projected?
  - what baseline hook/profile surface is installed?
- route state answers:
  - what path is this task actually on right now?

That means:

- `skillProfile=full` can still be true
- while a quick task can still correctly execute under `lean-direct`

This distinction should become visible in operator messaging rather than remaining implicit.

### 2. Operator-Surface Clarification

`doctor` and adjacent surfaces should distinguish two conditions:

1. **Baseline heaviness**
   The installed profile is heavier than the recommended default.
2. **Runtime route correctness**
   The current task is or is not using the correct route behavior.

Recommended messaging rule:

- do not collapse these into one generic “too heavy” warning
- instead explain whether the issue is:
  - installation hygiene,
  - runtime routing mismatch,
  - or both

This prevents false interpretations like:

- “routing is wrong because install state is full”
- or
- “Goal 4 is complete because the route looks right even though baseline hygiene is still unexamined”

### 3. `lean-direct` Proof Requirements

Goal 4 completion should require a real quick-task proof at the same quality bar as the tracked-task proof.

Recommended proof expectations:

- the quick task does not create `planning/active/<task-id>/`
- the quick task does not emit durable route evidence
- the quick task does not trigger tracked-task hot-context behavior
- the quick task remains explainable as `lean-direct`

This proof may be established through:

- a realistic fixture,
- a targeted command surface,
- or a controlled real task simulation

but it should be strong enough to support a completion claim, not only a design inference.

### 4. Goal 4 Completion Rule

Goal 4 should be considered complete only when all of the following are true:

1. tracked-task route proof exists
2. deep-route promotion proof exists
3. quick-task `lean-direct` proof exists
4. operator surfaces distinguish baseline heaviness from runtime route truth
5. current warnings and documentation no longer leave the completion story ambiguous

This is intentionally stricter than:

- “the router exists”
- or
- “tracked-lean works”
- or
- “doctor mentions minimal-global”

because those are partial truths, not completion.

## Surface Integration

### `doctor`

Should evolve from a single broad baseline warning toward differentiated guidance:

- baseline heavier than recommended
- route behavior still correct
- or route behavior not yet proven

### `summary` / `active-summary`

Do not turn these into install-state dashboards.
They should remain route-centered.

However, they may expose enough metadata to support the distinction:

- current route
- whether route evidence is durable or ephemeral
- whether anomalies are route mismatches vs execution-state anomalies

### Planning

Tracked and deep tasks continue to record route evidence durably.

Quick tasks should remain ephemeral-only.

That asymmetry is correct and should be preserved.

## Approaches

### Option 1: Baseline Hygiene Only

Focus only on install/profile warnings and leave `lean-direct` proof for later.

Pros:

- smallest change set
- fastest warning cleanup

Cons:

- leaves the quick-task route under-proven
- weakens Goal 4 completion confidence

### Option 2: `lean-direct` Proof Only

Focus only on quick-task route evidence and leave install/profile messaging unchanged.

Pros:

- proves the missing route behavior directly
- avoids touching install semantics

Cons:

- leaves operator confusion about heavy baseline vs light runtime behavior
- keeps Track 3 completion story fuzzy

### Option 3: Completion Slice With Both Pieces

Handle install/profile semantics and quick-task proof together while keeping the slice narrow.

Pros:

- closes the two remaining Track 3 gaps together
- preserves the current router design
- avoids premature Track 4 work

Cons:

- slightly broader than a one-surface patch

## Recommended Approach

Choose **Option 3: Completion Slice With Both Pieces**.

Why:

- it closes Goal 4 honestly rather than cosmetically
- it keeps work inside Track 3 instead of leaking into structural refactoring
- it preserves the approved router boundary that install-time state must not be silently rewritten

## Rollout Strategy

### Stage 1: Clarify Semantics

- document baseline-vs-route separation
- identify the minimum operator surface wording change

### Stage 2: Prove `lean-direct`

- add quick-task proof
- verify the route remains ephemeral and non-tracked

### Stage 3: Close Goal 4

- re-run operator checks
- confirm completion evidence now covers all three route states plus baseline hygiene interpretation

## Risks

### Risk: Completion becomes cosmetic

If the slice only weakens or rewords warnings, it may look better without proving anything new.

Mitigation:

- require real quick-task proof

### Risk: Quick-task proof accidentally becomes tracked

If the proof path creates durable planning or tracked artifacts, it no longer proves `lean-direct`.

Mitigation:

- explicitly verify no tracked-task durable state is created

### Risk: Install semantics become too abstract

If the baseline-vs-route distinction is only described in prose, operators may still misunderstand warnings.

Mitigation:

- require at least one operator surface to encode the distinction clearly

## Next Step

If this slice is approved, the next implementation plan should define:

1. the exact operator-surface wording change for baseline-vs-route semantics
2. the quick-task proof fixture or real-path verification method
3. the narrow Goal 4 completion signals that will be used to decide whether Track 3 is truly done
