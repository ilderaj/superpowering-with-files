import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { discoverAuthorityRoot } from '../../trio/core/authority.mjs';
import { withTrioPublicationLock } from '../../trio/core/store.mjs';
import {
  assertProductionRuntimeSelector,
  parseTrioCommandOptions,
  probeInstallerState,
  resolveTrioFixture,
  resolveTrioProductionEnvironment,
  selectInstallerRuntime
} from '../lib/state.mjs';
import { migrateV1ToV2, parseV2Config } from '../../trio/config.mjs';
import { applyTrioProjection } from './sync.mjs';

function trioInstallError(message, code = 'ERR_TRIO_INSTALL') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isWithin(rootDir, candidate) {
  const relative = path.relative(rootDir, candidate);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function parseTrioInstallOptions(args) {
  const options = parseTrioCommandOptions(args, {
    values: ['fixture-root', 'home-dir', 'recovery'],
    flags: ['upgrade']
  });
  if (!Object.hasOwn(options, 'fixture-root')) {
    throw trioInstallError('Trio --fixture-root is required and must be absolute.', 'ERR_TRIO_FIXTURE');
  }
  if (Object.hasOwn(options, 'recovery') && !options.upgrade) {
    throw trioInstallError('Trio --recovery is only valid for --upgrade.', 'ERR_TRIO_FIXTURE');
  }
  return options;
}

async function readContainedRegularFile(environment, requestedPath, label) {
  const boundaryRoot = environment.fixtureRoot ?? environment.authorityRoot;
  if (typeof requestedPath !== 'string' || !path.isAbsolute(requestedPath)) {
    throw trioInstallError(`${label} must be an absolute path.`, 'ERR_TRIO_FIXTURE');
  }
  const absolute = path.resolve(requestedPath);
  let info;
  try {
    info = await lstat(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw trioInstallError(`${label} is required and must exist.`, 'ERR_TRIO_FIXTURE');
    }
    throw error;
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw trioInstallError(`${label} must be a real regular file.`, 'ERR_TRIO_FIXTURE');
  }
  if (info.nlink > 1) {
    throw trioInstallError(
      `${label} must not be hard linked.`,
      environment.kind === 'production' ? 'ERR_TRIO_PHYSICAL_GATE' : 'ERR_TRIO_FIXTURE'
    );
  }
  const resolved = await realpath(absolute);
  if (!isWithin(boundaryRoot, resolved)) {
    throw trioInstallError(`${label} resolves outside --fixture-root.`, 'ERR_TRIO_FIXTURE');
  }
  let current = boundaryRoot;
  for (const segment of path.relative(boundaryRoot, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const currentInfo = await lstat(current);
    if (currentInfo.isSymbolicLink()) {
      throw trioInstallError(`${label} cannot traverse a symbolic link.`, 'ERR_TRIO_FIXTURE');
    }
  }
  return { path: resolved, bytes: await readFile(resolved) };
}

function parseExactRecovery(bytes) {
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw trioInstallError(`Trio recovery JSON is invalid: ${error.message}.`, 'ERR_TRIO_FIXTURE');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw trioInstallError('Trio recovery must be a JSON record.', 'ERR_TRIO_FIXTURE');
  }
  const expected = ['checkpointRef', 'rollbackRef'];
  if (Object.keys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    throw trioInstallError('Trio recovery must contain exactly checkpointRef and rollbackRef.', 'ERR_TRIO_FIXTURE');
  }
  for (const key of expected) {
    if (value[key] !== null && (typeof value[key] !== 'string' || value[key].trim() === '')) {
      throw trioInstallError(`Trio recovery ${key} must be null or non-empty text.`, 'ERR_TRIO_FIXTURE');
    }
  }
  return value;
}

function rebaseFixturePath(value, fixture) {
  if (typeof value !== 'string' || (value !== '/fixture' && !value.startsWith('/fixture/'))) {
    throw trioInstallError(`Trio V1 fixture evidence must be rooted at literal /fixture: ${String(value)}.`, 'ERR_TRIO_FIXTURE');
  }
  return `${fixture.fixtureRoot}${value.slice('/fixture'.length)}`;
}

function rebaseMigratedConfig(config, fixture) {
  const rebased = {
    ...config,
    targets: config.targets.map((target) => ({
      ...target,
      paths: target.paths.map((entry) => rebaseFixturePath(entry, fixture))
    })),
    ownership: {
      ...config.ownership,
      entries: config.ownership.entries.map((entry) => ({
        ...entry,
        path: rebaseFixturePath(entry.path, fixture)
      }))
    }
  };
  return parseV2Config(rebased);
}

function rebaseProductionPath(value, environment) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return value;
  for (const scope of ['workspace', 'user-global']) {
    const requestedRoot = environment.requestedScopeRoots?.[scope];
    const physicalRoot = environment.scopeRoots?.[scope];
    if (
      typeof requestedRoot === 'string' &&
      typeof physicalRoot === 'string' &&
      (value === requestedRoot || isWithin(requestedRoot, value))
    ) {
      return path.join(physicalRoot, path.relative(requestedRoot, value));
    }
  }
  return value;
}

function rebaseProductionMigratedConfig(config, environment) {
  return parseV2Config({
    ...config,
    targets: config.targets.map((target) => ({
      ...target,
      paths: target.paths.map((entry) => rebaseProductionPath(entry, environment))
    })),
    ownership: {
      ...config.ownership,
      entries: config.ownership.entries.map((entry) => ({
        ...entry,
        path: rebaseProductionPath(entry.path, environment)
      }))
    }
  });
}

async function readV1UpgradeInput(fixture, recoveryPath) {
  const [stateFile, manifestFile, recoveryFile] = await Promise.all([
    readContainedRegularFile(fixture, fixture.stateFile, 'Trio V1 state'),
    readContainedRegularFile(fixture, path.join(fixture.fixtureRoot, '.harness', 'projections.json'), 'Trio V1 projections'),
    readContainedRegularFile(fixture, recoveryPath, 'Trio --recovery')
  ]);
  let persistedState;
  let manifest;
  try {
    persistedState = JSON.parse(stateFile.bytes.toString('utf8'));
    manifest = JSON.parse(manifestFile.bytes.toString('utf8'));
  } catch (error) {
    throw trioInstallError(`Trio V1 input JSON is invalid: ${error.message}.`, 'ERR_TRIO_FIXTURE');
  }
  const recoveryReferences = parseExactRecovery(recoveryFile.bytes);
  const manifestText = manifestFile.bytes.toString('utf8');
  const config = rebaseMigratedConfig(migrateV1ToV2({
    persistedState,
    projectionManifestJson: manifestText,
    projectionManifestRef: `sha256:${sha256(manifestFile.bytes)}`,
    recoveryReferences
  }), fixture);
  const legacyStatusByPath = new Map();
  const legacyOwnershipByPath = new Map();
  const targetById = new Map(config.targets.map((target) => [target.id, target]));
  for (const entry of config.ownership.entries) {
    const target = targetById.get(entry.targetId);
    if (target?.hostKind === 'codex' && target.mode === 'managed') {
      legacyOwnershipByPath.set(entry.path, entry.identity);
    }
  }
  const migratedTargetIds = new Set(config.targets.map((target) => target.id));
  if (Array.isArray(manifest?.entries)) {
    for (const entry of manifest.entries) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !Object.hasOwn(entry, 'target') ||
        !Object.hasOwn(entry, 'targetPath') ||
        !migratedTargetIds.has(entry.target)
      ) continue;
      if (!['entry', 'skill'].includes(entry.kind) || !['unmanaged', 'user-managed'].includes(entry.legacyStatus)) continue;
      legacyStatusByPath.set(rebaseFixturePath(entry.targetPath, fixture), entry.legacyStatus);
    }
  }
  return { config, legacyStatusByPath, legacyOwnershipByPath };
}

async function readProductionV1UpgradeInput(environment, recoveryPath) {
  const [stateFile, manifestFile, recoveryFile] = await Promise.all([
    readContainedRegularFile(environment, environment.stateFile, 'Trio V1 state'),
    readContainedRegularFile(environment, path.join(environment.authorityRoot, '.harness', 'projections.json'), 'Trio V1 projections'),
    readContainedRegularFile(environment, recoveryPath, 'Trio --recovery')
  ]);
  let persistedState;
  let manifest;
  try {
    persistedState = JSON.parse(stateFile.bytes.toString('utf8'));
    manifest = JSON.parse(manifestFile.bytes.toString('utf8'));
  } catch (error) {
    throw trioInstallError(`Trio V1 input JSON is invalid: ${error.message}.`, 'ERR_TRIO_INSTALL');
  }
  const recoveryReferences = parseExactRecovery(recoveryFile.bytes);
  const config = rebaseProductionMigratedConfig(migrateV1ToV2({
    persistedState,
    projectionManifestJson: manifestFile.bytes.toString('utf8'),
    projectionManifestRef: `sha256:${sha256(manifestFile.bytes)}`,
    recoveryReferences
  }), environment);
  const legacyStatusByPath = new Map();
  const legacyOwnershipByPath = new Map();
  const targetById = new Map(config.targets.map((target) => [target.id, target]));
  for (const entry of config.ownership.entries) {
    const target = targetById.get(entry.targetId);
    if (target?.hostKind === 'codex' && target.mode === 'managed') {
      legacyOwnershipByPath.set(entry.path, entry.identity);
    }
  }
  const migratedTargetIds = new Set(config.targets.map((target) => target.id));
  if (Array.isArray(manifest?.entries)) {
    for (const entry of manifest.entries) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !Object.hasOwn(entry, 'target') ||
        !Object.hasOwn(entry, 'targetPath') ||
        !migratedTargetIds.has(entry.target)
      ) continue;
      if (!['entry', 'skill'].includes(entry.kind) || !['unmanaged', 'user-managed'].includes(entry.legacyStatus)) continue;
      legacyStatusByPath.set(rebaseProductionPath(entry.targetPath, environment), entry.legacyStatus);
    }
  }
  return { config, legacyStatusByPath, legacyOwnershipByPath };
}

function freshTrioConfig(fixture) {
  return parseV2Config({
    schemaVersion: 2,
    runtime: 'trio',
    scope: { kind: 'workspace' },
    targets: [{
      id: 'codex',
      enabled: true,
      paths: [path.join(fixture.fixtureRoot, 'workspace', 'AGENTS.md')],
      hostKind: 'codex',
      mode: 'managed'
    }],
    ownership: { source: 'fresh-install', manifestRef: null, entries: [] },
    recovery: { checkpointRef: null, rollbackRef: null }
  });
}

function freshProductionTrioConfig(environment) {
  return parseV2Config({
    schemaVersion: 2,
    runtime: 'trio',
    scope: { kind: 'workspace' },
    targets: [{
      id: 'codex',
      enabled: true,
      paths: [path.join(environment.authorityRoot, 'AGENTS.md')],
      hostKind: 'codex',
      mode: 'managed'
    }],
    ownership: { source: 'fresh-install', manifestRef: null, entries: [] },
    recovery: { checkpointRef: null, rollbackRef: null }
  });
}

async function installTrio(args) {
  const options = parseTrioInstallOptions(args);
  const fixture = await resolveTrioFixture({
    fixtureRoot: options['fixture-root'],
    homeDir: options['home-dir']
  });
  if (options.upgrade && !Object.hasOwn(options, 'recovery')) {
    throw trioInstallError('Trio V1 upgrade requires an explicit --recovery.', 'ERR_TRIO_FIXTURE');
  }
  return withTrioPublicationLock(fixture.authorityRoot, async () => {
    const probe = await probeInstallerState(fixture.fixtureRoot);
    if (probe.kind === 'v1' && !options.upgrade) {
      throw trioInstallError(
        'Persisted schema-v1 fixture state requires --upgrade with an explicit recovery input.',
        'ERR_TRIO_UPGRADE_REQUIRED'
      );
    }
    if (options.upgrade && probe.kind !== 'v1') {
      throw trioInstallError('Trio --upgrade is only available for a persisted schema-v1 fixture state.', 'ERR_TRIO_UPGRADE_REQUIRED');
    }
    const upgrade = probe.kind === 'v1'
      ? await readV1UpgradeInput(fixture, options.recovery)
      : {
        config: probe.kind === 'v2' ? probe.state : freshTrioConfig(fixture),
        legacyStatusByPath: new Map(),
        legacyOwnershipByPath: new Map()
      };
    const mode = probe.kind === 'v1' ? 'upgrade' : probe.kind === 'v2' ? 'reinstall' : 'fresh';
    const result = await applyTrioProjection({
      fixture,
      config: upgrade.config,
      legacyStatusByPath: upgrade.legacyStatusByPath,
      legacyOwnershipByPath: upgrade.legacyOwnershipByPath,
      statePrecondition: probe.evidence
    });
    const outcome = Object.freeze({ ...result, mode });
    console.log(JSON.stringify({
      runtime: 'trio',
      mode,
      writes: result.writes,
      conflicts: result.conflicts
    }, null, 2));
    return outcome;
  });
}

function hasFixtureRootArgument(args) {
  return args.some((argument) => argument === '--fixture-root' || (
    typeof argument === 'string' && argument.startsWith('--fixture-root=')
  ));
}

function fixtureRuntimeRequired() {
  if (selectInstallerRuntime() !== 'trio') {
    throw trioInstallError(
      'Trio --fixture-root requires SWF_RUNTIME=trio.',
      'ERR_TRIO_RUNTIME_SELECTOR'
    );
  }
}

function requiresExplicitProductionUpgrade(args) {
  if (!Array.isArray(args)) return true;
  let upgradeCount = 0;
  let recoveryCount = 0;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--upgrade') {
      upgradeCount += 1;
      continue;
    }
    if (argument === '--recovery') {
      const value = args[index + 1];
      if (typeof value !== 'string' || !value || value.startsWith('--')) return true;
      recoveryCount += 1;
      index += 1;
      continue;
    }
    if (typeof argument === 'string' && argument.startsWith('--recovery=')) {
      if (!argument.slice('--recovery='.length)) return true;
      recoveryCount += 1;
      continue;
    }
    return true;
  }
  return upgradeCount !== 1 || recoveryCount !== 1;
}

function parseProductionInstallOptions(args) {
  const options = parseTrioCommandOptions(args, {
    values: ['recovery'],
    flags: ['upgrade']
  });
  if (Object.hasOwn(options, 'recovery') && !options.upgrade) {
    throw trioInstallError('Trio --recovery is only valid for --upgrade.');
  }
  if (options.upgrade && !Object.hasOwn(options, 'recovery')) {
    throw trioInstallError('Trio V1 upgrade requires an explicit --recovery.');
  }
  return options;
}

function usage() {
  return [
    'Usage: ./scripts/harness install [options]',
    '',
    'Options:',
    '  --upgrade                 Upgrade persisted schema-v1 state to Trio v2',
    '  --recovery <path>         Required recovery input for --upgrade',
    '  --help, -h                Show this help message'
  ].join('\n');
}

export async function install(args = [], options = {}) {
  if (hasFixtureRootArgument(args)) {
    fixtureRuntimeRequired();
    if (args.includes('--help') || args.includes('-h')) {
      console.log(usage());
      return;
    }
    return installTrio(args);
  }

  assertProductionRuntimeSelector();
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }

  const rootDir = options.rootDir ?? (await discoverAuthorityRoot(process.cwd())).rootDir;
  const initialProbe = await probeInstallerState(rootDir);
  if (initialProbe.kind === 'v1' && requiresExplicitProductionUpgrade(args)) {
    throw trioInstallError(
      'Persisted schema-v1 state requires exactly --upgrade and one non-empty --recovery value.',
      'ERR_TRIO_UPGRADE_REQUIRED'
    );
  }
  return withTrioPublicationLock(rootDir, async () => {
    const probe = await probeInstallerState(rootDir);
    if (initialProbe.kind === 'v1' && probe.kind !== 'v1') {
      throw trioInstallError('Persisted schema-v1 state changed before upgrade could begin.', 'ERR_TRIO_UPGRADE_REQUIRED');
    }
    if (initialProbe.kind !== 'v1' && probe.kind === 'v1') {
      throw trioInstallError('Persisted schema-v1 state appeared before install could begin.', 'ERR_TRIO_UPGRADE_REQUIRED');
    }

    const installOptions = parseProductionInstallOptions(args);
    if (probe.kind !== 'v1' && (installOptions.upgrade || Object.hasOwn(installOptions, 'recovery'))) {
      throw trioInstallError('Trio --upgrade is only available for a persisted schema-v1 state.');
    }

    const environment = await resolveTrioProductionEnvironment({
      rootDir,
      homeDir: options.homeDir
    });
    const upgrade = probe.kind === 'v1'
      ? await readProductionV1UpgradeInput(environment, installOptions.recovery)
      : {
        config: probe.kind === 'v2' ? probe.state : freshProductionTrioConfig(environment),
        legacyStatusByPath: new Map(),
        legacyOwnershipByPath: new Map()
      };
    const mode = probe.kind === 'v1' ? 'upgrade' : probe.kind === 'v2' ? 'reinstall' : 'fresh';
    const result = await applyTrioProjection({
      environment,
      config: upgrade.config,
      legacyStatusByPath: upgrade.legacyStatusByPath,
      legacyOwnershipByPath: upgrade.legacyOwnershipByPath,
      statePrecondition: probe.evidence
    });
    const outcome = Object.freeze({ ...result, mode });
    console.log(JSON.stringify({
      runtime: 'trio',
      mode,
      writes: result.writes,
      conflicts: result.conflicts
    }, null, 2));
    return outcome;
  });
}
