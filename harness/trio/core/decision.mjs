import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { MODE_KINDS, normalizeIntensity } from './routing.mjs';

// Provider-neutral semantic decision contract.
//
// This module is inert: no runtime path imports it yet. It defines the narrow
// questions, the answer envelope, the pure composite resolvers, the
// deterministic failure taxonomy and the non-authoritative shadow trace.
// It performs no network call, no local inference and adds no dependency.

export const DECISION_SCHEMA_VERSION = 1;
export const DECISION_BUNDLE_VERSION = 1;
export const DECISION_KINDS = Object.freeze(['boolean', 'choice', 'score']);
export const EVIDENCE_CLASSES = Object.freeze(['deterministic', 'semantic', 'composite']);
// The phase-transition vocabulary. It carries the spec's five transitions plus
// the two the runtime previously could not express: `plan` (INTAKE -> PLAN, so
// the intake bundle can recommend planning) and `retry` (the correct response
// to an infrastructure failure, which must never be judged done).
export const DECISION_OUTCOMES = Object.freeze(['continue', 'plan', 'repair', 'replan', 'retry', 'escalate', 'done']);
export const RELEASE_STATES = Object.freeze(['not_ready', 'ready', 'allowed']);
// The recorded policy decision vocabulary. `allowed` is never inferred from a
// request field: it arrives through the dedicated authorization channel only.
export const AUTHORIZATION_VALUES = Object.freeze(['not_authorized', 'allowed']);
export const CONFIDENCE_LEVELS = Object.freeze(['unknown', 'low', 'medium', 'high']);
export const CONFIDENCE_PROVENANCE = Object.freeze(['deterministic', 'operator', 'model', 'policy']);
export const BACKEND_IDS = Object.freeze(['deterministic', 'operator', 'host', 'external']);
export const DECISION_CAPABILITIES = Object.freeze(['dev', 'office', 'safety']);
export const CHECK_STATUSES = Object.freeze(['pass', 'fail', 'unknown']);
export const FAILURE_CLASSES = Object.freeze(['infrastructure', 'cognitive']);

const EVENTUAL_OUTCOMES = Object.freeze([...DECISION_OUTCOMES, 'unknown']);

function question(id, kind, extra = {}) {
  return Object.freeze({ id, kind, evidenceClass: 'semantic', ...extra });
}

// Question ids and kinds are frozen here because they are architecture decisions.
export const DECISION_BUNDLES = Object.freeze({
  intake: Object.freeze({
    version: DECISION_BUNDLE_VERSION,
    questions: Object.freeze([
      question('goal_clarity', 'score', { scale: Object.freeze([1, 5]) }),
      question('plan_needed', 'boolean'),
      question('tracked_state_value', 'boolean'),
      question('risk_level', 'choice', { options: Object.freeze(['low', 'medium', 'high']) }),
      question('intelligence_demand', 'choice', { options: Object.freeze(['low', 'medium', 'high', 'max']) }),
      question('parallel_benefit', 'boolean')
    ]),
    composites: Object.freeze(['intake_route'])
  }),
  plan: Object.freeze({
    version: DECISION_BUNDLE_VERSION,
    questions: Object.freeze([
      question('requirements_covered', 'boolean'),
      question('solution_coherent', 'boolean'),
      question('dependencies_resolved', 'boolean'),
      question('implementation_specific', 'boolean'),
      question('acceptance_defined', 'boolean'),
      question('verification_defined', 'boolean'),
      question('blocking_unknowns_remain', 'boolean')
    ]),
    composites: Object.freeze(['plan_ready'])
  }),
  action: Object.freeze({
    version: DECISION_BUNDLE_VERSION,
    questions: Object.freeze([
      question('destructive', 'boolean'),
      question('irreversible', 'boolean'),
      question('privileged', 'boolean'),
      question('high_impact', 'boolean'),
      question('external', 'boolean'),
      question('security_sensitive', 'boolean')
    ]),
    composites: Object.freeze(['action_requires_policy_gate'])
  }),
  verify: Object.freeze({
    version: DECISION_BUNDLE_VERSION,
    questions: Object.freeze([
      question('goal_satisfied', 'boolean'),
      question('requirements_covered', 'boolean'),
      question('semantic_correctness', 'boolean'),
      question('scope_preserved', 'boolean'),
      question('verification_sufficient', 'boolean'),
      question('regression_risk', 'score', { scale: Object.freeze([1, 5]) }),
      question('more_work_required', 'boolean')
    ]),
    composites: Object.freeze(['next_state'])
  }),
  release: Object.freeze({
    version: DECISION_BUNDLE_VERSION,
    questions: Object.freeze([
      question('readiness', 'choice', { options: Object.freeze(['not_ready', 'ready']) }),
      question('authorization', 'choice', {
        options: AUTHORIZATION_VALUES,
        evidenceClass: 'deterministic'
      })
    ]),
    composites: Object.freeze(['release_state'])
  })
});

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must have the exact field set: ${expected.join(', ')}.`);
  }
}

function assertText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be non-empty text.`);
  }
}

function assertSafeSegment(value, label) {
  assertText(value, label);
  if (value !== value.trim()
    || path.isAbsolute(value)
    || value.includes('\\')
    || value.includes('/')
    || value === '.'
    || value === '..') {
    throw new Error(`${label} must be a safe single path segment.`);
  }
}

export function bundleOf(name) {
  assertText(name, 'Decision bundle');
  if (!Object.hasOwn(DECISION_BUNDLES, name)) {
    throw new Error(`Unknown decision bundle: ${String(name)}`);
  }
  return DECISION_BUNDLES[name];
}

function assertAnswerValue(value, frozen, label) {
  if (frozen.kind === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
    return;
  }
  if (frozen.kind === 'choice') {
    if (typeof value !== 'string' || !frozen.options.includes(value)) {
      throw new Error(`${label} must be one of ${frozen.options.join(', ')}.`);
    }
    return;
  }
  if (!Number.isSafeInteger(value) || value < frozen.scale[0] || value > frozen.scale[1]) {
    throw new Error(`${label} must be an integer between ${frozen.scale[0]} and ${frozen.scale[1]}.`);
  }
}

function assertQuestionMatches(requested, frozen, index) {
  const label = `Decision request questions[${index}]`;
  assertPlainObject(requested, label);
  if (requested.id !== frozen.id || requested.kind !== frozen.kind) {
    throw new Error(`${label} must be ${frozen.id}/${frozen.kind}.`);
  }
  if (frozen.options !== undefined) {
    if (!Array.isArray(requested.options)
      || requested.options.length !== frozen.options.length
      || frozen.options.some((option, position) => requested.options[position] !== option)) {
      throw new Error(`${label} options must be exactly ${frozen.options.join(', ')}.`);
    }
  } else if (requested.options !== undefined) {
    throw new Error(`${label} is not a choice question.`);
  }
  if (frozen.scale !== undefined) {
    if (!Array.isArray(requested.scale)
      || requested.scale.length !== 2
      || requested.scale[0] !== frozen.scale[0]
      || requested.scale[1] !== frozen.scale[1]) {
      throw new Error(`${label} scale must be exactly ${frozen.scale[0]}..${frozen.scale[1]}.`);
    }
  } else if (requested.scale !== undefined) {
    throw new Error(`${label} is not a score question.`);
  }
}

function assertEvidence(evidence) {
  assertPlainObject(evidence, 'Decision request evidence');
  const deterministic = evidence.deterministic ?? {};
  assertPlainObject(deterministic, 'Decision request evidence.deterministic');
  if (deterministic.checks !== undefined) {
    if (!Array.isArray(deterministic.checks)) {
      throw new Error('Decision request evidence.deterministic.checks must be an array.');
    }
    deterministic.checks.forEach((check, index) => {
      const label = `evidence.deterministic.checks[${index}]`;
      assertPlainObject(check, label);
      assertText(check.id, `${label}.id`);
      if (deterministic.checks.slice(0, index).some((prior) => prior?.id === check.id)) {
        throw new Error(`Duplicate deterministic check id: ${check.id}.`);
      }
      if (!CHECK_STATUSES.includes(check.status)) {
        throw new Error(`${label}.status must be one of ${CHECK_STATUSES.join(', ')}.`);
      }
    });
  }
  if (deterministic.answers !== undefined) {
    assertPlainObject(deterministic.answers, 'Decision request evidence.deterministic.answers');
  }
  if (evidence.semanticContext !== undefined && evidence.semanticContext !== null) {
    assertText(evidence.semanticContext, 'Decision request evidence.semanticContext');
  }
}

export function validateDecisionRequest(request) {
  assertExactKeys(
    request,
    ['schemaVersion', 'bundle', 'bundleVersion', 'subject', 'requirement', 'evidence', 'questions'],
    'Decision request'
  );
  if (request.schemaVersion !== DECISION_SCHEMA_VERSION) {
    throw new Error(`Decision request schemaVersion must be ${DECISION_SCHEMA_VERSION}.`);
  }
  const bundle = bundleOf(request.bundle);
  if (request.bundleVersion !== bundle.version) {
    throw new Error(`Decision request bundleVersion must be ${bundle.version} for ${request.bundle}.`);
  }
  assertExactKeys(request.subject, ['taskId', 'phase', 'capability'], 'Decision request subject');
  assertSafeSegment(request.subject.taskId, 'Decision request subject.taskId');
  assertText(request.subject.phase, 'Decision request subject.phase');
  if (!DECISION_CAPABILITIES.includes(request.subject.capability)) {
    throw new Error(`Decision request subject.capability must be one of ${DECISION_CAPABILITIES.join(', ')}.`);
  }
  assertExactKeys(request.requirement, ['mode', 'intensity'], 'Decision request requirement');
  if (typeof request.requirement.mode !== 'string' || !MODE_KINDS.includes(request.requirement.mode)) {
    throw new Error(`Unknown mode: ${String(request.requirement.mode)}`);
  }
  const intensity = normalizeIntensity(request.requirement.intensity, request.requirement.mode);
  assertEvidence(request.evidence);
  if (!Array.isArray(request.questions) || request.questions.length !== bundle.questions.length) {
    throw new Error(`Decision request questions must declare exactly the ${bundle.questions.length} ${request.bundle} questions.`);
  }
  request.questions.forEach((entry, index) => assertQuestionMatches(entry, bundle.questions[index], index));
  return structuredClone({
    schemaVersion: request.schemaVersion,
    bundle: request.bundle,
    bundleVersion: request.bundleVersion,
    subject: request.subject,
    requirement: { mode: request.requirement.mode, intensity },
    evidence: request.evidence,
    questions: request.questions
  });
}

export function validateDecisionResponse(response) {
  assertExactKeys(
    response,
    ['schemaVersion', 'bundle', 'bundleVersion', 'answers', 'backend'],
    'Decision response'
  );
  if (response.schemaVersion !== DECISION_SCHEMA_VERSION) {
    throw new Error(`Decision response schemaVersion must be ${DECISION_SCHEMA_VERSION}.`);
  }
  const bundle = bundleOf(response.bundle);
  if (response.bundleVersion !== bundle.version) {
    throw new Error(`Decision response bundleVersion must be ${bundle.version} for ${response.bundle}.`);
  }
  assertExactKeys(response.backend, ['id', 'version'], 'Decision response backend');
  if (!BACKEND_IDS.includes(response.backend.id)) {
    throw new Error(`Decision response backend.id must be one of ${BACKEND_IDS.join(', ')}.`);
  }
  const version = response.backend.version;
  if (!((typeof version === 'string' && version.trim() !== '') || Number.isSafeInteger(version))) {
    throw new Error('Decision response backend.version must be non-empty text or an integer.');
  }
  if (!Array.isArray(response.answers) || response.answers.length !== bundle.questions.length) {
    throw new Error(`Decision response answers must cover exactly the ${bundle.questions.length} ${response.bundle} questions.`);
  }
  response.answers.forEach((answer, index) => {
    const frozen = bundle.questions[index];
    const label = `Decision response answers[${index}]`;
    assertExactKeys(answer, ['id', 'value', 'kind', 'confidence'], label);
    if (answer.id !== frozen.id || answer.kind !== frozen.kind) {
      throw new Error(`${label} must be ${frozen.id}/${frozen.kind}.`);
    }
    assertAnswerValue(answer.value, frozen, `${label}.value`);
    assertExactKeys(answer.confidence, ['level', 'provenance'], `${label}.confidence`);
    if (!CONFIDENCE_LEVELS.includes(answer.confidence.level)) {
      throw new Error(`${label}.confidence.level must be one of ${CONFIDENCE_LEVELS.join(', ')}.`);
    }
    if (!CONFIDENCE_PROVENANCE.includes(answer.confidence.provenance)) {
      throw new Error(`${label}.confidence.provenance must be one of ${CONFIDENCE_PROVENANCE.join(', ')}.`);
    }
  });
  return structuredClone(response);
}

function answerValues(answers) {
  if (Array.isArray(answers)) {
    const map = {};
    for (const answer of answers) {
      assertPlainObject(answer, 'Decision answer');
      map[answer.id] = answer.value;
    }
    return map;
  }
  assertPlainObject(answers, 'Decision answers');
  return { ...answers };
}

function requireBooleanValue(map, id) {
  const value = map[id];
  if (typeof value !== 'boolean') throw new Error(`Composite resolution requires a boolean ${id}.`);
  return value;
}

function requireChoiceValue(map, id, options) {
  const value = map[id];
  if (typeof value !== 'string' || !options.includes(value)) {
    throw new Error(`Composite resolution requires ${id} to be one of ${options.join(', ')}.`);
  }
  return value;
}

function requireScoreValue(map, id, scale) {
  const value = map[id];
  if (!Number.isSafeInteger(value) || value < scale[0] || value > scale[1]) {
    throw new Error(`Composite resolution requires ${id} to be an integer between ${scale[0]} and ${scale[1]}.`);
  }
  return value;
}

export function failedDeterministicChecks(deterministic = {}) {
  if (!deterministic || typeof deterministic !== 'object' || Array.isArray(deterministic)) return [];
  const checks = Array.isArray(deterministic.checks) ? deterministic.checks : [];
  return checks.filter((check) => check && check.status === 'fail').map((check) => check.id);
}

// A check that never produced a result cannot establish done either. Its reason
// distinguishes a transient failure from evidence still needing collection.
// Kept separate from failedDeterministicChecks so a caller can
// still tell "this failed" from "this never reported".
export function unresolvedDeterministicChecks(deterministic = {}) {
  if (!deterministic || typeof deterministic !== 'object' || Array.isArray(deterministic)) return [];
  const checks = Array.isArray(deterministic.checks) ? deterministic.checks : [];
  return checks.filter((check) => check && check.status === 'unknown').map((check) => check.id);
}

export function transientDeterministicChecks(deterministic = {}) {
  if (!deterministic || typeof deterministic !== 'object' || Array.isArray(deterministic)) return [];
  const checks = Array.isArray(deterministic.checks) ? deterministic.checks : [];
  const reasons = new Set(['timed-out', 'signalled', 'transient-infrastructure']);
  return checks
    .filter((check) => check && check.status === 'unknown' && (check.transient === true || reasons.has(check.reason)))
    .map((check) => check.id);
}

// INTAKE -> PLAN? exists in the lifecycle, so it must exist in the transition
// field. The composite reads the one question the phase decision turns on.
export function resolveIntakeRoute(answers) {
  const map = answerValues(answers);
  return requireBooleanValue(map, 'plan_needed') ? 'plan' : 'continue';
}

export function resolvePlanReady(answers) {
  const map = answerValues(answers);
  const required = [
    'requirements_covered',
    'solution_coherent',
    'dependencies_resolved',
    'implementation_specific',
    'acceptance_defined',
    'verification_defined'
  ];
  for (const id of required) requireBooleanValue(map, id);
  const blockingUnknowns = requireBooleanValue(map, 'blocking_unknowns_remain');
  return required.every((id) => map[id] === true) && blockingUnknowns === false;
}

export function resolveActionGate(answers) {
  const map = answerValues(answers);
  const riskClasses = ['destructive', 'irreversible', 'privileged', 'high_impact', 'external', 'security_sensitive'];
  for (const id of riskClasses) requireBooleanValue(map, id);
  return riskClasses.some((id) => map[id] === true);
}

// Deterministic and semantic inputs are combined here; a semantic answer can never
// override an observed failure, and an infrastructure failure never escalates
// intelligence. An infrastructure failure means the mechanism failed, so the
// honest response is retry rather than a judgement about the work.
export function resolveNextState(answers, { deterministic = {}, failure = null } = {}) {
  const map = answerValues(answers);
  const goalSatisfied = requireBooleanValue(map, 'goal_satisfied');
  const requirementsCovered = requireBooleanValue(map, 'requirements_covered');
  const semanticCorrectness = requireBooleanValue(map, 'semantic_correctness');
  const scopePreserved = requireBooleanValue(map, 'scope_preserved');
  const verificationSufficient = requireBooleanValue(map, 'verification_sufficient');
  const regressionRisk = requireScoreValue(map, 'regression_risk', [1, 5]);
  const moreWorkRequired = requireBooleanValue(map, 'more_work_required');

  if (failedDeterministicChecks(deterministic).length > 0) {
    return !scopePreserved || !requirementsCovered ? 'replan' : 'repair';
  }
  if (!scopePreserved) return 'replan';
  if (!requirementsCovered) return 'replan';
  if (failure !== null && failure !== undefined) {
    const classified = classifyFailure(failure);
    if (classified.class === 'infrastructure') return 'retry';
    if (classified.suggestedTransition === 'escalate'
      || classified.suggestedTransition === 'think_escalation') return 'escalate';
    if (classified.suggestedTransition === 'replan') return 'replan';
  }

  if (!goalSatisfied) return moreWorkRequired ? 'repair' : 'replan';
  if (!semanticCorrectness) return 'repair';
  if (moreWorkRequired) return 'continue';
  if (transientDeterministicChecks(deterministic).length > 0) return 'retry';
  if (!verificationSufficient) return 'continue';
  if (regressionRisk >= 4) return 'continue';
  if (unresolvedDeterministicChecks(deterministic).length > 0) return 'continue';
  return 'done';
}

// READY is judged; ALLOWED is only ever a recorded policy decision. Permission
// is never inferred from data: `authorization` is declared deterministic
// evidence, so no operator or model answer may set it, and it is not read from
// the request's own `evidence.deterministic.answers` either. It must arrive
// through the dedicated authorization channel as a record that names the
// authority and the evidence behind it. This module cannot authenticate that
// record; it refuses to manufacture the provenance instead.
export const AUTHORIZATION_RECORD_FIELDS = Object.freeze(['value', 'authority', 'evidence']);

export function validateAuthorizationRecord(record) {
  assertExactKeys(record, AUTHORIZATION_RECORD_FIELDS, 'Authorization record');
  if (!AUTHORIZATION_VALUES.includes(record.value)) {
    throw new Error(`Authorization record.value must be one of ${AUTHORIZATION_VALUES.join(', ')}.`);
  }
  assertText(record.authority, 'Authorization record.authority');
  assertText(record.evidence, 'Authorization record.evidence');
  return structuredClone(record);
}

// `authorizationProvenance` is the caller's explicit declaration of where the
// authorization answer came from. It is never read out of the answer set, so a
// response-shaped object cannot grant permission on its own.
export function resolveReleaseState(answers, { authorizationProvenance } = {}) {
  const map = answerValues(answers);
  const readiness = requireChoiceValue(map, 'readiness', ['not_ready', 'ready']);
  const authorization = requireChoiceValue(map, 'authorization', ['not_authorized', 'allowed']);
  if (readiness === 'not_ready') return 'not_ready';
  return authorization === 'allowed' && authorizationProvenance === 'policy' ? 'allowed' : 'ready';
}

export function resolveComposites(bundleName, answers, context = {}) {
  const bundle = bundleOf(bundleName);
  const composites = {};
  if (bundle.composites.includes('intake_route')) composites.intake_route = resolveIntakeRoute(answers);
  if (bundle.composites.includes('plan_ready')) composites.plan_ready = resolvePlanReady(answers);
  if (bundle.composites.includes('action_requires_policy_gate')) {
    composites.action_requires_policy_gate = resolveActionGate(answers);
  }
  if (bundle.composites.includes('next_state')) composites.next_state = resolveNextState(answers, context);
  if (bundle.composites.includes('release_state')) {
    composites.release_state = resolveReleaseState(answers, { authorizationProvenance: context.authorizationProvenance });
  }
  return composites;
}

export function transitionRecommendationOf(bundleName, composites = {}) {
  bundleOf(bundleName);
  if (bundleName === 'verify') return composites.next_state ?? null;
  if (bundleName === 'plan') return composites.plan_ready === true ? 'continue' : 'replan';
  if (bundleName === 'action') return composites.action_requires_policy_gate === true ? 'escalate' : 'continue';
  if (bundleName === 'release') return composites.release_state === 'allowed' ? 'done' : 'continue';
  if (bundleName === 'intake') return composites.intake_route ?? 'continue';
  return 'continue';
}

// The authorization answer is the one answer whose provenance is not read from
// the answer value: it is `policy` exactly when the authorization channel
// supplied the record, and that channel is the only path that reaches here.
function authorizationAnswer(frozen, record) {
  return {
    id: frozen.id,
    value: record.value,
    kind: frozen.kind,
    confidence: { level: 'high', provenance: 'policy' }
  };
}

// A question declared as deterministic evidence is never answered from the
// request's own recorded evidence: the request payload may not carry it at all.
function assertNotRecordedDeterministic(frozen, recorded) {
  if (Object.hasOwn(recorded, frozen.id)) {
    throw new Error(`Request evidence may not record ${frozen.id}: it is declared deterministic evidence and must arrive through the authorization channel.`);
  }
}

export function answersFromEvidence(request, authorization = null) {
  const validated = validateDecisionRequest(request);
  const bundle = bundleOf(validated.bundle);
  const supplied = validated.evidence.deterministic.answers ?? {};
  const answers = [];
  const unanswered = [];
  for (const frozen of bundle.questions) {
    if (frozen.evidenceClass === 'deterministic') {
      assertNotRecordedDeterministic(frozen, supplied);
      if (authorization === null) {
        unanswered.push(frozen.id);
        continue;
      }
      answers.push(authorizationAnswer(frozen, authorization));
      continue;
    }
    if (!Object.hasOwn(supplied, frozen.id)) {
      unanswered.push(frozen.id);
      continue;
    }
    assertAnswerValue(supplied[frozen.id], frozen, `evidence.deterministic.answers.${frozen.id}`);
    answers.push({
      id: frozen.id,
      value: supplied[frozen.id],
      kind: frozen.kind,
      confidence: { level: 'high', provenance: 'deterministic' }
    });
  }
  return { answers, unanswered };
}

export function answersFromOperator(request, supplied, authorization = null) {
  const validated = validateDecisionRequest(request);
  const bundle = bundleOf(validated.bundle);
  assertPlainObject(supplied, 'Operator answers');
  const recorded = validated.evidence.deterministic.answers ?? {};
  const answers = [];
  const unanswered = [];
  for (const frozen of bundle.questions) {
    if (frozen.evidenceClass === 'deterministic') {
      if (Object.hasOwn(supplied, frozen.id)) {
        throw new Error(`Operator answers may not set ${frozen.id}: it is declared deterministic evidence and must arrive through the authorization channel.`);
      }
      assertNotRecordedDeterministic(frozen, recorded);
      if (authorization === null) {
        unanswered.push(frozen.id);
        continue;
      }
      answers.push(authorizationAnswer(frozen, authorization));
      continue;
    }
    if (!Object.hasOwn(supplied, frozen.id)) {
      unanswered.push(frozen.id);
      continue;
    }
    const entry = supplied[frozen.id];
    const structured = entry !== null && typeof entry === 'object' && !Array.isArray(entry);
    const value = structured ? entry.value : entry;
    assertAnswerValue(value, frozen, `operator.${frozen.id}`);
    answers.push({
      id: frozen.id,
      value,
      kind: frozen.kind,
      confidence: structured
        ? { level: entry.level ?? 'medium', provenance: entry.provenance ?? 'operator' }
        : { level: 'medium', provenance: 'operator' }
    });
  }
  return { answers, unanswered };
}

export function evaluateDecision(request, { operator = null, failure = null, backendId = null, authorization = null } = {}) {
  const validated = validateDecisionRequest(request);
  const authorizationRecord = authorization === null ? null : validateAuthorizationRecord(authorization);
  const backend = backendId ?? (operator === null ? 'deterministic' : 'operator');
  if (!BACKEND_IDS.includes(backend)) throw new Error(`Unknown decision backend: ${String(backend)}`);
  if (backend === 'external') {
    throw new Error('The external decision backend is out of scope for this milestone; no network decision backend is available.');
  }
  const { answers, unanswered } = operator === null
    ? answersFromEvidence(validated, authorizationRecord)
    : answersFromOperator(validated, operator, authorizationRecord);
  if (unanswered.length > 0) {
    return { response: null, composites: null, transitionRecommendation: null, unanswered };
  }
  const response = validateDecisionResponse({
    schemaVersion: DECISION_SCHEMA_VERSION,
    bundle: validated.bundle,
    bundleVersion: validated.bundleVersion,
    answers,
    backend: { id: backend, version: 1 }
  });
  const composites = resolveComposites(validated.bundle, response.answers, {
    deterministic: validated.evidence.deterministic,
    failure,
    authorizationProvenance: authorizationRecord === null ? null : 'policy'
  });
  return {
    response,
    composites,
    transitionRecommendation: transitionRecommendationOf(validated.bundle, composites),
    unanswered: []
  };
}

// Local, non-authoritative shadow trace. Never mirrored into Linear, never a
// durable task state, never chain-of-thought.
export const DECISION_TRACE_FIELDS = Object.freeze([
  'ts',
  'taskId',
  'phase',
  'bundle',
  'bundleVersion',
  'questionId',
  'answer',
  'confidenceProvenance',
  'backendId',
  'latencyMs',
  'transitionRecommendation',
  'override',
  'eventualOutcome'
]);
export const FORBIDDEN_TRACE_FIELDS = Object.freeze([
  'reasoning',
  'thoughts',
  'chainOfThought',
  'chain_of_thought',
  'prompt',
  'transcript'
]);

export function validateDecisionTraceRecord(record) {
  assertPlainObject(record, 'Decision trace record');
  for (const forbidden of FORBIDDEN_TRACE_FIELDS) {
    if (Object.hasOwn(record, forbidden)) {
      throw new Error(`Decision trace record must not contain ${forbidden}.`);
    }
  }
  assertExactKeys(record, DECISION_TRACE_FIELDS, 'Decision trace record');
  assertSafeSegment(record.taskId, 'Decision trace record taskId');
  if (typeof record.ts !== 'string' || Number.isNaN(Date.parse(record.ts))) {
    throw new Error('Decision trace record ts must be an ISO-8601 timestamp.');
  }
  assertText(record.phase, 'Decision trace record phase');
  const bundle = bundleOf(record.bundle);
  if (record.bundleVersion !== bundle.version) {
    throw new Error(`Decision trace record bundleVersion must be ${bundle.version}.`);
  }
  const knownIds = [...bundle.questions.map((entry) => entry.id), ...bundle.composites];
  if (!knownIds.includes(record.questionId)) {
    throw new Error(`Decision trace record questionId must be a ${record.bundle} question or composite.`);
  }
  const answer = record.answer;
  if (typeof answer === 'number') {
    if (!Number.isFinite(answer)) throw new Error('Decision trace record answer must be a finite number.');
  } else if (!(typeof answer === 'boolean' || typeof answer === 'string' || answer === null)) {
    throw new Error('Decision trace record answer must be a boolean, number, text or null.');
  }
  if (!CONFIDENCE_PROVENANCE.includes(record.confidenceProvenance)) {
    throw new Error(`Decision trace record confidenceProvenance must be one of ${CONFIDENCE_PROVENANCE.join(', ')}.`);
  }
  if (!BACKEND_IDS.includes(record.backendId)) {
    throw new Error(`Decision trace record backendId must be one of ${BACKEND_IDS.join(', ')}.`);
  }
  if (record.latencyMs !== null && !(Number.isFinite(record.latencyMs) && record.latencyMs >= 0)) {
    throw new Error('Decision trace record latencyMs must be null or a non-negative number.');
  }
  if (record.transitionRecommendation !== null && !DECISION_OUTCOMES.includes(record.transitionRecommendation)) {
    throw new Error(`Decision trace record transitionRecommendation must be null or one of ${DECISION_OUTCOMES.join(', ')}.`);
  }
  if (record.override !== null) {
    assertExactKeys(record.override, ['reason', 'provenance'], 'Decision trace record override');
    assertText(record.override.reason, 'Decision trace record override.reason');
    assertText(record.override.provenance, 'Decision trace record override.provenance');
  }
  if (record.eventualOutcome !== null && !EVENTUAL_OUTCOMES.includes(record.eventualOutcome)) {
    throw new Error(`Decision trace record eventualOutcome must be null or one of ${EVENTUAL_OUTCOMES.join(', ')}.`);
  }
  return record;
}

export function decisionTracePath(directory, taskId) {
  assertText(directory, 'Decision trace directory');
  assertSafeSegment(taskId, 'Decision trace taskId');
  return path.join(directory, `${taskId}.jsonl`);
}

export async function appendDecisionTrace(record, { directory }) {
  validateDecisionTraceRecord(record);
  assertText(directory, 'Decision trace directory');
  await mkdir(directory, { recursive: true });
  const file = decisionTracePath(directory, record.taskId);
  await appendFile(file, `${JSON.stringify(record)}\n`, 'utf8');
  return { path: file, taskId: record.taskId };
}

export async function readDecisionTrace({ directory, taskId }) {
  assertText(directory, 'Decision trace directory');
  assertSafeSegment(taskId, 'Decision trace taskId');
  let raw;
  try {
    raw = await readFile(decisionTracePath(directory, taskId), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => validateDecisionTraceRecord(JSON.parse(line)));
}

// Infrastructure failure and cognitive failure invite different responses.
const FAILURE_TABLE = Object.freeze([
  Object.freeze({ code: 'quota_exceeded', class: 'infrastructure', retryable: true, suggestedTransition: 'retry', aliases: Object.freeze(['rate limit', 'rate_limit', 'quota', '429', 'too many requests']) }),
  Object.freeze({ code: 'timeout', class: 'infrastructure', retryable: true, suggestedTransition: 'retry', aliases: Object.freeze(['etimedout', 'timed out', 'timeout']) }),
  Object.freeze({ code: 'provider_unavailable', class: 'infrastructure', retryable: true, suggestedTransition: 'retry', aliases: Object.freeze(['provider unavailable', 'provider_unavailable', 'econnrefused', 'service unavailable']) }),
  Object.freeze({ code: 'transport_incompatible', class: 'infrastructure', retryable: true, suggestedTransition: 'retry', aliases: Object.freeze(['transport']) }),
  Object.freeze({ code: 'unsupported_tool', class: 'infrastructure', retryable: true, suggestedTransition: 'retry', aliases: Object.freeze(['unsupported tool', 'unsupported_tool', 'tool not supported']) }),
  Object.freeze({ code: 'sandbox_denied', class: 'infrastructure', retryable: true, suggestedTransition: 'retry', aliases: Object.freeze(['sandbox', 'eperm']) }),
  Object.freeze({ code: 'context_limit', class: 'infrastructure', retryable: true, suggestedTransition: 'retry', aliases: Object.freeze(['context limit', 'context_limit', 'context length', 'context window']) }),
  Object.freeze({ code: 'provider_mismatch', class: 'infrastructure', retryable: true, suggestedTransition: 'retry', aliases: Object.freeze(['provider mismatch', 'provider_mismatch', 'encrypted content']) }),
  Object.freeze({ code: 'incomplete_plan', class: 'cognitive', retryable: false, suggestedTransition: 'replan', aliases: Object.freeze(['incomplete plan', 'incomplete_plan']) }),
  Object.freeze({ code: 'unresolved_ambiguity', class: 'cognitive', retryable: false, suggestedTransition: 'think_escalation', aliases: Object.freeze(['ambiguity', 'ambiguous']) }),
  Object.freeze({ code: 'repeated_failed_repair', class: 'cognitive', retryable: false, suggestedTransition: 'escalate', aliases: Object.freeze(['repeated repair', 'repeated_failed_repair', 'failed repair']) }),
  Object.freeze({ code: 'verification_contradiction', class: 'cognitive', retryable: false, suggestedTransition: 'replan', aliases: Object.freeze(['contradict']) }),
  Object.freeze({ code: 'wrong_architecture', class: 'cognitive', retryable: false, suggestedTransition: 'replan', aliases: Object.freeze(['wrong architecture', 'wrong_architecture', 'architecture is wrong']) })
]);

function codeText(value) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return String(value);
}

function failureInput(input) {
  if (typeof input === 'string') return { code: input, message: '' };
  if (input instanceof Error) {
    return { code: codeText(input.code ?? input.status), message: input.message ?? '' };
  }
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return {
      code: codeText(input.code ?? input.status),
      message: typeof input.message === 'string' ? input.message : ''
    };
  }
  throw new Error('Failure classification requires an error, a code or a recorded condition.');
}

export function classifyFailure(input) {
  const { code, message } = failureInput(input);
  const lowerCode = code.toLowerCase();
  const haystack = `${lowerCode} ${message.toLowerCase()}`;
  const matched = FAILURE_TABLE.find((entry) =>
    entry.code === lowerCode || entry.aliases.some((alias) => haystack.includes(alias)));
  if (!matched) throw new Error(`Unknown failure: ${code || message || 'unrecognized failure'}`);
  return Object.freeze({
    class: matched.class,
    code: matched.code,
    retryable: matched.retryable,
    suggestedTransition: matched.suggestedTransition
  });
}
