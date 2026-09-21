import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DECISION_BUNDLES,
  DECISION_BUNDLE_VERSION,
  DECISION_OUTCOMES,
  DECISION_SCHEMA_VERSION,
  classifyFailure,
  evaluateDecision
} from '../harness/trio/core/decision.mjs';

// Deterministic replay of the shadow decision bundles. This makes no model call,
// takes no transition and writes no telemetry into Linear or Trio.
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_SHADOW_FIXTURE_ROOT = path.join(SCRIPT_ROOT, 'tests', 'fixtures', 'decision');
export const SHADOW_RESULT_NAME = 'observed-shadow-result.json';
export const SHADOW_RUNNER_ID = 'scripts/evaluate-decision-shadow.mjs';
export const SHADOW_DISCLAIMER = Object.freeze([
  'This is deterministic shadow evidence, not a matched Host/model benchmark.',
  'No model or network call is made; operator answers are fixture inputs.',
  'Actual model and effort remain unknown without authenticated Host evidence.',
  'No transition is taken from a gate: a shadow record only holds the recommendation.'
]);

// Every §19 evaluation row must be represented by at least one fixture case.
export const SHADOW_ROWS = Object.freeze({
  'intake/trivial-quick-edit': Object.freeze(['intake-trivial-quick-edit']),
  'intake/multi-step-tracked-coding': Object.freeze(['intake-tracked-coding']),
  'intake/plan-only': Object.freeze(['intake-plan-only']),
  'intake/execute-existing-plan': Object.freeze(['intake-execute-existing-plan']),
  'intake/office-artifact': Object.freeze(['intake-office-artifact']),
  'intake/high-uncertainty-architecture': Object.freeze(['intake-high-uncertainty-architecture']),
  'plan/genuinely-ready': Object.freeze(['plan-ready']),
  'plan/incomplete-requirements': Object.freeze(['plan-incomplete-requirements']),
  'plan/unresolved-dependency': Object.freeze(['plan-unresolved-dependency']),
  'plan/vague-acceptance-criteria': Object.freeze(['plan-vague-acceptance']),
  'verify/tests-pass-goal-not-satisfied': Object.freeze(['verify-tests-pass-goal-not-satisfied']),
  'verify/goal-satisfied-sufficient-evidence': Object.freeze(['verify-goal-satisfied-sufficient-evidence']),
  'verify/needs-local-repair': Object.freeze(['verify-local-repair-needed']),
  'verify/architecture-requires-replan': Object.freeze(['verify-architecture-requires-replan']),
  'verify/infrastructure-failure': Object.freeze(['verify-infrastructure-failure']),
  'verify/deterministic-failure-blocks-done': Object.freeze(['verify-deterministic-failure-blocks-done']),
  'night/clean-unattended-success': Object.freeze(['night-clean-unattended-success']),
  'night/technical-provider-failure': Object.freeze(['night-technical-provider-failure']),
  'night/blocker-requiring-human': Object.freeze(['night-blocker-requiring-human']),
  'night/unexpected-scope-expansion': Object.freeze(['night-unexpected-scope-expansion']),
  'night/verification-failure': Object.freeze(['night-verification-failure']),
  'office/deterministic-pass-semantic-fail': Object.freeze(['office-deterministic-pass-semantic-fail']),
  'office/semantic-pass-deterministic-fail': Object.freeze(['office-semantic-pass-deterministic-fail']),
  'action/risk-boundary': Object.freeze(['action-destructive-write']),
  'release/ready-not-authorized': Object.freeze(['release-ready-not-authorized']),
  'release/ready-authorized': Object.freeze(['release-ready-authorized']),
  'release/not-ready': Object.freeze(['release-not-ready'])
});

const REQUIRED_CASE_FIELDS = Object.freeze(['id', 'area', 'bundle', 'subject', 'requirement', 'operator', 'oldBehaviour']);

function assertPlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be non-empty text.`);
  }
}

export function buildRequest(entry) {
  assertPlainRecord(entry, 'Shadow case');
  assertText(entry.bundle, `Shadow case ${String(entry.id)} bundle`);
  if (!Object.hasOwn(DECISION_BUNDLES, entry.bundle)) {
    throw new Error(`Shadow case ${String(entry.id)} uses unknown bundle ${entry.bundle}.`);
  }
  const frozen = DECISION_BUNDLES[entry.bundle];
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    bundle: entry.bundle,
    bundleVersion: DECISION_BUNDLE_VERSION,
    subject: entry.subject,
    requirement: entry.requirement,
    evidence: entry.evidence ?? { deterministic: {}, semanticContext: null },
    questions: frozen.questions.map((entry2) => ({
      id: entry2.id,
      kind: entry2.kind,
      ...(entry2.options ? { options: [...entry2.options] } : {}),
      ...(entry2.scale ? { scale: [...entry2.scale] } : {})
    }))
  };
}

export function evaluateShadowCase(entry) {
  const request = buildRequest(entry);
  const failure = entry.failure ?? null;
  const result = evaluateDecision(request, {
    operator: entry.operator ?? null,
    failure,
    authorization: entry.authorization ?? null
  });
  const classified = failure === null ? null : classifyFailure(failure);
  return {
    id: entry.id,
    area: entry.area,
    bundle: entry.bundle,
    shadowTransition: result.transitionRecommendation,
    shadowComposites: result.composites,
    unanswered: result.unanswered,
    failureClass: classified === null ? null : classified.class,
    failureTransition: classified === null ? null : classified.suggestedTransition,
    oldBehaviour: entry.oldBehaviour,
    disagreement: result.transitionRecommendation !== entry.oldBehaviour
  };
}

export async function loadShadowCases(fixtureRoot = DEFAULT_SHADOW_FIXTURE_ROOT) {
  const raw = JSON.parse(await readFile(path.join(fixtureRoot, 'cases.json'), 'utf8'));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Shadow fixture cases.json must be a non-empty array.');
  }
  const seen = new Set();
  return raw.map((entry, index) => {
    assertPlainRecord(entry, `cases[${index}]`);
    for (const field of REQUIRED_CASE_FIELDS) {
      if (!Object.hasOwn(entry, field)) throw new Error(`cases[${index}] is missing ${field}.`);
    }
    assertText(entry.id, `cases[${index}].id`);
    assertText(entry.area, `cases[${index}].area`);
    if (entry.failure !== undefined && entry.failure !== null) {
      assertText(entry.failure, `cases[${index}].failure`);
    }
    if (seen.has(entry.id)) throw new Error(`Duplicate shadow case id ${entry.id}.`);
    seen.add(entry.id);
    return entry;
  });
}

export function validateShadowCoverage(cases) {
  const ids = new Set(cases.map((entry) => entry.id));
  for (const [row, required] of Object.entries(SHADOW_ROWS)) {
    if (!required.some((id) => ids.has(id))) {
      throw new Error(`Shadow fixture coverage is missing row ${row}.`);
    }
  }
  return true;
}

export function validateShadowReport(report) {
  assertPlainRecord(report, 'Shadow report');
  if (report.runner !== SHADOW_RUNNER_ID) {
    throw new Error(`Shadow report runner must be ${SHADOW_RUNNER_ID}.`);
  }
  if (report.mode !== 'shadow') throw new Error('Shadow report mode must be shadow.');
  if (!Array.isArray(report.disclaimer) || !report.disclaimer.includes(SHADOW_DISCLAIMER[0])) {
    throw new Error('Shadow report must carry the deterministic shadow-evidence disclaimer.');
  }
  if (!Array.isArray(report.cases) || report.cases.length === 0) {
    throw new Error('Shadow report must contain evaluated cases.');
  }
  for (const entry of report.cases) {
    assertPlainRecord(entry, `Shadow report case ${String(entry.id)}`);
    if (entry.shadowTransition !== null && !DECISION_OUTCOMES.includes(entry.shadowTransition)) {
      throw new Error(`Shadow report case ${entry.id} has an unknown shadow transition.`);
    }
    if (entry.shadowTransition === null && (!Array.isArray(entry.unanswered) || entry.unanswered.length === 0)) {
      throw new Error(`Shadow report case ${entry.id} must list unanswered questions when unevaluable.`);
    }
  }
  return report;
}

function areaCounts(cases) {
  const counts = {};
  for (const area of cases.map((entry) => entry.area).sort()) {
    counts[area] = (counts[area] ?? 0) + 1;
  }
  return counts;
}

export async function evaluateDecisionShadow({ fixtureRoot = DEFAULT_SHADOW_FIXTURE_ROOT } = {}) {
  const cases = await loadShadowCases(fixtureRoot);
  validateShadowCoverage(cases);
  const evaluated = cases.map(evaluateShadowCase);
  return validateShadowReport({
    schemaVersion: 1,
    runner: SHADOW_RUNNER_ID,
    mode: 'shadow',
    disclaimer: [...SHADOW_DISCLAIMER],
    rows: Object.fromEntries(Object.entries(SHADOW_ROWS).map(([row, ids]) => [row, [...ids]])),
    cases: evaluated,
    summary: {
      cases: evaluated.length,
      disagreements: evaluated.filter((entry) => entry.disagreement).length,
      unevaluable: evaluated.filter((entry) => entry.shadowTransition === null).length,
      byArea: areaCounts(evaluated)
    }
  });
}

export function serializeShadowReport(report) {
  validateShadowReport(report);
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function writeShadowReport({ fixtureRoot, outputPath } = {}) {
  const report = await evaluateDecisionShadow(fixtureRoot === undefined ? {} : { fixtureRoot });
  const target = outputPath ?? path.join(fixtureRoot ?? DEFAULT_SHADOW_FIXTURE_ROOT, SHADOW_RESULT_NAME);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, serializeShadowReport(report), 'utf8');
  return { path: target, report };
}

export function parseCliArgs(argv) {
  const parsed = { fixtureRoot: DEFAULT_SHADOW_FIXTURE_ROOT, outputPath: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== '--fixture-root' && flag !== '--out') {
      throw new Error(`Unknown argument ${String(flag)}; use --fixture-root <dir> and --out <file>.`);
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${flag} requires a non-empty path.`);
    }
    if (flag === '--fixture-root') parsed.fixtureRoot = path.resolve(value);
    else parsed.outputPath = path.resolve(value);
  }
  return parsed;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { fixtureRoot, outputPath } = parseCliArgs(process.argv.slice(2));
  const { path: written, report } = await writeShadowReport({ fixtureRoot, outputPath });
  console.log(JSON.stringify({ written, summary: report.summary }));
}
