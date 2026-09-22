#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECISION_BUNDLES, DECISION_BUNDLE_VERSION, DECISION_SCHEMA_VERSION, DECISION_OUTCOMES, evaluateDecision } from '../harness/trio/core/decision.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_FIXTURE_ROOT = path.join(ROOT, 'tests/fixtures/decision');
export const ACCURACY_RESULT_NAME = 'observed-accuracy-result.json';
export const ACCURACY_RUNNER_ID = 'scripts/evaluate-decision-accuracy.mjs';
export const TRUTH_EQUIVALENCE = Object.freeze({ 'waiting-human': 'escalate', policy_gate: 'escalate' });
export const TRUTH_VOCABULARY = Object.freeze(['continue', 'plan', 'repair', 'replan', 'retry', 'escalate', 'done', 'unsupported']);
const rate = (n, d) => d === 0 ? null : n / d;
const requestOf = e => ({ schemaVersion: DECISION_SCHEMA_VERSION, bundle: e.bundle, bundleVersion: DECISION_BUNDLE_VERSION, subject: e.subject, requirement: e.requirement, evidence: e.evidence ?? { deterministic: {}, semanticContext: null }, questions: DECISION_BUNDLES[e.bundle].questions.map(q => ({ id: q.id, kind: q.kind, ...(q.options ? { options: [...q.options] } : {}), ...(q.scale ? { scale: [...q.scale] } : {}) })) });
const normalized = value => TRUTH_EQUIVALENCE[value] ?? value;
export function oldVerdictOf(e) { return normalized(e.oldBehaviour); }
export function evaluateCase(e) { const r = evaluateDecision(requestOf(e), { operator: e.operator ?? null, failure: e.failure ?? null, policyContext: e.policyContext ?? null, operation: e.operation ?? null, authorization: e.authorization ?? null }); return { transitionVerdict: r.transitionRecommendation, answerVerdict: r.transitionRecommendation, unevaluable: !r.response, unanswered: r.unanswered ?? [] }; }
function validateInputs(cases, truthDoc) {
  if (!Array.isArray(cases) || !Array.isArray(truthDoc?.cases)) throw new Error('cases and ground-truth cases must be arrays');
  const ids = (xs, label) => { const values = xs.map(x => x?.id); if (values.some(x => typeof x !== 'string' || !x)) throw new Error(label + ' contains an invalid id'); if (new Set(values).size !== values.length) throw new Error(label + ' contains duplicate ids'); return new Set(values); };
  const a = ids(cases, 'cases'), b = ids(truthDoc.cases, 'ground-truth');
  if (a.size !== b.size || [...a].some(id => !b.has(id)) || [...b].some(id => !a.has(id))) throw new Error('cases and ground-truth must contain exactly the same ids');
  for (const t of truthDoc.cases) { if (typeof t.truthTransition !== 'string' || !t.truthTransition.trim()) throw new Error('missing truth label for ' + t.id); }
}
export async function evaluateDecisionAccuracy({ fixtureRoot = DEFAULT_FIXTURE_ROOT } = {}) {
  const cases = JSON.parse(await readFile(path.join(fixtureRoot, 'cases.json'), 'utf8')); const truthDoc = JSON.parse(await readFile(path.join(fixtureRoot, 'ground-truth.json'), 'utf8')); validateInputs(cases, truthDoc);
  const truth = new Map(truthDoc.cases.map(x => [x.id, x.truthTransition]));
  const rows = cases.map(e => { const t = truth.get(e.id), g = evaluateCase(e), unsupported = !DECISION_OUTCOMES.includes(t); return { id: e.id, area: e.area, bundle: e.bundle, truth: t, unsupported, gateTransitionVerdict: g.transitionVerdict, gateAnswerVerdict: g.answerVerdict, gateUnevaluable: g.unevaluable, gateCorrect: unsupported ? false : (g.unevaluable ? null : g.transitionVerdict === t), answerCorrect: unsupported ? false : (g.unevaluable ? null : g.answerVerdict === t), oldVerdict: oldVerdictOf(e), oldCorrect: !unsupported && oldVerdictOf(e) === t, unanswered: g.unanswered }; });
  const supported = rows.filter(r => !r.unsupported), answered = rows.filter(r => !r.gateUnevaluable), correct = answered.filter(r => r.gateCorrect).length;
  const eligibleFalseDone = rows.filter(r => !r.unsupported && r.truth !== 'done'), evaluatedFalseDone = eligibleFalseDone.filter(r => !r.gateUnevaluable), falseDone = evaluatedFalseDone.filter(r => r.gateTransitionVerdict === 'done');
  const eligiblePremature = rows.filter(r => !r.unsupported && (r.truth === 'plan' || (r.bundle === 'plan' && r.truth === 'replan'))), evaluatedPremature = eligiblePremature.filter(r => !r.gateUnevaluable), premature = evaluatedPremature.filter(r => ['continue', 'done'].includes(r.gateTransitionVerdict));
  const legacyCorrect = supported.filter(r => r.oldCorrect).length;
  const headline = { total: rows.length, comparable: supported.length, answered: answered.length, correct, disagreements: answered.length - correct, conditionalAgreement: rate(correct, answered.length), coverage: rate(answered.length, rows.length), correctOverAll: rate(rows.filter(r => r.gateCorrect).length, rows.length), abstentionRate: rate(rows.filter(r => r.gateUnevaluable).length, rows.length), unsupportedIds: rows.filter(r => r.unsupported).map(r => r.id), falseDoneRate: rate(falseDone.length, evaluatedFalseDone.length), falseDoneNumerator: falseDone.length, falseDoneDenominator: evaluatedFalseDone.length, falseDoneEligible: eligibleFalseDone.length, falseDoneEvaluatedCoverage: rate(evaluatedFalseDone.length, eligibleFalseDone.length), prematureExecutionRate: rate(premature.length, evaluatedPremature.length), prematureExecutionNumerator: premature.length, prematureExecutionDenominator: evaluatedPremature.length, prematureExecutionEligible: eligiblePremature.length, prematureExecutionEvaluatedCoverage: rate(evaluatedPremature.length, eligiblePremature.length), legacyReferenceAccuracy: rate(legacyCorrect, supported.length), deprecated: { answerAccuracy: 'alias for conditionalAgreement; deprecated', oldAccuracy: 'alias for legacyReferenceAccuracy; indicative only' }, unevaluableIds: rows.filter(r => r.gateUnevaluable).map(r => r.id) };
  return { schemaVersion: 2, runner: ACCURACY_RUNNER_ID, mode: 'accuracy', disclaimer: ['Offline deterministic scoring; no model or network call.', 'Truth is fixture evidence, not a production accuracy claim.', 'legacyReferenceAccuracy is author-authored historical reference, not a measured baseline.', 'conditionalAgreement is not independent accuracy; T1.5 requires blinded held-out labels.'], truthVocabulary: [...TRUTH_VOCABULARY], labeler: truthDoc.labeler, reviewStatus: truthDoc.reviewStatus, headline, cases: rows };
}
async function main() { const result = await evaluateDecisionAccuracy(); await mkdir(DEFAULT_FIXTURE_ROOT, { recursive: true }); await writeFile(path.join(DEFAULT_FIXTURE_ROOT, ACCURACY_RESULT_NAME), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ written: path.join(DEFAULT_FIXTURE_ROOT, ACCURACY_RESULT_NAME), headline: result.headline }, null, 2)); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
