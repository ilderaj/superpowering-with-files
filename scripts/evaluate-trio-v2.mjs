import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { access, lstat, mkdtemp, open, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runTokenAudit } from '../harness/runtime/token-audit-service.mjs';

const execFile = promisify(execFileCallback);
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FIXTURE_ROOT = path.join(SCRIPT_ROOT, 'tests', 'fixtures', 'trio-v2', 'evaluation');
const DEFAULT_RESULT_NAME = 'observed-shadow-result.json';
const SCENARIO_IDS = Object.freeze([
  'quick-bug',
  'tracked-feature',
  'complex-debug',
  'broad-refactor',
  'cross-session-recovery',
  'two-worker',
  'plan-mismatch',
  'luna-to-terra',
  'host-unavailable',
  'source-backed-document',
  'formula-spreadsheet',
  'high-risk-cleanup'
]);

const CAPABILITIES = Object.freeze(['dev', 'office', 'safety']);
const FORBIDDEN_PACKET_KEYS = /^(?:result|pass|winner|tokens?|cost|human|scope|commands?)$/iu;
const CONTEXT_FORMULA = 'ceil(UTF-8 bytes / 4)';
const MEDIAN_REDUCTION_THRESHOLD = 0.25;
const ORCHESTRATION_SHARE_THRESHOLD = 0.15;
const RESULT_LIMITATIONS = Object.freeze([
  'This is deterministic shadow evidence, not a matched Host/model/billing benchmark.',
  'Actual model and effort are unknown without authenticated Host evidence.',
  'Per-scenario tokens, billing, human intervention, and scope drift are not measured by this replay.',
  'The context proxy measures instruction bytes only and is not an agent-quality or billing measurement.'
]);

function nodeTest(...files) {
  return [process.execPath, '--test', ...files];
}

function nodeScript(...args) {
  return [process.execPath, ...args];
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

const PROOF_ALLOWLIST = deepFreeze({
  quickRouting: [nodeTest('tests/trio/routing.test.mjs')],
  trackedLifecycle: [nodeTest('tests/trio/store.test.mjs', 'tests/trio/lifecycle.test.mjs')],
  complexDebug: [nodeTest('tests/trio/dev-capability.test.mjs')],
  broadRefactor: [
    nodeTest('tests/trio/dev-capability.test.mjs'),
    nodeScript('tests/trio/import-boundaries.test.mjs', '--milestone', 'final')
  ],
  recovery: [nodeTest('tests/trio/recovery.test.mjs')],
  twoWorker: [nodeTest('tests/trio/permission-routing.test.mjs')],
  planMismatch: [nodeTest('tests/trio/dev-capability.test.mjs')],
  lunaToTerra: [nodeTest('tests/trio/routing.test.mjs')],
  hostUnavailable: [nodeTest('tests/trio/host-routing.test.mjs')],
  sourceBackedDocument: [nodeTest('tests/trio/office-capability.test.mjs')],
  formulaSpreadsheet: [nodeTest('tests/trio/office-capability.test.mjs')],
  highRiskCleanup: [nodeTest('tests/trio/safety-capability.test.mjs')]
});

const SCENARIO_PROOFS = deepFreeze({
  'quick-bug': { capability: 'dev', proofKey: 'quickRouting' },
  'tracked-feature': { capability: 'dev', proofKey: 'trackedLifecycle' },
  'complex-debug': { capability: 'dev', proofKey: 'complexDebug' },
  'broad-refactor': { capability: 'dev', proofKey: 'broadRefactor' },
  'cross-session-recovery': { capability: 'dev', proofKey: 'recovery' },
  'two-worker': { capability: 'dev', proofKey: 'twoWorker' },
  'plan-mismatch': { capability: 'dev', proofKey: 'planMismatch' },
  'luna-to-terra': { capability: 'dev', proofKey: 'lunaToTerra' },
  'host-unavailable': { capability: 'dev', proofKey: 'hostUnavailable' },
  'source-backed-document': { capability: 'office', proofKey: 'sourceBackedDocument' },
  'formula-spreadsheet': { capability: 'office', proofKey: 'formulaSpreadsheet' },
  'high-risk-cleanup': { capability: 'safety', proofKey: 'highRiskCleanup' }
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizedOutput(value) {
  return String(value ?? '').replace(/\r\n/gu, '\n').replaceAll(SCRIPT_ROOT, '<repo>');
}

function assertPlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainRecord(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unexpected field set.`);
  }
}

function assertText(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be non-empty text.`);
  }
}

function assertSafeRelative(value, label) {
  assertText(value, label);
  if (path.isAbsolute(value) || value.includes('\\') || value.split('/').some((part) => part === '' || part === '..' || part === '.')) {
    throw new Error(`${label} must be a safe relative path.`);
  }
}

function assertNoForbiddenPacketKeys(value, label = 'packet') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenPacketKeys(entry, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PACKET_KEYS.test(key)) {
      throw new Error(`${label} contains a forbidden field: ${key}`);
    }
    assertNoForbiddenPacketKeys(nested, `${label}.${key}`);
  }
}

function parseJson(bytes, label) {
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is malformed JSON: ${error.message}`);
  }
  return parsed;
}

async function assertRegularFile(targetPath, label) {
  let stat;
  try {
    stat = await lstat(targetPath);
  } catch (error) {
    throw new Error(`${label} is missing: ${targetPath}`, { cause: error });
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file: ${targetPath}`);
  }
  return stat;
}

async function assertEvaluationTree(fixtureRoot, allowResult = true) {
  const rootStat = await lstat(fixtureRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('Evaluation fixture root must be a real directory.');
  }
  const rootEntries = await readdir(fixtureRoot, { withFileTypes: true });
  const allowedRoot = new Set(['scenarios.json', 'packets', ...(allowResult ? [DEFAULT_RESULT_NAME] : [])]);
  for (const entry of rootEntries) {
    if (!allowedRoot.has(entry.name)) throw new Error(`Unexpected evaluation fixture entry: ${entry.name}`);
    if (entry.isSymbolicLink()) throw new Error(`Symlinked evaluation fixture entry is not allowed: ${entry.name}`);
  }
  await assertRegularFile(path.join(fixtureRoot, 'scenarios.json'), 'Scenario configuration');
  const packetsRoot = path.join(fixtureRoot, 'packets');
  const packetStat = await lstat(packetsRoot);
  if (!packetStat.isDirectory() || packetStat.isSymbolicLink()) throw new Error('Packet root must be a real directory.');
  if (rootEntries.some((entry) => entry.name === DEFAULT_RESULT_NAME)) {
    await assertRegularFile(path.join(fixtureRoot, DEFAULT_RESULT_NAME), 'Observed result');
  }
  return packetsRoot;
}

async function loadFixture(fixtureRoot) {
  const packetsRoot = await assertEvaluationTree(fixtureRoot);
  const scenarioBytes = await readFile(path.join(fixtureRoot, 'scenarios.json'));
  const config = parseJson(scenarioBytes, 'scenarios.json');
  assertExactKeys(config, ['scenarios'], 'Scenario configuration');
  if (!Array.isArray(config.scenarios) || config.scenarios.length !== SCENARIO_IDS.length) {
    throw new Error('Scenario configuration must contain exactly twelve scenarios.');
  }

  const scenarios = [];
  const seenIds = new Set();
  for (const [index, scenario] of config.scenarios.entries()) {
    assertExactKeys(scenario, ['id', 'capability', 'packet'], `Scenario ${index}`);
    assertText(scenario.id, `Scenario ${index} id`);
    if (seenIds.has(scenario.id)) throw new Error(`Duplicate scenario id: ${scenario.id}`);
    seenIds.add(scenario.id);
    if (scenario.id !== SCENARIO_IDS[index]) throw new Error(`Scenario order mismatch at index ${index}.`);
    if (!CAPABILITIES.includes(scenario.capability)) throw new Error(`Unknown capability for ${scenario.id}.`);
    const expected = SCENARIO_PROOFS[scenario.id];
    if (!expected || expected.capability !== scenario.capability) throw new Error(`Scenario contract mismatch: ${scenario.id}`);
    assertSafeRelative(scenario.packet, `${scenario.id} packet path`);
    if (scenario.packet !== `packets/${scenario.id}.json`) throw new Error(`Unexpected packet path for ${scenario.id}.`);
    const packetPath = path.join(fixtureRoot, scenario.packet);
    const packetBytes = await readFile(packetPath).catch((error) => {
      throw new Error(`Missing packet for ${scenario.id}.`, { cause: error });
    });
    const packet = parseJson(packetBytes, scenario.packet);
    assertNoForbiddenPacketKeys(packet, scenario.packet);
    assertExactKeys(packet, ['taskId', 'goal', 'constraints', 'successCriteria', 'nonGoals', 'returnContract'], scenario.packet);
    assertText(packet.taskId, `${scenario.id} task id`);
    for (const field of ['constraints', 'successCriteria', 'nonGoals', 'returnContract']) {
      if (!Array.isArray(packet[field]) || packet[field].length === 0 || packet[field].some((item) => typeof item !== 'string' || item.trim() === '')) {
        throw new Error(`${scenario.packet} ${field} must be a non-empty text list.`);
      }
    }
    scenarios.push({
      id: scenario.id,
      capability: scenario.capability,
      packetPath: scenario.packet,
      packet,
      packetBytes
    });
  }
  const actualIds = scenarios.map(({ id }) => id);
  if (actualIds.join('\u0000') !== SCENARIO_IDS.join('\u0000')) throw new Error('Scenario IDs are not the exact ordered set.');
  const packetEntries = await readdir(packetsRoot, { withFileTypes: true });
  const expectedPackets = new Set(SCENARIO_IDS.map((id) => `${id}.json`));
  if (packetEntries.length !== expectedPackets.size || packetEntries.some((entry) => !expectedPackets.has(entry.name) || entry.isSymbolicLink() || !entry.isFile())) {
    throw new Error('Packet inventory must contain exactly one immutable packet per scenario.');
  }
  return { scenarios, scenarioBytes };
}

function sourceRecord(relativePath, bytes) {
  return {
    path: relativePath,
    sha256: sha256(bytes),
    bytes: bytes.length,
    approximateTokens: Math.ceil(bytes.length / 4),
    formula: CONTEXT_FORMULA
  };
}

async function readSource(sourceRoot, relativePath) {
  const bytes = await readFile(path.join(sourceRoot, relativePath));
  return sourceRecord(relativePath, bytes);
}

async function buildContextPair(sourceRoot, scenario) {
  const packet = sourceRecord(scenario.packetPath, scenario.packetBytes);
  const legacySources = [packet, await readSource(sourceRoot, 'AGENTS.md')];
  const trioSources = [
    packet,
    await readSource(sourceRoot, 'harness/trio/templates/entry-policy.md'),
    await readSource(sourceRoot, 'harness/trio/skill/SKILL.md'),
    await readSource(sourceRoot, `harness/trio/capabilities/${scenario.capability}/SKILL.md`)
  ];
  const sum = (records) => records.reduce((total, record) => total + record.bytes, 0);
  const legacyBytes = sum(legacySources);
  const trioBytes = sum(trioSources);
  const legacyTokens = Math.ceil(legacyBytes / 4);
  const trioTokens = Math.ceil(trioBytes / 4);
  const reduction = legacyTokens === 0 ? null : (legacyTokens - trioTokens) / legacyTokens;
  return {
    formula: CONTEXT_FORMULA,
    packet: { ...packet },
    legacy: { sources: legacySources, bytes: legacyBytes, approximateTokens: legacyTokens },
    trio: { sources: trioSources, bytes: trioBytes, approximateTokens: trioTokens },
    reduction
  };
}

function commandEvidence(commandResult) {
  const stdout = normalizedOutput(commandResult.stdout);
  const stderr = normalizedOutput(commandResult.stderr);
  const validArgv = Array.isArray(commandResult.argv) && commandResult.argv.length >= 2 && typeof commandResult.argv[0] === 'string';
  const hasHashes = /^[a-f0-9]{64}$/u.test(sha256(Buffer.from(stdout))) && /^[a-f0-9]{64}$/u.test(sha256(Buffer.from(stderr)));
  return {
    argv: [...commandResult.argv],
    exit: commandResult.exit,
    durationMs: commandResult.durationMs,
    stdoutHash: sha256(Buffer.from(stdout)),
    stderrHash: sha256(Buffer.from(stderr)),
    contractPass: commandResult.exit === 0,
    evidenceComplete: validArgv && hasHashes && Number.isFinite(commandResult.durationMs)
  };
}

async function executeAllowedCommand(argv, sourceRoot) {
  const started = Date.now();
  let stdout = '';
  let stderr = '';
  let exit = 0;
  try {
    const result = await execFile(argv[0], argv.slice(1), {
      cwd: sourceRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      shell: false
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    stdout = error.stdout ?? '';
    stderr = error.stderr ?? error.message ?? '';
    exit = Number.isInteger(error.code) ? error.code : 1;
  }
  return commandEvidence({
    argv: [...argv],
    exit,
    durationMs: Math.max(0, Date.now() - started),
    stdout,
    stderr
  });
}

function proofCommandsFor(scenario) {
  const definition = SCENARIO_PROOFS[scenario.id];
  const commands = PROOF_ALLOWLIST[definition.proofKey];
  if (!commands) throw new Error(`No hard-coded proof allow-list entry for ${scenario.id}.`);
  return commands;
}

function contextSignature(context) {
  return JSON.stringify({
    formula: context.formula,
    packet: context.packet,
    legacy: context.legacy.sources,
    trio: context.trio.sources
  });
}

async function evaluateScenario(sourceRoot, scenario, runProofs) {
  const context = await buildContextPair(sourceRoot, scenario);
  const commands = [];
  if (runProofs) {
    for (const argv of proofCommandsFor(scenario)) {
      commands.push(await executeAllowedCommand(argv, sourceRoot));
    }
  }
  const sourceDrift = contextSignature(context) !== contextSignature(await buildContextPair(sourceRoot, scenario));
  const commandPass = commands.length > 0 && commands.every((command) => command.contractPass && command.evidenceComplete);
  return {
    id: scenario.id,
    capability: scenario.capability,
    packetPath: scenario.packetPath,
    packetSha256: sha256(scenario.packetBytes),
    commands,
    contractPass: commandPass && !sourceDrift,
    evidenceComplete: commandPass && !sourceDrift && commands.every((command) => command.stdoutHash && command.stderrHash),
    sourceDrift,
    measurementKind: 'deterministic_shadow_replay',
    notAHostTaskRun: true,
    actualModel: 'unknown',
    actualEffort: 'unknown',
    mainTokens: null,
    workerTokens: null,
    freshTokenProxy: null,
    trustworthyCost: null,
    humanIntervention: null,
    scopeDrift: null,
    limitations: [...RESULT_LIMITATIONS],
    context
  };
}

function pendingOrchestration(reason, input = {}) {
  return {
    verdict: 'pending',
    status: 'pending',
    freshShare: null,
    chiefFresh: null,
    delegateFresh: null,
    selection: {
      taskId: input.taskId ?? null,
      chiefSessionId: input.chiefSessionId ?? null,
      delegateSessionIds: input.includeSessionIds ?? []
    },
    reason,
    limitations: [
      'Selection, task attribution, and token availability are not sufficient for a task-level aggregation.',
      'This proxy is not authenticated model evidence or billing attribution.'
    ]
  };
}

export async function evaluateOrchestrationProxy(input = {}) {
  const required = ['taskId', 'chiefSessionId', 'dateFrom', 'dateTo'];
  const missing = required.filter((key) => typeof input[key] !== 'string' || input[key].trim() === '');
  if (missing.length > 0) return { ...pendingOrchestration(`Missing explicit orchestration selection: ${missing.join(', ')}.`, input), verdict: 'fail', status: 'fail' };
  const includeSessionIds = Array.isArray(input.includeSessionIds) ? [...input.includeSessionIds] : [];
  if (includeSessionIds.length === 0) return { ...pendingOrchestration('At least one explicit delegate include is required for an auditable selection.', input), verdict: 'fail', status: 'fail' };
  if (includeSessionIds.some((id) => typeof id !== 'string' || id.trim() === '')) return { ...pendingOrchestration('Invalid explicit delegate session selection.', input), verdict: 'fail', status: 'fail' };
  if (new Set(includeSessionIds).size !== includeSessionIds.length) return { ...pendingOrchestration('Duplicate delegate session selection is not auditable.', input), verdict: 'fail', status: 'fail' };
  if (includeSessionIds.includes(input.chiefSessionId)) return { ...pendingOrchestration('Chief session cannot also be a delegate.', input), verdict: 'fail', status: 'fail' };

  let audit;
  try {
    audit = await runTokenAudit({
      dateFrom: input.dateFrom,
      dateTo: input.dateTo === 'current' ? new Date().toISOString() : input.dateTo,
      sessionsRoot: input.sessionsRoot,
      now: input.now
    });
  } catch (error) {
    return { ...pendingOrchestration(`Token-audit selection failed: ${error.message}`, input), verdict: 'fail', status: 'fail' };
  }
  const allSessions = audit?.leaderboards?.sessions;
  if (!Array.isArray(allSessions)) {
    return { ...pendingOrchestration('Token-audit did not return an auditable session list.', input), verdict: 'fail', status: 'fail' };
  }
  const allSessionIds = allSessions.map((session) => session?.sessionId);
  if (allSessionIds.some((id) => typeof id !== 'string' || id.trim() === '') || new Set(allSessionIds).size !== allSessionIds.length) {
    return { ...pendingOrchestration('Token-audit contains duplicate or invalid session identities.', input), verdict: 'fail', status: 'fail' };
  }
  const exactTaskSessions = allSessions.filter((session) => session.taskId === input.taskId);
  const chief = exactTaskSessions.find((session) => session.sessionId === input.chiefSessionId);
  if (!chief) return { ...pendingOrchestration('Chief session must be present in the exact task-id selection.', input), verdict: 'fail', status: 'fail' };
  const exactTaskIds = new Set(exactTaskSessions.map((session) => session.sessionId));
  const duplicateExplicit = includeSessionIds.filter((id) => exactTaskIds.has(id));
  if (duplicateExplicit.length > 0) return { ...pendingOrchestration(`Explicit include duplicates an automatically selected exact-task session: ${duplicateExplicit.join(', ')}.`, input), verdict: 'fail', status: 'fail' };
  const orderedExactTaskSessions = [
    chief,
    ...exactTaskSessions
      .filter((session) => session.sessionId !== chief.sessionId)
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId))
  ];
  const selectedIds = [...orderedExactTaskSessions.map((session) => session.sessionId), ...includeSessionIds];
  const byId = new Map(allSessions.map((session) => [session.sessionId, session]));
  const absent = selectedIds.filter((id) => !byId.has(id));
  if (absent.length > 0) return { ...pendingOrchestration(`Explicit sessions were not found in the selected window: ${absent.join(', ')}.`, input), verdict: 'fail', status: 'fail' };
  const delegates = selectedIds.filter((id) => id !== chief.sessionId).map((id) => byId.get(id));
  if (![chief, ...delegates].every((session) => Number.isFinite(session.totalTokens) && session.totalTokens > 0 && Number.isFinite(session.freshProxy) && session.freshProxy >= 0)) {
    return { ...pendingOrchestration('Selected sessions do not expose usable cumulative token totals.', input), verdict: 'fail', status: 'fail' };
  }
  const chiefFresh = chief.freshProxy;
  const delegateFresh = delegates.reduce((total, session) => total + session.freshProxy, 0);
  const denominator = chiefFresh + delegateFresh;
  if (!(denominator > 0)) return { ...pendingOrchestration('Fresh-token denominator is zero.', input), verdict: 'fail', status: 'fail' };
  const freshShare = chiefFresh / denominator;
  return {
    verdict: freshShare < ORCHESTRATION_SHARE_THRESHOLD ? 'pass' : 'fail',
    status: 'observed',
    freshShare,
    chiefFresh,
    delegateFresh,
    selection: {
      taskId: input.taskId,
      chiefSessionId: input.chiefSessionId,
      exactTaskSessionIds: orderedExactTaskSessions.map((session) => session.sessionId),
      selectedSessionIds: [...selectedIds],
      delegateSessionIds: delegates.map((session) => session.sessionId),
      selectedSessionCount: selectedIds.length,
      selectedTaskIds: [...new Set([chief, ...delegates].map((session) => session.taskId))]
    },
    limitations: [
      'Selection: exact task-ID matches are automatically selected; generic or misattributed delegates require explicit include IDs.',
      'Task attribution: exact task ID matching is heuristic, and explicit generic includes are manual exceptions rather than billing or model proof.',
      'Session cumulative: values are cumulative for the selected window and can grow after this snapshot.',
      'Billing: freshProxy is not billing, price, model-quality, or authenticated actual-model evidence.'
    ]
  };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && sameValue(Object.keys(value).sort(), [...keys].sort());
}

function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return sameValue(leftKeys, rightKeys) && leftKeys.every((key) => sameValue(left[key], right[key]));
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isNonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isFiniteNonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function sourcePathsFor(scenario) {
  return {
    legacy: [scenario.packetPath, 'AGENTS.md'],
    trio: [
      scenario.packetPath,
      'harness/trio/templates/entry-policy.md',
      'harness/trio/skill/SKILL.md',
      `harness/trio/capabilities/${scenario.capability}/SKILL.md`
    ]
  };
}

function validateSourceRecord(record, expectedPath, label, failures) {
  if (!hasExactKeys(record, ['path', 'sha256', 'bytes', 'approximateTokens', 'formula'])) {
    failures.push(`${label} field set mismatch`);
    return false;
  }
  let valid = true;
  if (record.path !== expectedPath) {
    failures.push(`${label} path mismatch`);
    valid = false;
  }
  if (!isSha256(record.sha256)) {
    failures.push(`${label} hash missing`);
    valid = false;
  }
  if (!isNonnegativeInteger(record.bytes) || record.approximateTokens !== Math.ceil(record.bytes / 4)) {
    failures.push(`${label} token arithmetic mismatch`);
    valid = false;
  }
  if (record.formula !== CONTEXT_FORMULA) {
    failures.push(`${label} formula mismatch`);
    valid = false;
  }
  return valid;
}

function validateSourceGroup(group, expectedPaths, label, failures) {
  if (!hasExactKeys(group, ['sources', 'bytes', 'approximateTokens']) || !Array.isArray(group?.sources) || group.sources.length !== expectedPaths.length) {
    failures.push(`${label} source group mismatch`);
    return false;
  }
  let valid = true;
  for (const [index, expectedPath] of expectedPaths.entries()) {
    valid = validateSourceRecord(group.sources[index], expectedPath, `${label} source ${index}`, failures) && valid;
  }
  const bytes = group.sources.reduce((total, source) => total + (isNonnegativeInteger(source?.bytes) ? source.bytes : 0), 0);
  if (group.bytes !== bytes || group.approximateTokens !== Math.ceil(group.bytes / 4)) {
    failures.push(`${label} aggregate token arithmetic mismatch`);
    valid = false;
  }
  return valid;
}

function validateContext(context, scenario, index, failures) {
  if (!hasExactKeys(context, ['formula', 'packet', 'legacy', 'trio', 'reduction'])) {
    failures.push(`scenario ${index} context field set mismatch`);
    return false;
  }
  const expectedPaths = sourcePathsFor(scenario);
  let valid = context.formula === CONTEXT_FORMULA;
  if (!valid) failures.push(`scenario ${index} context formula mismatch`);
  valid = validateSourceRecord(context.packet, scenario.packetPath, `scenario ${index} packet`, failures) && valid;
  valid = validateSourceGroup(context.legacy, expectedPaths.legacy, `scenario ${index} legacy`, failures) && valid;
  valid = validateSourceGroup(context.trio, expectedPaths.trio, `scenario ${index} trio`, failures) && valid;
  if (!sameValue(context.packet, context.legacy?.sources?.[0]) || !sameValue(context.packet, context.trio?.sources?.[0])) {
    failures.push(`scenario ${index} packet is not fully paired`);
    valid = false;
  }
  const legacyTokens = context.legacy?.approximateTokens;
  const trioTokens = context.trio?.approximateTokens;
  const expectedReduction = legacyTokens === 0 ? null : (legacyTokens - trioTokens) / legacyTokens;
  if (!sameValue(context.reduction, expectedReduction)) {
    failures.push(`scenario ${index} reduction mismatch`);
    valid = false;
  }
  return valid;
}

function validateOrchestrationProxy(orchestrationProxy, topLevelVerdict, failures) {
  if (!isRecord(orchestrationProxy) || !['pass', 'fail', 'pending'].includes(topLevelVerdict)) {
    failures.push('orchestration verdict is unknown');
    return;
  }
  if (orchestrationProxy.verdict !== topLevelVerdict) failures.push('top-level orchestration verdict does not match nested evidence');
  if (!Array.isArray(orchestrationProxy.limitations) || orchestrationProxy.limitations.length === 0 || JSON.stringify(orchestrationProxy).includes('.jsonl')) {
    failures.push('orchestration limitations or path boundary is invalid');
  }
  if (orchestrationProxy.status !== 'observed') {
    if (!hasExactKeys(orchestrationProxy, ['verdict', 'status', 'freshShare', 'chiefFresh', 'delegateFresh', 'selection', 'reason', 'limitations'])) {
      failures.push('pending orchestration field set mismatch');
    }
    if (!['fail', 'pending'].includes(orchestrationProxy.status) || orchestrationProxy.verdict !== orchestrationProxy.status) {
      failures.push('pending orchestration status mismatch');
    }
    if (orchestrationProxy.freshShare !== null || orchestrationProxy.chiefFresh !== null || orchestrationProxy.delegateFresh !== null || typeof orchestrationProxy.reason !== 'string' || orchestrationProxy.reason.trim() === '') {
      failures.push('pending orchestration measurement mismatch');
    }
    if (!hasExactKeys(orchestrationProxy.selection, ['taskId', 'chiefSessionId', 'delegateSessionIds']) || !Array.isArray(orchestrationProxy.selection?.delegateSessionIds)) {
      failures.push('pending orchestration selection mismatch');
    }
    return;
  }

  if (!hasExactKeys(orchestrationProxy, ['verdict', 'status', 'freshShare', 'chiefFresh', 'delegateFresh', 'selection', 'limitations'])) {
    failures.push('observed orchestration field set mismatch');
    return;
  }
  const selection = orchestrationProxy.selection;
  if (!hasExactKeys(selection, ['taskId', 'chiefSessionId', 'exactTaskSessionIds', 'selectedSessionIds', 'delegateSessionIds', 'selectedSessionCount', 'selectedTaskIds'])) {
    failures.push('observed orchestration selection field set mismatch');
    return;
  }
  const idArrays = ['exactTaskSessionIds', 'selectedSessionIds', 'delegateSessionIds'];
  if (typeof selection.taskId !== 'string' || selection.taskId.trim() === '' || typeof selection.chiefSessionId !== 'string' || selection.chiefSessionId.trim() === '' || idArrays.some((key) => !Array.isArray(selection[key]) || selection[key].some((id) => typeof id !== 'string' || id.trim() === '') || new Set(selection[key]).size !== selection[key].length)) {
    failures.push('observed orchestration selection identities are invalid');
    return;
  }
  if (selection.exactTaskSessionIds[0] !== selection.chiefSessionId || !selection.selectedSessionIds.includes(selection.chiefSessionId) || !sameValue(selection.selectedSessionIds.slice(0, selection.exactTaskSessionIds.length), selection.exactTaskSessionIds)) {
    failures.push('observed orchestration Chief selection mismatch');
  }
  if (!sameValue(selection.delegateSessionIds, selection.selectedSessionIds.filter((id) => id !== selection.chiefSessionId)) || selection.selectedSessionCount !== selection.selectedSessionIds.length) {
    failures.push('observed orchestration delegate selection mismatch');
  }
  if (!Array.isArray(selection.selectedTaskIds) || selection.selectedTaskIds.length === 0 || selection.selectedTaskIds.some((taskId) => typeof taskId !== 'string' || taskId.trim() === '') || new Set(selection.selectedTaskIds).size !== selection.selectedTaskIds.length) {
    failures.push('observed orchestration task attribution mismatch');
  }
  if (!isFiniteNonnegative(orchestrationProxy.chiefFresh) || !isFiniteNonnegative(orchestrationProxy.delegateFresh)) {
    failures.push('observed orchestration fresh values are invalid');
    return;
  }
  const denominator = orchestrationProxy.chiefFresh + orchestrationProxy.delegateFresh;
  const expectedShare = denominator > 0 ? orchestrationProxy.chiefFresh / denominator : null;
  if (!Number.isFinite(expectedShare) || orchestrationProxy.freshShare !== expectedShare) failures.push('observed orchestration fresh share mismatch');
  const expectedVerdict = expectedShare !== null && expectedShare < ORCHESTRATION_SHARE_THRESHOLD ? 'pass' : 'fail';
  if (orchestrationProxy.verdict !== expectedVerdict) failures.push('observed orchestration threshold verdict mismatch');
}

export function validateEvaluationReport(report) {
  const failures = [];
  const reportKeys = ['schemaVersion', 'notice', 'generatedAt', 'proofsExecuted', 'scenarioIds', 'scenarios', 'summary', 'shadowVerdict', 'costProxyVerdict', 'orchestrationProxyVerdict', 'orchestrationProxy', 'cutoverVerdict', 'limitations'];
  if (!hasExactKeys(report, reportKeys)) failures.push('report field set mismatch');
  if (report?.schemaVersion !== 1) failures.push('schema version mismatch');
  if (report?.notice !== 'Deterministic shadow evidence; not a matched Host/model/billing benchmark.') failures.push('missing deterministic evidence notice');
  if (typeof report?.generatedAt !== 'string' || Number.isNaN(Date.parse(report.generatedAt))) failures.push('generation timestamp is invalid');
  if (typeof report?.proofsExecuted !== 'boolean') failures.push('proof execution state is invalid');
  if (!sameValue(report?.scenarioIds, SCENARIO_IDS)) failures.push('scenario ID order mismatch');
  if (!Array.isArray(report?.scenarios) || report.scenarios.length !== SCENARIO_IDS.length) failures.push('scenario result count mismatch');

  for (const [index, scenario] of (report?.scenarios ?? []).entries()) {
    const scenarioId = SCENARIO_IDS[index];
    const definition = SCENARIO_PROOFS[scenarioId];
    const scenarioKeys = ['id', 'capability', 'packetPath', 'packetSha256', 'commands', 'contractPass', 'evidenceComplete', 'sourceDrift', 'measurementKind', 'notAHostTaskRun', 'actualModel', 'actualEffort', 'mainTokens', 'workerTokens', 'freshTokenProxy', 'trustworthyCost', 'humanIntervention', 'scopeDrift', 'limitations', 'context'];
    if (!hasExactKeys(scenario, scenarioKeys)) failures.push(`scenario ${index} field set mismatch`);
    if (scenario?.id !== scenarioId || scenario?.capability !== definition?.capability || scenario?.packetPath !== `packets/${scenarioId}.json`) failures.push(`scenario ${index} mapping mismatch`);
    if (!isSha256(scenario?.packetSha256) || scenario.packetSha256 !== scenario?.context?.packet?.sha256) failures.push(`scenario ${index} packet digest mismatch`);
    if (scenario?.measurementKind !== 'deterministic_shadow_replay' || scenario?.notAHostTaskRun !== true) failures.push(`scenario ${index} measurement boundary missing`);
    if (scenario?.actualModel !== 'unknown' || scenario?.actualEffort !== 'unknown') failures.push(`scenario ${index} actual evidence is not unknown`);
    for (const field of ['mainTokens', 'workerTokens', 'freshTokenProxy', 'trustworthyCost', 'humanIntervention', 'scopeDrift']) {
      if (scenario?.[field] !== null) failures.push(`scenario ${index} ${field} must remain null`);
    }
    if (!sameValue(scenario?.limitations, RESULT_LIMITATIONS)) failures.push(`scenario ${index} limitations missing or changed`);
    const contextValid = validateContext(scenario?.context, { id: scenarioId, capability: definition?.capability, packetPath: `packets/${scenarioId}.json` }, index, failures);
    if (typeof scenario?.sourceDrift !== 'boolean') failures.push(`scenario ${index} source drift state is invalid`);
    const expectedCommands = report?.proofsExecuted ? (PROOF_ALLOWLIST[definition?.proofKey] ?? []) : [];
    if (!Array.isArray(scenario?.commands) || scenario.commands.length !== expectedCommands.length) failures.push(`scenario ${index} proof command count mismatch`);
    let commandsPass = expectedCommands.length > 0 && Array.isArray(scenario?.commands) && scenario.commands.length === expectedCommands.length;
    for (const [commandIndex, command] of (scenario?.commands ?? []).entries()) {
      const expectedArgv = expectedCommands[commandIndex];
      if (!hasExactKeys(command, ['argv', 'exit', 'durationMs', 'stdoutHash', 'stderrHash', 'contractPass', 'evidenceComplete'])) {
        failures.push(`scenario ${index} command ${commandIndex} field set mismatch`);
        commandsPass = false;
        continue;
      }
      const evidenceComplete = Array.isArray(command.argv) && command.argv.length >= 2 && typeof command.argv[0] === 'string' && isNonnegativeInteger(command.durationMs) && isSha256(command.stdoutHash) && isSha256(command.stderrHash);
      if (!sameValue(command.argv, expectedArgv)) failures.push(`scenario ${index} command ${commandIndex} argv is not allow-listed`);
      if (!Number.isInteger(command.exit) || command.contractPass !== (command.exit === 0) || command.evidenceComplete !== evidenceComplete) failures.push(`scenario ${index} command ${commandIndex} status mismatch`);
      commandsPass = commandsPass && sameValue(command.argv, expectedArgv) && command.contractPass && command.evidenceComplete;
    }
    const expectedScenarioPass = commandsPass && contextValid && scenario?.sourceDrift === false;
    if (scenario?.contractPass !== expectedScenarioPass || scenario?.evidenceComplete !== expectedScenarioPass) failures.push(`scenario ${index} contract or evidence mismatch`);
  }

  const accepted = (report?.scenarios ?? []).filter((scenario) => scenario?.contractPass && scenario?.evidenceComplete).length;
  const reductions = (report?.scenarios ?? []).map((scenario) => scenario?.context?.reduction);
  const calculatedMedian = reductions.length === SCENARIO_IDS.length && reductions.every((value) => Number.isFinite(value)) ? median(reductions) : null;
  if (!hasExactKeys(report?.summary, ['scenarioCount', 'acceptedCount', 'medianContextTokenReduction', 'threshold', 'formula'])) {
    failures.push('summary field set mismatch');
  } else if (report.summary.scenarioCount !== SCENARIO_IDS.length || report.summary.acceptedCount !== accepted || !sameValue(report.summary.medianContextTokenReduction, calculatedMedian) || report.summary.threshold !== MEDIAN_REDUCTION_THRESHOLD || report.summary.formula !== CONTEXT_FORMULA) {
    failures.push('summary does not match replay evidence');
  }
  const expectedShadow = accepted === SCENARIO_IDS.length ? 'pass' : 'fail';
  if (report?.shadowVerdict !== expectedShadow) failures.push('shadow verdict does not match evidence');
  const expectedCost = calculatedMedian !== null && calculatedMedian >= MEDIAN_REDUCTION_THRESHOLD ? 'pass' : 'fail';
  if (report?.costProxyVerdict !== expectedCost) failures.push('cost proxy verdict does not match threshold evidence');
  validateOrchestrationProxy(report?.orchestrationProxy, report?.orchestrationProxyVerdict, failures);
  if (report?.cutoverVerdict !== 'pending_full_preconditions') failures.push('cutover verdict must remain pending');
  if (!sameValue(report?.limitations, [...RESULT_LIMITATIONS, 'Cutover remains pending until Chief verifies the complete precondition matrix.'])) failures.push('report limitations missing or changed');
  return { valid: failures.length === 0, failures };
}

export async function evaluateFixture({ fixtureRoot = DEFAULT_FIXTURE_ROOT, sourceRoot = SCRIPT_ROOT, runProofs = true, orchestration = {} } = {}) {
  const fixture = await loadFixture(fixtureRoot);
  const scenarios = [];
  for (const scenario of fixture.scenarios) scenarios.push(await evaluateScenario(sourceRoot, scenario, runProofs));
  const accepted = scenarios.filter((scenario) => scenario.contractPass && scenario.evidenceComplete);
  const reductions = scenarios.map((scenario) => scenario.context.reduction);
  const medianReduction = reductions.every((value) => Number.isFinite(value)) ? median(reductions) : null;
  const shadowVerdict = accepted.length === SCENARIO_IDS.length ? 'pass' : 'fail';
  const costProxyVerdict = medianReduction !== null && medianReduction >= MEDIAN_REDUCTION_THRESHOLD ? 'pass' : 'fail';
  const orchestrationProxy = await evaluateOrchestrationProxy(orchestration);
  const report = {
    schemaVersion: 1,
    notice: 'Deterministic shadow evidence; not a matched Host/model/billing benchmark.',
    generatedAt: new Date().toISOString(),
    proofsExecuted: runProofs,
    scenarioIds: [...SCENARIO_IDS],
    scenarios,
    summary: {
      scenarioCount: scenarios.length,
      acceptedCount: accepted.length,
      medianContextTokenReduction: medianReduction,
      threshold: MEDIAN_REDUCTION_THRESHOLD,
      formula: CONTEXT_FORMULA
    },
    shadowVerdict,
    costProxyVerdict,
    orchestrationProxyVerdict: orchestrationProxy.verdict,
    orchestrationProxy,
    cutoverVerdict: 'pending_full_preconditions',
    limitations: [...RESULT_LIMITATIONS, 'Cutover remains pending until Chief verifies the complete precondition matrix.']
  };
  const validation = validateEvaluationReport(report);
  if (!validation.valid) throw new Error(`Evaluation report failed closed: ${validation.failures.join('; ')}`);
  return report;
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a non-empty value.`);
  return value;
}

export function parseCliArgs(argv = []) {
  if (!Array.isArray(argv)) throw new Error('CLI arguments must be an array.');
  const options = { includeSessionIds: [] };
  const seen = new Set();
  const valueFlags = new Set([
    '--fixture-root',
    '--output',
    '--task-id',
    '--chief-session-id',
    '--date-from',
    '--date-to',
    '--sessions-root'
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--include-session-id') {
      const value = requireValue(argv, index, flag);
      if (options.includeSessionIds.includes(value)) throw new Error('Duplicate --include-session-id is not allowed.');
      options.includeSessionIds.push(value);
      index += 1;
      continue;
    }
    if (!valueFlags.has(flag)) throw new Error(`Unknown or malformed argument: ${flag}`);
    if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    seen.add(flag);
    options[flag.slice(2).replaceAll('-', '')] = requireValue(argv, index, flag);
    index += 1;
  }
  if (options.fixtureRoot && !path.isAbsolute(options.fixtureRoot)) throw new Error('--fixture-root must be absolute.');
  if (options.output && !path.isAbsolute(options.output)) throw new Error('--output must be absolute.');
  if (options.sessionsroot && !path.isAbsolute(options.sessionsroot)) throw new Error('--sessions-root must be absolute.');
  if (options.dateFrom && Number.isNaN(Date.parse(options.dateFrom))) throw new Error('--date-from must be an ISO date.');
  if (options.dateTo && options.dateTo !== 'current' && Number.isNaN(Date.parse(options.dateTo))) throw new Error('--date-to must be an ISO date or current.');
  return options;
}

async function canonicalDirectory(targetPath, label) {
  const stat = await lstat(targetPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a real directory.`);
  return realpath(targetPath);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function validateFixtureRoot(requestedRoot) {
  const resolved = await canonicalDirectory(path.resolve(requestedRoot), 'Fixture root');
  const canonicalTmp = await realpath(os.tmpdir());
  const canonicalDefaultFixture = await realpath(DEFAULT_FIXTURE_ROOT);
  if (resolved !== canonicalDefaultFixture && !isInside(canonicalTmp, resolved)) {
    throw new Error('Fixture root must be the canonical repository evaluation fixture or inside OS temporary storage.');
  }
  await assertEvaluationTree(resolved);
  return resolved;
}

export async function validateOutputPath(requestedOutput, fixtureRoot) {
  const output = path.resolve(requestedOutput);
  const parentRequested = path.dirname(output);
  let parentStat;
  try {
    parentStat = await lstat(parentRequested);
  } catch (error) {
    throw new Error(`Output parent is missing: ${parentRequested}`, { cause: error });
  }
  if (!parentStat.isDirectory() && !parentStat.isSymbolicLink()) throw new Error('Output parent must be a directory.');
  const parent = await realpath(parentRequested);
  const resolvedParentStat = await lstat(parent);
  if (!resolvedParentStat.isDirectory() || resolvedParentStat.isSymbolicLink()) throw new Error('Output parent must resolve to a real directory.');
  const canonicalTempRoots = await Promise.all([os.tmpdir(), '/tmp'].map((directory) => realpath(directory)));
  const canonicalFixture = await realpath(fixtureRoot);
  const canonicalDefaultFixture = await realpath(DEFAULT_FIXTURE_ROOT);
  const canonicalOutput = path.join(parent, path.basename(output));
  const allowedFixtureResult = canonicalFixture === canonicalDefaultFixture && canonicalOutput === path.join(canonicalDefaultFixture, DEFAULT_RESULT_NAME);
  if (!allowedFixtureResult && !canonicalTempRoots.some((root) => isInside(root, parent))) throw new Error('Output must be the exact fixture result or inside OS temporary storage.');
  if (isInside(canonicalFixture, parent) && !allowedFixtureResult) throw new Error('Output inside the fixture root is not an allowed result path.');
  try {
    const stat = await lstat(canonicalOutput);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Output must not be a symlink or non-regular file.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return canonicalOutput;
}

async function writeJsonAtomically(outputPath, value) {
  const parent = path.dirname(outputPath);
  const temporaryPath = path.join(parent, `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  let published = false;
  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, outputPath);
    published = true;
    const directoryHandle = await open(parent, 'r');
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    if (!published) await unlink(temporaryPath).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
  }
}

function orchestrationInputFromOptions(options) {
  if (!options.taskid && !options.chiefsessionid && !options.datefrom && !options.dateto && !options.sessionsroot && options.includeSessionIds.length === 0) return {};
  return {
    taskId: options.taskid,
    chiefSessionId: options.chiefsessionid,
    dateFrom: options.datefrom,
    dateTo: options.dateto,
    sessionsRoot: options.sessionsroot,
    includeSessionIds: options.includeSessionIds
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const fixtureRoot = await validateFixtureRoot(options.fixtureroot ?? DEFAULT_FIXTURE_ROOT);
  const outputPath = options.output ? await validateOutputPath(options.output, fixtureRoot) : null;
  const report = await evaluateFixture({
    fixtureRoot,
    sourceRoot: SCRIPT_ROOT,
    orchestration: orchestrationInputFromOptions(options)
  });
  if (outputPath) {
    await writeJsonAtomically(outputPath, report);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`evaluate-trio-v2: ${error.message}\n`);
    process.exitCode = 1;
  }
}

export { CAPABILITIES, CONTEXT_FORMULA, DEFAULT_FIXTURE_ROOT, PROOF_ALLOWLIST, SCENARIO_PROOFS, SCENARIO_IDS };
