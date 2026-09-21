#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DECISION_BUNDLES,
  DECISION_BUNDLE_VERSION,
  DECISION_SCHEMA_VERSION,
  DECISION_OUTCOMES,
  evaluateDecision
} from '../harness/trio/core/decision.mjs';

// T1 decision-accuracy evaluation. Offline, deterministic, no model call.
// It compares each gate's answer against hand-labelled ground truth and also
// scores the fixture's recorded old behaviour against the same truth as an
// indicative (author-authored, not observed) reference.
//
// Two gate columns are reported on purpose:
//   gateTransitionVerdict - what the runtime's transitionRecommendationOf
//     actually emits. This is the honest measure of the runtime's output.
//   gateAnswerVerdict - the action implied by the bundle's answers. For intake
//     this DUPLICATES the labelling rule (truth is derived from plan_needed),
//     so it is shown for completeness and never used as the headline.

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_FIXTURE_ROOT = path.join(SCRIPT_ROOT, 'tests', 'fixtures', 'decision');
export const ACCURACY_RESULT_NAME = 'observed-accuracy-result.json';
export const ACCURACY_RUNNER_ID = 'scripts/evaluate-decision-accuracy.mjs';

// Ground truth vocabulary. After the F23/F24 fix this is exactly the runtime's
// outcome vocabulary: every truth value is now expressible, so a truth value
// outside DECISION_OUTCOMES is a defect the runner must report rather than a
// known gap it can absorb.
export const TRUTH_VOCABULARY = Object.freeze([...DECISION_OUTCOMES]);

const OLD_EQUIVALENCE = Object.freeze({ 'waiting-human': 'escalate', policy_gate: 'escalate' });

const DISCLAIMER = Object.freeze([
  'Offline ground-truth scoring; no model or network call is made.',
  'The fixture old-behaviour column is author-authored, not observed production behaviour, so it is an indicative reference only, not a matched baseline.',
  'A gate verdict of done here is a recommendation, not a taken transition.',
  'gateTransitionVerdict is the runtime output; gateAnswerVerdict is now the same surface by construction and is retained only so a divergence would be visible.',
  'Every label is derived from the evidence the composite reads, so this run proves expressiveness and internal consistency, not independent predictive accuracy.'
]);

// Which areas' labels are derived from the same rule the composite implements.
// These cases measure expressiveness and internal consistency, not independent
// predictive accuracy: the label and the composite read the same evidence.
export const LABEL_DERIVATION = Object.freeze({
  intake: 'derived from plan_needed, which is exactly what resolveIntakeRoute reads',
  plan: 'derived from the six readiness conditions, which is exactly what resolvePlanReady reads',
  verify: 'derived from the deterministic checks and the recorded failure first, then the semantic answers',
  night: 'same rule as verify, over unattended cases',
  office: 'same rule as verify, over artifact cases',
  action: 'derived from the six risk flags, which is exactly what resolveActionGate reads',
  release: 'derived from readiness and authorization, which is exactly what resolveReleaseState reads'
});

function buildRequest(entry) {
  const frozen = DECISION_BUNDLES[entry.bundle];
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    bundle: entry.bundle,
    bundleVersion: DECISION_BUNDLE_VERSION,
    subject: entry.subject,
    requirement: entry.requirement,
    evidence: entry.evidence ?? { deterministic: {}, semanticContext: null },
    questions: frozen.questions.map((q) => ({
      id: q.id,
      kind: q.kind,
      ...(q.options ? { options: [...q.options] } : {}),
      ...(q.scale ? { scale: [...q.scale] } : {})
    }))
  };
}

export function evaluateCase(entry) {
  const request = buildRequest(entry);
  const result = evaluateDecision(request, {
    operator: entry.operator ?? null,
    failure: entry.failure ?? null,
    authorization: entry.authorization ?? null
  });
  if (!result.response) {
    return { transitionVerdict: null, answerVerdict: null, unevaluable: true, unanswered: result.unanswered };
  }
  const composites = result.composites ?? {};
  return {
    transitionVerdict: result.transitionRecommendation,
    // The transition field and the composite-derived verdict are now the same
    // surface by construction; it is reported once so it cannot be mistaken for
    // two independent measurements.
    answerVerdict: result.transitionRecommendation,
    unevaluable: false,
    unanswered: []
  };
}

export function oldVerdictOf(entry) {
  const token = entry.oldBehaviour;
  return OLD_EQUIVALENCE[token] ?? token;
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export async function evaluateDecisionAccuracy({ fixtureRoot = DEFAULT_FIXTURE_ROOT } = {}) {
  const cases = JSON.parse(await readFile(path.join(fixtureRoot, 'cases.json'), 'utf8'));
  const truthDoc = JSON.parse(await readFile(path.join(fixtureRoot, 'ground-truth.json'), 'utf8'));
  const truthById = new Map(truthDoc.cases.map((c) => [c.id, c]));

  const rows = [];
  for (const entry of cases) {
    const truth = truthById.get(entry.id);
    if (!truth) throw new Error('No ground truth for case ' + entry.id);
    const gate = evaluateCase(entry);
    const old = oldVerdictOf(entry);
    // A truth value the runtime cannot express is now a defect, not a known gap.
    const structuralGap = DECISION_OUTCOMES.includes(truth.truthTransition)
      ? null
      : 'truth-not-in-outcome-vocabulary';
    rows.push({
      id: entry.id,
      area: entry.area,
      bundle: entry.bundle,
      truth: truth.truthTransition,
      gateTransitionVerdict: gate.transitionVerdict,
      gateAnswerVerdict: gate.answerVerdict,
      gateUnevaluable: gate.unevaluable,
      gateCorrect: gate.unevaluable ? null : gate.transitionVerdict === truth.truthTransition,
      answerCorrect: gate.unevaluable ? null : gate.answerVerdict === truth.truthTransition,
      structuralGap,
      oldVerdict: old,
      oldCorrect: old === truth.truthTransition
    });
  }

  const scorable = rows.filter((r) => !r.gateUnevaluable);
  const byBundle = {};
  for (const r of scorable) {
    const b = byBundle[r.bundle] ?? (byBundle[r.bundle] = { total: 0, gateCorrect: 0, answerCorrect: 0, oldCorrect: 0 });
    b.total += 1;
    if (r.gateCorrect) b.gateCorrect += 1;
    if (r.answerCorrect) b.answerCorrect += 1;
    if (r.oldCorrect) b.oldCorrect += 1;
  }
  for (const b of Object.values(byBundle)) {
    b.gateAccuracy = rate(b.gateCorrect, b.total);
    b.answerAccuracy = rate(b.answerCorrect, b.total);
    b.oldAccuracy = rate(b.oldCorrect, b.total);
  }

  const truthNotDone = scorable.filter((r) => r.truth !== 'done');
  const falseDone = truthNotDone.filter((r) => r.gateTransitionVerdict === 'done');
  const truthPlan = scorable.filter((r) => r.truth === 'plan');
  const premature = truthPlan.filter((r) => r.gateTransitionVerdict === 'continue');
  const structuralGapCases = scorable.filter((r) => r.structuralGap);

  const headline = {
    gateAccuracy: rate(scorable.filter((r) => r.gateCorrect).length, scorable.length),
    answerAccuracy: rate(scorable.filter((r) => r.answerCorrect).length, scorable.length),
    oldAccuracy: rate(scorable.filter((r) => r.oldCorrect).length, scorable.length),
    falseDoneRate: rate(falseDone.length, truthNotDone.length),
    falseDoneCases: falseDone.map((r) => r.id),
    prematureExecutionRate: rate(premature.length, truthPlan.length),
    prematureExecutionCases: premature.map((r) => r.id),
    unevaluable: rows.length - scorable.length,
    structuralGapCases: structuralGapCases.length,
    structuralGapIds: structuralGapCases.map((r) => r.id),
    expressibleTruthRate: rate(scorable.filter((r) => !r.structuralGap).length, scorable.length)
  };

  return {
    schemaVersion: 1,
    runner: ACCURACY_RUNNER_ID,
    mode: 'accuracy',
    disclaimer: [...DISCLAIMER],
    truthVocabulary: [...TRUTH_VOCABULARY],
    labelDerivation: { ...LABEL_DERIVATION },
    labelDerivationCaveat: 'Every area label is derived from the same evidence the composite reads, so this run measures whether the runtime can express the correct transition and whether the composites are internally consistent. It does not measure independent predictive accuracy; that requires held-out cases labelled before the composite was written, which is T1.5.',
    labeler: truthDoc.labeler,
    reviewStatus: truthDoc.reviewStatus,
    byBundle,
    headline,
    cases: rows
  };
}

async function main() {
  const result = await evaluateDecisionAccuracy();
  await mkdir(DEFAULT_FIXTURE_ROOT, { recursive: true });
  const target = path.join(DEFAULT_FIXTURE_ROOT, ACCURACY_RESULT_NAME);
  await writeFile(target, JSON.stringify(result, null, 2) + String.fromCharCode(10));
  process.stdout.write(JSON.stringify({ written: target, headline: result.headline, byBundle: result.byBundle }, null, 2) + String.fromCharCode(10));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
