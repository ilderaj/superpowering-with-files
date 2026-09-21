import { DECISION_BUNDLES, DECISION_OUTCOMES, appendDecisionTrace, evaluateDecision } from './decision.mjs';

// Shadow recording. A gate observes a phase and records what it would have
// recommended next to what the existing path actually did. Nothing here takes a
// transition: the existing path stays authoritative, and a gate that fails,
// throws or cannot answer never blocks it.

export const SHADOW_VERSION = 1;

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
      false: Object.freeze(['proceed', 'execute'])
    })
  }),
  plan_ready: Object.freeze({
    bundle: 'plan',
    target: 'plan_ready',
    kind: 'boolean',
    agreeWhen: Object.freeze({
      true: Object.freeze(['proceed', 'execute']),
      false: Object.freeze(['replan', 'halt'])
    })
  }),
  execution_ready: Object.freeze({
    bundle: 'plan',
    target: 'plan_ready',
    kind: 'boolean',
    agreeWhen: Object.freeze({
      true: Object.freeze(['proceed', 'execute']),
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
      false: Object.freeze(['continue', 'repair', 'replan', 'escalate', 'halt'])
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

// Record one shadow decision. The existing path is never blocked: a gate that
// throws, an unsatisfiable bundle or an unwritable trace all return a structured
// result instead of propagating.
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
  const declared = shadowQuestionOf(questionId);
  assertText(currentBehaviour, 'Shadow current behaviour');
  if (!SHADOW_CURRENT_BEHAVIOURS.includes(currentBehaviour)) {
    throw new Error(`Unknown shadow current behaviour: ${String(currentBehaviour)}.`);
  }
  assertText(phase, 'Shadow phase');
  if (eventualOutcome !== null && eventualOutcome !== undefined
    && ![...DECISION_OUTCOMES, 'unknown'].includes(eventualOutcome)) {
    throw new Error(`Unknown shadow eventual outcome: ${String(eventualOutcome)}.`);
  }
  const result = {
    version: SHADOW_VERSION,
    questionId,
    bundle: declared.bundle,
    target: declared.target,
    currentBehaviour,
    recommendation: null,
    agreement: null,
    unevaluable: false,
    reason: null,
    tracePath: null
  };
  let evaluation;
  try {
    evaluation = evaluateDecision(request, { operator, failure });
  } catch (error) {
    return Object.freeze({ ...result, unevaluable: true, reason: 'gate-failed' });
  }
  if (!evaluation.response) {
    return Object.freeze({ ...result, unevaluable: true, reason: 'unanswered' });
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
  const record = {
    ts: timestamp ?? new Date().toISOString(),
    taskId: request.subject.taskId,
    phase,
    bundle: declared.bundle,
    bundleVersion: DECISION_BUNDLES[declared.bundle].version,
    questionId: declared.target,
    answer,
    confidenceProvenance: operator === null ? 'deterministic' : 'operator',
    backendId: operator === null ? 'deterministic' : 'operator',
    latencyMs: null,
    transitionRecommendation: evaluation.transitionRecommendation,
    override: agreement === false
      ? { reason: 'existing path retained', provenance: 'current-behaviour' }
      : null,
    eventualOutcome: eventualOutcome ?? null
  };
  let tracePath = null;
  try {
    const written = await appendDecisionTrace(record, { directory });
    tracePath = written.path;
  } catch {
    return Object.freeze({ ...result, recommendation, agreement, reason: 'trace-unwritable' });
  }
  return Object.freeze({ ...result, recommendation, agreement, tracePath });
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

// Attach shadow recording to one checkpoint. `observations` declares which
// priority questions to evaluate; everything else about the checkpoint is left
// alone. A gate that fails or cannot be recorded never blocks the checkpoint.
export async function recordCheckpointShadow({
  checkpoint,
  observations = [],
  directory,
  eventualOutcome = null,
  timestamp = null
} = {}) {
  assertPlainObject(checkpoint, 'Checkpoint');
  assertText(checkpoint.taskId, 'Checkpoint taskId');
  if (!Array.isArray(observations)) {
    throw new Error('Checkpoint shadow observations must be an array.');
  }
  const currentBehaviour = checkpointBehaviourOf(checkpoint.state);
  const phase = typeof checkpoint.phase === 'string' && checkpoint.phase.trim() !== ''
    ? checkpoint.phase
    : 'checkpoint';
  const results = [];
  for (const observation of observations) {
    assertPlainObject(observation, 'Checkpoint shadow observation');
    results.push(await recordShadowDecision({
      questionId: observation.questionId,
      request: observation.request,
      operator: observation.operator ?? null,
      failure: observation.failure ?? null,
      currentBehaviour,
      phase,
      eventualOutcome,
      directory,
      timestamp
    }));
  }
  const evaluated = results.filter((entry) => !entry.unevaluable);
  return Object.freeze({
    version: SHADOW_VERSION,
    checkpoint,
    currentBehaviour,
    phase,
    results: Object.freeze(results),
    summary: summarizeShadow(evaluated.map((entry) => ({
      questionId: entry.questionId,
      override: entry.agreement === false ? { provenance: 'current-behaviour' } : null
    })))
  });
}

// Morning handoff reads the disagreement count without judging any single gate.
export function summarizeShadow(records = []) {
  if (!Array.isArray(records)) throw new Error('Shadow records must be an array.');
  const summary = {
    version: SHADOW_VERSION,
    total: 0,
    agreements: 0,
    disagreements: 0,
    unevaluable: 0,
    byQuestion: {}
  };
  for (const record of records) {
    assertPlainObject(record, 'Shadow record');
    const questionId = record.questionId;
    assertText(questionId, 'Shadow record questionId');
    const bucket = summary.byQuestion[questionId]
      ?? (summary.byQuestion[questionId] = { agreements: 0, disagreements: 0 });
    summary.total += 1;
    if (record.override && record.override.provenance === 'current-behaviour') {
      summary.disagreements += 1;
      bucket.disagreements += 1;
    } else {
      summary.agreements += 1;
      bucket.agreements += 1;
    }
  }
  return Object.freeze(summary);
}
