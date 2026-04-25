import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STATE_KEYS = new Set([
  'schemaVersion',
  'scope',
  'projectionMode',
  'hookMode',
  'policyProfile',
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
    policyProfile: 'always-on-core',
    skillProfile: 'full',
    targets: {},
    upstream: {}
  };
}

export function statePath(rootDir) {
  return path.join(rootDir, '.harness', 'state.json');
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

  if ('policyProfile' in state && typeof state.policyProfile !== 'string') {
    throw new TypeError('Harness state policyProfile must be a string.');
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
  return {
    ...state,
    hookMode: state.hookMode ?? 'off',
    policyProfile: state.policyProfile ?? 'always-on-core',
    skillProfile: state.skillProfile ?? 'full'
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
