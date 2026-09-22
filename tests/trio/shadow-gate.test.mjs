import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SHADOW_CURRENT_BEHAVIOURS,
  SHADOW_ITEM_STATUSES,
  SHADOW_QUESTIONS,
  SHADOW_VERSION,
  CHECKPOINT_BEHAVIOURS,
  checkpointBehaviourOf,
  GATE_ACTIVATION_STATES,
  GATE_BENEFIT_METRICS,
  GATE_IDS,
  activeGates,
  gateActivationDefaults,
  recordCheckpointShadow,
  resolveGateActivation,
  resolveGateActivations,
  recordShadowDecision,
  shadowAgreement,
  shadowAnswerOf,
  shadowQuestionOf,
  shadowRequestFor,
  summarizeShadow
} from '../../harness/trio/core/shadow.mjs';

import { readDecisionTrace } from '../../harness/trio/core/decision.mjs';

import { renderCheckpoint } from '../../harness/core/skills/linear-work-control/lib/linear-work-control.mjs';

const subject = { taskId: 'shadow-test', phase: 'verify', capability: 'dev' };
const requirement = { mode: 'think', intensity: 'high' };

function planOperator(overrides = {}) {
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

function verifyOperator(overrides = {}) {
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

function intakeOperator(overrides = {}) {
  return {
    goal_clarity: 4,
    plan_needed: true,
    tracked_state_value: true,
    risk_level: 'medium',
    intelligence_demand: 'high',
    parallel_benefit: false,
    ...overrides
  };
}

test('the priority shadow questions are declared and read frozen bundle targets', () => {
  assert.deepEqual(Object.keys(SHADOW_QUESTIONS), [
    'plan_needed',
    'plan_ready',
    'execution_ready',
    'verification_sufficient',
    'next_action',
    'goal_complete'
  ]);
  for (const [id, declared] of Object.entries(SHADOW_QUESTIONS)) {
    assert.equal(shadowQuestionOf(id), declared);
    assert.ok(['boolean', 'choice'].includes(declared.kind));
  }
  assert.throws(() => shadowQuestionOf('risk_score'), /Unknown shadow question/);
});

test('a request carries the whole frozen bundle the question belongs to', () => {
  const request = shadowRequestFor('plan_ready', { subject, requirement });
  assert.equal(request.bundle, 'plan');
  assert.equal(request.questions.length, 7);
  const intake = shadowRequestFor('plan_needed', { subject, requirement });
  assert.equal(intake.bundle, 'intake');
  assert.equal(intake.questions.length, 6);
});

test('a shadow gate agrees and disagrees against the existing behaviour', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-agree-'));
  try {
    const ready = await recordShadowDecision({
      questionId: 'plan_ready',
      request: shadowRequestFor('plan_ready', { subject, requirement }),
      operator: planOperator(),
      currentBehaviour: 'proceed',
      phase: 'plan',
      directory,
      timestamp: '2026-09-19T00:00:00.000Z'
    });
    assert.equal(ready.recommendation, true);
    assert.equal(ready.agreement, true);
    assert.equal(ready.unevaluable, false);
    assert.equal(ready.tracePath !== null, true);

    const disagreed = await recordShadowDecision({
      questionId: 'plan_ready',
      request: shadowRequestFor('plan_ready', { subject, requirement }),
      operator: planOperator({ acceptance_defined: false }),
      currentBehaviour: 'proceed',
      phase: 'plan',
      directory,
      timestamp: '2026-09-19T00:00:01.000Z'
    });
    assert.equal(disagreed.recommendation, false);
    assert.equal(disagreed.agreement, false);

    const records = await readDecisionTrace({ directory, taskId: 'shadow-test' });
    assert.equal(records.length, 2);
    // Records are read in write order: agreement first, then the disagreement.
    // A disagreement records the override; agreement records none.
    assert.equal(records[0].override, null);
    assert.equal(records[1].override.provenance, 'current-behaviour');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a shadow run where the gate disagrees completes normally', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-complete-'));
  try {
    const outcome = await recordShadowDecision({
      questionId: 'goal_complete',
      request: shadowRequestFor('goal_complete', { subject, requirement }),
      operator: verifyOperator({ more_work_required: true }),
      currentBehaviour: 'done',
      phase: 'verify',
      directory
    });
    // The gate disagreed with the existing DONE, and nothing threw.
    assert.equal(outcome.agreement, false);
    assert.equal(outcome.recommendation, 'continue');
    assert.equal(outcome.unevaluable, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a gate failure never blocks the existing path', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-fail-'));
  try {
    const failed = await recordShadowDecision({
      questionId: 'plan_ready',
      request: { not: 'a request' },
      operator: planOperator(),
      currentBehaviour: 'proceed',
      phase: 'plan',
      directory
    });
    assert.equal(failed.unevaluable, true);
    assert.equal(failed.reason, 'gate-failed');
    assert.equal(failed.recommendation, null);

    const unanswered = await recordShadowDecision({
      questionId: 'plan_ready',
      request: shadowRequestFor('plan_ready', { subject, requirement }),
      operator: { requirements_covered: true },
      currentBehaviour: 'proceed',
      phase: 'plan',
      directory
    });
    assert.equal(unanswered.unevaluable, true);
    assert.equal(unanswered.reason, 'unanswered');

    const unwritable = await recordShadowDecision({
      questionId: 'plan_ready',
      request: shadowRequestFor('plan_ready', { subject, requirement }),
      operator: planOperator(),
      currentBehaviour: 'proceed',
      phase: 'plan',
      directory: '/dev/null/not-a-directory'
    });
    assert.equal(unwritable.unevaluable, false);
    assert.equal(unwritable.reason, 'trace-unwritable');
    assert.equal(unwritable.agreement, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an infrastructure failure is recorded and never escalates', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-infra-'));
  try {
    const outcome = await recordShadowDecision({
      questionId: 'next_action',
      request: shadowRequestFor('next_action', { subject, requirement }),
      operator: verifyOperator(),
      currentBehaviour: 'proceed',
      failure: { code: 'rate_limit' },
      phase: 'verify',
      directory
    });
    // The deterministic answers still decide; an infrastructure failure does not
    // raise intelligence or force escalation, but it does stop the gate from
    // judging the work done: the mechanism failed, so the response is retry.
    assert.notEqual(outcome.recommendation, 'escalate');
    assert.equal(outcome.recommendation, 'retry');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('agreement is null when the two cannot be compared', () => {
  assert.equal(shadowAgreement('plan_ready', true, 'unknown'), null);
  assert.equal(shadowAgreement('plan_ready', null, 'proceed'), null);
  assert.equal(shadowAgreement('next_action', 'repair', 'repair'), true);
  assert.equal(shadowAgreement('next_action', 'repair', 'done'), false);
  // A behaviour outside the declared set is rejected rather than compared.
  assert.throws(() => shadowAgreement('plan_ready', true, 'merge'), /Unknown shadow current behaviour/);
  for (const behaviour of SHADOW_CURRENT_BEHAVIOURS) {
    assert.doesNotThrow(() => shadowAgreement('plan_ready', true, behaviour));
  }
});

test('shadow answers are read from composites and answers, not re-derived', () => {
  const evaluation = {
    response: { answers: [{ id: 'goal_satisfied', value: false }] },
    composites: { next_state: 'done' }
  };
  assert.equal(shadowAnswerOf('goal_complete', evaluation), true);
  assert.equal(shadowAnswerOf('next_action', evaluation), 'done');
  assert.equal(shadowAnswerOf('plan_ready', { response: null, composites: null }), null);
});

test('the summary counts disagreements without judging a gate', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-summary-'));
  try {
    await recordShadowDecision({
      questionId: 'plan_ready',
      request: shadowRequestFor('plan_ready', { subject, requirement }),
      operator: planOperator(),
      currentBehaviour: 'proceed', phase: 'plan', directory, timestamp: '2026-09-19T00:00:00.000Z'
    });
    await recordShadowDecision({
      questionId: 'plan_ready',
      request: shadowRequestFor('plan_ready', { subject, requirement }),
      operator: planOperator({ solution_coherent: false }),
      currentBehaviour: 'proceed', phase: 'plan', directory, timestamp: '2026-09-19T00:00:01.000Z'
    });
    const records = await readDecisionTrace({ directory, taskId: 'shadow-test' });
    const summary = summarizeShadow(records);
    assert.equal(summary.total, 2);
    assert.equal(summary.agreements, 1);
    assert.equal(summary.disagreements, 1);
    assert.equal(summary.byQuestion.plan_ready.agreements, 1);
    assert.equal(summary.byQuestion.plan_ready.disagreements, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// --- J02 / spec S2: observation isolation, identity and three-state statistics ---

function validObservation(questionId, operatorFn = planOperator, overrides = {}) {
  return {
    questionId,
    request: shadowRequestFor(questionId, { subject, requirement }),
    operator: operatorFn(),
    ...overrides
  };
}

test('spec S2: an invalid observation is isolated and the later observations still run', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-isolate-'));
  try {
    const checkpoint = checkpointFixture();
    const before = renderCheckpoint(checkpoint);
    const attached = await recordCheckpointShadow({
      checkpoint,
      observations: [
        null,
        validObservation('plan_ready'),
        { questionId: 'invented_question', request: {}, operator: planOperator() }
      ],
      directory
    });
    assert.equal(attached.results.length, 3);
    assert.equal(attached.results[0].status, 'unevaluable');
    assert.equal(attached.results[0].reason, 'invalid-observation');
    assert.equal(attached.results[1].status, 'evaluated');
    assert.equal(attached.results[1].agreement, true);
    assert.equal(attached.results[2].status, 'unevaluable');
    assert.equal(attached.results[2].reason, 'unknown-question');
    assert.equal(attached.summary.total, 3);
    assert.equal(attached.summary.agreements, 1);
    assert.equal(attached.summary.unevaluable, 2);
    assert.equal(renderCheckpoint(attached.checkpoint), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('spec S2: a bundle mismatch and a task mismatch are rejected without writing another task trace', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-mismatch-'));
  try {
    const attached = await recordCheckpointShadow({
      checkpoint: checkpointFixture(),
      observations: [
        validObservation('plan_ready'),
        { questionId: 'plan_ready', request: { ...shadowRequestFor('plan_ready', { subject, requirement }), bundle: 'verify' }, operator: planOperator() },
        { questionId: 'plan_ready', request: shadowRequestFor('plan_ready', { subject: { ...subject, taskId: 'another-task' }, requirement }), operator: planOperator() }
      ],
      directory
    });
    assert.equal(attached.results[0].agreement, true);
    assert.equal(attached.results[1].reason, 'bundle-mismatch');
    assert.equal(attached.results[1].status, 'unevaluable');
    assert.equal(attached.results[2].reason, 'task-mismatch');
    assert.deepEqual(await readDecisionTrace({ directory, taskId: 'another-task' }), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('spec S2: an unmapped checkpoint state adds an incomparable item, never an agreement', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-unknown-state-'));
  try {
    const attached = await recordCheckpointShadow({
      checkpoint: checkpointFixture({ state: 'not-a-state' }),
      observations: [validObservation('plan_ready')],
      directory
    });
    assert.equal(attached.currentBehaviour, 'unknown');
    assert.equal(attached.results[0].agreement, null);
    assert.equal(attached.results[0].status, 'incomparable');
    assert.equal(attached.summary.agreements, 0);
    assert.equal(attached.summary.incomparable, 1);
    assert.equal(attached.summary.total, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('spec S2: a missing answer counts as unevaluable and stays inside total', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-refused-'));
  try {
    const attached = await recordCheckpointShadow({
      checkpoint: checkpointFixture(),
      observations: [
        { questionId: 'plan_ready', request: shadowRequestFor('plan_ready', { subject, requirement }), operator: { requirements_covered: true } },
        validObservation('plan_ready')
      ],
      directory
    });
    assert.equal(attached.results[0].status, 'unevaluable');
    assert.equal(attached.results[0].reason, 'unanswered');
    assert.equal(attached.summary.total, 2);
    assert.equal(attached.summary.unevaluable, 1);
    assert.equal(attached.summary.agreements, 1);
    assert.equal(
      attached.summary.total,
      attached.summary.agreements + attached.summary.disagreements + attached.summary.unevaluable + attached.summary.incomparable
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('spec S2: a trace write failure is counted apart and never blocks the renderer', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-tracefail-'));
  try {
    const checkpoint = checkpointFixture();
    const before = renderCheckpoint(checkpoint);
    const attached = await recordCheckpointShadow({
      checkpoint,
      observations: [validObservation('plan_ready')],
      directory: path.join(directory, 'missing', '\u0000bad')
    });
    assert.equal(attached.results[0].traceFailed, true);
    assert.equal(attached.results[0].persisted, false);
    assert.equal(attached.results[0].status, 'evaluated');
    assert.equal(attached.summary.traceFailures, 1);
    assert.equal(renderCheckpoint(attached.checkpoint), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('spec S2 / F27: the alias map is local per question and never global', () => {
  // intake false and plan true accept continue/proceed/execute.
  assert.equal(shadowAgreement('plan_needed', false, 'continue'), true);
  assert.equal(shadowAgreement('plan_needed', false, 'proceed'), true);
  assert.equal(shadowAgreement('plan_ready', true, 'continue'), true);
  assert.equal(shadowAgreement('execution_ready', true, 'execute'), true);
  // goal_complete false accepts retry.
  assert.equal(shadowAgreement('goal_complete', false, 'retry'), true);
  // The same token is not globally equivalent to execution: for plan_ready it is
  // a disagreement with the recorded replan, for intake it is an agreement.
  assert.equal(shadowAgreement('plan_ready', false, 'continue'), false);
  assert.equal(shadowAgreement('plan_needed', false, 'continue'), true);
  assert.equal(shadowAgreement('verification_sufficient', false, 'done'), false);
});

test('spec S2: identity is preserved per shadow question in results and summary', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-identity-'));
  try {
    const attached = await recordCheckpointShadow({
      checkpoint: checkpointFixture(),
      observations: [validObservation('plan_ready'), validObservation('execution_ready')],
      directory
    });
    assert.deepEqual(attached.results.map((entry) => entry.questionId), ['plan_ready', 'execution_ready']);
    assert.deepEqual(Object.keys(attached.summary.byQuestion).sort(), ['execution_ready', 'plan_ready']);
    const records = await readDecisionTrace({ directory, taskId: 'shadow-test' });
    assert.deepEqual(records.map((entry) => entry.shadowQuestionId), ['plan_ready', 'execution_ready']);
    assert.deepEqual(records.map((entry) => entry.agreement), [true, true]);
    for (const record of records) assert.equal(record.schemaVersion, SHADOW_VERSION);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('spec S2: a legacy v1 record without an explicit agreement is unknown, never an agreement', () => {
  const summary = summarizeShadow([
    { questionId: 'plan_ready', override: null },
    { questionId: 'plan_ready', override: { provenance: 'current-behaviour', reason: 'x' }, agreement: false }
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.agreements, 0);
  assert.equal(summary.disagreements, 1);
  assert.equal(summary.unevaluable, 1);
  assert.deepEqual([...SHADOW_ITEM_STATUSES], ['evaluated', 'unevaluable', 'incomparable']);
});

test('shadow records never carry chain-of-thought', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-cot-'));
  try {
    await recordShadowDecision({
      questionId: 'plan_needed',
      request: shadowRequestFor('plan_needed', { subject, requirement }),
      operator: intakeOperator(),
      currentBehaviour: 'plan', phase: 'intake', directory
    });
    const records = await readDecisionTrace({ directory, taskId: 'shadow-test' });
    for (const record of records) {
      for (const forbidden of ['reasoning', 'thoughts', 'chainOfThought', 'chain_of_thought', 'prompt', 'transcript']) {
        assert.equal(Object.hasOwn(record, forbidden), false, `trace must not carry ${forbidden}`);
      }
    }
    assert.equal(records[0].questionId, 'plan_needed');
    assert.equal(records[0].answer, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the shadow module stays provider-neutral and versioned', async () => {
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../../harness/trio/core/shadow.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /deepseek|gpt-|luna|sol\b|terra|opencode|claude/i);
  assert.equal(SHADOW_VERSION, 2);
});

test('every gate defaults to shadow when no activation decision exists', () => {
  assert.deepEqual(Object.keys(gateActivationDefaults()), [...GATE_IDS]);
  assert.deepEqual([...new Set(Object.values(gateActivationDefaults()))], ['shadow']);
  const resolved = resolveGateActivations();
  for (const id of GATE_IDS) {
    assert.equal(resolved[id].state, 'shadow');
    assert.equal(resolved[id].reason, 'no-activation-decision');
  }
  assert.deepEqual([...activeGates()], []);
});

test('a gate cannot be activated without a measured benefit, rollback and authorization', () => {
  const complete = {
    state: 'active',
    benefit: 'false_done_reduced',
    rollback: 'flip the record back to shadow',
    evidence: 'tests/fixtures/decision/observed-shadow-result.json',
    authorizedBy: 'chief'
  };
  assert.equal(resolveGateActivation('goal_complete', complete).state, 'active');
  assert.equal(resolveGateActivation('goal_complete', complete).reason, 'recorded-activation');
  // Each missing requirement leaves the gate in shadow with a stated reason.
  const missing = {
    'no-measured-benefit': { ...complete, benefit: 'cleaner-architecture' },
    'no-measured-benefit-absent': { ...complete, benefit: undefined },
    'no-rollback-condition': { ...complete, rollback: '  ' },
    'no-evidence': { ...complete, evidence: '' },
    'not-authorized': { ...complete, authorizedBy: 'agent' },
    'unknown-state': { ...complete, state: 'enabled' }
  };
  for (const [reason, record] of Object.entries(missing)) {
    const resolved = resolveGateActivation('goal_complete', record);
    assert.equal(resolved.state, 'shadow', `${reason} must stay in shadow`);
    assert.equal(resolved.reason, reason.replace('-absent', ''));
  }
  assert.deepEqual([...activeGates({ goal_complete: complete })], ['goal_complete']);
  for (const metric of GATE_BENEFIT_METRICS) {
    assert.equal(resolveGateActivation('plan_ready', { ...complete, benefit: metric }).state, 'active');
  }
  assert.deepEqual([...GATE_ACTIVATION_STATES], ['shadow', 'active']);
});

test('an unknown gate id is rejected instead of defaulting to shadow', () => {
  assert.throws(() => resolveGateActivation('risk_score'), /Unknown gate/);
  assert.throws(() => resolveGateActivations({ risk_score: { state: 'active' } }), /Unknown gate/);
});

test('the shipped activation decision keeps every gate in shadow', () => {
  // No activation record is shipped, so the runtime default is shadow for all.
  assert.deepEqual([...activeGates()], []);
  assert.deepEqual(
    Object.values(resolveGateActivations()).map((entry) => entry.state),
    GATE_IDS.map(() => 'shadow')
  );
});

function checkpointFixture(overrides = {}) {
  return {
    taskId: 'shadow-test',
    title: 'Shadow checkpoint',
    state: 'running',
    progress: { percent: 50, note: 'halfway' },
    completed: ['one slice'],
    now: ['another slice'],
    next: ['a third slice'],
    humanAction: { required: false },
    validation: { summary: 'suite passes', command: 'npm run verify:trio' },
    timestamp: '2026-09-19 09:00:00 UTC+8',
    ...overrides
  };
}

test('checkpoint states map to the behaviour the existing path is taking', () => {
  assert.equal(checkpointBehaviourOf('running'), 'execute');
  assert.equal(checkpointBehaviourOf('ready'), 'proceed');
  assert.equal(checkpointBehaviourOf('review'), 'done');
  assert.equal(checkpointBehaviourOf('blocked'), 'halt');
  // An unmapped or malformed state is unknown, which yields a null agreement
  // rather than a fabricated disagreement.
  assert.equal(checkpointBehaviourOf('unmapped-state'), 'unknown');
  assert.equal(checkpointBehaviourOf(undefined), 'unknown');
  for (const behaviour of Object.values(CHECKPOINT_BEHAVIOURS)) {
    assert.ok(SHADOW_CURRENT_BEHAVIOURS.includes(behaviour), `${behaviour} must be a declared behaviour`);
  }
});

test('attaching shadow recording leaves the rendered checkpoint byte-identical', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-checkpoint-'));
  try {
    const checkpoint = checkpointFixture();
    const before = renderCheckpoint(checkpoint);
    const attached = await recordCheckpointShadow({
      checkpoint,
      observations: [{
        questionId: 'plan_ready',
        request: shadowRequestFor('plan_ready', { subject, requirement }),
        operator: planOperator()
      }],
      directory
    });
    // The checkpoint object is returned untouched and the renderer is unchanged,
    // so the human-facing snapshot is exactly what it was.
    assert.deepEqual(attached.checkpoint, checkpoint);
    assert.equal(renderCheckpoint(attached.checkpoint), before);
    assert.equal(attached.currentBehaviour, 'execute');
    assert.equal(attached.phase, 'checkpoint');
    assert.equal(attached.results.length, 1);
    assert.equal(attached.results[0].recommendation, true);
    assert.equal(attached.results[0].agreement, true);
    // The shadow record landed in the local trace.
    const records = await readDecisionTrace({ directory, taskId: 'shadow-test' });
    assert.equal(records.length, 1);
    assert.equal(records[0].questionId, 'plan_ready');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a checkpoint-level gate disagreement is recorded and still completes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-checkpoint-disagree-'));
  try {
    const checkpoint = checkpointFixture({ state: 'review' });
    const before = renderCheckpoint(checkpoint);
    const attached = await recordCheckpointShadow({
      checkpoint,
      observations: [{
        questionId: 'goal_complete',
        request: shadowRequestFor('goal_complete', { subject, requirement }),
        operator: verifyOperator({ more_work_required: true })
      }],
      directory
    });
    // The existing path reported review; the gate recommended continuing.
    assert.equal(attached.currentBehaviour, 'done');
    assert.equal(attached.results[0].recommendation, 'continue');
    assert.equal(attached.results[0].agreement, false);
    assert.equal(attached.summary.disagreements, 1);
    assert.equal(attached.summary.agreements, 0);
    // Nothing threw and the rendered checkpoint is unchanged.
    assert.equal(renderCheckpoint(attached.checkpoint), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a checkpoint gate failure never blocks the checkpoint', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-checkpoint-fail-'));
  try {
    const checkpoint = checkpointFixture();
    const attached = await recordCheckpointShadow({
      checkpoint,
      observations: [
        { questionId: 'plan_ready', request: { broken: true }, operator: planOperator() },
        { questionId: 'plan_ready', request: shadowRequestFor('plan_ready', { subject, requirement }), operator: 'not-an-operator' }
      ],
      directory
    });
    assert.equal(attached.results[0].unevaluable, true);
    // A request that does not carry the question's bundle is refused before it is
    // evaluated; a request that cannot be evaluated is a gate failure.
    assert.equal(attached.results[0].reason, 'invalid-request');
    assert.equal(attached.results[1].unevaluable, true);
    assert.equal(attached.results[1].reason, 'gate-failed');
    assert.equal(attached.summary.total, 2);
    assert.equal(attached.summary.unevaluable, 2);
    assert.equal(attached.summary.agreements, 0);
    assert.equal(renderCheckpoint(attached.checkpoint), renderCheckpoint(checkpoint));
    // An unmapped state produces a null agreement instead of a false one.
    const unmapped = await recordCheckpointShadow({
      checkpoint: checkpointFixture({ state: 'not-a-state' }),
      observations: [{
        questionId: 'plan_ready',
        request: shadowRequestFor('plan_ready', { subject, requirement }),
        operator: planOperator()
      }],
      directory
    });
    assert.equal(unmapped.currentBehaviour, 'unknown');
    assert.equal(unmapped.results[0].agreement, null);
    assert.equal(unmapped.results[0].unevaluable, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('attaching to a checkpoint with no observations records nothing and changes nothing', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shadow-checkpoint-empty-'));
  try {
    const checkpoint = checkpointFixture();
    const attached = await recordCheckpointShadow({ checkpoint, directory });
    assert.deepEqual(attached.results, []);
    assert.equal(attached.summary.total, 0);
    assert.equal(renderCheckpoint(attached.checkpoint), renderCheckpoint(checkpoint));
    assert.deepEqual(await readDecisionTrace({ directory, taskId: 'shadow-test' }), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('summary of persisted v2 traces retains distinct shadow consumer questions',()=>{
 const s=summarizeShadow([
  {questionId:'plan_ready',shadowQuestionId:'plan_ready',agreement:true},
  {questionId:'plan_ready',shadowQuestionId:'execution_ready',agreement:false}
 ]);
 assert.equal(s.byQuestion.plan_ready.agreements,1);
 assert.equal(s.byQuestion.execution_ready.disagreements,1);
});
