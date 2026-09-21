import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ACCURACY_RESULT_NAME,
  DEFAULT_FIXTURE_ROOT,
  TRUTH_VOCABULARY,
  evaluateCase,
  evaluateDecisionAccuracy
} from '../../scripts/evaluate-decision-accuracy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function loadJson(target) {
  return JSON.parse(await readFile(target, 'utf8'));
}

test('ground truth covers every fixture case with a declared vocabulary value', async () => {
  const cases = await loadJson(path.join(DEFAULT_FIXTURE_ROOT, 'cases.json'));
  const truth = await loadJson(path.join(DEFAULT_FIXTURE_ROOT, 'ground-truth.json'));
  const ids = new Set(cases.map((entry) => entry.id));
  assert.equal(truth.cases.length, cases.length);
  for (const entry of truth.cases) {
    assert.ok(ids.has(entry.id), `ground truth has an unknown case ${entry.id}`);
    assert.ok(TRUTH_VOCABULARY.includes(entry.truthTransition), `${entry.id} uses an undeclared truth value`);
    assert.ok(typeof entry.rationale === 'string' && entry.rationale.trim() !== '', `${entry.id} needs a rationale`);
  }
  assert.equal(new Set(truth.cases.map((entry) => entry.id)).size, truth.cases.length);
  assert.equal(truth.reviewStatus, 'reviewed-by-2-independent-subagents');
  assert.ok(truth.review.reviewers >= 2);
  assert.equal(truth.review.overturn, 0);
});

test('the transition field now expresses every truth value in the vocabulary', async () => {
  const cases = await loadJson(path.join(DEFAULT_FIXTURE_ROOT, 'cases.json'));
  const report = await evaluateDecisionAccuracy();
  // Every labelled truth value is now in the runtime outcome vocabulary, so no
  // case is a structural gap and the truth vocabulary equals the runtime's.
  assert.deepEqual([...report.truthVocabulary].sort(), [...TRUTH_VOCABULARY].sort());
  for (const entry of cases) {
    const row = report.cases.find((r) => r.id === entry.id);
    assert.equal(row.structuralGap, null, entry.id);
  }
  assert.equal(report.headline.structuralGapCases, 0);
  assert.deepEqual(report.headline.structuralGapIds, []);
  assert.equal(report.headline.expressibleTruthRate, 1);
  // intake can now emit plan, and retry is now emittable.
  assert.equal(report.cases.find((r) => r.id === 'intake-tracked-coding').gateTransitionVerdict, 'plan');
  for (const row of report.cases.filter((r) => r.truth === 'retry' && !r.gateUnevaluable)) {
    assert.equal(row.gateTransitionVerdict, 'retry', row.id);
  }
  assert.equal(report.cases.find((r) => r.id === 'verify-infrastructure-failure').gateTransitionVerdict, 'retry');
  // The one unevaluable case stays unevaluable for an unrelated reason: its
  // fixture deliberately omits an answer, so the gate must not guess.
  const unevaluable = report.cases.find((r) => r.id === 'night-technical-provider-failure');
  assert.equal(unevaluable.gateUnevaluable, true);
  assert.equal(unevaluable.structuralGap, null);
  assert.ok(report.labelDerivation.intake.includes('plan_needed'));
  assert.ok(report.labelDerivationCaveat.includes('T1.5'));
});

test('a recorded infrastructure failure is consumed: the gate recommends retry, not done', async () => {
  const cases = await loadJson(path.join(DEFAULT_FIXTURE_ROOT, 'cases.json'));
  const infra = cases.find((entry) => entry.id === 'verify-infrastructure-failure');
  const evaluated = evaluateCase(infra);
  assert.equal(evaluated.transitionVerdict, 'retry');
  // Isolate the failure field from the secondary unknown-check fix: with a
  // reporting check and no failure the same answers are done, so the failure
  // field is what changed the verdict.
  const reporting = {
    ...infra,
    failure: null,
    evidence: { deterministic: { checks: [{ id: 'provider_probe', status: 'pass' }] } }
  };
  assert.equal(evaluateCase(reporting).transitionVerdict, 'done');
  assert.equal(evaluateCase({ ...reporting, failure: 'timeout' }).transitionVerdict, 'retry');
  // J01 distinguishes absent evidence from an observed transient failure.
  // Without the failure fact, this unknown check needs further verification.
  assert.equal(evaluateCase({ ...infra, failure: null }).transitionVerdict, 'continue');
});

test('the committed accuracy report is reproducible and keeps the two gate columns distinct', async () => {
  const committed = await loadJson(path.join(DEFAULT_FIXTURE_ROOT, ACCURACY_RESULT_NAME));
  const fresh = await evaluateDecisionAccuracy();
  assert.deepEqual(fresh, committed);
  // With the structural gaps closed the two columns agree, which is the point:
  // a divergence would now be a real defect rather than a known gap.
  assert.equal(fresh.headline.gateAccuracy, fresh.headline.answerAccuracy);
  assert.equal(fresh.headline.gateAccuracy, 1);
  assert.deepEqual(fresh.headline.falseDoneCases, []);
  assert.equal(fresh.headline.prematureExecutionRate, 0);
  assert.deepEqual(fresh.headline.prematureExecutionCases, []);
  assert.equal(fresh.headline.unevaluable, 1);
});
