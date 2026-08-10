import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteText, withTrioPublicationLock } from '../../trio/core/store.mjs';
import { parseV2Config } from '../../trio/config.mjs';
import { projectConfig } from '../../trio/projection.mjs';
import { discoverAuthorityRoot } from '../../trio/core/authority.mjs';
import {
  assertProductionRuntimeSelector,
  assertInstallerStateEvidence,
  parseTrioCommandOptions,
  preflightTrioFixturePaths,
  probeInstallerState,
  readState,
  recheckTrioFixturePaths,
  resolveTrioFixture,
  resolveTrioProductionEnvironment,
  selectInstallerRuntime
} from '../lib/state.mjs';

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TRIO_SURFACE_SOURCES = Object.freeze({
  entry: 'harness/trio/templates/entry-policy.md',
  trio: 'harness/trio/skill/SKILL.md',
  dev: 'harness/trio/capabilities/dev/SKILL.md',
  office: 'harness/trio/capabilities/office/SKILL.md',
  safety: 'harness/trio/capabilities/safety/SKILL.md',
  chiefops: 'harness/trio/governance/chiefops/SKILL.md'
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

function scopeRootForEnvironment(environment, scope) {
  const root = environment?.scopeRoots?.[scope];
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw trioBridgeError(`Trio environment has no ${scope} scope root.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  return path.resolve(root);
}

function buildTrioPlacements(config, environment) {
  const placements = [];
  for (const target of config.targets) {
    if (!target.enabled) continue;
    const scopes = scopesForTarget(config, target);
    target.paths.forEach((targetPath, index) => {
      const scope = scopes[index];
      const scopeRoot = scopeRootForEnvironment(environment, scope);
      const root = target.hostKind === 'codex'
        ? placementRootForCodex(targetPath, scope)
        : environment.kind === 'fixture'
          ? environment.homeDir
          : scopeRoot;
      const resolvedRoot = path.resolve(root);
      if (!isInside(scopeRoot, resolvedRoot) && resolvedRoot !== scopeRoot) {
        throw trioBridgeError(`Trio placement root escapes its ${scope} scope: ${root}.`, 'ERR_TRIO_PHYSICAL_GATE');
      }
      if (environment.kind === 'production' && resolvedRoot !== scopeRoot) {
        throw trioBridgeError(`Trio ${scope} placement root must equal its production scope root: ${root}.`, 'ERR_TRIO_PHYSICAL_GATE');
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
  environment,
  config,
  legacyStatusByPath,
  legacyOwnershipByPath
} = {}) {
  const runtimeEnvironment = environment ?? fixture;
  if (!runtimeEnvironment || typeof runtimeEnvironment !== 'object') {
    throw trioBridgeError('Trio projection requires a resolved environment.', 'ERR_TRIO_PHYSICAL_GATE');
  }
  const validated = parseV2Config(config);
  const targetContract = await loadTargetContract();
  const placements = buildTrioPlacements(validated, runtimeEnvironment);
  const shape = projectConfig({
    config: validated,
    targetContract,
    placements,
    pathObservations: {}
  });
  const managed = shape.descriptors.filter((descriptor) => descriptor.management === 'managed');
  const physical = await preflightTrioFixturePaths({
    fixtureRoot: runtimeEnvironment.fixtureRoot,
    scopeRoots: runtimeEnvironment.scopeRoots,
    descriptors: managed,
    stateFile: runtimeEnvironment.stateFile
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
    physical,
    environment: runtimeEnvironment
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

function physicalGateInput(environment, descriptors) {
  return {
    fixtureRoot: environment.fixtureRoot,
    scopeRoots: environment.scopeRoots,
    descriptors,
    stateFile: environment.stateFile
  };
}

async function ensureContainedParent(environment, targetPath, scope, createdDirectories) {
  const scopeRoot = scopeRootForEnvironment(environment, scope);
  const parent = path.dirname(targetPath);
  if (!isInside(scopeRoot, parent) && parent !== scopeRoot) {
    throw trioBridgeError(`Trio write parent escapes its ${scope} scope root: ${parent}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  const segments = path.relative(scopeRoot, parent).split(path.sep).filter(Boolean);
  let current = scopeRoot;
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
      lease.identity = Object.freeze({ dev: created.dev, ino: created.ino, nlink: created.nlink });
    }
  }
}

async function snapshotPaths(paths) {
  const snapshots = new Map();
  for (const targetPath of paths) {
    let parent;
    try {
      parent = await lstat(path.dirname(targetPath), { bigint: true });
    } catch (error) {
      throw trioBridgeError(`Trio snapshot parent is unavailable: ${path.dirname(targetPath)}.`, 'ERR_TRIO_PHYSICAL_GATE');
    }
    if (parent.isSymbolicLink() || !parent.isDirectory()) {
      throw trioBridgeError(`Trio snapshot parent is not a real directory: ${path.dirname(targetPath)}.`, 'ERR_TRIO_PHYSICAL_GATE');
    }
    const parentIdentity = Object.freeze({ dev: parent.dev, ino: parent.ino, nlink: parent.nlink });
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
        nlink: info.nlink,
        parent: parentIdentity
      }));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        snapshots.set(targetPath, Object.freeze({
          exists: false,
          bytes: null,
          sha256: null,
          dev: null,
          ino: null,
          nlink: null,
          parent: parentIdentity
        }));
      }
      else throw error;
    }
  }
  return snapshots;
}

function settledConfigForWrites(config, writes, sources) {
  if (new Set(writes.map((descriptor) => descriptor.destination)).size !== writes.length) {
    throw trioBridgeError('Trio apply cannot settle duplicate managed surfaces.', 'ERR_TRIO_BRIDGE');
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

function publicationReceiptError(message) {
  return trioBridgeError(message, 'ERR_TRIO_PUBLICATION_RECEIPT');
}

function ownPublicationReceiptValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw publicationReceiptError(`Trio publication receipt ${key} must be an own data property.`);
  }
  return descriptor.value;
}

function normalizePublicationReceipt(value, targetPath, contents) {
  if (value === undefined || value === null) return null;
  const expectedKeys = new Set(['path', 'sha256', 'dev', 'ino', 'nlink']);
  const keys = value && typeof value === 'object' ? Reflect.ownKeys(value) : [];
  if (!value || typeof value !== 'object'
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || keys.length !== expectedKeys.size
    || keys.some((key) => typeof key !== 'string' || !expectedKeys.has(key))) {
    throw publicationReceiptError('Trio publication receipt has an invalid shape.');
  }
  const receipt = {
    path: ownPublicationReceiptValue(value, 'path'),
    sha256: ownPublicationReceiptValue(value, 'sha256'),
    dev: ownPublicationReceiptValue(value, 'dev'),
    ino: ownPublicationReceiptValue(value, 'ino'),
    nlink: ownPublicationReceiptValue(value, 'nlink')
  };
  const expectedPath = path.resolve(targetPath);
  const expectedSha256 = hashText(contents);
  if (receipt.path !== expectedPath || receipt.sha256 !== expectedSha256
    || typeof receipt.dev !== 'bigint' || typeof receipt.ino !== 'bigint' || typeof receipt.nlink !== 'bigint'
    || receipt.dev < 0n || receipt.ino <= 0n || receipt.nlink !== 1n) {
    throw publicationReceiptError(`Trio publication receipt does not prove ${expectedPath}.`);
  }
  return Object.freeze(receipt);
}

function thrownPublicationReceipt(error) {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return null;
  const descriptor = Object.getOwnPropertyDescriptor(error, 'publication');
  if (!descriptor) return null;
  if (!Object.hasOwn(descriptor, 'value')) {
    throw publicationReceiptError('Trio thrown publication receipt must be an own data property.');
  }
  return descriptor.value;
}

function samePublicationReceipt(receipt, observed) {
  return receipt.dev === observed.dev
    && receipt.ino === observed.ino
    && receipt.nlink === observed.nlink
    && receipt.sha256 === observed.sha256;
}

async function assertRecordedPublicationReceipt(receipt, targetPath, expected) {
  const observed = await recordPublishedFile(targetPath, expected);
  if (!samePublicationReceipt(receipt, observed)) {
    throw publicationReceiptError(`Trio published target drifted after receipt registration: ${targetPath}.`);
  }
}

function stateBeforeFromProbe({ statePrecondition, targetPath, createdDirectories }) {
  const target = path.resolve(targetPath);
  if (statePrecondition.path !== target) {
    throw trioBridgeError(`Trio state precondition does not match the publication path: ${target}.`, 'ERR_TRIO_STATE_DRIFT');
  }
  const parentPath = path.dirname(target);
  let parent = null;
  if (statePrecondition.nearest.path === parentPath) {
    parent = statePrecondition.nearest.identity;
  } else {
    const lease = [...createdDirectories].reverse().find((entry) => entry.path === parentPath);
    if (!lease?.identity) {
      throw trioBridgeError(`Trio state parent was not created from the bound absent-state evidence: ${parentPath}.`, 'ERR_TRIO_STATE_DRIFT');
    }
    parent = lease.identity;
  }
  return Object.freeze({
    exists: statePrecondition.exists,
    bytes: statePrecondition.bytes,
    sha256: statePrecondition.sha256,
    dev: statePrecondition.identity?.dev ?? null,
    ino: statePrecondition.identity?.ino ?? null,
    nlink: statePrecondition.identity?.nlink ?? null,
    parent
  });
}

async function verifyPublishedRollbackTarget({ targetPath, published, environment, managed }) {
  await recheckTrioFixturePaths(physicalGateInput(environment, managed));
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

async function settleProvisionalAttempt({ attempt, environment, managed }) {
  const { targetPath, before } = attempt;
  try {
    await recheckTrioFixturePaths(physicalGateInput(environment, managed));
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
  environment,
  managed,
  writeText
}) {
  const errors = [];
  for (const attempt of [...attempts].reverse()) {
    const { targetPath, before, published } = attempt;
    try {
      if (!published) {
        await settleProvisionalAttempt({ attempt, environment, managed });
        continue;
      }
      await verifyPublishedRollbackTarget({ targetPath, published, environment, managed });
      if (before?.exists) {
        await writeText(targetPath, before.bytes.toString('utf8'), {
          expectedSha256: published.sha256,
          expectedTargetIdentity: {
            dev: published.dev,
            ino: published.ino,
            nlink: published.nlink
          },
          expectedParentIdentity: before.parent
        });
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
      await recheckTrioFixturePaths(physicalGateInput(environment, managed));
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
 * Internal projection apply seam shared by the fixture bridge and the
 * state-aware production adapter. Public fixture sync remains read-only.
 */
export async function applyTrioProjection({
  fixture,
  environment,
  config,
  legacyStatusByPath,
  legacyOwnershipByPath,
  beforeWrite,
  statePrecondition,
  writeText = atomicWriteText
} = {}) {
  if (beforeWrite !== undefined && typeof beforeWrite !== 'function') {
    throw trioBridgeError('Trio beforeWrite must be a function when supplied.', 'ERR_TRIO_BRIDGE');
  }
  const runtimeEnvironment = environment ?? fixture;
  if (!runtimeEnvironment || typeof runtimeEnvironment !== 'object') {
    throw trioBridgeError('Trio apply requires a resolved environment.', 'ERR_TRIO_PHYSICAL_GATE');
  }
  const boundStatePrecondition = statePrecondition === undefined
    ? null
    : await assertInstallerStateEvidence(runtimeEnvironment.authorityRoot, statePrecondition);
  const prepared = await prepareTrioProjection({
    environment: runtimeEnvironment,
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
  desired.set(runtimeEnvironment.stateFile, `${JSON.stringify(settledConfig, null, 2)}\n`);
  const createdDirectories = [];
  const attempts = [];
  const writeDesired = async (targetPath, explicitBefore = null) => {
    const before = explicitBefore ?? (await snapshotPaths([targetPath])).get(targetPath);
    if (!before) {
      throw trioBridgeError(`Trio write is missing its external precondition snapshot: ${targetPath}.`, 'ERR_TRIO_BRIDGE');
    }
    const options = {
      expectedSha256: before.exists ? before.sha256 : null,
      expectedParentIdentity: before.parent
    };
    if (before.exists) {
      options.expectedTargetIdentity = {
        dev: before.dev,
        ino: before.ino,
        nlink: before.nlink
      };
    }
    const attempt = { targetPath, before, published: null };
    attempts.push(attempt);
    const contents = desired.get(targetPath);
    let returned;
    try {
      returned = await writeText(targetPath, contents, options);
    } catch (error) {
      const receipt = normalizePublicationReceipt(thrownPublicationReceipt(error), targetPath, contents);
      if (receipt) attempt.published = receipt;
      throw error;
    }
    const receipt = normalizePublicationReceipt(returned, targetPath, contents);
    if (!receipt) {
      throw trioBridgeError(`Trio writer returned without a publication receipt: ${targetPath}.`, 'ERR_TRIO_PUBLICATION_AMBIGUOUS');
    }
    attempt.published = receipt;
    await assertRecordedPublicationReceipt(receipt, targetPath, contents);
  };
  try {
    for (const descriptor of writes) {
      await ensureContainedParent(runtimeEnvironment, descriptor.destination, descriptor.scope, createdDirectories);
      if (beforeWrite) await beforeWrite(Object.freeze({ targetPath: descriptor.destination, phase: 'target' }));
      await recheckTrioFixturePaths(physicalGateInput(runtimeEnvironment, prepared.managed));
      await writeDesired(descriptor.destination);
    }
    await ensureContainedParent(runtimeEnvironment, runtimeEnvironment.stateFile, 'workspace', createdDirectories);
    if (beforeWrite) await beforeWrite(Object.freeze({ targetPath: runtimeEnvironment.stateFile, phase: 'state' }));
    await recheckTrioFixturePaths(physicalGateInput(runtimeEnvironment, prepared.managed));
    await writeDesired(
      runtimeEnvironment.stateFile,
      boundStatePrecondition
        ? stateBeforeFromProbe({
          statePrecondition: boundStatePrecondition,
          targetPath: runtimeEnvironment.stateFile,
          createdDirectories
        })
        : null
    );
  } catch (error) {
    const rollbackErrors = await settleCompensation({
      attempts,
      createdDirectories,
      environment: runtimeEnvironment,
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
    statePath: runtimeEnvironment.stateFile
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

function hasFixtureRootArgument(args) {
  return args.some((argument) => argument === '--fixture-root' || (
    typeof argument === 'string' && argument.startsWith('--fixture-root=')
  ));
}

function fixtureRuntimeRequired() {
  if (selectInstallerRuntime() !== 'trio') {
    throw trioBridgeError(
      'Trio --fixture-root requires SWF_RUNTIME=trio.',
      'ERR_TRIO_RUNTIME_SELECTOR'
    );
  }
}

function parseProductionSyncOptions(args) {
  const options = parseTrioCommandOptions(args, { flags: ['dry-run', 'check'] });
  if (options['dry-run'] && options.check) {
    throw trioBridgeError('Trio --dry-run and --check cannot be combined.', 'ERR_TRIO_SYNC');
  }
  return options;
}

async function trioProjectionNeedsSync(prepared, environment) {
  const managedConflicts = prepared.conflicts.filter((conflict) =>
    prepared.descriptors.some((descriptor) =>
      descriptor.destination === conflict.destination && descriptor.management === 'managed'
    )
  );
  if (managedConflicts.length > 0) return true;

  const writes = prepared.descriptors.filter((descriptor) =>
    descriptor.management === 'managed' && ['create', 'update'].includes(descriptor.action)
  );
  if (new Set(writes.map((descriptor) => descriptor.destination)).size !== writes.length) return true;
  const sources = await readTrioSources(writes);
  for (const descriptor of writes) {
    const actual = await readFile(descriptor.destination, 'utf8').catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (actual !== sources.get(descriptor.destination)) return true;
  }
  const settled = settledConfigForWrites(prepared.config, writes, sources);
  const state = await readFile(environment.stateFile, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  return state !== `${JSON.stringify(settled, null, 2)}\n`;
}

export async function assertTrioProjectionInSync(prepared, environment = prepared?.environment) {
  if (!environment || typeof environment !== 'object') {
    throw trioBridgeError('Trio sync verification requires a resolved environment.', 'ERR_TRIO_CHECK');
  }
  if (await trioProjectionNeedsSync(prepared, environment)) {
    throw trioBridgeError('Trio projection verification failed: managed state is missing, drifted, or unowned.', 'ERR_TRIO_CHECK');
  }
  return prepared;
}

async function syncProduction(args, environment, config) {
  const options = parseProductionSyncOptions(args);
  const mode = options.check ? 'check' : options['dry-run'] ? 'dry-run' : 'apply';
  if (mode === 'apply') {
    return withTrioPublicationLock(environment.authorityRoot, async () => {
      const current = await probeInstallerState(environment.authorityRoot);
      if (current.kind !== 'v2') {
        throw trioBridgeError('Trio sync requires a schema-v2 state while the publication lock is held.', 'ERR_TRIO_STATE');
      }
      const result = await applyTrioProjection({
        environment,
        config: current.state,
        statePrecondition: current.evidence
      });
      const report = renderTrioSyncReport(result, mode);
      console.log(JSON.stringify(report, null, 2));
      return report;
    });
  }

  const prepared = await prepareTrioProjection({ environment, config });
  const report = renderTrioSyncReport(prepared, mode);
  console.log(JSON.stringify(report, null, 2));
  if (mode === 'check') await assertTrioProjectionInSync(prepared, environment);
  return report;
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

export async function sync(args = [], options = {}) {
  if (hasFixtureRootArgument(args)) {
    fixtureRuntimeRequired();
    if (hasFlag(args, '--help', '-h')) {
      console.log(usage());
      return;
    }
    const report = await readTrioSyncReport(args);
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  assertProductionRuntimeSelector();
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const rootDir = options.rootDir ?? (await discoverAuthorityRoot(process.cwd())).rootDir;
  const probe = await probeInstallerState(rootDir);
  if (probe.kind === 'absent') {
    throw trioBridgeError('Trio sync requires an installed schema-v2 state.', 'ERR_TRIO_STATE');
  }
  if (probe.kind === 'v2') {
    const environment = await resolveTrioProductionEnvironment({
      rootDir,
      homeDir: options.homeDir
    });
    return syncProduction(args, environment, probe.state);
  }
  throw trioBridgeError('Persisted schema-v1 state requires install --upgrade with recovery evidence.', 'ERR_TRIO_UPGRADE_REQUIRED');
}
