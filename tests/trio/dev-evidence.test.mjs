import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEV_CHECK_IDS,
  DEV_EVIDENCE_VERSION,
  GIT_FACT_FIELDS,
  OBSERVATION_REASONS,
  classifyObservation,
  collectDevEvidence,
  devCheck,
  devChecks,
  devEvidence,
  gitFacts
} from '../../harness/trio/core/evidence.mjs';

import {
  DECISION_BUNDLE_VERSION,
  DECISION_BUNDLES,
  DECISION_SCHEMA_VERSION,
  failedDeterministicChecks,
  validateDecisionRequest
} from '../../harness/trio/core/decision.mjs';

function verifyRequest(deterministic) {
  const frozen = DECISION_BUNDLES.verify;
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    bundle: 'verify',
    bundleVersion: DECISION_BUNDLE_VERSION,
    subject: { taskId: 'dev-evidence-test', phase: 'verify', capability: 'dev' },
    requirement: { mode: 'think', intensity: 'high' },
    evidence: { deterministic, semanticContext: null },
    questions: frozen.questions.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      ...(entry.options ? { options: [...entry.options] } : {}),
      ...(entry.scale ? { scale: [...entry.scale] } : {})
    }))
  };
}

test('a command result maps to exactly one observed status', () => {
  assert.deepEqual(classifyObservation({ exitCode: 0 }), { status: 'pass', reason: 'exit-zero' });
  assert.deepEqual(classifyObservation({ exitCode: 1 }), { status: 'fail', reason: 'exit-nonzero' });
  assert.deepEqual(classifyObservation({ exitCode: 2 }), { status: 'fail', reason: 'exit-nonzero' });
  assert.deepEqual(classifyObservation(null), { status: 'unknown', reason: 'not-run' });
  assert.deepEqual(classifyObservation(undefined), { status: 'unknown', reason: 'not-run' });
  assert.deepEqual(classifyObservation({ timedOut: true }), { status: 'unknown', reason: 'timed-out' });
  assert.deepEqual(classifyObservation({ signal: 'SIGKILL' }), { status: 'unknown', reason: 'signalled' });
  assert.deepEqual(
    classifyObservation({ exitCode: null, signal: 'SIGTERM' }),
    { status: 'unknown', reason: 'signalled' }
  );
  assert.deepEqual(classifyObservation({ exitCode: '1' }), { status: 'unknown', reason: 'unreadable' });
  for (const observed of [
    classifyObservation({ exitCode: 0 }),
    classifyObservation({ exitCode: 1 }),
    classifyObservation(null),
    classifyObservation({ timedOut: true })
  ]) {
    assert.ok(OBSERVATION_REASONS.includes(observed.reason), 'reason must come from the frozen set');
  }
});

test('a timed-out or signalled command is unknown rather than a failed check', () => {
  assert.equal(devCheck('tests', { timedOut: true }).status, 'unknown');
  assert.equal(devCheck('tests', { timedOut: true }).timedOut, true);
  assert.equal(devCheck('tests', { exitCode: null, signal: 'SIGTERM' }).status, 'unknown');
  assert.equal(devCheck('tests', { exitCode: null, signal: 'SIGTERM' }).signal, 'SIGTERM');
  // No verdict was reached, so nothing may be reported as a failure.
  assert.notEqual(devCheck('tests', { timedOut: true }).status, 'fail');
});

test('every declared dev check is reported exactly once', () => {
  const checks = devChecks({ tests: { exitCode: 0 }, lint: { exitCode: 1 } });
  assert.deepEqual(checks.map((check) => check.id), [...DEV_CHECK_IDS]);
  assert.equal(new Set(checks.map((check) => check.id)).size, checks.length);
  const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
  assert.equal(byId.tests.status, 'pass');
  assert.equal(byId.lint.status, 'fail');
  // Unreported checks are unknown, never an assumed pass.
  assert.equal(byId.build.status, 'unknown');
  assert.equal(byId.build.reason, 'not-run');
  assert.equal(byId.typecheck.status, 'unknown');
});

test('an undeclared check id is rejected instead of silently recorded', () => {
  assert.throws(() => devCheck('deploy', { exitCode: 0 }), /Unknown dev evidence check id/);
  assert.throws(() => devChecks({ release: { exitCode: 0 } }), /Unknown dev evidence check id/);
  assert.throws(() => devChecks({ '': { exitCode: 0 } }), /must be non-empty text/);
  assert.throws(() => devChecks({ ' tests ': { exitCode: 0 } }), /Unknown dev evidence check id/);
});

test('adapter output carries observed facts and no opinion', () => {
  const evidence = devEvidence({
    results: { tests: { exitCode: 1, command: 'npm test', durationMs: 12 }, build: { exitCode: 0 } },
    git: { branch: 'dev', head: 'ad3c8b30', dirty: true, detached: false }
  });
  assert.deepEqual(Object.keys(evidence).sort(), ['checks', 'git']);
  // A failing command is a fact with an exit code, not a decision.
  const tests = evidence.checks.find((check) => check.id === 'tests');
  assert.equal(tests.status, 'fail');
  assert.equal(tests.exitCode, 1);
  assert.equal(tests.reason, 'exit-nonzero');
  for (const forbidden of [
    'outcome', 'transition', 'transitionRecommendation', 'decision', 'answer', 'answers',
    'verdict', 'recommendation', 'next_state', 'goal_satisfied', 'more_work_required', 'severity'
  ]) {
    assert.equal(Object.hasOwn(evidence, forbidden), false, `evidence must not carry ${forbidden}`);
    for (const check of evidence.checks) {
      assert.equal(Object.hasOwn(check, forbidden), false, `check must not carry ${forbidden}`);
    }
  }
});

test('git state is reported as facts without a verdict', () => {
  const observed = gitFacts({ branch: 'dev', head: 'ad3c8b30', dirty: true, detached: false });
  assert.deepEqual(Object.keys(observed).sort(), [...GIT_FACT_FIELDS, 'reason'].sort());
  assert.equal(observed.reason, 'observed');
  // A dirty tree is observed state, not a failed check.
  assert.equal(observed.dirty, true);
  assert.equal(Object.hasOwn(observed, 'status'), false);
  const unreadable = gitFacts();
  assert.equal(unreadable.reason, 'unreadable');
  assert.equal(unreadable.branch, null);
  assert.equal(unreadable.dirty, null);
  assert.throws(() => gitFacts({ branch: 'dev', ahead: 2 }), /Unknown git fact/);
  assert.throws(() => gitFacts({ branch: 'dev', dirty: 'yes' }), /must be a boolean or null/);
  assert.throws(() => gitFacts({ branch: '' }), /must be non-empty text/);
});

test('adapter output satisfies the verify bundle evidence contract', () => {
  const evidence = devEvidence({ results: { tests: { exitCode: 1 } }, git: { branch: 'dev' } });
  const request = validateDecisionRequest(verifyRequest(evidence));
  assert.deepEqual(request.evidence.deterministic.checks.map((check) => check.id), [...DEV_CHECK_IDS]);
  // The deterministic half of the composite sees the same failure.
  assert.deepEqual(failedDeterministicChecks(request.evidence.deterministic), ['tests']);
  const clean = validateDecisionRequest(verifyRequest(devEvidence({ results: { tests: { exitCode: 0 } } })));
  assert.deepEqual(failedDeterministicChecks(clean.evidence.deterministic), []);
  const unknown = validateDecisionRequest(verifyRequest(devEvidence({})));
  assert.deepEqual(failedDeterministicChecks(unknown.evidence.deterministic), []);
});

test('collection records what a runner observed and never throws for a check', async () => {
  const calls = [];
  const evidence = await collectDevEvidence({
    commands: [
      { id: 'tests', command: 'npm', args: ['run', 'verify:trio'] },
      { id: 'lint', command: 'npm', args: ['run', 'lint'] }
    ],
    run: async (command, { id, args }) => {
      calls.push([command, ...args].join(' '));
      if (id === 'tests') return { exitCode: 0, durationMs: 5 };
      throw new Error('runner could not start');
    }
  });
  assert.deepEqual(calls, ['npm run verify:trio', 'npm run lint']);
  const byId = Object.fromEntries(evidence.checks.map((check) => [check.id, check]));
  assert.equal(byId.tests.status, 'pass');
  assert.equal(byId.tests.command, 'npm run verify:trio');
  // A runner that throws produced no observation; that is unknown, not fail.
  assert.equal(byId.lint.status, 'unknown');
  assert.equal(byId.lint.reason, 'not-run');
  assert.equal(Object.hasOwn(byId, 'build'), false);
  assert.equal(evidence.git.reason, 'unreadable');
});

test('collection reads git state and survives a failing git reader', async () => {
  const withGit = await collectDevEvidence({
    commands: [{ id: 'tests', command: 'npm', args: ['test'] }],
    run: async () => ({ exitCode: 0 }),
    readGit: async () => ({ branch: 'dev', head: 'ad3c8b30', dirty: false, detached: false })
  });
  assert.equal(withGit.git.reason, 'observed');
  assert.equal(withGit.git.branch, 'dev');
  const brokenGit = await collectDevEvidence({
    commands: [{ id: 'tests', command: 'npm', args: ['test'] }],
    run: async () => ({ exitCode: 0 }),
    readGit: async () => { throw new Error('not a repository'); }
  });
  assert.equal(brokenGit.git.reason, 'unreadable');
  assert.equal(brokenGit.checks.find((check) => check.id === 'tests').status, 'pass');
});

test('collection rejects an undeclared or duplicated command set', async () => {
  const run = async () => ({ exitCode: 0 });
  await assert.rejects(() => collectDevEvidence({ commands: [], run }), /non-empty array/);
  await assert.rejects(
    () => collectDevEvidence({ commands: [{ id: 'deploy', command: 'x' }], run }),
    /Unknown dev evidence check id/
  );
  await assert.rejects(
    () => collectDevEvidence({ commands: [{ id: 'tests', command: 'a' }, { id: 'tests', command: 'b' }], run }),
    /Duplicate dev evidence check id/
  );
  await assert.rejects(() => collectDevEvidence({ commands: [{ id: 'tests', command: '' }], run }), /non-empty text/);
  await assert.rejects(() => collectDevEvidence({ commands: [{ id: 'tests', command: 'x' }] }), /run function/);
});

test('the adapter stays provider-neutral and adds no model vocabulary', async () => {
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../../harness/trio/core/evidence.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /deepseek|gpt-|luna|sol\b|terra|opencode|claude/i);
  assert.equal(DEV_EVIDENCE_VERSION, 1);
});

test('deterministic serialization is stable for identical observations', () => {
  const build = () => devEvidence({
    results: { tests: { exitCode: 0, command: 'npm test' }, build: { exitCode: 1, command: 'npm run build' } },
    git: { branch: 'dev', head: 'ad3c8b30', dirty: false, detached: false }
  });
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
});


test('S1 limits dev evidence to explicit requiredCheckIds and preserves default compatibility', () => {
  const selected = devEvidence({
    requiredCheckIds: ['tests'],
    results: { tests: { exitCode: 0 } }
  });
  assert.deepEqual(selected.checks.map((check) => check.id), ['tests']);
  assert.equal(selected.checks[0].status, 'pass');
  assert.deepEqual(devEvidence({ results: { tests: { exitCode: 0 } } }).checks.map((check) => check.id), [...DEV_CHECK_IDS]);
  assert.deepEqual(devEvidence({ requiredCheckIds: [], results: {} }).checks, []);
  assert.throws(() => devEvidence({ requiredCheckIds: ['tests', 'tests'], results: {} }), /Duplicate dev evidence check id/);
  assert.throws(() => devEvidence({ requiredCheckIds: ['tests'], results: { build: { exitCode: 1 } } }), /outside required dev evidence scope/);
  assert.throws(() => devEvidence({ requiredCheckIds: ['missing'], results: {} }), /Unknown dev evidence check id/);
});

test('S1 derives dev required scope from commands and retains timeout facts', async () => {
  const evidence = await collectDevEvidence({
    commands: [{ id: 'tests', command: 'npm test' }],
    run: async () => ({ timedOut: true })
  });
  assert.deepEqual(evidence.checks.map((check) => check.id), ['tests']);
  assert.deepEqual(evidence.checks[0], { id: 'tests', status: 'unknown', reason: 'timed-out', timedOut: true, durationMs: 0, command: 'npm test' });
});

test('S1 collector preserves a nonzero exit reported through runner rejection', async () => {
  const evidence = await collectDevEvidence({commands:[{id:'tests',command:'failing test'}],run:async()=>{throw Object.assign(new Error('test failed'),{exitCode:1});}});
  assert.equal(evidence.checks[0].status,'fail');
  assert.equal(evidence.checks[0].exitCode,1);
});
