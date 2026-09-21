import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DECISION_BUNDLES,
  DECISION_BUNDLE_VERSION,
  DECISION_KINDS,
  DECISION_OUTCOMES,
  DECISION_SCHEMA_VERSION,
  DECISION_TRACE_FIELDS,
  EVIDENCE_CLASSES,
  FAILURE_CLASSES,
  FORBIDDEN_TRACE_FIELDS,
  RELEASE_STATES,
  appendDecisionTrace,
  bundleOf,
  classifyFailure,
  decisionTracePath,
  evaluateDecision,
  failedDeterministicChecks,
  readDecisionTrace,
  resolveActionGate,
  resolveComposites,
  resolveIntakeRoute,
  resolveNextState,
  transientDeterministicChecks,
  resolvePlanReady,
  resolveReleaseState,
  transitionRecommendationOf,
  unresolvedDeterministicChecks,
  validateDecisionRequest,
  validateDecisionResponse
} from '../../harness/trio/core/decision.mjs';

import {
  DEFAULT_SHADOW_FIXTURE_ROOT,
  SHADOW_DISCLAIMER,
  SHADOW_ROWS,
  SHADOW_RUNNER_ID,
  evaluateDecisionShadow,
  loadShadowCases,
  parseCliArgs,
  serializeShadowReport,
  validateShadowCoverage,
  validateShadowReport
} from '../../scripts/evaluate-decision-shadow.mjs';

function requestFor(bundleName, overrides = {}) {
  const frozen = DECISION_BUNDLES[bundleName];
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    bundle: bundleName,
    bundleVersion: DECISION_BUNDLE_VERSION,
    subject: { taskId: 'decision-test', phase: 'verify', capability: 'dev' },
    requirement: { mode: 'think', intensity: 'high' },
    evidence: { deterministic: {}, semanticContext: null },
    questions: frozen.questions.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      ...(entry.options ? { options: [...entry.options] } : {}),
      ...(entry.scale ? { scale: [...entry.scale] } : {})
    })),
    ...overrides
  };
}

function verifyAnswers(overrides = {}) {
  return {
    goal_satisfied: true,
    requirements_covered: true,
    semantic_correctness: true,
    scope_preserved: true,
    verification_sufficient: true,
    regression_risk: 1,
    more_work_required: false,
    ...overrides
  };
}

function planAnswers(overrides = {}) {
  return {
    requirements_covered: true,
    solution_coherent: true,
    dependencies_resolved: true,
    implementation_specific: true,
    acceptance_defined: true,
    verification_defined: true,
    blocking_unknowns_remain: false,
    ...overrides
  };
}

test('decision vocabulary is frozen and labels every question with its evidence class', () => {
  assert.deepEqual([...DECISION_KINDS], ['boolean', 'choice', 'score']);
  assert.deepEqual([...EVIDENCE_CLASSES], ['deterministic', 'semantic', 'composite']);
  assert.deepEqual([...DECISION_OUTCOMES], ['continue', 'plan', 'repair', 'replan', 'retry', 'escalate', 'done']);
  assert.deepEqual([...RELEASE_STATES], ['not_ready', 'ready', 'allowed']);
  assert.deepEqual([...FAILURE_CLASSES], ['infrastructure', 'cognitive']);
  assert.deepEqual(Object.keys(DECISION_BUNDLES).sort(), ['action', 'intake', 'plan', 'release', 'verify']);
  for (const [name, bundle] of Object.entries(DECISION_BUNDLES)) {
    assert.equal(bundle.version, DECISION_BUNDLE_VERSION, name);
    assert.ok(bundle.questions.length > 0, name);
    for (const entry of bundle.questions) {
      assert.ok(DECISION_KINDS.includes(entry.kind), name + '/' + entry.id);
      assert.ok(EVIDENCE_CLASSES.includes(entry.evidenceClass), name + '/' + entry.id);
      assert.ok(Object.isFrozen(entry), name + '/' + entry.id);
    }
  }
  const authorization = DECISION_BUNDLES.release.questions.find((entry) => entry.id === 'authorization');
  assert.equal(authorization.evidenceClass, 'deterministic');
  assert.throws(() => bundleOf('nope'), /Unknown decision bundle/i);
  assert.throws(() => bundleOf(''), /non-empty text/i);
});

test('validateDecisionRequest accepts a canonical request and rejects unknown bundles, questions and kinds', () => {
  const request = requestFor('verify');
  const validated = validateDecisionRequest(request);
  assert.equal(validated.requirement.intensity, 'high');
  assert.notEqual(validated, request);

  assert.throws(() => validateDecisionRequest(requestFor('verify', { bundle: 'nope' })), /Unknown decision bundle/i);
  assert.throws(() => validateDecisionRequest(requestFor('verify', { schemaVersion: 2 })), /schemaVersion must be 1/i);
  assert.throws(() => validateDecisionRequest(requestFor('verify', { bundleVersion: 7 })), /bundleVersion must be 1/i);
  assert.throws(() => validateDecisionRequest(requestFor('verify', { requirement: { mode: 'ultra', intensity: 'high' } })), /Unknown mode/i);
  assert.throws(() => validateDecisionRequest(requestFor('verify', { requirement: { mode: 'execute', intensity: 'low' } })), /not supported in execute mode/i);
  assert.throws(() => validateDecisionRequest(requestFor('verify', { subject: { taskId: 'a/b', phase: 'verify', capability: 'dev' } })), /safe single path segment/i);
  assert.throws(() => validateDecisionRequest(requestFor('verify', { subject: { taskId: 't', phase: 'verify', capability: 'other' } })), /subject.capability/i);
  assert.throws(() => validateDecisionRequest(requestFor('verify', { evidence: { deterministic: { checks: [{ id: 'tests', status: 'maybe' }] } } })), /status must be one of/i);
  assert.throws(() => validateDecisionRequest(requestFor('verify', { evidence: { deterministic: {}, semanticContext: '' } })), /semanticContext/i);

  const wrongKind = requestFor('verify');
  wrongKind.questions[0] = { id: 'goal_satisfied', kind: 'score', scale: [1, 5] };
  assert.throws(() => validateDecisionRequest(wrongKind), /must be goal_satisfied\/boolean/i);

  const unknownQuestion = requestFor('verify');
  unknownQuestion.questions[0] = { id: 'invented_question', kind: 'boolean' };
  assert.throws(() => validateDecisionRequest(unknownQuestion), /must be goal_satisfied\/boolean/i);

  assert.throws(() => validateDecisionRequest(requestFor('verify', { questions: [] })), /must declare exactly the 7 verify questions/i);
  assert.throws(() => validateDecisionRequest(requestFor('verify', { extra: true })), /exact field set/i);
});

test('validateDecisionResponse requires provenance and rejects out-of-scale or mistyped answers', () => {
  const request = requestFor('verify');
  const evaluation = evaluateDecision(request, { operator: verifyAnswers() });
  assert.equal(evaluation.response.backend.id, 'operator');
  assert.equal(validateDecisionResponse(evaluation.response).bundle, 'verify');

  const missingProvenance = structuredClone(evaluation.response);
  delete missingProvenance.answers[0].confidence.provenance;
  assert.throws(() => validateDecisionResponse(missingProvenance), /confidence/i);

  const outOfScale = structuredClone(evaluation.response);
  outOfScale.answers[5].value = 9;
  assert.throws(() => validateDecisionResponse(outOfScale), /integer between 1 and 5/i);

  const mistypedBoolean = structuredClone(evaluation.response);
  mistypedBoolean.answers[0].value = 'true';
  assert.throws(() => validateDecisionResponse(mistypedBoolean), /must be a boolean/i);

  const mistypedChoice = structuredClone(evaluation.response);
  mistypedChoice.answers[0] = { id: 'goal_satisfied', value: 'yes', kind: 'boolean', confidence: { level: 'low', provenance: 'operator' } };
  assert.throws(() => validateDecisionResponse(mistypedChoice), /must be a boolean/i);

  const unknownBackend = structuredClone(evaluation.response);
  unknownBackend.backend = { id: 'guess', version: 1 };
  assert.throws(() => validateDecisionResponse(unknownBackend), /backend.id/i);

  const incompleteAnswers = structuredClone(evaluation.response);
  incompleteAnswers.answers.pop();
  assert.throws(() => validateDecisionResponse(incompleteAnswers), /must cover exactly the 7 verify questions/i);
});

test('resolvePlanReady requires every plan question and treats a blocking unknown as not ready', () => {
  assert.equal(resolvePlanReady(planAnswers()), true);
  assert.equal(resolvePlanReady(planAnswers({ blocking_unknowns_remain: true })), false);
  assert.equal(resolvePlanReady(planAnswers({ acceptance_defined: false })), false);
  assert.equal(resolvePlanReady(planAnswers({ dependencies_resolved: false })), false);
  assert.throws(() => resolvePlanReady({ requirements_covered: true }), /requires a boolean/i);
});

test('resolveActionGate only escalates to policy and never authorises', () => {
  const clear = {
    destructive: false,
    irreversible: false,
    privileged: false,
    high_impact: false,
    external: false,
    security_sensitive: false
  };
  assert.equal(resolveActionGate(clear), false);
  for (const id of Object.keys(clear)) {
    assert.equal(resolveActionGate({ ...clear, [id]: true }), true, id);
  }
  assert.throws(() => resolveActionGate({ destructive: 'yes' }), /requires a boolean/i);
});

test('resolveNextState covers every outcome and never escalates intelligence on infrastructure failure', () => {
  assert.equal(resolveNextState(verifyAnswers()), 'done');
  assert.equal(resolveNextState(verifyAnswers({ verification_sufficient: false })), 'continue');
  assert.equal(resolveNextState(verifyAnswers({ more_work_required: true })), 'continue');
  assert.equal(resolveNextState(verifyAnswers({ regression_risk: 4 })), 'continue');
  assert.equal(resolveNextState(verifyAnswers({ goal_satisfied: false, more_work_required: true })), 'repair');
  assert.equal(resolveNextState(verifyAnswers({ semantic_correctness: false })), 'repair');
  assert.equal(resolveNextState(verifyAnswers({ goal_satisfied: false })), 'replan');
  assert.equal(resolveNextState(verifyAnswers({ scope_preserved: false })), 'replan');
  assert.equal(resolveNextState(verifyAnswers({ requirements_covered: false })), 'replan');

  const failedChecks = { checks: [{ id: 'tests', status: 'fail' }] };
  assert.deepEqual(failedDeterministicChecks(failedChecks), ['tests']);
  assert.equal(resolveNextState(verifyAnswers(), { deterministic: failedChecks }), 'repair');
  assert.equal(
    resolveNextState(verifyAnswers({ scope_preserved: false }), { deterministic: failedChecks }),
    'replan'
  );

  // An infrastructure failure means the mechanism failed, so the response is
  // retry, never a judgement that the work is done.
  assert.equal(resolveNextState(verifyAnswers(), { failure: 'timeout' }), 'retry');
  assert.equal(resolveNextState(verifyAnswers(), { failure: 'provider_unavailable' }), 'retry');
  assert.equal(resolveNextState(verifyAnswers(), { failure: '429 rate limit' }), 'retry');
  assert.notEqual(resolveNextState(verifyAnswers(), { failure: 'timeout' }), 'done');
  // A check that never reported leaves verification unproven: retry the check.
  const unrun = { checks: [{ id: 'provider_probe', status: 'unknown' }] };
  assert.deepEqual(unresolvedDeterministicChecks(unrun), ['provider_probe']);
  assert.deepEqual(unresolvedDeterministicChecks({ checks: [{ id: 'tests', status: 'pass' }] }), []);
  assert.equal(resolveNextState(verifyAnswers(), { deterministic: unrun }), 'continue');
  assert.equal(resolveNextState(verifyAnswers(), { failure: 'wrong_architecture' }), 'replan');
  assert.equal(resolveNextState(verifyAnswers(), { failure: 'unresolved_ambiguity' }), 'escalate');
  assert.equal(resolveNextState(verifyAnswers(), { failure: 'repeated_failed_repair' }), 'escalate');
});

test('resolveReleaseState never returns allowed from readiness alone', () => {
  assert.equal(resolveReleaseState({ readiness: 'not_ready', authorization: 'not_authorized' }), 'not_ready');
  assert.equal(resolveReleaseState({ readiness: 'not_ready', authorization: 'allowed' }), 'not_ready');
  assert.equal(resolveReleaseState({ readiness: 'ready', authorization: 'not_authorized' }), 'ready');
  assert.equal(resolveReleaseState({ readiness: 'ready', authorization: 'allowed' }), 'allowed');
  assert.throws(() => resolveReleaseState({ readiness: 'maybe', authorization: 'allowed' }), /readiness/i);
  assert.throws(() => resolveReleaseState({ readiness: 'ready' }), /authorization/i);
});

test('resolveComposites and transitionRecommendationOf dispatch per bundle', () => {
  // INTAKE -> PLAN is representable: the composite reads plan_needed.
  assert.equal(resolveIntakeRoute({ plan_needed: true }), 'plan');
  assert.equal(resolveIntakeRoute({ plan_needed: false }), 'continue');
  assert.deepEqual(resolveComposites('intake', {
    goal_clarity: 5,
    plan_needed: false,
    tracked_state_value: false,
    risk_level: 'low',
    intelligence_demand: 'low',
    parallel_benefit: false
  }), { intake_route: 'continue' });
  assert.deepEqual(resolveComposites('intake', {
    goal_clarity: 2,
    plan_needed: true,
    tracked_state_value: true,
    risk_level: 'high',
    intelligence_demand: 'max',
    parallel_benefit: true
  }), { intake_route: 'plan' });
  assert.deepEqual(resolveComposites('plan', planAnswers()), { plan_ready: true });
  assert.deepEqual(resolveComposites('verify', verifyAnswers()), { next_state: 'done' });
  assert.deepEqual(resolveComposites('release', { readiness: 'ready', authorization: 'allowed' }), { release_state: 'allowed' });

  assert.equal(transitionRecommendationOf('verify', { next_state: 'repair' }), 'repair');
  assert.equal(transitionRecommendationOf('plan', { plan_ready: false }), 'replan');
  assert.equal(transitionRecommendationOf('plan', { plan_ready: true }), 'continue');
  assert.equal(transitionRecommendationOf('action', { action_requires_policy_gate: true }), 'escalate');
  assert.equal(transitionRecommendationOf('action', { action_requires_policy_gate: false }), 'continue');
  assert.equal(transitionRecommendationOf('release', { release_state: 'ready' }), 'continue');
  assert.equal(transitionRecommendationOf('release', { release_state: 'allowed' }), 'done');
  assert.equal(transitionRecommendationOf('intake', { intake_route: 'plan' }), 'plan');
  assert.equal(transitionRecommendationOf('intake', { intake_route: 'continue' }), 'continue');
  assert.equal(transitionRecommendationOf('intake', {}), 'continue');
  assert.throws(() => transitionRecommendationOf('nope', {}), /Unknown decision bundle/i);
});

test('evaluateDecision answers from operator input or deterministic evidence and reports what is unevaluable', () => {
  const operator = evaluateDecision(requestFor('verify'), { operator: verifyAnswers() });
  assert.equal(operator.response.backend.id, 'operator');
  assert.equal(operator.composites.next_state, 'done');
  assert.equal(operator.transitionRecommendation, 'done');
  assert.deepEqual(operator.unanswered, []);

  const deterministic = evaluateDecision(requestFor('verify', {
    evidence: { deterministic: { answers: verifyAnswers() }, semanticContext: null }
  }));
  assert.equal(deterministic.response.backend.id, 'deterministic');
  assert.equal(deterministic.response.answers[0].confidence.provenance, 'deterministic');
  assert.equal(deterministic.transitionRecommendation, 'done');

  const unevaluable = evaluateDecision(requestFor('verify'));
  assert.equal(unevaluable.response, null);
  assert.equal(unevaluable.composites, null);
  assert.equal(unevaluable.transitionRecommendation, null);
  assert.equal(unevaluable.unanswered.length, 7);

  assert.throws(
    () => evaluateDecision(requestFor('verify', { requirement: { mode: 'execute', intensity: 'high' } }), { operator: verifyAnswers(), backendId: 'external' }),
    /out of scope for this milestone/i
  );
  assert.throws(
    () => evaluateDecision(requestFor('verify'), { operator: verifyAnswers(), backendId: 'guess' }),
    /Unknown decision backend/i
  );
});

test('decision trace round-trips locally and never accepts chain-of-thought', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'decision-trace-'));
  try {
    const record = {
      ts: '2026-09-19T12:00:00.000Z',
      taskId: 'decision-test',
      phase: 'verify',
      bundle: 'verify',
      bundleVersion: DECISION_BUNDLE_VERSION,
      questionId: 'next_state',
      answer: 'repair',
      confidenceProvenance: 'model',
      backendId: 'host',
      latencyMs: 12,
      transitionRecommendation: 'repair',
      override: null,
      eventualOutcome: 'unknown'
    };
    assert.deepEqual([...DECISION_TRACE_FIELDS].sort(), Object.keys(record).sort());
    assert.ok(FORBIDDEN_TRACE_FIELDS.includes('reasoning'));
    const appended = await appendDecisionTrace(record, { directory });
    assert.equal(appended.path, path.join(directory, 'decision-test.jsonl'));
    assert.ok(!appended.path.includes('planning'));
    await appendDecisionTrace({ ...record, questionId: 'goal_satisfied', answer: true, latencyMs: null }, { directory });
    const records = await readDecisionTrace({ directory, taskId: 'decision-test' });
    assert.equal(records.length, 2);
    assert.equal(records[0].questionId, 'next_state');
    assert.equal(records[1].answer, true);
    assert.deepEqual(await readDecisionTrace({ directory, taskId: 'absent' }), []);

    assert.throws(
      () => decisionTracePath(directory, 'a/b'),
      /safe single path segment/i
    );
    await assert.rejects(
      () => appendDecisionTrace({ ...record, reasoning: 'because' }, { directory }),
      /must not contain reasoning/i
    );
    await assert.rejects(
      () => appendDecisionTrace({ ...record, ts: 'not-a-date' }, { directory }),
      /ISO-8601/i
    );
    await assert.rejects(
      () => appendDecisionTrace({ ...record, questionId: 'invented' }, { directory }),
      /question or composite/i
    );
    const missingField = { ...record };
    delete missingField.backendId;
    await assert.rejects(
      () => appendDecisionTrace(missingField, { directory }),
      /exact field set/i
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('classifyFailure separates infrastructure from cognitive failure and never escalates on infrastructure', () => {
  const infrastructure = {
    quota_exceeded: '429 rate limit',
    timeout: 'ETIMEDOUT',
    provider_unavailable: 'provider unavailable',
    transport_incompatible: 'transport incompatible payload',
    unsupported_tool: 'unsupported_tool',
    sandbox_denied: 'sandbox denial',
    context_limit: 'context window exceeded',
    provider_mismatch: 'provider mismatch'
  };
  for (const [code, input] of Object.entries(infrastructure)) {
    const classified = classifyFailure(input);
    assert.equal(classified.class, 'infrastructure', input);
    assert.equal(classified.retryable, true, input);
    assert.equal(classified.suggestedTransition, 'retry', input);
    assert.notEqual(classified.suggestedTransition, 'escalate');
    assert.notEqual(classified.suggestedTransition, 'think_escalation');
    assert.equal(classifyFailure(code).code, code);
  }
  assert.equal(classifyFailure(Object.assign(new Error('boom'), { status: 429 })).code, 'quota_exceeded');

  assert.equal(classifyFailure('incomplete_plan').suggestedTransition, 'replan');
  assert.equal(classifyFailure('unresolved_ambiguity').suggestedTransition, 'think_escalation');
  assert.equal(classifyFailure('repeated_failed_repair').suggestedTransition, 'escalate');
  assert.equal(classifyFailure('verification contradicts implementation').code, 'verification_contradiction');
  assert.equal(classifyFailure('wrong_architecture').class, 'cognitive');
  assert.equal(classifyFailure('wrong_architecture').retryable, false);
  assert.throws(() => classifyFailure('something entirely unknown'), /Unknown failure/i);
  assert.throws(() => classifyFailure(42), /requires an error, a code/i);
});

test('shadow fixtures cover every evaluation row and replay deterministically', async () => {
  const cases = await loadShadowCases();
  assert.equal(cases.length, 27);
  assert.equal(validateShadowCoverage(cases), true);
  assert.equal(Object.keys(SHADOW_ROWS).length, 27);

  const first = await evaluateDecisionShadow();
  const second = await evaluateDecisionShadow();
  assert.equal(serializeShadowReport(first), serializeShadowReport(second));
  const committed = await readFile(path.join(DEFAULT_SHADOW_FIXTURE_ROOT, 'observed-shadow-result.json'), 'utf8');
  assert.equal(committed, serializeShadowReport(first));
  assert.equal(first.runner, SHADOW_RUNNER_ID);
  assert.equal(first.mode, 'shadow');
  assert.equal(first.summary.cases, 27);
  assert.equal(first.summary.unevaluable, 1);
  assert.ok(first.summary.disagreements > 0);

  const byId = new Map(first.cases.map((entry) => [entry.id, entry]));
  const expectation = {
    'plan-ready': { shadowTransition: 'continue', shadowComposites: { plan_ready: true } },
    'plan-incomplete-requirements': { shadowTransition: 'replan', shadowComposites: { plan_ready: false } },
    'verify-goal-satisfied-sufficient-evidence': { shadowTransition: 'done', shadowComposites: { next_state: 'done' } },
    'verify-tests-pass-goal-not-satisfied': { shadowTransition: 'repair', shadowComposites: { next_state: 'repair' } },
    'verify-deterministic-failure-blocks-done': { shadowTransition: 'repair', shadowComposites: { next_state: 'repair' } },
    'verify-architecture-requires-replan': { shadowTransition: 'replan', shadowComposites: { next_state: 'replan' } },
    'night-technical-provider-failure': { shadowTransition: null, unmanned: ['verification_sufficient'] },
    'night-blocker-requiring-human': { shadowTransition: 'escalate', shadowComposites: { next_state: 'escalate' } },
    'night-unexpected-scope-expansion': { shadowTransition: 'replan', shadowComposites: { next_state: 'replan' } },
    'office-deterministic-pass-semantic-fail': { shadowTransition: 'repair', shadowComposites: { next_state: 'repair' } },
    'office-semantic-pass-deterministic-fail': { shadowTransition: 'repair', shadowComposites: { next_state: 'repair' } },
    'action-destructive-write': { shadowTransition: 'escalate', shadowComposites: { action_requires_policy_gate: true } },
    'release-ready-not-authorized': { shadowTransition: 'continue', shadowComposites: { release_state: 'ready' } },
    'release-ready-authorized': { shadowTransition: 'done', shadowComposites: { release_state: 'allowed' } },
    'release-not-ready': { shadowTransition: 'continue', shadowComposites: { release_state: 'not_ready' } }
  };
  for (const [id, expected] of Object.entries(expectation)) {
    const entry = byId.get(id);
    assert.ok(entry, id);
    assert.equal(entry.shadowTransition, expected.shadowTransition, id);
    if (expected.shadowComposites) assert.deepEqual(entry.shadowComposites, expected.shadowComposites, id);
    if (expected.unmanned) assert.deepEqual(entry.unanswered, expected.unmanned, id);
  }

  const infrastructure = byId.get('verify-infrastructure-failure');
  assert.equal(infrastructure.failureClass, 'infrastructure');
  assert.equal(infrastructure.failureTransition, 'retry');
  // The failure is now consumed, so the gate's own transition agrees with the
  // taxonomy instead of judging the work done while the mechanism failed.
  assert.equal(infrastructure.shadowTransition, 'retry');

  const withoutDisclaimer = structuredClone(first);
  withoutDisclaimer.disclaimer = [];
  assert.throws(() => validateShadowReport(withoutDisclaimer), /disclaimer/i);
  const wrongRunner = { ...structuredClone(first), runner: 'other' };
  assert.throws(() => validateShadowReport(wrongRunner), /runner/i);

  assert.deepEqual(parseCliArgs(['--fixture-root', '/tmp/f', '--out', '/tmp/o.json']), { fixtureRoot: '/tmp/f', outputPath: '/tmp/o.json' });
  assert.throws(() => parseCliArgs(['--nope', 'x']), /Unknown argument/i);
  assert.throws(() => parseCliArgs(['--out']), /requires a non-empty path/i);
  assert.ok(SHADOW_DISCLAIMER[0].includes('deterministic shadow evidence, not a matched Host/model benchmark'));
});


test('S1 prioritizes known failures and scope problems over unknown checks', () => {
  const failAndUnknown = {
    checks: [
      { id: 'tests', status: 'fail', reason: 'exit-nonzero' },
      { id: 'build', status: 'unknown', reason: 'not-run' }
    ]
  };
  assert.deepEqual(failedDeterministicChecks(failAndUnknown), ['tests']);
  assert.equal(resolveNextState(verifyAnswers(), { deterministic: failAndUnknown }), 'repair');
  assert.equal(
    resolveNextState(verifyAnswers({ scope_preserved: false }), { deterministic: failAndUnknown }),
    'replan'
  );
  const timeout = { checks: [{ id: 'tests', status: 'unknown', reason: 'timed-out' }] };
  assert.deepEqual(transientDeterministicChecks(timeout), ['tests']);
  assert.equal(resolveNextState(verifyAnswers(), { deterministic: timeout }), 'retry');
  assert.equal(
    resolveNextState(verifyAnswers({ scope_preserved: false }), { deterministic: timeout }),
    'replan'
  );
});

test('S1 does not turn not-run or unreadable evidence into retry or done', () => {
  for (const reason of ['not-run', 'unreadable', 'unknown-reason']) {
    const deterministic = { checks: [{ id: 'tests', status: 'unknown', reason }] };
    assert.deepEqual(transientDeterministicChecks(deterministic), []);
    assert.equal(resolveNextState(verifyAnswers(), { deterministic }), 'continue', reason);
  }
  assert.equal(resolveNextState(verifyAnswers({ verification_sufficient: false }), { deterministic: { checks: [] } }), 'continue');
});

test('S1 rejects duplicate deterministic checks before resolution', () => {
  assert.throws(
    () => validateDecisionRequest(requestFor('verify', {
      evidence: { deterministic: { checks: [
        { id: 'tests', status: 'pass' },
        { id: 'tests', status: 'fail' }
      ] }, semanticContext: null }
    })),
    /Duplicate deterministic check id/
  );
});

test('S1 known failure and broken scope dominate a separate infrastructure failure', () => {
  const deterministic = {checks: [{id: 'tests', status: 'fail'}]};
  assert.equal(resolveNextState(verifyAnswers(), {deterministic, failure:'timeout'}), 'repair');
  assert.equal(resolveNextState(verifyAnswers({scope_preserved:false}), {failure:'timeout'}), 'replan');
});

test('S1 an incomplete semantic verification still retries a measured timeout', () => {
  assert.equal(resolveNextState(verifyAnswers({verification_sufficient:false}), {deterministic:{checks:[{id:'tests',status:'unknown',reason:'timed-out'}]}}), 'retry');
});
