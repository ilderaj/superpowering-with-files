import { mkdir, lstat, readFile, realpath, stat } from 'node:fs/promises';
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
    fixtureRoot: rootReal,
    homeDir: path.resolve(homeDir),
    stateFile: path.join(rootReal, '.harness', 'state.json')
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
export async function preflightTrioFixturePaths({ fixtureRoot, descriptors, stateFile }) {
  if (!Array.isArray(descriptors)) {
    throw trioError('Trio descriptors must be an array.', 'ERR_TRIO_PHYSICAL_GATE');
  }
  const rootInfo = await optionalLstat(fixtureRoot, 'fixture root');
  if (!rootInfo || rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw trioError('Fixture root must be an existing real directory.', 'ERR_TRIO_PHYSICAL_GATE');
  }
  const rootReal = await realpath(fixtureRoot);
  const targets = [
    ...descriptors.map((descriptor, index) => ({
      label: `descriptor[${index}]`,
      path: descriptor?.destination
    })),
    { label: 'state', path: stateFile }
  ];
  const byPath = new Map();
  const byIdentity = new Map();
  const byAbsentCollision = new Map();
  const inspected = [];

  for (const target of targets) {
    const absolute = assertAbsolutePath(target.path, `${target.label} path`);
    if (!pathIsWithinOrEqual(rootReal, absolute)) {
      throw trioError(`${target.label} escapes the fixture root.`, 'ERR_TRIO_PHYSICAL_GATE');
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
  try {
    const parsed = JSON.parse(await readFile(statePath(rootDir), 'utf8'));
    if (parsed && typeof parsed === 'object' && Object.hasOwn(parsed, 'schemaVersion') && parsed.schemaVersion === 2) {
      return validateV2Config(parsed);
    }
    const state = normalizeStateShape(parsed);
    validateStateShape(state);
    return state;
  } catch (error) {
    if (error && error.code === 'ENOENT') return defaultState();
    throw error;
  }
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
