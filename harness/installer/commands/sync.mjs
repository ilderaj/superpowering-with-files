import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteText } from '../../trio/core/store.mjs';
import { parseV2Config } from '../../trio/config.mjs';
import { projectConfig } from '../../trio/projection.mjs';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import {
  diffProjectionManifest,
  readProjectionManifest
} from '../lib/projection-manifest.mjs';
import {
  parseTrioCommandOptions,
  preflightTrioFixturePaths,
  readState,
  recheckTrioFixturePaths,
  resolveTrioFixture,
  selectInstallerRuntime
} from '../lib/state.mjs';
import {
  buildSyncPlan,
  collectSyncOperations,
  formatDiff,
  includeRetiredProjectionDiff
} from '../lib/sync-plan.mjs';
import { applySyncPlan } from '../lib/sync-apply.mjs';
import { renderSyncReport } from '../lib/sync-report.mjs';

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TRIO_SURFACE_SOURCES = Object.freeze({
  entry: 'harness/trio/templates/entry-policy.md',
  trio: 'harness/trio/skill/SKILL.md',
  dev: 'harness/trio/capabilities/dev/SKILL.md',
  office: 'harness/trio/capabilities/office/SKILL.md',
  safety: 'harness/trio/capabilities/safety/SKILL.md'
});

function trioBridgeError(message, code = 'ERR_TRIO_BRIDGE') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

function isInside(rootDir, candidate) {
  const relative = path.relative(rootDir, candidate);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function canonicalTrioOptions(args, { allowUpgrade = false, allowRecovery = false, allowOutput = false } = {}) {
  const flags = ['dry-run', 'check'];
  if (allowUpgrade) flags.push('upgrade');
  const values = ['fixture-root', 'home-dir'];
  if (allowRecovery) values.push('recovery');
  if (allowOutput) values.push('output');
  const options = parseTrioCommandOptions(args, { values, flags });
  if (!Object.hasOwn(options, 'fixture-root')) {
    throw trioBridgeError('Trio commands require an explicit --fixture-root.', 'ERR_TRIO_FIXTURE');
  }
  return options;
}

async function loadTargetContract() {
  const source = await readFile(path.join(SOURCE_ROOT, 'harness/trio/runtime-targets.json'), 'utf8');
  try {
    return JSON.parse(source);
  } catch (error) {
    throw trioBridgeError(`Unable to parse the static Trio target contract: ${error.message}.`, 'ERR_TRIO_BRIDGE');
  }
}

function placementRootForCodex(targetPath, scope) {
  const suffix = scope === 'workspace' ? '/AGENTS.md' : '/.codex/AGENTS.md';
  if (!targetPath.endsWith(suffix)) {
    throw trioBridgeError(`Retained Codex path does not match ${scope}: ${targetPath}.`, 'ERR_TRIO_BRIDGE');
  }
  return targetPath.slice(0, -suffix.length) || '/';
}

function scopesForTarget(config, target) {
  if (target.hostKind !== 'codex') {
    return target.paths.map(() => config.scope.kind === 'both' ? 'user-global' : config.scope.kind);
  }
  if (config.scope.kind !== 'both') return target.paths.map(() => config.scope.kind);
  return target.paths.map((targetPath) => targetPath.endsWith('/AGENTS.md') && !targetPath.endsWith('/.codex/AGENTS.md')
    ? 'workspace'
    : 'user-global');
}

function buildTrioPlacements(config, fixture) {
  const placements = [];
  for (const target of config.targets) {
    if (!target.enabled) continue;
    const scopes = scopesForTarget(config, target);
    target.paths.forEach((targetPath, index) => {
      const scope = scopes[index];
      const root = target.hostKind === 'codex'
        ? placementRootForCodex(targetPath, scope)
        : fixture.homeDir;
      if (!isInside(fixture.fixtureRoot, path.resolve(root)) && path.resolve(root) !== fixture.fixtureRoot) {
        throw trioBridgeError(`Trio placement root escapes fixture root: ${root}.`, 'ERR_TRIO_FIXTURE');
      }
      placements.push({ targetId: target.id, targetPath, scope, root });
    });
  }
  return placements;
}

function ownershipIdentity(config, descriptor) {
  return config.ownership.entries.find((entry) =>
    entry.targetId === descriptor.targetId && entry.path === descriptor.destination
  )?.identity ?? null;
}

function normalizeLegacyStatusMap(value) {
  if (!value) return new Map();
  if (!(value instanceof Map)) {
    throw trioBridgeError('Legacy status evidence must be a Map.', 'ERR_TRIO_BRIDGE');
  }
  return value;
}

function normalizeLegacyOwnershipMap(value) {
  if (!value) return new Map();
  if (!(value instanceof Map)) {
    throw trioBridgeError('Legacy ownership evidence must be a Map.', 'ERR_TRIO_BRIDGE');
  }
  return value;
}

async function managedDescriptorObservations(
  config,
  descriptors,
  physical,
  legacyStatusByPath,
  legacyOwnershipByPath
) {
  const physicalByPath = new Map(physical.map((entry) => [entry.absolute, entry]));
  const observations = {};
  for (const descriptor of descriptors) {
    if (descriptor.management !== 'managed') {
      observations[descriptor.destination] = { state: 'unknown' };
      continue;
    }
    const entry = physicalByPath.get(path.resolve(descriptor.destination));
    if (!entry) throw trioBridgeError(`Missing physical preflight for ${descriptor.destination}.`, 'ERR_TRIO_PHYSICAL_GATE');
    if (!entry.exists) {
      observations[descriptor.destination] = { state: 'absent' };
      continue;
    }
    if (['unmanaged', 'user-managed'].includes(legacyStatusByPath.get(descriptor.destination))) {
      observations[descriptor.destination] = { state: 'unmanaged' };
      continue;
    }
    const identity = ownershipIdentity(config, descriptor);
    const actualIdentity = `sha256:${hashText(await readFile(entry.absolute))}`;
    const legacyIdentity = legacyOwnershipByPath.get(descriptor.destination);
    observations[descriptor.destination] = identity && (
      identity === actualIdentity || legacyIdentity === identity
    )
      ? { state: 'managed', identity }
      : { state: 'unknown' };
  }
  return observations;
}

/**
 * Produce a V2-only projection plan after one shared physical fixture preflight.
 */
export async function prepareTrioProjection({
  fixture,
  config,
  legacyStatusByPath,
  legacyOwnershipByPath
} = {}) {
  const validated = parseV2Config(config);
  const targetContract = await loadTargetContract();
  const placements = buildTrioPlacements(validated, fixture);
  const shape = projectConfig({
    config: validated,
    targetContract,
    placements,
    pathObservations: {}
  });
  const managed = shape.descriptors.filter((descriptor) => descriptor.management === 'managed');
  const physical = await preflightTrioFixturePaths({
    fixtureRoot: fixture.fixtureRoot,
    descriptors: managed,
    stateFile: fixture.stateFile
  });
  const observations = await managedDescriptorObservations(
    validated,
    shape.descriptors,
    physical,
    normalizeLegacyStatusMap(legacyStatusByPath),
    normalizeLegacyOwnershipMap(legacyOwnershipByPath)
  );
  const projected = projectConfig({
    config: validated,
    targetContract,
    placements,
    pathObservations: observations
  });
  return Object.freeze({
    config: validated,
    targetContract,
    placements,
    descriptors: projected.descriptors,
    conflicts: projected.conflicts,
    managed,
    physical
  });
}

async function readTrioSources(descriptors) {
  const contents = new Map();
  for (const descriptor of descriptors) {
    if (descriptor.management !== 'managed' || !['create', 'update'].includes(descriptor.action)) continue;
    const relative = TRIO_SURFACE_SOURCES[descriptor.surface];
    if (!relative || descriptor.source !== relative) {
      throw trioBridgeError(`Unexpected Trio source for ${descriptor.surface}.`, 'ERR_TRIO_BRIDGE');
    }
    contents.set(descriptor.destination, await readFile(path.join(SOURCE_ROOT, relative), 'utf8'));
  }
  return contents;
}

async function ensureContainedParent(fixture, targetPath, createdDirectories) {
  const parent = path.dirname(targetPath);
  if (!isInside(fixture.fixtureRoot, parent) && parent !== fixture.fixtureRoot) {
    throw trioBridgeError(`Trio write parent escapes fixture root: ${parent}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  const segments = path.relative(fixture.fixtureRoot, parent).split(path.sep).filter(Boolean);
  let current = fixture.fixtureRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw trioBridgeError(`Trio write parent is not a real directory: ${current}.`, 'ERR_TRIO_PHYSICAL_GATE');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await mkdir(current);
      const lease = { path: current, identity: null };
      createdDirectories.push(lease);
      const created = await lstat(current, { bigint: true });
      if (created.isSymbolicLink() || !created.isDirectory()) {
        throw trioBridgeError(`Trio created parent is not a real directory: ${current}.`, 'ERR_TRIO_PHYSICAL_GATE');
      }
      lease.identity = Object.freeze({ dev: created.dev, ino: created.ino });
    }
  }
}

async function snapshotPaths(paths) {
  const snapshots = new Map();
  for (const targetPath of paths) {
    try {
      const info = await lstat(targetPath, { bigint: true });
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) {
        throw trioBridgeError(`Trio snapshot target is not a regular file: ${targetPath}.`, 'ERR_TRIO_PHYSICAL_GATE');
      }
      const bytes = await readFile(targetPath);
      snapshots.set(targetPath, Object.freeze({
        exists: true,
        bytes,
        sha256: hashText(bytes),
        dev: info.dev,
        ino: info.ino,
        nlink: info.nlink
      }));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        snapshots.set(targetPath, Object.freeze({
          exists: false,
          bytes: null,
          sha256: null,
          dev: null,
          ino: null,
          nlink: null
        }));
      }
      else throw error;
    }
  }
  return snapshots;
}

function settledConfigForWrites(config, writes, sources) {
  if (writes.length !== 5 || new Set(writes.map((descriptor) => descriptor.destination)).size !== 5) {
    throw trioBridgeError('Trio apply must settle exactly five managed surfaces.', 'ERR_TRIO_BRIDGE');
  }
  return parseV2Config({
    ...config,
    ownership: {
      ...config.ownership,
      entries: writes.map((descriptor) => {
        const contents = sources.get(descriptor.destination);
        if (typeof contents !== 'string') {
          throw trioBridgeError(`Missing settled source bytes for ${descriptor.destination}.`, 'ERR_TRIO_BRIDGE');
        }
        return {
          targetId: descriptor.targetId,
          path: descriptor.destination,
          identity: `sha256:${hashText(contents)}`
        };
      })
    }
  });
}

async function recordPublishedFile(targetPath, expected) {
  const info = await lstat(targetPath, { bigint: true });
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1n) {
    throw trioBridgeError(`Trio published target cannot be identified: ${targetPath}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  const actual = await readFile(targetPath);
  const expectedHash = hashText(expected);
  if (hashText(actual) !== expectedHash) {
    throw trioBridgeError(`Trio published target bytes drifted: ${targetPath}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  return Object.freeze({ dev: info.dev, ino: info.ino, nlink: info.nlink, sha256: expectedHash });
}

async function verifyPublishedRollbackTarget({ targetPath, published, fixture, managed }) {
  await recheckTrioFixturePaths({
    fixtureRoot: fixture.fixtureRoot,
    descriptors: managed,
    stateFile: fixture.stateFile
  });
  const info = await lstat(targetPath, { bigint: true });
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.nlink !== 1n ||
    info.dev !== published.dev ||
    info.ino !== published.ino
  ) {
    throw trioBridgeError(`Compensation target changed identity: ${targetPath}.`, 'ERR_TRIO_ROLLBACK');
  }
  const current = await readFile(targetPath);
  if (hashText(current) !== published.sha256) {
    throw trioBridgeError(`Compensation target content drifted: ${targetPath}.`, 'ERR_TRIO_ROLLBACK');
  }
}

function rollbackSettlementError(message, cause) {
  const error = trioBridgeError(message, 'ERR_TRIO_ROLLBACK');
  if (cause) error.cause = cause;
  return error;
}

async function settleProvisionalAttempt({ attempt, fixture, managed }) {
  const { targetPath, before } = attempt;
  try {
    await recheckTrioFixturePaths({
      fixtureRoot: fixture.fixtureRoot,
      descriptors: managed,
      stateFile: fixture.stateFile
    });
    let info;
    try {
      info = await lstat(targetPath, { bigint: true });
    } catch (error) {
      if (!before?.exists && error?.code === 'ENOENT') return;
      throw rollbackSettlementError(`Compensation cannot prove no publication: ${targetPath}.`, error);
    }
    if (!before?.exists) {
      throw rollbackSettlementError(`Compensation provisional target exists: ${targetPath}.`);
    }
    if (
      info.isSymbolicLink() ||
      !info.isFile() ||
      info.nlink !== 1n ||
      info.dev !== before.dev ||
      info.ino !== before.ino ||
      info.nlink !== before.nlink
    ) {
      throw rollbackSettlementError(`Compensation provisional target changed identity: ${targetPath}.`);
    }
    const current = await readFile(targetPath);
    if (hashText(current) !== before.sha256) {
      throw rollbackSettlementError(`Compensation provisional target content drifted: ${targetPath}.`);
    }
  } catch (error) {
    if (error?.code === 'ERR_TRIO_ROLLBACK') throw error;
    throw rollbackSettlementError(`Compensation cannot settle provisional target: ${targetPath}.`, error);
  }
}

async function settleCompensation({
  attempts,
  createdDirectories,
  fixture,
  managed,
  writeText
}) {
  const errors = [];
  for (const attempt of [...attempts].reverse()) {
    const { targetPath, before, published } = attempt;
    try {
      if (!published) {
        await settleProvisionalAttempt({ attempt, fixture, managed });
        continue;
      }
      await verifyPublishedRollbackTarget({ targetPath, published, fixture, managed });
      if (before?.exists) {
        await writeText(targetPath, before.bytes.toString('utf8'));
      } else {
        await unlink(targetPath);
      }
    } catch (error) {
      errors.push(error);
    }
  }
  for (const lease of [...createdDirectories].reverse()) {
    try {
      if (!lease.identity) {
        throw trioBridgeError(`Compensation cannot prove directory ownership: ${lease.path}.`, 'ERR_TRIO_ROLLBACK');
      }
      await recheckTrioFixturePaths({
        fixtureRoot: fixture.fixtureRoot,
        descriptors: managed,
        stateFile: fixture.stateFile
      });
      const info = await lstat(lease.path, { bigint: true });
      if (
        info.isSymbolicLink() ||
        !info.isDirectory() ||
        info.dev !== lease.identity.dev ||
        info.ino !== lease.identity.ino
      ) {
        throw trioBridgeError(`Compensation directory changed identity: ${lease.path}.`, 'ERR_TRIO_ROLLBACK');
      }
      if ((await readdir(lease.path)).length !== 0) {
        throw trioBridgeError(`Compensation directory is not empty: ${lease.path}.`, 'ERR_TRIO_ROLLBACK');
      }
      await rmdir(lease.path);
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

/**
 * Internal fixture-only apply seam. The public CLI never enables this operation.
 */
export async function applyTrioProjection({
  fixture,
  config,
  legacyStatusByPath,
  legacyOwnershipByPath,
  beforeWrite,
  writeText = atomicWriteText
} = {}) {
  if (beforeWrite !== undefined && typeof beforeWrite !== 'function') {
    throw trioBridgeError('Trio beforeWrite must be a function when supplied.', 'ERR_TRIO_BRIDGE');
  }
  const prepared = await prepareTrioProjection({
    fixture,
    config,
    legacyStatusByPath,
    legacyOwnershipByPath
  });
  const managedConflicts = prepared.conflicts.filter((conflict) =>
    prepared.descriptors.some((descriptor) =>
      descriptor.destination === conflict.destination && descriptor.management === 'managed'
    )
  );
  if (managedConflicts.length > 0) {
    throw trioBridgeError('Trio projection has unresolved destination conflicts.', 'ERR_TRIO_CONFLICT');
  }
  const writes = prepared.descriptors.filter((descriptor) =>
    descriptor.management === 'managed' && ['create', 'update'].includes(descriptor.action)
  );
  const sources = await readTrioSources(writes);
  const settledConfig = settledConfigForWrites(prepared.config, writes, sources);
  const desired = new Map(sources);
  desired.set(fixture.stateFile, `${JSON.stringify(settledConfig, null, 2)}\n`);
  const snapshots = await snapshotPaths([...desired.keys()]);
  const createdDirectories = [];
  const attempts = [];
  const writeDesired = async (targetPath) => {
    const before = snapshots.get(targetPath);
    const options = before?.exists ? { expectedSha256: before.sha256 } : {};
    const attempt = { targetPath, before, published: null };
    attempts.push(attempt);
    await writeText(targetPath, desired.get(targetPath), options);
    attempt.published = await recordPublishedFile(targetPath, desired.get(targetPath));
  };
  try {
    for (const descriptor of writes) {
      await ensureContainedParent(fixture, descriptor.destination, createdDirectories);
      if (beforeWrite) await beforeWrite(Object.freeze({ targetPath: descriptor.destination, phase: 'target' }));
      await recheckTrioFixturePaths({
        fixtureRoot: fixture.fixtureRoot,
        descriptors: prepared.managed,
        stateFile: fixture.stateFile
      });
      await writeDesired(descriptor.destination);
    }
    await ensureContainedParent(fixture, fixture.stateFile, createdDirectories);
    if (beforeWrite) await beforeWrite(Object.freeze({ targetPath: fixture.stateFile, phase: 'state' }));
    await recheckTrioFixturePaths({
      fixtureRoot: fixture.fixtureRoot,
      descriptors: prepared.managed,
      stateFile: fixture.stateFile
    });
    await writeDesired(fixture.stateFile);
  } catch (error) {
    const rollbackErrors = await settleCompensation({
      attempts,
      createdDirectories,
      fixture,
      managed: prepared.managed,
      writeText
    });
    if (rollbackErrors.length > 0) {
      const composite = trioBridgeError('Trio projection failed and compensation was incomplete.', 'ERR_TRIO_ROLLBACK');
      composite.cause = error;
      composite.errors = rollbackErrors;
      throw composite;
    }
    throw error;
  }
  return Object.freeze({
    ...prepared,
    config: settledConfig,
    writes: writes.map((descriptor) => descriptor.destination),
    statePath: fixture.stateFile
  });
}

function renderTrioSyncReport(prepared, mode) {
  return {
    schemaVersion: 2,
    runtime: 'trio',
    mode,
    descriptors: prepared.descriptors.map((descriptor) => ({
      targetId: descriptor.targetId,
      surface: descriptor.surface,
      destination: descriptor.destination,
      action: descriptor.action,
      execution: descriptor.execution,
      conflict: Boolean(descriptor.conflict)
    })),
    conflicts: prepared.conflicts
  };
}

export async function readTrioSyncReport(args = []) {
  const options = canonicalTrioOptions(args);
  if (!options['dry-run'] || options.check) {
    throw trioBridgeError('Public Trio sync requires --dry-run without --check.', 'ERR_TRIO_DRY_RUN_REQUIRED');
  }
  const fixture = await resolveTrioFixture({
    fixtureRoot: options['fixture-root'],
    homeDir: options['home-dir']
  });
  const config = await readState(fixture.fixtureRoot);
  const prepared = await prepareTrioProjection({ fixture, config });
  return renderTrioSyncReport(prepared, 'dry-run');
}

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function usage() {
  return [
    'Usage: ./scripts/harness sync [--conflict=reject|backup] [--dry-run] [--check] [--takeover]',
    '',
    'Options:',
    '  --conflict=reject|backup  Refuse or back up non-Harness-owned paths before writing',
    '  --dry-run                 Print the desired projection diff without writing files',
    '  --check                   Exit non-zero when sync would make changes',
    '  --takeover                Treat desired projection targets as Harness-owned for this run',
    '  --help, -h                Show this help message'
  ].join('\n');
}

export async function planSyncOperations({ rootDir, homeDir, state }) {
  return collectSyncOperations({ rootDir, homeDir, state });
}

async function computeBaseSyncPlanReport({
  rootDir,
  homeDir,
  state
}) {
  const effectiveHomeDir = homeDir ?? os.homedir();
  const effectiveState = state ?? (await readState(rootDir));
  const currentManifest = await readProjectionManifest(rootDir);
  const plan = await planSyncOperations({ rootDir, homeDir: effectiveHomeDir, state: effectiveState });
  const diff = includeRetiredProjectionDiff(
    diffProjectionManifest(currentManifest, plan.manifest),
    plan.retiredProjections
  );
  return {
    state: effectiveState,
    currentManifest,
    plan,
    diff,
    summary: formatDiff(diff)
  };
}

export async function computeSyncPlanReport({ rootDir, homeDir, state }) {
  const baseReport = await computeBaseSyncPlanReport({ rootDir, homeDir, state });
  return renderSyncReport(baseReport, {
    mode: 'plan',
    warnings: [],
    details: {
      projections: baseReport.plan?.targets ?? [],
      hooks: [...new Set(baseReport.plan?.hookWrites?.map((entry) => entry.parentSkillName).filter(Boolean) ?? [])]
    }
  });
}

export async function sync(args = [], options = {}) {
  const runtime = selectInstallerRuntime();
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  if (runtime === 'trio') {
    const report = await readTrioSyncReport(args);
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  const rootDir = options.rootDir ?? (await discoverAuthorityRoot(process.cwd())).rootDir;
  const homeDir = options.homeDir ?? os.homedir();
  const state = options.state ?? (await readState(rootDir));
  const conflictMode = readOption(args, 'conflict', 'reject');
  const dryRun = hasFlag(args, '--dry-run');
  const check = hasFlag(args, '--check');
  const takeover = hasFlag(args, '--takeover');
  if (!['reject', 'backup'].includes(conflictMode)) {
    throw new Error(`Invalid conflict mode: ${conflictMode}`);
  }

  const currentManifest = await readProjectionManifest(rootDir);
  const plan = await buildSyncPlan(args, {
    rootDir,
    homeDir,
    state,
    findRetiredProjections: options.findRetiredProjections
  });
  const diff = includeRetiredProjectionDiff(
    diffProjectionManifest(currentManifest, plan.desiredManifest),
    plan.executionPlan.retiredProjections
  );
  const summary = formatDiff(diff);

  if (dryRun || check) {
    console.log(JSON.stringify(renderSyncReport(
      {
        mode: check ? 'check' : 'dry-run',
        targets: plan.executionPlan.targets,
        summary,
        diff
      },
      {
        mode: check ? 'check' : 'dry-run',
        warnings: plan.report.warnings,
        details: plan.report.details
      }
    ), null, 2));
    if (check && (summary.create > 0 || summary.update > 0 || summary.stale > 0)) {
      throw new Error('Harness sync check failed: projections are out of sync.');
    }
    return;
  }

  await applySyncPlan(plan, {
    rootDir,
    homeDir,
    state,
    currentManifest,
    conflictMode,
    takeover,
    findRetiredProjections: options.findRetiredProjections
  });
  console.log(
    `Synced ${plan.executionPlan.targets.length} target(s): ${plan.executionPlan.targets.join(', ')} (create=${summary.create}, update=${summary.update}, stale=${summary.stale})`
  );
}
