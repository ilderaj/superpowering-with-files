import { DECISION_BUNDLES, DECISION_OUTCOMES, appendDecisionTrace, evaluateDecision } from './decision.mjs';

// Shadow recording. A gate observes a phase and records what it would have
// recommended next to what the existing path actually did. Nothing here takes a
// transition: the existing path stays authoritative, and a gate that fails,
// throws or cannot answer never blocks it.

// 2 adds the three-state item status, the per-question identity and the explicit
// agreement to the shadow trace; a version-1 record is still readable and its
// missing agreement stays unknown.
export const SHADOW_VERSION = 2;

// The behaviour tokens the existing path may report. The set reuses the
// decision outcome vocabulary for the outcomes it shares, so a comparison never
// translates between two private languages.
export const SHADOW_CURRENT_BEHAVIOURS = Object.freeze([
  'proceed',
  'execute',
  ...DECISION_OUTCOMES,
  'halt',
  'unknown'
]);

// The three states one shadow observation can end in. A comparison that could
// not be made is never counted as an agreement, and a comparison that could not
// be attempted is never counted at all.
export const SHADOW_ITEM_STATUSES = Object.freeze(['evaluated', 'unevaluable', 'incomparable']);

// Priority shadow questions, in the order the spec fixes. Several are the same
// underlying contract element observed by different consumers; that is stated
// rather than hidden behind two invented signals:
//   plan_ready and execution_ready both read the plan bundle's plan_ready composite
//   next_action and goal_complete both read the verify bundle's next_state composite
//     (goal_complete is true only when next_state is done)
export const SHADOW_QUESTIONS = Object.freeze({
  plan_needed: Object.freeze({
    bundle: 'intake',
    target: 'plan_needed',
    kind: 'boolean',
    agreeWhen: Object.freeze({
      true: Object.freeze(['plan']),
      false: Object.freeze(['continue', 'proceed', 'execute'])
    })
  }),
  plan_ready: Object.freeze({
    bundle: 'plan',
    target: 'plan_ready',
    kind: 'boolean',
    agreeWhen: Object.freeze({
      true: Object.freeze(['continue', 'proceed', 'execute']),
      false: Object.freeze(['replan', 'halt'])
    })
  }),
  execution_ready: Object.freeze({
    bundle: 'plan',
    target: 'plan_ready',
    kind: 'boolean',
    agreeWhen: Object.freeze({
      true: Object.freeze(['continue', 'proceed', 'execute']),
      false: Object.freeze(['replan', 'halt'])
    })
  }),
  verification_sufficient: Object.freeze({
    bundle: 'verify',
    target: 'verification_sufficient',
    kind: 'boolean',
    agreeWhen: Object.freeze({
      true: Object.freeze(['done', 'proceed']),
      false: Object.freeze(['continue', 'repair'])
    })
  }),
  next_action: Object.freeze({
    bundle: 'verify',
    target: 'next_state',
    kind: 'choice',
    agreeWhen: null
  }),
  goal_complete: Object.freeze({
    bundle: 'verify',
    target: 'next_state',
    kind: 'boolean',
    agreeWhen: Object.freeze({
      true: Object.freeze(['done']),
      false: Object.freeze(['continue', 'repair', 'replan', 'retry', 'escalate', 'halt'])
    })
  })
});

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be non-empty text.`);
  }
}

export function shadowQuestionOf(id) {
  assertText(id, 'Shadow question');
  if (!Object.hasOwn(SHADOW_QUESTIONS, id)) {
    throw new Error(`Unknown shadow question: ${String(id)}. Declared questions are ${Object.keys(SHADOW_QUESTIONS).join(', ')}.`);
  }
  return SHADOW_QUESTIONS[id];
}

// The request a caller submits for one shadow question. It carries the bundle's
// full frozen question set because a bundle is evaluated as a whole.
export function shadowRequestFor(questionId, { subject, requirement, evidence = { deterministic: {} } } = {}) {
  const declared = shadowQuestionOf(questionId);
  const frozen = DECISION_BUNDLES[declared.bundle];
  assertPlainObject(subject, 'Shadow request subject');
  assertPlainObject(requirement, 'Shadow request requirement');
  return {
    schemaVersion: 1,
    bundle: declared.bundle,
    bundleVersion: frozen.version,
    subject,
    requirement,
    evidence,
    questions: frozen.questions.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      ...(entry.options ? { options: [...entry.options] } : {}),
      ...(entry.scale ? { scale: [...entry.scale] } : {})
    }))
  };
}

// The value the shadow question asks about, read out of an evaluated bundle.
export function shadowAnswerOf(questionId, evaluation) {
  const declared = shadowQuestionOf(questionId);
  if (!evaluation || !evaluation.response || !evaluation.composites) return null;
  if (Object.hasOwn(evaluation.composites, declared.target)) {
    const composite = evaluation.composites[declared.target];
    if (declared.kind === 'boolean' && declared.target === 'next_state') return composite === 'done';
    return composite;
  }
  const answer = evaluation.response.answers.find((entry) => entry.id === declared.target);
  return answer ? answer.value : null;
}

// Agreement between a recommendation and what the existing path did. An
// unrecognised current behaviour is `null`: the two cannot be compared, and
// reporting a disagreement would invent one.
export function shadowAgreement(questionId, recommendation, currentBehaviour) {
  const declared = shadowQuestionOf(questionId);
  assertText(currentBehaviour, 'Shadow current behaviour');
  if (!SHADOW_CURRENT_BEHAVIOURS.includes(currentBehaviour)) {
    throw new Error(`Unknown shadow current behaviour: ${String(currentBehaviour)}.`);
  }
  if (recommendation === null || recommendation === undefined) return null;
  if (currentBehaviour === 'unknown') return null;
  if (declared.agreeWhen === null) return recommendation === currentBehaviour;
  const agreeing = declared.agreeWhen[String(recommendation)];
  if (!agreeing) return null;
  return agreeing.includes(currentBehaviour);
}

// One shadow item plus its derived state. `unevaluable` is kept as a field for
// callers written against the first shape; `status` is the declared three-state
// vocabulary.
function shadowItem(overrides = {}) {
  const item = {
    version: SHADOW_VERSION,
    questionId: null,
    bundle: null,
    target: null,
    currentBehaviour: 'unknown',
    recommendation: null,
    agreement: null,
    status: 'unevaluable',
    reason: null,
    tracePath: null,
    persisted: false,
    traceFailed: false,
    ...overrides
  };
  return Object.freeze({ ...item, unevaluable: item.status === 'unevaluable' });
}

// Record one shadow decision. The existing path is never blocked: a malformed
// request, an unsatisfiable bundle or an unwritable trace all return a structured
// item instead of propagating, and the item always ends in one of the three
// declared statuses.
export async function recordShadowDecision({
  questionId,
  request,
  operator = null,
  currentBehaviour,
  failure = null,
  phase,
  eventualOutcome = null,
  directory,
  timestamp = null
} = {}) {
  let declared;
  try {
    declared = shadowQuestionOf(questionId);
  } catch {
    return shadowItem({ questionId: typeof questionId === 'string' ? questionId : null, reason: 'unknown-question' });
  }
  const base = { questionId, bundle: declared.bundle, target: declared.target };
  if (typeof currentBehaviour !== 'string' || !SHADOW_CURRENT_BEHAVIOURS.includes(currentBehaviour)) {
    return shadowItem({ ...base, reason: 'invalid-current-behaviour' });
  }
  if (eventualOutcome !== null && eventualOutcome !== undefined
    && ![...DECISION_OUTCOMES, 'unknown'].includes(eventualOutcome)) {
    return shadowItem({ ...base, currentBehaviour, reason: 'invalid-eventual-outcome' });
  }
  // A request naming another bundle would compare this question's answer against
  // a contract it does not belong to, so it is refused before evaluation.
  if (request && typeof request === 'object' && !Array.isArray(request)
    && request.bundle !== undefined && request.bundle !== declared.bundle) {
    return shadowItem({ ...base, currentBehaviour, reason: 'bundle-mismatch' });
  }
  let evaluation;
  try {
    evaluation = evaluateDecision(request, { operator, failure });
  } catch {
    return shadowItem({ ...base, currentBehaviour, reason: 'gate-failed' });
  }
  if (!evaluation.response) {
    return shadowItem({ ...base, currentBehaviour, reason: 'unanswered' });
  }
  const recommendation = declared.target === 'next_state'
    ? evaluation.composites.next_state
    : (Object.hasOwn(evaluation.composites, declared.target)
      ? evaluation.composites[declared.target]
      : (declared.kind === 'boolean'
        ? evaluation.response.answers.find((entry) => entry.id === declared.target)?.value ?? null
        : null));
  const answer = shadowAnswerOf(questionId, evaluation);
  const agreement = shadowAgreement(questionId, answer, currentBehaviour);
  const status = agreement === true || agreement === false
    ? 'evaluated'
    : (answer === null || answer === undefined ? 'unevaluable' : 'incomparable');
  const item = shadowItem({ ...base, currentBehaviour, recommendation, agreement, status });
  const record = {
    schemaVersion: SHADOW_VERSION,
    ts: timestamp ?? new Date().toISOString(),
    taskId: request.subject.taskId,
    phase,
    bundle: declared.bundle,
    bundleVersion: DECISION_BUNDLES[declared.bundle].version,
    questionId: declared.target,
    shadowQuestionId: questionId,
    answer,
    agreement,
    reason: null,
    confidenceProvenance: operator === null ? 'deterministic' : 'operator',
    backendId: operator === null ? 'deterministic' : 'operator',
    latencyMs: null,
    transitionRecommendation: evaluation.transitionRecommendation,
    override: agreement === false
      ? { reason: 'existing path retained', provenance: 'current-behaviour' }
      : null,
    eventualOutcome: eventualOutcome ?? null
  };
  try {
    const written = await appendDecisionTrace(record, { directory });
    return Object.freeze({ ...item, tracePath: written.path, persisted: true });
  } catch {
    // The evaluation still stands; only its persistence failed, and the item
    // says so instead of pretending the trace was written.
    return Object.freeze({ ...item, reason: 'trace-unwritable', traceFailed: true });
  }
}

// Morning handoff reads the disagreement count without judging any single gate.
// ---------------------------------------------------------------------------
// Gate activation. Every gate starts in shadow and stays there unless a recorded
// activation decision carries measured benefit and a rollback condition. The
// switch is data: a record, not a code change, and the default when no record
// exists is shadow.

export const GATE_ACTIVATION_STATES = Object.freeze(['shadow', 'active']);
export const GATE_IDS = Object.freeze(Object.keys(SHADOW_QUESTIONS));

// What a gate must show before it may leave shadow. A gate with no measured
// benefit stays in shadow, so absence of evidence is a shadow outcome.
export const GATE_BENEFIT_METRICS = Object.freeze([
  'false_done_reduced',
  'premature_execution_reduced',
  'unnecessary_plan_reduced',
  'repair_loop_reduced',
  'repair_vs_replan_improved',
  'chief_token_usage_reduced',
  'orchestration_latency_reduced',
  'unattended_reliability_improved'
]);

export function gateActivationDefaults() {
  return Object.freeze(Object.fromEntries(GATE_IDS.map((id) => [id, 'shadow'])));
}

function assertGateId(id) {
  assertText(id, 'Gate id');
  if (!GATE_IDS.includes(id)) {
    throw new Error(`Unknown gate: ${String(id)}. Declared gates are ${GATE_IDS.join(', ')}.`);
  }
}

// Resolve one gate's state from an optional activation record. An absent,
// malformed or incomplete record leaves the gate in shadow: activation is never
// inferred, and a gate without measured benefit cannot be promoted.
export function resolveGateActivation(gateId, record = null) {
  assertGateId(gateId);
  if (record === null || record === undefined) {
    return Object.freeze({ gateId, state: 'shadow', reason: 'no-activation-decision' });
  }
  assertPlainObject(record, 'Gate activation record');
  const state = record.state ?? 'shadow';
  if (!GATE_ACTIVATION_STATES.includes(state)) {
    return Object.freeze({ gateId, state: 'shadow', reason: 'unknown-state' });
  }
  if (state === 'shadow') {
    return Object.freeze({ gateId, state: 'shadow', reason: 'recorded-shadow' });
  }
  if (typeof record.benefit !== 'string' || !GATE_BENEFIT_METRICS.includes(record.benefit)) {
    return Object.freeze({ gateId, state: 'shadow', reason: 'no-measured-benefit' });
  }
  if (typeof record.rollback !== 'string' || record.rollback.trim() === '') {
    return Object.freeze({ gateId, state: 'shadow', reason: 'no-rollback-condition' });
  }
  if (typeof record.evidence !== 'string' || record.evidence.trim() === '') {
    return Object.freeze({ gateId, state: 'shadow', reason: 'no-evidence' });
  }
  if (record.authorizedBy !== 'chief' && record.authorizedBy !== 'human') {
    return Object.freeze({ gateId, state: 'shadow', reason: 'not-authorized' });
  }
  return Object.freeze({ gateId, state: 'active', reason: 'recorded-activation' });
}

// The full switch. A caller passes whatever records exist; everything else
// stays in shadow.
export function resolveGateActivations(records = {}) {
  assertPlainObject(records, 'Gate activation records');
  for (const id of Object.keys(records)) assertGateId(id);
  return Object.freeze(Object.fromEntries(
    GATE_IDS.map((id) => [id, resolveGateActivation(id, records[id] ?? null)])
  ));
}

export function activeGates(records = {}) {
  const resolved = resolveGateActivations(records);
  return Object.freeze(GATE_IDS.filter((id) => resolved[id].state === 'active'));
}

// ---------------------------------------------------------------------------
// Checkpoint attachment. A checkpoint producer calls this before rendering. The
// checkpoint object is returned untouched, so no existing checkpoint behaviour
// or test changes; the shadow recommendation is recorded alongside it.

// Runtime state -> the behaviour the existing path is actually taking. An
// unrecognised state maps to `unknown`, which yields a null agreement rather
// than a fabricated disagreement, so this table can lag the runtime safely.
export const CHECKPOINT_BEHAVIOURS = Object.freeze({
  planned: 'plan',
  ready: 'proceed',
  running: 'execute',
  review: 'done',
  done: 'done',
  failed: 'repair',
  waiting_human: 'halt',
  blocked: 'halt',
  canceled: 'halt'
});

export function checkpointBehaviourOf(state) {
  if (typeof state !== 'string') return 'unknown';
  return CHECKPOINT_BEHAVIOURS[state] ?? 'unknown';
}

// One checkpoint observation, isolated from the others. A malformed entry, an
// unknown question or a request that belongs to another bundle or task is turned
// into a structured failure here, so it can never abort the checkpoint or reach
// another task's trace.
async function recordCheckpointObservation({
  observation,
  checkpoint,
  currentBehaviour,
  phase,
  eventualOutcome,
  directory,
  timestamp,
  containerInvalid = false
}) {
  if (containerInvalid) return shadowItem({ currentBehaviour, reason: 'invalid-observations' });
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    return shadowItem({ currentBehaviour, reason: 'invalid-observation' });
  }
  const questionId = observation.questionId;
  if (typeof questionId !== 'string' || !Object.hasOwn(SHADOW_QUESTIONS, questionId)) {
    return shadowItem({
      questionId: typeof questionId === 'string' ? questionId : null,
      currentBehaviour,
      reason: 'unknown-question'
    });
  }
  const declared = SHADOW_QUESTIONS[questionId];
  const base = { questionId, bundle: declared.bundle, target: declared.target, currentBehaviour };
  const request = observation.request;
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.bundle === undefined) {
    return shadowItem({ ...base, reason: 'invalid-request' });
  }
  if (request.bundle !== declared.bundle) {
    return shadowItem({ ...base, reason: 'bundle-mismatch' });
  }
  const taskId = request.subject && typeof request.subject === 'object' ? request.subject.taskId : null;
  if (taskId !== checkpoint.taskId) {
    return shadowItem({ ...base, reason: 'task-mismatch' });
  }
  return recordShadowDecision({
    questionId,
    request,
    operator: observation.operator ?? null,
    failure: observation.failure ?? null,
    currentBehaviour,
    phase,
    eventualOutcome,
    directory,
    timestamp
  });
}

// Attach shadow recording to one checkpoint. `observations` declares which
// priority questions to evaluate; everything else about the checkpoint is left
// alone. An invalid checkpoint keeps its original failure semantics; on a valid
// checkpoint a bad observation is recorded and the remaining ones still run.
export async function recordCheckpointShadow({
  checkpoint,
  observations = [],
  directory,
  eventualOutcome = null,
  timestamp = null
} = {}) {
  assertPlainObject(checkpoint, 'Checkpoint');
  assertText(checkpoint.taskId, 'Checkpoint taskId');
  const currentBehaviour = checkpointBehaviourOf(checkpoint.state);
  const phase = typeof checkpoint.phase === 'string' && checkpoint.phase.trim() !== ''
    ? checkpoint.phase
    : 'checkpoint';
  const containerInvalid = !Array.isArray(observations);
  const declared = containerInvalid ? [undefined] : observations;
  const results = [];
  for (const observation of declared) {
    results.push(await recordCheckpointObservation({
      observation,
      checkpoint,
      currentBehaviour,
      phase,
      eventualOutcome,
      directory,
      timestamp,
      containerInvalid
    }));
  }
  return Object.freeze({
    version: SHADOW_VERSION,
    checkpoint,
    currentBehaviour,
    phase,
    results: Object.freeze(results),
    summary: summarizeShadow(results)
  });
}

// Morning handoff reads the counts without judging any single gate. Only an
// explicit `agreement` of true or false is an agreement or a disagreement: an
// item that could not answer is `unevaluable`, an item whose answer could not be
// compared is `incomparable`, and a record written before the agreement field
// existed stays unknown instead of being read as implicit agreement.
export function summarizeShadow(records = []) {
  if (!Array.isArray(records)) throw new Error('Shadow records must be an array.');
  const summary = {
    version: SHADOW_VERSION,
    total: 0,
    agreements: 0,
    disagreements: 0,
    unevaluable: 0,
    incomparable: 0,
    traceFailures: 0,
    byQuestion: {}
  };
  for (const record of records) {
    assertPlainObject(record, 'Shadow record');
    const identity = record.shadowQuestionId ?? record.questionId;
    const questionId = typeof identity === 'string' && identity.trim() !== '' ? identity : '(unknown)';
    const bucket = summary.byQuestion[questionId]
      ?? (summary.byQuestion[questionId] = { agreements: 0, disagreements: 0, unevaluable: 0, incomparable: 0 });
    summary.total += 1;
    let key;
    if (record.agreement === true) key = 'agreements';
    else if (record.agreement === false) key = 'disagreements';
    else if (record.status === 'incomparable') key = 'incomparable';
    else key = 'unevaluable';
    summary[key] += 1;
    bucket[key] += 1;
    if (record.traceFailed === true || record.reason === 'trace-unwritable') summary.traceFailures += 1;
  }
  return Object.freeze(summary);
}
