import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteText } from '../../trio/core/store.mjs';
import { validateV2Config } from '../../trio/config.mjs';
import { isSafetyPolicyProfile } from './safety-projection.mjs';

export const DEFAULT_DEPLOYMENT_PROFILE = 'standard';
export const DEFAULT_POLICY_PROFILE = 'always-on-core';
export const DEFAULT_SKILL_PROFILE = 'standard';
export const GITHUB_CLOUD_DEPLOYMENT_PROFILE = 'github-cloud';
const DEPLOYMENT_PROFILES = new Set([DEFAULT_DEPLOYMENT_PROFILE, GITHUB_CLOUD_DEPLOYMENT_PROFILE]);
const RETIRED_SKILL_PROFILE = 'second-opinion-advisory';

const STATE_KEYS = new Set([
  'schemaVersion',
  'scope',
  'projectionMode',
  'hookMode',
  'deploymentProfile',
  'policyProfile',
  'workspacePolicyOverlay',
  'skillProfile',
  'targets',
  'upstream',
  'lastSync',
  'lastFetch',
  'lastUpdate'
]);

const TARGET_KEYS = new Set(['codex', 'copilot', 'cursor', 'claude-code']);

function trioError(message, code = 'ERR_TRIO_FIXTURE') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isMissingPathError(error) {
  return error?.code === 'ENOENT';
}

function pathIsStrictlyWithin(rootDir, candidate) {
  const relative = path.relative(rootDir, candidate);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function pathIsWithinOrEqual(rootDir, candidate) {
  return candidate === rootDir || pathIsStrictlyWithin(rootDir, candidate);
}

async function optionalLstat(targetPath, label) {
  try {
    return await lstat(targetPath);
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw trioError(`Unable to inspect ${label}: ${targetPath}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
}

function assertAbsolutePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || !path.isAbsolute(value)) {
    throw trioError(`${label} must be an absolute path.`, 'ERR_TRIO_FIXTURE');
  }
  return path.resolve(value);
}

async function nearestExistingAncestor(rootDir, targetPath, label) {
  const segments = path.relative(rootDir, targetPath).split(path.sep).filter(Boolean);
  let current = rootDir;
  let nearest = rootDir;
  let nearestStat = await optionalLstat(rootDir, 'fixture root');
  if (!nearestStat || nearestStat.isSymbolicLink() || !nearestStat.isDirectory()) {
    throw trioError(`Fixture root must remain a real directory: ${rootDir}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const info = await optionalLstat(current, label);
    if (!info) {
      return {
        nearest,
        nearestStat,
        missingSuffix: segments.slice(index).join('/')
      };
    }
    if (info.isSymbolicLink()) {
      throw trioError(`${label} cannot traverse a symbolic link: ${current}.`, 'ERR_TRIO_PHYSICAL_GATE');
    }
    if (index < segments.length - 1 && !info.isDirectory()) {
      throw trioError(`${label} has a non-directory ancestor: ${current}.`, 'ERR_TRIO_PHYSICAL_GATE');
    }
    nearest = current;
    nearestStat = info;
  }

  return { nearest, nearestStat, missingSuffix: '' };
}

async function assertNearestContained(rootReal, nearest, label) {
  let nearestReal;
  try {
    nearestReal = await realpath(nearest);
  } catch (error) {
    throw trioError(`Unable to resolve ${label} ancestor: ${nearest}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  if (!pathIsWithinOrEqual(rootReal, nearestReal)) {
    throw trioError(`${label} escapes the fixture root: ${nearest}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  return nearestReal;
}

/**
 * Resolve the explicit, temporary-root-only surface permitted by the Trio command bridge.
 */
export async function resolveTrioFixture({ fixtureRoot: requestedRoot, homeDir: requestedHome } = {}) {
  const rootPath = assertAbsolutePath(requestedRoot, 'Trio --fixture-root');
  const rootInfo = await optionalLstat(rootPath, 'fixture root');
  if (!rootInfo || rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw trioError('Trio --fixture-root must name an existing real directory.', 'ERR_TRIO_FIXTURE');
  }

  const [rootReal, tempReal] = await Promise.all([
    realpath(rootPath),
    realpath(os.tmpdir())
  ]);
  if (!pathIsStrictlyWithin(tempReal, rootReal)) {
    throw trioError('Trio --fixture-root must resolve strictly under the canonical OS temporary directory.', 'ERR_TRIO_FIXTURE');
  }

  let homeDir = path.join(rootReal, 'home');
  if (requestedHome !== undefined) {
    const homePath = assertAbsolutePath(requestedHome, 'Trio --home-dir');
    const homeInfo = await optionalLstat(homePath, 'Trio --home-dir');
    if (!homeInfo || homeInfo.isSymbolicLink() || !homeInfo.isDirectory()) {
      throw trioError('Trio --home-dir must name an existing real directory.', 'ERR_TRIO_FIXTURE');
    }
    homeDir = await realpath(homePath);
    if (!pathIsWithinOrEqual(rootReal, homeDir)) {
      throw trioError('Trio --home-dir must be physically contained under --fixture-root.', 'ERR_TRIO_FIXTURE');
    }
  }

  return Object.freeze({
    kind: 'fixture',
    fixtureRoot: rootReal,
    authorityRoot: rootReal,
    homeDir: path.resolve(homeDir),
    stateFile: path.join(rootReal, '.harness', 'state.json'),
    scopeRoots: Object.freeze({
      workspace: rootReal,
      'user-global': rootReal
    })
  });
}

async function resolveExistingRealDirectory(value, label) {
  if (typeof value !== 'string' || value.length === 0 || !path.isAbsolute(value)) {
    throw trioError(`${label} must be an absolute path.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  const absolute = path.resolve(value);
  const info = await optionalLstat(absolute, label);
  if (!info || info.isSymbolicLink() || !info.isDirectory()) {
    throw trioError(`${label} must name an existing real directory.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  return realpath(absolute);
}

/**
 * Resolve the normal workspace environment used by production Trio commands.
 * This intentionally does not accept or inspect SWF_RUNTIME.
 */
export async function resolveTrioProductionEnvironment({ rootDir, homeDir = os.homedir() } = {}) {
  const requestedAuthorityRoot = path.resolve(rootDir);
  const requestedHome = path.resolve(homeDir);
  const [authorityRoot, resolvedHome] = await Promise.all([
    resolveExistingRealDirectory(requestedAuthorityRoot, 'Trio authority root'),
    resolveExistingRealDirectory(requestedHome, 'Trio home directory')
  ]);
  if (authorityRoot === resolvedHome) {
    throw trioError('Trio workspace and user-global roots must not be physical aliases.', 'ERR_TRIO_PHYSICAL_GATE');
  }
  return Object.freeze({
    kind: 'production',
    authorityRoot,
    homeDir: resolvedHome,
    stateFile: path.join(authorityRoot, '.harness', 'state.json'),
    scopeRoots: Object.freeze({
      workspace: authorityRoot,
      'user-global': resolvedHome
    }),
    requestedScopeRoots: Object.freeze({
      workspace: requestedAuthorityRoot,
      'user-global': requestedHome
    })
  });
}

/**
 * Select the legacy or Trio branch without inferring a runtime from caller input.
 */
export function selectInstallerRuntime(selector = process.env.SWF_RUNTIME) {
  if (selector === undefined || selector === '' || selector === 'legacy') return 'legacy';
  if (selector === 'trio') return 'trio';
  throw trioError(`Unsupported SWF_RUNTIME selector: ${selector}.`, 'ERR_TRIO_RUNTIME_SELECTOR');
}

/**
 * Production runtime selection is disk-state driven. An ambient selector can
 * only be used by the explicit fixture/shadow bridge and must never switch a
 * normal workspace command.
 */
export function assertProductionRuntimeSelector() {
  if (Object.hasOwn(process.env, 'SWF_RUNTIME')) {
    throw trioError('SWF_RUNTIME is only supported with an explicit Trio --fixture-root.', 'ERR_TRIO_RUNTIME_SELECTOR');
  }
}

/**
 * Parse a small explicit command surface without accepting duplicate or unknown arguments.
 */
export function parseTrioCommandOptions(args, { values = [], flags = [] } = {}) {
  if (!Array.isArray(args)) {
    throw trioError('Trio command arguments must be an array.', 'ERR_TRIO_FIXTURE');
  }
  const valueNames = new Set(values);
  const flagNames = new Set(flags);
  const result = Object.create(null);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (typeof argument !== 'string' || !argument.startsWith('--')) {
      throw trioError(`Unsupported Trio argument: ${String(argument)}.`, 'ERR_TRIO_FIXTURE');
    }
    const equals = argument.indexOf('=');
    const name = equals === -1 ? argument.slice(2) : argument.slice(2, equals);
    if (flagNames.has(name)) {
      if (equals !== -1 || Object.hasOwn(result, name)) {
        throw trioError(`Trio argument --${name} is invalid or duplicated.`, 'ERR_TRIO_FIXTURE');
      }
      result[name] = true;
      continue;
    }
    if (!valueNames.has(name) || Object.hasOwn(result, name)) {
      throw trioError(`Unsupported or duplicate Trio argument: --${name}.`, 'ERR_TRIO_FIXTURE');
    }
    const value = equals === -1 ? args[++index] : argument.slice(equals + 1);
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      throw trioError(`Trio argument --${name} requires a non-empty value.`, 'ERR_TRIO_FIXTURE');
    }
    result[name] = value;
  }
  return result;
}

/**
 * Preflight all managed destinations and the state file as a single physical fixture transaction.
 */
function rootForScope(scopeRoots, scope, label) {
  if (!scopeRoots || typeof scopeRoots !== 'object') {
    throw trioError('Trio physical gate requires scope roots.', 'ERR_TRIO_PHYSICAL_GATE');
  }
  if (!['workspace', 'user-global'].includes(scope)) {
    throw trioError(`${label} has an unsupported scope: ${String(scope)}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  const root = scopeRoots[scope];
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw trioError(`${label} has no physical root for scope ${scope}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  return path.resolve(root);
}

async function canonicalScopeRoots(scopeRoots) {
  const result = new Map();
  for (const scope of ['workspace', 'user-global']) {
    const root = rootForScope(scopeRoots, scope, 'Trio scope');
    const info = await optionalLstat(root, `${scope} root`);
    if (!info || info.isSymbolicLink() || !info.isDirectory()) {
      throw trioError(`${scope} root must be an existing real directory.`, 'ERR_TRIO_PHYSICAL_GATE');
    }
    result.set(scope, await realpath(root));
  }
  return result;
}

export async function preflightTrioFixturePaths({ fixtureRoot, scopeRoots, descriptors, stateFile }) {
  if (!Array.isArray(descriptors)) {
    throw trioError('Trio descriptors must be an array.', 'ERR_TRIO_PHYSICAL_GATE');
  }
  const effectiveScopeRoots = scopeRoots ?? {
    workspace: fixtureRoot,
    'user-global': fixtureRoot
  };
  const roots = await canonicalScopeRoots(effectiveScopeRoots);
  const targets = [
    ...descriptors.map((descriptor, index) => ({
      label: `descriptor[${index}]`,
      path: descriptor?.destination,
      scope: descriptor?.scope
    })),
    { label: 'state', path: stateFile, scope: 'workspace' }
  ];
  const byPath = new Map();
  const byIdentity = new Map();
  const byAbsentCollision = new Map();
  const inspected = [];

  for (const target of targets) {
    const rootReal = roots.get(target.scope);
    if (!rootReal) {
      throw trioError(`${target.label} has no physical scope root.`, 'ERR_TRIO_PHYSICAL_GATE');
    }
    const absolute = assertAbsolutePath(target.path, `${target.label} path`);
    if (!pathIsWithinOrEqual(rootReal, absolute)) {
      throw trioError(`${target.label} escapes its ${target.scope} root.`, 'ERR_TRIO_PHYSICAL_GATE');
    }
    if (byPath.has(absolute)) {
      throw trioError(`${target.label} aliases ${byPath.get(absolute)}.`, 'ERR_TRIO_PHYSICAL_GATE');
    }
    byPath.set(absolute, target.label);

    const ancestor = await nearestExistingAncestor(rootReal, absolute, target.label);
    const nearestReal = await assertNearestContained(rootReal, ancestor.nearest, target.label);
    const existing = ancestor.missingSuffix === '' ? ancestor.nearestStat : null;
    if (existing) {
      if (!existing.isFile()) {
        throw trioError(`${target.label} must be a regular file when it exists.`, 'ERR_TRIO_PHYSICAL_GATE');
      }
      const resolved = await realpath(absolute).catch(() => null);
      if (!resolved || !pathIsWithinOrEqual(rootReal, resolved)) {
        throw trioError(`${target.label} resolves outside the fixture root.`, 'ERR_TRIO_PHYSICAL_GATE');
      }
      const resolvedStat = await stat(absolute).catch((error) => {
        throw trioError(`Unable to stat ${target.label}.`, 'ERR_TRIO_PHYSICAL_GATE');
      });
      if (resolvedStat.nlink > 1) {
        throw trioError(`${target.label} must not be hard linked.`, 'ERR_TRIO_PHYSICAL_GATE');
      }
      const identity = `${resolvedStat.dev}:${resolvedStat.ino}`;
      if (byIdentity.has(identity)) {
        throw trioError(`${target.label} aliases ${byIdentity.get(identity)} by device/inode.`, 'ERR_TRIO_PHYSICAL_GATE');
      }
      byIdentity.set(identity, target.label);
      inspected.push(Object.freeze({
        ...target,
        absolute,
        exists: true,
        dev: resolvedStat.dev,
        ino: resolvedStat.ino,
        nlink: resolvedStat.nlink,
        nearest: nearestReal,
        collisionKey: `inode:${identity}`
      }));
      continue;
    }

    const nearestStat = await stat(ancestor.nearest).catch((error) => {
      throw trioError(`Unable to stat ${target.label} ancestor.`, 'ERR_TRIO_PHYSICAL_GATE');
    });
    const collisionKey = `absent:${nearestStat.dev}:${nearestStat.ino}:${ancestor.missingSuffix}`;
    if (byAbsentCollision.has(collisionKey)) {
      throw trioError(`${target.label} collides with ${byAbsentCollision.get(collisionKey)}.`, 'ERR_TRIO_PHYSICAL_GATE');
    }
    byAbsentCollision.set(collisionKey, target.label);
    inspected.push(Object.freeze({
      ...target,
      absolute,
      exists: false,
      dev: nearestStat.dev,
      ino: nearestStat.ino,
      nlink: nearestStat.nlink,
      nearest: nearestReal,
      collisionKey
    }));
  }
  return Object.freeze(inspected);
}

/**
 * Re-run the physical gate after directory creation and immediately before a write.
 */
export async function recheckTrioFixturePaths(input) {
  return preflightTrioFixturePaths(input);
}

export function defaultState() {
  return {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    hookMode: 'off',
    deploymentProfile: DEFAULT_DEPLOYMENT_PROFILE,
    policyProfile: DEFAULT_POLICY_PROFILE,
    workspacePolicyOverlay: null,
    skillProfile: DEFAULT_SKILL_PROFILE,
    targets: {},
    upstream: {}
  };
}

export function statePath(rootDir) {
  return path.join(rootDir, '.harness', 'state.json');
}

function hashStateBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stateEvidenceError(message) {
  return trioError(message, 'ERR_TRIO_STATE_DRIFT');
}

async function canonicalStateRoot(rootDir) {
  const requested = path.resolve(rootDir);
  try {
    return await realpath(requested);
  } catch (error) {
    throw stateEvidenceError(`Trio authority root is unavailable while probing state: ${requested}.`);
  }
}

function stateIdentityFromStat(info, label, { directory = false } = {}) {
  if (!info || info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) {
    throw stateEvidenceError(`${label} must remain a real ${directory ? 'directory' : 'regular file'}.`);
  }
  if (!directory && info.nlink !== 1n) {
    throw stateEvidenceError(`${label} must not be hard linked.`);
  }
  return Object.freeze({ dev: info.dev, ino: info.ino, nlink: info.nlink });
}

function sameStateIdentity(left, right) {
  return Boolean(left && right)
    && left.dev === right.dev
    && left.ino === right.ino
    && left.nlink === right.nlink;
}

async function nearestStateDirectoryEvidence(rootDir, targetPath) {
  const authorityPath = path.resolve(rootDir);
  let authority;
  try {
    authority = await lstat(authorityPath, { bigint: true });
  } catch (error) {
    throw stateEvidenceError(`Trio authority root is unavailable while probing state: ${authorityPath}.`);
  }
  const authorityIdentity = stateIdentityFromStat(authority, 'Trio authority root', { directory: true });
  const stateDirectory = path.dirname(targetPath);
  try {
    const parent = await lstat(stateDirectory, { bigint: true });
    return Object.freeze({
      path: stateDirectory,
      identity: stateIdentityFromStat(parent, 'Trio state parent', { directory: true })
    });
  } catch (error) {
    if (isMissingPathError(error)) {
      return Object.freeze({ path: authorityPath, identity: authorityIdentity });
    }
    throw stateEvidenceError(`Trio state parent is unavailable while probing state: ${stateDirectory}.`);
  }
}

async function captureInstallerStateEvidence(rootDir) {
  const targetPath = statePath(rootDir);
  let handle;
  try {
    handle = await open(targetPath, 'r');
  } catch (error) {
    if (!isMissingPathError(error)) throw error;
    const nearest = await nearestStateDirectoryEvidence(rootDir, targetPath);
    return Object.freeze({
      path: targetPath,
      exists: false,
      bytes: null,
      sha256: null,
      identity: null,
      nearest
    });
  }

  try {
    const initial = stateIdentityFromStat(
      await handle.stat({ bigint: true }),
      'Trio persisted state'
    );
    const bytes = await handle.readFile();
    const settled = stateIdentityFromStat(
      await handle.stat({ bigint: true }),
      'Trio persisted state'
    );
    if (!sameStateIdentity(initial, settled)) {
      throw stateEvidenceError(`Trio persisted state changed while it was being read: ${targetPath}.`);
    }
    let pathIdentity;
    try {
      pathIdentity = stateIdentityFromStat(
        await lstat(targetPath, { bigint: true }),
        'Trio persisted state'
      );
    } catch (error) {
      throw stateEvidenceError(`Trio persisted state changed while it was being bound: ${targetPath}.`);
    }
    if (!sameStateIdentity(initial, pathIdentity)) {
      throw stateEvidenceError(`Trio persisted state path changed while it was being read: ${targetPath}.`);
    }
    return Object.freeze({
      path: targetPath,
      exists: true,
      bytes,
      sha256: hashStateBytes(bytes),
      identity: initial,
      nearest: await nearestStateDirectoryEvidence(rootDir, targetPath)
    });
  } finally {
    await handle.close();
  }
}

function normalizeStateEvidenceIdentity(value, label, { allowNull = false } = {}) {
  if (value === null && allowNull) return null;
  const expectedKeys = new Set(['dev', 'ino', 'nlink']);
  const keys = value && typeof value === 'object' ? Reflect.ownKeys(value) : [];
  if (!value || typeof value !== 'object'
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || keys.length !== expectedKeys.size
    || keys.some((key) => typeof key !== 'string' || !expectedKeys.has(key))
    || typeof Object.getOwnPropertyDescriptor(value, 'dev')?.value !== 'bigint'
    || typeof Object.getOwnPropertyDescriptor(value, 'ino')?.value !== 'bigint'
    || typeof Object.getOwnPropertyDescriptor(value, 'nlink')?.value !== 'bigint') {
    throw stateEvidenceError(`${label} must contain bigint dev, ino, and nlink values.`);
  }
  return Object.freeze({ dev: value.dev, ino: value.ino, nlink: value.nlink });
}

function normalizeInstallerStateEvidence(rootDir, value) {
  const expectedKeys = new Set(['path', 'exists', 'bytes', 'sha256', 'identity', 'nearest']);
  const keys = value && typeof value === 'object' ? Reflect.ownKeys(value) : [];
  if (!value || typeof value !== 'object'
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || keys.length !== expectedKeys.size
    || keys.some((key) => typeof key !== 'string' || !expectedKeys.has(key))) {
    throw stateEvidenceError('Trio state probe evidence has an invalid shape.');
  }
  const expectedPath = statePath(rootDir);
  if (Object.getOwnPropertyDescriptor(value, 'path')?.value !== expectedPath
    || typeof Object.getOwnPropertyDescriptor(value, 'exists')?.value !== 'boolean') {
    throw stateEvidenceError('Trio state probe evidence does not match the requested state path.');
  }
  const exists = value.exists;
  const bytes = Object.getOwnPropertyDescriptor(value, 'bytes')?.value;
  const sha256 = Object.getOwnPropertyDescriptor(value, 'sha256')?.value;
  const identity = normalizeStateEvidenceIdentity(
    Object.getOwnPropertyDescriptor(value, 'identity')?.value,
    'Trio state probe target identity',
    { allowNull: !exists }
  );
  const nearestValue = Object.getOwnPropertyDescriptor(value, 'nearest')?.value;
  const nearestKeys = new Set(['path', 'identity']);
  const nearestOwnKeys = nearestValue && typeof nearestValue === 'object' ? Reflect.ownKeys(nearestValue) : [];
  if (!nearestValue || typeof nearestValue !== 'object'
    || (Object.getPrototypeOf(nearestValue) !== Object.prototype && Object.getPrototypeOf(nearestValue) !== null)
    || nearestOwnKeys.length !== nearestKeys.size
    || nearestOwnKeys.some((key) => typeof key !== 'string' || !nearestKeys.has(key))
    || typeof Object.getOwnPropertyDescriptor(nearestValue, 'path')?.value !== 'string') {
    throw stateEvidenceError('Trio state probe nearest-directory evidence has an invalid shape.');
  }
  const nearest = Object.freeze({
    path: nearestValue.path,
    identity: normalizeStateEvidenceIdentity(
      Object.getOwnPropertyDescriptor(nearestValue, 'identity')?.value,
      'Trio state probe nearest-directory identity'
    )
  });
  if (exists) {
    if (!Buffer.isBuffer(bytes) || typeof sha256 !== 'string' || sha256 !== hashStateBytes(bytes) || !identity) {
      throw stateEvidenceError('Trio existing-state probe evidence is invalid.');
    }
  } else if (bytes !== null || sha256 !== null || identity !== null) {
    throw stateEvidenceError('Trio absent-state probe evidence is invalid.');
  }
  return Object.freeze({ path: expectedPath, exists, bytes, sha256, identity, nearest });
}

function sameInstallerStateEvidence(expected, observed) {
  return expected.path === observed.path
    && expected.exists === observed.exists
    && expected.sha256 === observed.sha256
    && (expected.exists ? sameStateIdentity(expected.identity, observed.identity) : expected.identity === null && observed.identity === null)
    && expected.nearest.path === observed.nearest.path
    && sameStateIdentity(expected.nearest.identity, observed.nearest.identity);
}

export async function assertInstallerStateEvidence(rootDir, evidence) {
  const stateRoot = await canonicalStateRoot(rootDir);
  const expected = normalizeInstallerStateEvidence(stateRoot, evidence);
  const observed = await captureInstallerStateEvidence(stateRoot);
  if (!sameInstallerStateEvidence(expected, observed)) {
    throw stateEvidenceError(`Persisted Trio state changed after it was routed: ${statePath(stateRoot)}.`);
  }
  return expected;
}

/**
 * Read the persisted runtime state without collapsing an absent state file into
 * the legacy default. Production command routing relies on this distinction:
 * an absent state is a fresh Trio install opportunity, while a persisted V1
 * state remains on the compatibility path until an explicit upgrade.
 */
export async function probeInstallerState(rootDir) {
  const stateRoot = await canonicalStateRoot(rootDir);
  const evidence = await captureInstallerStateEvidence(stateRoot);
  if (!evidence.exists) {
    return Object.freeze({ kind: 'absent', state: null, evidence });
  }
  let parsed;
  try {
    parsed = JSON.parse(evidence.bytes.toString('utf8'));
  } catch (error) {
    throw error;
  }

  if (parsed && typeof parsed === 'object' && Object.hasOwn(parsed, 'schemaVersion') && parsed.schemaVersion === 2) {
    return Object.freeze({ kind: 'v2', state: validateV2Config(parsed), evidence });
  }

  const state = normalizeStateShape(parsed);
  validateStateShape(state);
  return Object.freeze({ kind: 'v1', state, evidence });
}

export function validateDeploymentProfile(deploymentProfile) {
  if (!DEPLOYMENT_PROFILES.has(deploymentProfile)) {
    throw new TypeError(
      `Harness state deploymentProfile must be one of: ${[...DEPLOYMENT_PROFILES].join(', ')}.`
    );
  }
}

export function normalizePolicySelection(policyProfile) {
  if (isSafetyPolicyProfile(policyProfile)) {
    return {
      policyProfile: DEFAULT_POLICY_PROFILE,
      workspacePolicyOverlay: policyProfile
    };
  }

  return {
    policyProfile: policyProfile ?? DEFAULT_POLICY_PROFILE,
    workspacePolicyOverlay: null
  };
}

export function effectiveEntryPolicyProfiles(state) {
  if (!state.workspacePolicyOverlay) {
    return state.policyProfile;
  }

  const overlayProfile = {
    safety: 'safety-overlay',
    'cloud-safe': 'cloud-safe-overlay'
  }[state.workspacePolicyOverlay] ?? state.workspacePolicyOverlay;

  return [state.policyProfile, overlayProfile];
}

export function activeSafetyPolicyProfile(state) {
  if (state.workspacePolicyOverlay && isSafetyPolicyProfile(state.workspacePolicyOverlay)) {
    return state.workspacePolicyOverlay;
  }

  return isSafetyPolicyProfile(state.policyProfile) ? state.policyProfile : null;
}

export function normalizeRetiredSkillProfile(skillProfile, scope) {
  if (skillProfile !== RETIRED_SKILL_PROFILE) {
    return skillProfile;
  }

  return scope === 'user-global' || scope === 'both' ? 'minimal-global' : DEFAULT_SKILL_PROFILE;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateStateShape(state) {
  if (!isPlainObject(state)) {
    throw new TypeError('Harness state must be a JSON object.');
  }

  for (const key of Object.keys(state)) {
    if (!STATE_KEYS.has(key)) {
      throw new TypeError(`Harness state contains unsupported field: ${key}`);
    }
  }

  if (state.schemaVersion !== 1) {
    throw new TypeError('Harness state schemaVersion must be 1.');
  }

  if (!['workspace', 'user-global', 'both'].includes(state.scope)) {
    throw new TypeError('Harness state scope must be workspace, user-global, or both.');
  }

  if (!['link', 'portable'].includes(state.projectionMode)) {
    throw new TypeError('Harness state projectionMode must be link or portable.');
  }

  if (!['off', 'on'].includes(state.hookMode)) {
    throw new TypeError('Harness state hookMode must be off or on.');
  }

  if ('deploymentProfile' in state) {
    if (typeof state.deploymentProfile !== 'string') {
      throw new TypeError('Harness state deploymentProfile must be a string.');
    }
    validateDeploymentProfile(state.deploymentProfile);
  }

  if ('policyProfile' in state && typeof state.policyProfile !== 'string') {
    throw new TypeError('Harness state policyProfile must be a string.');
  }

  if (
    'workspacePolicyOverlay' in state &&
    state.workspacePolicyOverlay !== null &&
    typeof state.workspacePolicyOverlay !== 'string'
  ) {
    throw new TypeError('Harness state workspacePolicyOverlay must be a string or null.');
  }

  if ('skillProfile' in state && typeof state.skillProfile !== 'string') {
    throw new TypeError('Harness state skillProfile must be a string.');
  }

  if (!isPlainObject(state.targets)) {
    throw new TypeError('Harness state targets must be a JSON object.');
  }

  for (const [targetName, targetState] of Object.entries(state.targets)) {
    if (!TARGET_KEYS.has(targetName)) {
      throw new TypeError(`Harness state contains unsupported target: ${targetName}`);
    }

    if (!isPlainObject(targetState)) {
      throw new TypeError(`Harness state target ${targetName} must be a JSON object.`);
    }

    for (const key of Object.keys(targetState)) {
      if (!['enabled', 'paths'].includes(key)) {
        throw new TypeError(`Harness state target ${targetName} contains unsupported field: ${key}`);
      }
    }

    if (typeof targetState.enabled !== 'boolean') {
      throw new TypeError(`Harness state target ${targetName}.enabled must be boolean.`);
    }

    if (!Array.isArray(targetState.paths) || !targetState.paths.every((entry) => typeof entry === 'string')) {
      throw new TypeError(`Harness state target ${targetName}.paths must be an array of strings.`);
    }
  }

  if (!isPlainObject(state.upstream)) {
    throw new TypeError('Harness state upstream must be a JSON object.');
  }

  for (const key of ['lastSync', 'lastFetch', 'lastUpdate']) {
    if (key in state && typeof state[key] !== 'string') {
      throw new TypeError(`Harness state ${key} must be a string.`);
    }
  }
}

function normalizeStateShape(state) {
  const normalizedPolicySelection = normalizePolicySelection(state.policyProfile);
  const requestedSkillProfile = state.skillProfile ?? 'full';
  return {
    ...state,
    hookMode: state.hookMode ?? 'off',
    deploymentProfile: state.deploymentProfile ?? DEFAULT_DEPLOYMENT_PROFILE,
    policyProfile: normalizedPolicySelection.policyProfile,
    workspacePolicyOverlay:
      state.workspacePolicyOverlay ?? normalizedPolicySelection.workspacePolicyOverlay,
    // Existing v1 state omitted this field while `full` was the default. Keep that
    // persisted-state compatibility while new state starts from `standard`.
    skillProfile: normalizeRetiredSkillProfile(requestedSkillProfile, state.scope)
  };
}

export async function readState(rootDir) {
  const probe = await probeInstallerState(rootDir);
  return probe.kind === 'absent' ? defaultState() : probe.state;
}

export async function writeState(rootDir, state) {
  const normalizedState = state && typeof state === 'object' && Object.hasOwn(state, 'schemaVersion') && state.schemaVersion === 2
    ? validateV2Config(state)
    : normalizeStateShape(state);
  if (normalizedState.schemaVersion === 1) validateStateShape(normalizedState);

  const stateFile = statePath(rootDir);
  const stateDir = path.dirname(stateFile);
  await mkdir(stateDir, { recursive: true });
  await atomicWriteText(stateFile, `${JSON.stringify(normalizedState, null, 2)}\n`);
}

export async function updateState(rootDir, updater) {
  const currentState = await readState(rootDir);
  const nextState = updater(currentState);
  await writeState(rootDir, nextState);
  return nextState;
}
