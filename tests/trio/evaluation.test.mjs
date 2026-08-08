import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  DEFAULT_FIXTURE_ROOT,
  PROOF_ALLOWLIST,
  SCENARIO_IDS,
  evaluateFixture,
  evaluateOrchestrationProxy,
  parseCliArgs,
  validateEvaluationReport
} from '../../scripts/evaluate-trio-v2.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evaluatorPath = path.join(repositoryRoot, 'scripts', 'evaluate-trio-v2.mjs');

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, 'utf8'));
}

async function snapshotInputFixture(fixtureRoot) {
  const snapshot = new Map();
  snapshot.set('scenarios.json', await readFile(path.join(fixtureRoot, 'scenarios.json')));
  for (const id of SCENARIO_IDS) {
    snapshot.set(`packets/${id}.json`, await readFile(path.join(fixtureRoot, 'packets', `${id}.json`)));
  }
  return snapshot;
}

function assertSnapshotUnchanged(snapshot, fixtureRoot) {
  return Promise.all([...snapshot.entries()].map(async ([relativePath, before]) => {
    assert.deepEqual(await readFile(path.join(fixtureRoot, relativePath)), before, `${relativePath} changed`);
  }));
}

async function copyFixture(prefix = 'trio-v2-evaluation-') {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  const fixtureRoot = path.join(root, 'evaluation');
  await cp(DEFAULT_FIXTURE_ROOT, fixtureRoot, { recursive: true });
  return { root, fixtureRoot };
}

function assertNoForbiddenFixtureFields(value, label = 'fixture') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenFixtureFields(entry, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.doesNotMatch(key, /^(?:result|pass|winner|tokens?|cost|human|scope|commands?)$/iu, `${label}.${key}`);
    assertNoForbiddenFixtureFields(nested, `${label}.${key}`);
  }
}

async function writeSyntheticRollout(root, id, threadSource, freshInput, output, cached = 0, taskDirectory = 'trio-v2-refactor-20260802', fileName = id) {
  const bucket = path.join(root, '2026', '08', '02');
  await mkdir(bucket, { recursive: true });
  const taskPath = `/tmp/planning/active/${taskDirectory}/`;
  const records = [
    {
      type: 'session_meta',
      timestamp: '2026-08-02T14:00:00.000Z',
      payload: {
        id,
        timestamp: '2026-08-02T14:00:00.000Z',
        cwd: `${taskPath}${id}`,
        thread_source: threadSource
      }
    },
    {
      type: 'turn_context',
      timestamp: '2026-08-02T14:01:00.000Z',
      payload: { model: 'gpt-5.6-luna', effort: 'max' }
    },
    {
      type: 'event_msg',
      timestamp: '2026-08-02T14:02:00.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            total_tokens: freshInput + output,
            input_tokens: freshInput,
            cached_input_tokens: cached,
            output_tokens: output,
            reasoning_output_tokens: 0
          }
        }
      }
    }
  ];
  await writeFile(path.join(bucket, `rollout-${fileName}.jsonl`), `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
}

test('evaluation entrypoint exists before deterministic shadow replay', () => {
  assert.equal(typeof evaluatorPath, 'string');
});

test('evaluation fixture has the exact ordered scenario tree and data-only packets', async () => {
  const rootEntries = (await readdir(DEFAULT_FIXTURE_ROOT)).sort();
  assert.deepEqual(rootEntries, ['observed-shadow-result.json', 'packets', 'scenarios.json']);
  const config = await readJson(path.join(DEFAULT_FIXTURE_ROOT, 'scenarios.json'));
  assert.deepEqual(config.scenarios.map(({ id }) => id), SCENARIO_IDS);
  assert.equal(new Set(config.scenarios.map(({ id }) => id)).size, 12);
  assert.deepEqual(config.scenarios.map(({ capability }) => capability), [
    'dev', 'dev', 'dev', 'dev', 'dev', 'dev', 'dev', 'dev', 'dev', 'office', 'office', 'safety'
  ]);
  for (const scenario of config.scenarios) {
    const packet = await readJson(path.join(DEFAULT_FIXTURE_ROOT, scenario.packet));
    assertNoForbiddenFixtureFields(packet, scenario.packet);
    assert.equal(packet.taskId.startsWith('shadow-'), true);
  }
  const observed = await readJson(path.join(DEFAULT_FIXTURE_ROOT, 'observed-shadow-result.json'));
  assert.equal(observed.proofsExecuted, true);
  assert.equal(observed.summary.scenarioCount, 12);
  assert.equal(observed.cutoverVerdict, 'pending_full_preconditions');
});

test('proof allow-list is static and uses argv without shell fragments', () => {
  const commandSource = readFileSync(evaluatorPath, 'utf8');
  assert.match(commandSource, /PROOF_ALLOWLIST/u);
  assert.match(commandSource, /shell:\s*false/u);
  for (const commands of Object.values(PROOF_ALLOWLIST)) {
    assert.ok(commands.length > 0);
    for (const argv of commands) {
      assert.equal(argv[0], process.execPath);
      assert.equal(argv.some((part) => part.includes('&&') || part.includes(';') || part.includes('|')), false);
    }
  }
});

test('deterministic replay executes all named proofs and keeps unknown/null fields truthful', async () => {
  const snapshot = await snapshotInputFixture(DEFAULT_FIXTURE_ROOT);
  const report = await evaluateFixture({ fixtureRoot: DEFAULT_FIXTURE_ROOT, sourceRoot: repositoryRoot });
  assert.deepEqual(report.scenarioIds, SCENARIO_IDS);
  assert.equal(report.scenarios.length, 12);
  assert.equal(report.shadowVerdict, 'pass');
  assert.equal(report.costProxyVerdict, 'pass');
  assert.equal(report.cutoverVerdict, 'pending_full_preconditions');
  assert.match(report.notice, /not a matched Host\/model\/billing benchmark/u);
  for (const scenario of report.scenarios) {
    assert.equal(scenario.measurementKind, 'deterministic_shadow_replay');
    assert.equal(scenario.notAHostTaskRun, true);
    assert.equal(scenario.actualModel, 'unknown');
    assert.equal(scenario.actualEffort, 'unknown');
    for (const field of ['mainTokens', 'workerTokens', 'freshTokenProxy', 'trustworthyCost', 'humanIntervention', 'scopeDrift']) assert.equal(scenario[field], null);
    assert.equal(scenario.contractPass, true);
    assert.equal(scenario.evidenceComplete, true);
    assert.ok(scenario.commands.length > 0);
    for (const command of scenario.commands) {
      assert.equal(command.exit, 0);
      assert.match(command.stdoutHash, /^[a-f0-9]{64}$/u);
      assert.match(command.stderrHash, /^[a-f0-9]{64}$/u);
      assert.ok(Array.isArray(command.argv));
    }
    assert.equal(scenario.context.packet.sha256, scenario.packetSha256);
    assert.equal(scenario.context.legacy.sources[0].sha256, scenario.context.trio.sources[0].sha256);
    assert.equal(scenario.context.legacy.sources[0].bytes, scenario.context.trio.sources[0].bytes);
    assert.equal(scenario.context.formula, 'ceil(UTF-8 bytes / 4)');
    assert.ok(scenario.context.reduction >= 0.25);
    assert.ok(scenario.limitations.length >= 4);
  }
  await assertSnapshotUnchanged(snapshot, DEFAULT_FIXTURE_ROOT);
});

test('context proxy rejects embedded metrics and source drift without using precomputed result data', async () => {
  const { root, fixtureRoot } = await copyFixture();
  try {
    const resultPath = path.join(fixtureRoot, 'observed-shadow-result.json');
    await writeFile(resultPath, JSON.stringify({ medianContextTokenReduction: 0, winner: 'legacy' }), 'utf8');
    const report = await evaluateFixture({ fixtureRoot, sourceRoot: repositoryRoot, runProofs: false });
    assert.equal(report.summary.medianContextTokenReduction >= 0.25, true);
    const packetPath = path.join(fixtureRoot, 'packets', 'quick-bug.json');
    await writeFile(packetPath, JSON.stringify({
      ...(await readJson(packetPath)),
      pass: true
    }), 'utf8');
    await assert.rejects(() => evaluateFixture({ fixtureRoot, sourceRoot: repositoryRoot, runProofs: false }), /forbidden field/u);
    await writeFile(packetPath, JSON.stringify(await readJson(path.join(DEFAULT_FIXTURE_ROOT, 'packets', 'quick-bug.json')), null, 2), 'utf8');
    const emptySource = await mkdtemp(path.join(root, 'empty-source-'));
    await assert.rejects(() => evaluateFixture({ fixtureRoot, sourceRoot: emptySource, runProofs: false }), /ENOENT|missing|no such/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fixture allow-list rejects extra entries and arbitrary fixture fields', async () => {
  const { root, fixtureRoot } = await copyFixture();
  try {
    await writeFile(path.join(fixtureRoot, 'unexpected.json'), '{}\n', 'utf8');
    await assert.rejects(() => evaluateFixture({ fixtureRoot, sourceRoot: repositoryRoot, runProofs: false }), /Unexpected evaluation fixture entry/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('malformed input and weakened report limitations fail closed', async () => {
  const { root, fixtureRoot } = await copyFixture();
  try {
    await writeFile(path.join(fixtureRoot, 'scenarios.json'), '{malformed\n', 'utf8');
    await assert.rejects(() => evaluateFixture({ fixtureRoot, sourceRoot: repositoryRoot, runProofs: false }), /malformed JSON/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const report = await evaluateFixture({ fixtureRoot: DEFAULT_FIXTURE_ROOT, sourceRoot: repositoryRoot, runProofs: false });
  const weakened = structuredClone(report);
  weakened.scenarios[0].limitations = [];
  assert.equal(validateEvaluationReport(weakened).valid, false);
  assert.match(validateEvaluationReport(weakened).failures.join(' '), /limitations/u);
});

test('report validator recomputes deterministic replay evidence instead of trusting report fields', async () => {
  const report = await evaluateFixture({ fixtureRoot: DEFAULT_FIXTURE_ROOT, sourceRoot: repositoryRoot });
  const withoutProofs = await evaluateFixture({ fixtureRoot: DEFAULT_FIXTURE_ROOT, sourceRoot: repositoryRoot, runProofs: false });
  assert.equal(validateEvaluationReport(withoutProofs).valid, true);

  const tampered = [
    ['complete argv', (value) => { value.scenarios[0].commands[0].argv[1] = '--eval'; }],
    ['nonzero exit', (value) => { value.scenarios[0].commands[0].exit = 1; }],
    ['command contract', (value) => { value.scenarios[0].commands[0].contractPass = false; }],
    ['command evidence', (value) => { value.scenarios[0].commands[0].evidenceComplete = false; }],
    ['scenario contract', (value) => { value.scenarios[0].contractPass = false; value.shadowVerdict = 'fail'; }],
    ['scenario evidence', (value) => { value.scenarios[0].evidenceComplete = false; value.shadowVerdict = 'fail'; }],
    ['source drift', (value) => { value.scenarios[0].sourceDrift = true; }],
    ['raw command stdout', (value) => { value.scenarios[0].commands[0].stdout = 'raw command output'; }],
    ['source byte arithmetic', (value) => { value.scenarios[0].context.legacy.sources[1].bytes += 1; }],
    ['packet full record', (value) => { value.scenarios[0].context.trio.sources[0].approximateTokens += 1; }],
    ['packet digest pairing', (value) => { value.scenarios[0].packetSha256 = 'a'.repeat(64); }],
    ['scenario reduction', (value) => { value.scenarios[0].context.reduction += 0.01; }],
    ['summary accepted count', (value) => { value.summary.acceptedCount = 0; }],
    ['summary median', (value) => { value.summary.medianContextTokenReduction = 0.99; }],
    ['summary threshold', (value) => { value.summary.threshold = 0.01; }],
    ['summary formula', (value) => { value.summary.formula = 'invented formula'; }],
    ['shadow verdict', (value) => { value.shadowVerdict = 'fail'; }],
    ['cost verdict', (value) => { value.costProxyVerdict = 'fail'; }]
  ];

  const acceptedTampering = tampered.flatMap(([label, mutate]) => {
    const candidate = structuredClone(report);
    mutate(candidate);
    return validateEvaluationReport(candidate).valid ? [label] : [];
  });
  assert.deepEqual(acceptedTampering, []);
});

test('report validator binds orchestration observations to arithmetic and nested evidence', async () => {
  const observed = await readJson(path.join(DEFAULT_FIXTURE_ROOT, 'observed-shadow-result.json'));
  const tampered = [
    ['top-level verdict', (value) => { value.orchestrationProxyVerdict = value.orchestrationProxyVerdict === 'pass' ? 'fail' : 'pass'; }],
    ['nested verdict', (value) => { value.orchestrationProxy.verdict = value.orchestrationProxy.verdict === 'pass' ? 'fail' : 'pass'; }],
    ['fresh share', (value) => { value.orchestrationProxy.freshShare = 0.01; }],
    ['chief fresh', (value) => { value.orchestrationProxy.chiefFresh = -1; }],
    ['delegate fresh', (value) => { value.orchestrationProxy.delegateFresh += 1; }],
    ['selection count', (value) => { value.orchestrationProxy.selection.selectedSessionCount += 1; }],
    ['selection duplicate', (value) => { value.orchestrationProxy.selection.selectedSessionIds[1] = value.orchestrationProxy.selection.selectedSessionIds[0]; }]
  ];
  const acceptedTampering = tampered.flatMap(([label, mutate]) => {
    const candidate = structuredClone(observed);
    mutate(candidate);
    return validateEvaluationReport(candidate).valid ? [label] : [];
  });
  assert.deepEqual(acceptedTampering, []);
});

test('orchestration proxy rejects duplicate audit identities and negative fresh proxies', async () => {
  const duplicateRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-duplicate-telemetry-'));
  const negativeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-negative-telemetry-'));
  try {
    await writeSyntheticRollout(duplicateRoot, 'chief-duplicate', 'main', 100, 10);
    await writeSyntheticRollout(duplicateRoot, 'delegate-exact-duplicate', 'subagent', 1000, 10);
    await writeSyntheticRollout(duplicateRoot, 'delegate-generic-duplicate', 'subagent', 1000, 10, 0, 'generic-task');
    await writeSyntheticRollout(duplicateRoot, 'duplicate-anywhere', 'subagent', 1000, 10, 0, 'other-task', 'duplicate-one');
    await writeSyntheticRollout(duplicateRoot, 'duplicate-anywhere', 'subagent', 1000, 10, 0, 'other-task', 'duplicate-two');
    const duplicate = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802', chiefSessionId: 'chief-duplicate', includeSessionIds: ['delegate-generic-duplicate'],
      dateFrom: '2026-08-02T13:40:00.000Z', dateTo: '2026-08-03T00:00:00.000Z', sessionsRoot: duplicateRoot
    });

    await writeSyntheticRollout(negativeRoot, 'chief-negative', 'main', 100, 10);
    await writeSyntheticRollout(negativeRoot, 'delegate-exact-negative', 'subagent', 1000, 10);
    await writeSyntheticRollout(negativeRoot, 'delegate-negative', 'subagent', 100, 10, 120, 'generic-task');
    const negative = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802', chiefSessionId: 'chief-negative', includeSessionIds: ['delegate-negative'],
      dateFrom: '2026-08-02T13:40:00.000Z', dateTo: '2026-08-03T00:00:00.000Z', sessionsRoot: negativeRoot
    });

    assert.deepEqual([
      duplicate.status === 'observed' ? 'duplicate audit session ID' : null,
      negative.status === 'observed' ? 'negative fresh proxy' : null
    ].filter(Boolean), []);
  } finally {
    await rm(duplicateRoot, { recursive: true, force: true });
    await rm(negativeRoot, { recursive: true, force: true });
  }
});

test('proof and output boundaries keep canonical commands and canonical paths', async () => {
  const failures = [];
  const nestedArgv = PROOF_ALLOWLIST.quickRouting[0];
  const originalArgv = [...nestedArgv];
  try {
    let mutationThrew = false;
    try {
      nestedArgv.push('--tamper');
    } catch {
      mutationThrew = true;
    }
    if (!mutationThrew || JSON.stringify(nestedArgv) !== JSON.stringify(originalArgv)) failures.push('nested proof argv mutation changed canonical commands');
  } finally {
    if (!Object.isFrozen(nestedArgv)) nestedArgv.splice(0, nestedArgv.length, ...originalArgv);
  }

  const evaluator = await import('../../scripts/evaluate-trio-v2.mjs');
  const repoLookalike = path.join(repositoryRoot, 'tests', 'fixtures', 'trio-v2');
  try {
    await evaluator.main(['--fixture-root', repoLookalike]);
    failures.push('arbitrary repository fixture root was accepted');
  } catch (error) {
    if (!/canonical repository evaluation fixture/u.test(error.message)) failures.push('arbitrary repository fixture root was not rejected by canonical identity');
  }

  if (typeof evaluator.validateOutputPath !== 'function') {
    failures.push('canonical output validator is not exposed');
  } else {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-output-canonical-'));
    const aliasRoot = `${outputRoot}-alias`;
    try {
      await symlink(outputRoot, aliasRoot);
      const requestedOutput = path.join(aliasRoot, 'report.json');
      const canonicalOutput = await evaluator.validateOutputPath(requestedOutput, DEFAULT_FIXTURE_ROOT);
      assert.equal(canonicalOutput, path.join(await realpath(outputRoot), 'report.json'));
      await evaluator.main(['--output', requestedOutput]);
      assert.equal((await readJson(canonicalOutput)).summary.scenarioCount, 12);
      await assert.rejects(
        () => evaluator.validateOutputPath(path.join(DEFAULT_FIXTURE_ROOT, 'second-result.json'), DEFAULT_FIXTURE_ROOT),
        /exact fixture result|fixture root/u
      );
    } finally {
      await rm(aliasRoot, { recursive: true, force: true });
      await rm(outputRoot, { recursive: true, force: true });
    }
  }

  assert.deepEqual(failures, []);
});

test('orchestration proxy requires explicit auditable Chief and delegate selection', async () => {
  const pending = await evaluateOrchestrationProxy({});
  assert.equal(pending.verdict, 'fail');
  const { root } = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-telemetry-')).then((directory) => ({ root: directory }));
  try {
    await writeSyntheticRollout(root, 'chief-session', 'main', 100, 10);
    await writeSyntheticRollout(root, 'delegate-a', 'subagent', 1000, 20);
    await writeSyntheticRollout(root, 'delegate-b', 'subagent', 1000, 20, 0, 'generic-task');
    const observed = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802',
      chiefSessionId: 'chief-session',
      includeSessionIds: ['delegate-b'],
      dateFrom: '2026-08-02T13:40:00.000Z',
      dateTo: '2026-08-03T00:00:00.000Z',
      sessionsRoot: root
    });
    assert.equal(observed.verdict, 'pass');
    assert.ok(observed.freshShare < 0.15);
    assert.equal(JSON.stringify(observed).includes('.jsonl'), false);
    assert.deepEqual(observed.selection.delegateSessionIds, ['delegate-a', 'delegate-b']);
    assert.deepEqual(observed.selection.selectedSessionIds, ['chief-session', 'delegate-a', 'delegate-b']);
    assert.equal(observed.selection.selectedSessionCount, 3);
    assert.match(observed.limitations.join(' '), /task attribution/iu);

    const duplicate = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802', chiefSessionId: 'chief-session', includeSessionIds: ['delegate-a', 'delegate-a'],
      dateFrom: '2026-08-02T13:40:00.000Z', dateTo: '2026-08-03T00:00:00.000Z', sessionsRoot: root
    });
    assert.equal(duplicate.verdict, 'fail');
    const chiefAsDelegate = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802', chiefSessionId: 'chief-session', includeSessionIds: ['chief-session'],
      dateFrom: '2026-08-02T13:40:00.000Z', dateTo: '2026-08-03T00:00:00.000Z', sessionsRoot: root
    });
    assert.equal(chiefAsDelegate.verdict, 'fail');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('orchestration proxy fails closed for zero fresh-token denominator', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-zero-telemetry-'));
  try {
    await writeSyntheticRollout(root, 'chief-zero', 'main', 100, 0, 100);
    await writeSyntheticRollout(root, 'delegate-zero', 'subagent', 100, 0, 100, 'generic-task');
    const observed = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802', chiefSessionId: 'chief-zero', includeSessionIds: ['delegate-zero'],
      dateFrom: '2026-08-02T13:40:00.000Z', dateTo: '2026-08-03T00:00:00.000Z', sessionsRoot: root
    });
    assert.equal(observed.verdict, 'fail');
    assert.match(observed.reason, /denominator|token/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('orchestration selection includes every exact-task session and only explicit generic additions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-exact-task-telemetry-'));
  try {
    await writeSyntheticRollout(root, 'chief-exact', 'main', 100, 10);
    await writeSyntheticRollout(root, 'delegate-exact-a', 'subagent', 1000, 20);
    await writeSyntheticRollout(root, 'delegate-exact-b', 'subagent', 1000, 20);
    await writeSyntheticRollout(root, 'delegate-generic', 'subagent', 1000, 20, 0, 'generic-task');
    const observed = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802',
      chiefSessionId: 'chief-exact',
      includeSessionIds: ['delegate-generic'],
      dateFrom: '2026-08-02T13:40:00.000Z',
      dateTo: '2026-08-03T00:00:00.000Z',
      sessionsRoot: root
    });
    assert.deepEqual(observed.selection.selectedSessionIds, ['chief-exact', 'delegate-exact-a', 'delegate-exact-b', 'delegate-generic']);
    assert.deepEqual(observed.selection.exactTaskSessionIds, ['chief-exact', 'delegate-exact-a', 'delegate-exact-b']);
    assert.deepEqual(observed.selection.delegateSessionIds, ['delegate-exact-a', 'delegate-exact-b', 'delegate-generic']);
    assert.equal(observed.selection.selectedSessionCount, 4);
    assert.match(observed.limitations.join(' '), /exact task id matching/iu);

    const missingInclude = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802', chiefSessionId: 'chief-exact', includeSessionIds: [],
      dateFrom: '2026-08-02T13:40:00.000Z', dateTo: '2026-08-03T00:00:00.000Z', sessionsRoot: root
    });
    assert.equal(missingInclude.verdict, 'fail');
    const missingChief = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802', includeSessionIds: ['delegate-generic'],
      dateFrom: '2026-08-02T13:40:00.000Z', dateTo: '2026-08-03T00:00:00.000Z', sessionsRoot: root
    });
    assert.equal(missingChief.verdict, 'fail');
    const duplicateAutoSelected = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802', chiefSessionId: 'chief-exact', includeSessionIds: ['delegate-exact-a'],
      dateFrom: '2026-08-02T13:40:00.000Z', dateTo: '2026-08-03T00:00:00.000Z', sessionsRoot: root
    });
    assert.equal(duplicateAutoSelected.verdict, 'fail');
    const chiefAsInclude = await evaluateOrchestrationProxy({
      taskId: 'trio-v2-refactor-20260802', chiefSessionId: 'chief-exact', includeSessionIds: ['chief-exact'],
      dateFrom: '2026-08-02T13:40:00.000Z', dateTo: '2026-08-03T00:00:00.000Z', sessionsRoot: root
    });
    assert.equal(chiefAsInclude.verdict, 'fail');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI parser and output boundary fail closed before replay', async () => {
  assert.throws(() => parseCliArgs(['--unknown', 'value']), /Unknown|malformed/u);
  assert.throws(() => parseCliArgs(['--output', 'relative.json']), /absolute/u);
  assert.throws(() => parseCliArgs(['--include-session-id', 'x', '--include-session-id', 'x']), /Duplicate/u);
  await assert.rejects(() => import('../../scripts/evaluate-trio-v2.mjs').then(({ main }) => main(['--output', '/etc/swf-trio-v2-unsafe-output.json'])), /Output|temporary|fixture/u);
});

test('CLI stdout and optional OS-temporary output preserve source fixture bytes', async () => {
  const snapshot = await snapshotInputFixture(DEFAULT_FIXTURE_ROOT);
  const stdoutRun = await execFile(process.execPath, [evaluatorPath], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const stdoutReport = JSON.parse(stdoutRun.stdout);
  assert.equal(stdoutReport.cutoverVerdict, 'pending_full_preconditions');
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-evaluation-output-'));
  try {
    const outputPath = path.join(outputRoot, 'report.json');
    await execFile(process.execPath, [evaluatorPath, '--output', outputPath], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const outputReport = await readJson(outputPath);
    assert.equal(outputReport.summary.scenarioCount, 12);
    assert.equal(outputReport.notice, stdoutReport.notice);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
  await assertSnapshotUnchanged(snapshot, DEFAULT_FIXTURE_ROOT);
});

test('CLI accepts an OS-temporary output through a symlinked temp alias', async (t) => {
  const tempAlias = '/tmp';
  if (!(await lstat(tempAlias)).isSymbolicLink()) {
    t.skip('The target platform does not expose /tmp as a symlink.');
    return;
  }
  const outputPath = path.join(tempAlias, `swf-trio-v2-evaluation-symlink-${process.pid}.json`);
  try {
    await execFile(process.execPath, [evaluatorPath, '--output', outputPath], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    assert.equal((await readJson(outputPath)).summary.scenarioCount, 12);
  } finally {
    await rm(outputPath, { force: true });
  }
});
