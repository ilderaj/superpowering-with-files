import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isSafetyPolicyProfile } from './safety-projection.mjs';

export const DEFAULT_DEPLOYMENT_PROFILE = 'standard';
export const DEFAULT_POLICY_PROFILE = 'always-on-core';
export const DEFAULT_SKILL_PROFILE = 'standard';
export const GITHUB_CLOUD_DEPLOYMENT_PROFILE = 'github-cloud';
const DEPLOYMENT_PROFILES = new Set([DEFAULT_DEPLOYMENT_PROFILE, GITHUB_CLOUD_DEPLOYMENT_PROFILE]);
const RETIRED_SKILL_PROFILE_REPLACEMENTS = new Map([
  ['second-opinion-advisory', DEFAULT_SKILL_PROFILE]
]);

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
    skillProfile: RETIRED_SKILL_PROFILE_REPLACEMENTS.get(requestedSkillProfile) ?? requestedSkillProfile
  };
}

export async function readState(rootDir) {
  try {
    const state = normalizeStateShape(JSON.parse(await readFile(statePath(rootDir), 'utf8')));
    validateStateShape(state);
    return state;
  } catch (error) {
    if (error && error.code === 'ENOENT') return defaultState();
    throw error;
  }
}

export async function writeState(rootDir, state) {
  const normalizedState = normalizeStateShape(state);
  validateStateShape(normalizedState);

  const stateFile = statePath(rootDir);
  const stateDir = path.dirname(stateFile);
  await mkdir(stateDir, { recursive: true });

  const tempFile = path.join(
    stateDir,
    `${path.basename(stateFile)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  );
  try {
    await writeFile(tempFile, `${JSON.stringify(normalizedState, null, 2)}\n`);
    await rename(tempFile, stateFile);
  } catch (error) {
    try {
      await unlink(tempFile);
    } catch {
      // Best-effort cleanup only.
    }

    throw error;
  }
}

export async function updateState(rootDir, updater) {
  const currentState = await readState(rootDir);
  const nextState = updater(currentState);
  await writeState(rootDir, nextState);
  return nextState;
}
