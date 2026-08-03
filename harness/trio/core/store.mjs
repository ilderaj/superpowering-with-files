import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  unlink
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { discoverAuthorityRoot } from './authority.mjs';
import {
  assertTrioBinding,
  assertValidTaskId,
  readTrioTask
} from './read.mjs';

const TRIO_FILE_ENTRIES = Object.freeze([
  { fileName: 'task_plan.md', key: 'taskPlan' },
  { fileName: 'findings.md', key: 'findings' },
  { fileName: 'progress.md', key: 'progress' }
]);

export const TRIO_STORE_FILE_NAMES = Object.freeze(TRIO_FILE_ENTRIES.map((entry) => entry.fileName));

const TEMPLATE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates');
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;
const TIMESTAMP_PATTERN = /^\d{8}-\d{6}$/u;
const RESERVED_PROGRESS_EVENTS = new Set(['accepted', 'stopped', 'closed', 'archived']);
const LOCK_PREFIX = 'swf-trio-v2-lock-';
const LOCK_OWNER_FILE = '.trio-lock-owner';
const LOCK_WAIT_MS = 2_000;
const LOCK_RETRY_MS = 10;

function storeError(message, code, cause = undefined) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function isMissingPathError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

function isTrioError(error) {
  return typeof error?.code === 'string' && error.code.startsWith('ERR_TRIO_');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireNonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw storeError(`${label} must be non-empty.`, 'ERR_TRIO_INVALID_INPUT');
  }
  return value.trim();
}

function requireSingleLine(value, label) {
  const normalized = requireNonEmpty(value, label);
  if (/[\r\n]/u.test(normalized)) {
    throw storeError(`${label} must be a single line.`, 'ERR_TRIO_INVALID_INPUT');
  }
  return normalized;
}

function requireChief(actor) {
  if (actor !== 'chief') throw storeError('This lifecycle transition requires actor chief.', 'ERR_TRIO_CHIEF_REQUIRED');
  return actor;
}

function assertExpectedSha256(expectedSha256) {
  if (expectedSha256 !== undefined
    && (typeof expectedSha256 !== 'string' || !SHA256_PATTERN.test(expectedSha256))) {
    throw storeError('expectedSha256 must be a 64-character hexadecimal hash.', 'ERR_TRIO_INVALID_SHA256');
  }
}

function assertNotAborted(signal) {
  if (!signal?.aborted) return;
  const error = storeError('Atomic write was aborted before rename.', 'ERR_TRIO_ABORTED');
  error.name = 'AbortError';
  throw error;
}

async function safeLstat(targetPath, label) {
  try {
    return await lstat(targetPath);
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw storeError(`Unable to inspect ${label}: ${targetPath}.`, 'ERR_TRIO_IO', error);
  }
}

async function canonicalDirectory(targetPath, label) {
  const original = await safeLstat(targetPath, label);
  if (!original) throw storeError(`${label} is missing: ${targetPath}.`, 'ERR_TRIO_IO');
  if (original.isSymbolicLink()) throw storeError(`Symlinked ${label} is not allowed: ${targetPath}.`, 'ERR_TRIO_SYMLINK');
  if (!original.isDirectory()) throw storeError(`${label} must be a directory: ${targetPath}.`, 'ERR_TRIO_CORRUPT');

  let resolved;
  try {
    resolved = await realpath(targetPath);
  } catch (error) {
    throw storeError(`Unable to resolve ${label}: ${targetPath}.`, 'ERR_TRIO_IO', error);
  }
  const resolvedStat = await safeLstat(resolved, label);
  if (!resolvedStat || !resolvedStat.isDirectory()) {
    throw storeError(`${label} must resolve to a directory: ${targetPath}.`, 'ERR_TRIO_CORRUPT');
  }
  return resolved;
}

function assertDirectChild(parentPath, candidatePath, label) {
  const relative = path.relative(parentPath, candidatePath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative) || path.dirname(candidatePath) !== parentPath) {
    throw storeError(`${label} must remain a direct child of the authority structure.`, 'ERR_TRIO_PATH_BOUNDARY');
  }
}

async function ensureDirectory(parentPath, targetPath, label) {
  assertDirectChild(parentPath, targetPath, label);
  let stat = await safeLstat(targetPath, label);
  let created = false;
  if (!stat) {
    try {
      await mkdir(targetPath, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw storeError(`Unable to create ${label}: ${targetPath}.`, 'ERR_TRIO_IO', error);
      }
    }
    stat = await safeLstat(targetPath, label);
  }
  if (!stat) throw storeError(`Unable to create ${label}: ${targetPath}.`, 'ERR_TRIO_IO');
  if (stat.isSymbolicLink()) throw storeError(`Symlinked ${label} is not allowed: ${targetPath}.`, 'ERR_TRIO_SYMLINK');
  if (!stat.isDirectory()) throw storeError(`${label} must be a directory: ${targetPath}.`, 'ERR_TRIO_CORRUPT');

  const resolved = await canonicalDirectory(targetPath, label);
  assertDirectChild(parentPath, resolved, label);
  if (created) await fsyncDirectory(parentPath, `${label} parent directory after creation`);
  return resolved;
}

async function fsyncDirectory(directoryPath, label) {
  try {
    const handle = await open(directoryPath, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (isTrioError(error)) throw error;
    throw storeError(`Unable to fsync ${label}: ${directoryPath}.`, 'ERR_TRIO_DIRECTORY_SYNC', error);
  }
}

function lockPathFor(lockKey) {
  const digest = sha256(Buffer.from(lockKey, 'utf8'));
  return path.join(os.tmpdir(), `${LOCK_PREFIX}${digest}`);
}

function directoryIdentity(stat) {
  return { dev: stat.dev, ino: stat.ino };
}

function sameDirectoryIdentity(expected, stat) {
  return stat?.isDirectory()
    && !stat.isSymbolicLink()
    && stat.dev === expected.dev
    && stat.ino === expected.ino;
}

function lockOwnershipError(lockPath, cause = undefined) {
  return storeError(`Trio mutation lock ownership changed: ${lockPath}.`, 'ERR_TRIO_LOCK_OWNERSHIP', cause);
}

async function lockDirectoryIdentity(lockPath) {
  const stat = await safeLstat(lockPath, 'Trio mutation lock');
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) throw lockOwnershipError(lockPath);
  return directoryIdentity(stat);
}

async function assertTransientLockOwnership(lock, lockPath = lock.path) {
  const stat = await safeLstat(lockPath, 'Trio mutation lock');
  if (!sameDirectoryIdentity(lock.identity, stat)) throw lockOwnershipError(lockPath);

  const ownerPath = path.join(lockPath, LOCK_OWNER_FILE);
  const ownerStat = await safeLstat(ownerPath, 'Trio mutation lock owner');
  if (!ownerStat || ownerStat.isSymbolicLink() || !ownerStat.isFile()) throw lockOwnershipError(lockPath);

  let ownerBytes;
  try {
    ownerBytes = await readFile(ownerPath);
  } catch (error) {
    if (isMissingPathError(error)) throw lockOwnershipError(lockPath, error);
    throw storeError(`Unable to inspect Trio mutation lock owner: ${ownerPath}.`, 'ERR_TRIO_LOCK', error);
  }
  if (!ownerBytes.equals(Buffer.from(lock.ownerToken, 'utf8'))) throw lockOwnershipError(lockPath);
}

async function removeEmptyOwnedLock(lock) {
  const stat = await safeLstat(lock.path, 'Trio mutation lock');
  if (!sameDirectoryIdentity(lock.identity, stat)) throw lockOwnershipError(lock.path);
  const entries = await readdir(lock.path);
  if (entries.length !== 0) throw lockOwnershipError(lock.path);
  try {
    await rmdir(lock.path);
  } catch (error) {
    if (isMissingPathError(error) || error?.code === 'ENOTEMPTY') throw lockOwnershipError(lock.path, error);
    throw storeError(`Unable to clean Trio mutation lock: ${lock.path}.`, 'ERR_TRIO_LOCK_CLEANUP', error);
  }
  await fsyncDirectory(path.dirname(lock.path), 'Trio mutation lock parent directory after cleanup');
}

async function releaseTransientLock(lock) {
  await assertTransientLockOwnership(lock);
  const releasePath = `${lock.path}.release-${lock.ownerToken}`;
  try {
    await rename(lock.path, releasePath);
  } catch (error) {
    if (isMissingPathError(error) || error?.code === 'EEXIST') throw lockOwnershipError(lock.path, error);
    throw storeError(`Unable to release Trio mutation lock: ${lock.path}.`, 'ERR_TRIO_LOCK_CLEANUP', error);
  }

  const releasedLock = { ...lock, path: releasePath };
  await assertTransientLockOwnership(releasedLock);
  const ownerPath = path.join(releasePath, LOCK_OWNER_FILE);
  try {
    await unlink(ownerPath);
  } catch (error) {
    if (isMissingPathError(error)) throw lockOwnershipError(releasePath, error);
    throw storeError(`Unable to clean Trio mutation lock owner: ${ownerPath}.`, 'ERR_TRIO_LOCK_CLEANUP', error);
  }
  await removeEmptyOwnedLock(releasedLock);
}

async function cleanupFailedLockAcquisition(lock) {
  const stat = await safeLstat(lock.path, 'Trio mutation lock');
  if (!sameDirectoryIdentity(lock.identity, stat)) throw lockOwnershipError(lock.path);

  const ownerPath = path.join(lock.path, LOCK_OWNER_FILE);
  const ownerStat = await safeLstat(ownerPath, 'Trio mutation lock owner');
  if (!ownerStat) {
    await removeEmptyOwnedLock(lock);
    return;
  }

  try {
    await assertTransientLockOwnership(lock);
  } catch (error) {
    if (isTrioError(error)) throw error;
    throw storeError(`Unable to clean Trio mutation lock: ${lock.path}.`, 'ERR_TRIO_LOCK_CLEANUP', error);
  }
  await releaseTransientLock(lock);
}

async function acquireTransientLock(lockKey) {
  const lockPath = lockPathFor(lockKey);
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (true) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw storeError(`Unable to acquire Trio mutation lock: ${lockPath}.`, 'ERR_TRIO_LOCK', error);
      }
      if (Date.now() >= deadline) {
        throw storeError(`Timed out waiting for Trio mutation lock: ${lockPath}.`, 'ERR_TRIO_LOCK_TIMEOUT');
      }
      await delay(LOCK_RETRY_MS);
      continue;
    }

    const lock = {
      path: lockPath,
      identity: await lockDirectoryIdentity(lockPath),
      ownerToken: randomUUID()
    };
    const ownerPath = path.join(lockPath, LOCK_OWNER_FILE);
    try {
      const handle = await open(ownerPath, 'wx', 0o600);
      try {
        await handle.writeFile(lock.ownerToken, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fsyncDirectory(lockPath, 'Trio mutation lock directory after owner claim');
      await fsyncDirectory(path.dirname(lockPath), 'Trio mutation lock parent directory after owner claim');
    } catch (error) {
      try {
        await cleanupFailedLockAcquisition(lock);
      } catch (cleanupError) {
        if (isTrioError(cleanupError)) throw cleanupError;
        throw storeError(`Unable to clean failed Trio mutation lock acquisition: ${lockPath}.`, 'ERR_TRIO_LOCK_CLEANUP', cleanupError);
      }
      if (isTrioError(error)) throw error;
      throw storeError(`Unable to initialize Trio mutation lock: ${lockPath}.`, 'ERR_TRIO_LOCK', error);
    }

    return {
      path: lockPath,
      async release() {
        await releaseTransientLock(lock);
      }
    };
  }
}

async function withTransientLock(lockKey, operation) {
  const lock = await acquireTransientLock(lockKey);
  try {
    return await operation();
  } finally {
    await lock.release();
  }
}

function taskLockKey(authorityRoot, taskId) {
  return `task\u0000${authorityRoot}\u0000${taskId}`;
}

function withTaskLock(authorityRoot, taskId, operation) {
  return withTransientLock(taskLockKey(authorityRoot, taskId), operation);
}

async function authorityRootFor(rootDir) {
  const authority = await discoverAuthorityRoot(rootDir, { inputRoot: rootDir });
  try {
    const resolved = await realpath(authority.rootDir);
    const stat = await safeLstat(resolved, 'authority root');
    if (!stat || !stat.isDirectory()) throw storeError(`Authority root must be a directory: ${authority.rootDir}.`, 'ERR_TRIO_CORRUPT');
    return resolved;
  } catch (error) {
    if (isTrioError(error)) throw error;
    throw storeError(`Unable to resolve authority root: ${authority.rootDir}.`, 'ERR_TRIO_IO', error);
  }
}

export async function acquireTrioTaskLock(rootDir, taskId) {
  assertValidTaskId(taskId);
  const authorityRoot = await authorityRootFor(rootDir);
  return acquireTransientLock(taskLockKey(authorityRoot, taskId));
}

async function readTemplate(fileName) {
  try {
    return await readFile(path.join(TEMPLATE_ROOT, fileName), 'utf8');
  } catch (error) {
    throw storeError(`Unable to read Trio template ${fileName}.`, 'ERR_TRIO_TEMPLATE', error);
  }
}

async function exactTaskFiles(taskDir) {
  let entries;
  try {
    entries = await readdir(taskDir, { withFileTypes: true });
  } catch (error) {
    throw storeError(`Unable to inspect Trio task directory: ${taskDir}.`, 'ERR_TRIO_IO', error);
  }

  const expected = new Set(TRIO_STORE_FILE_NAMES);
  if (entries.length !== expected.size || entries.some((entry) => !expected.has(entry.name))) {
    throw storeError(`Trio task must contain exactly the three authority files: ${taskDir}.`, 'ERR_TRIO_EXTRA_STATE');
  }
  for (const entry of entries) {
    const targetPath = path.join(taskDir, entry.name);
    if (entry.isSymbolicLink()) throw storeError(`Symlinked Trio file is not allowed: ${targetPath}.`, 'ERR_TRIO_SYMLINK');
    if (!entry.isFile()) throw storeError(`Trio task contains a non-file entry: ${targetPath}.`, 'ERR_TRIO_EXTRA_STATE');
  }
}

export async function readExactTrioTask(rootDir, options = {}) {
  const trio = await readTrioTask(rootDir, options);
  await exactTaskFiles(trio.taskDir);
  await currentTrioBytes(trio);
  return trio;
}

export async function assertExactTrioTask(rootDir, options = {}) {
  return readExactTrioTask(rootDir, options);
}

export const readExactTrio = readExactTrioTask;

async function writableTrio(rootDir, taskId) {
  assertValidTaskId(taskId);
  return readExactTrioTask(rootDir, { taskId });
}

async function withTaskMutation(rootDir, taskId, operation) {
  assertValidTaskId(taskId);
  const authorityRoot = await authorityRootFor(rootDir);
  return withTaskLock(authorityRoot, taskId, async () => {
    const trio = await writableTrio(authorityRoot, taskId);
    return operation(trio);
  });
}

function topLevelFieldLines(text, fieldName) {
  const pattern = new RegExp(`^${fieldName}:([^\\r\\n]*)$`, 'gmu');
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) {
    throw storeError(`Trio task plan has an ambiguous or missing ${fieldName} field.`, 'ERR_TRIO_CORRUPT');
  }
  return matches;
}

function topLevelFieldValue(text, fieldName) {
  return topLevelFieldLines(text, fieldName)[0][1].trim();
}

function setTopLevelFields(text, values) {
  const lines = text.split(/\r?\n/u);
  return lines.map((line) => {
    for (const [fieldName, value] of Object.entries(values)) {
      if (line.startsWith(`${fieldName}:`)) return `${fieldName}: ${value}`;
    }
    return line;
  }).join('\n');
}

function progressEvents(progress) {
  const lines = progress.split(/\r?\n/u);
  const events = [];
  let previousMilliseconds = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('Event:')) continue;
    const event = lines[index].slice('Event:'.length).trim();
    const timestampLine = lines[index + 1] ?? '';
    const actorLine = lines[index + 2] ?? '';
    const detailLine = lines[index + 3] ?? '';
    if (!event || !timestampLine.startsWith('Timestamp:') || !actorLine.startsWith('Actor:') || !detailLine.startsWith('Detail:')) {
      throw storeError('Progress contains a corrupt event record.', 'ERR_TRIO_CORRUPT');
    }
    const timestamp = timestampLine.slice('Timestamp:'.length).trim();
    const actor = actorLine.slice('Actor:'.length).trim();
    const detail = detailLine.slice('Detail:'.length).trim();
    const milliseconds = Date.parse(timestamp);
    if (!timestamp || !actor || !detail || Number.isNaN(milliseconds)) {
      throw storeError('Progress contains an invalid event record.', 'ERR_TRIO_CORRUPT');
    }
    if (previousMilliseconds !== null && milliseconds <= previousMilliseconds) {
      throw storeError('Progress event timestamps must be strictly chronological.', 'ERR_TRIO_CHRONOLOGY');
    }
    previousMilliseconds = milliseconds;
    events.push({ event, timestamp, actor, detail });
    index += 3;
  }
  return events;
}

function assertActive(trio) {
  if (trio.status !== 'active') {
    throw storeError('Progress and lifecycle evidence require an active Trio.', 'ERR_TRIO_LIFECYCLE');
  }
}

function assertExpectedBinding(expectedBinding, trio) {
  if (expectedBinding === undefined) return;
  const expected = assertTrioBinding(expectedBinding);
  if (expected.authorityRoot !== trio.authorityRoot || expected.taskId !== trio.taskId) {
    throw storeError('Trio binding does not target the current authority root and task.', 'ERR_TRIO_BINDING_TARGET');
  }

  const mismatches = [];
  for (const { key } of TRIO_FILE_ENTRIES) {
    if (expected.files[key].sha256.toLowerCase() !== trio.binding.files[key].sha256.toLowerCase()) {
      mismatches.push(key);
    }
  }
  if (mismatches.length > 0) {
    throw storeError(`Trio binding drift detected: ${mismatches.join(', ')}.`, 'ERR_TRIO_BINDING_DRIFT');
  }
}

async function currentTrioBytes(trio) {
  const bytesByKey = {};
  for (const { fileName, key } of TRIO_FILE_ENTRIES) {
    let bytes;
    try {
      bytes = await readFile(trio.paths[key]);
    } catch (error) {
      throw storeError(`Unable to re-read Trio file ${fileName}.`, 'ERR_TRIO_IO', error);
    }
    if (sha256(bytes) !== trio.binding.files[key].sha256.toLowerCase()) {
      throw storeError(`Trio bytes drifted while the mutation lock was held: ${fileName}.`, 'ERR_TRIO_SHA256_DRIFT');
    }
    exactUtf8Text(bytes, fileName);
    bytesByKey[key] = bytes;
  }
  return bytesByKey;
}

function exactUtf8Text(bytes, fileName) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw storeError(`Trio file is not stable UTF-8 text: ${fileName}.`, 'ERR_TRIO_CORRUPT');
  }
  return text;
}

function timestampFor(events, suppliedTimestamp) {
  if (suppliedTimestamp !== undefined) {
    const timestamp = requireSingleLine(suppliedTimestamp, 'timestamp');
    if (Number.isNaN(Date.parse(timestamp))) throw storeError('timestamp must be an ISO date.', 'ERR_TRIO_INVALID_INPUT');
    const lastTimestamp = events.at(-1)?.timestamp;
    if (lastTimestamp && Date.parse(timestamp) <= Date.parse(lastTimestamp)) {
      throw storeError('Progress event timestamps must be chronological.', 'ERR_TRIO_CHRONOLOGY');
    }
    return timestamp;
  }

  const lastMilliseconds = events.length === 0 ? Number.NEGATIVE_INFINITY : Date.parse(events.at(-1).timestamp);
  return new Date(Math.max(Date.now(), lastMilliseconds + 1)).toISOString();
}

async function readAtomicTargetBytes(targetPath) {
  const stat = await safeLstat(targetPath, 'atomic write target');
  if (stat?.isSymbolicLink()) throw storeError(`Atomic write target cannot be a symlink: ${targetPath}.`, 'ERR_TRIO_SYMLINK');
  if (stat && !stat.isFile()) throw storeError(`Atomic write target must be a regular file: ${targetPath}.`, 'ERR_TRIO_CORRUPT');
  if (!stat) return null;
  try {
    return await readFile(targetPath);
  } catch (error) {
    throw storeError(`Unable to read atomic write target: ${targetPath}.`, 'ERR_TRIO_IO', error);
  }
}

function assertAtomicExpectedSha256(expectedSha256, currentBytes) {
  if (expectedSha256 === undefined) return;
  const observed = currentBytes === null ? null : sha256(currentBytes);
  if (observed !== expectedSha256.toLowerCase()) {
    throw storeError(`Atomic write expected SHA-256 ${expectedSha256}, observed ${observed ?? 'missing'}.`, 'ERR_TRIO_SHA256_DRIFT');
  }
}

async function atomicWriteTextLocked(target, contents, options) {
  assertNotAborted(options.signal);
  const parent = path.dirname(target);
  const parentStat = await safeLstat(parent, 'atomic write parent');
  if (!parentStat || parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw storeError(`Atomic write parent must be a real directory: ${parent}.`, 'ERR_TRIO_PATH_BOUNDARY');
  }

  assertAtomicExpectedSha256(options.expectedSha256, await readAtomicTargetBytes(target));
  const temporaryPath = path.join(parent, `.${path.basename(target)}.${randomUUID()}.tmp`);
  let renamed = false;
  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    assertNotAborted(options.signal);
    assertAtomicExpectedSha256(options.expectedSha256, await readAtomicTargetBytes(target));
    assertNotAborted(options.signal);
    await rename(temporaryPath, target);
    renamed = true;
    await fsyncDirectory(parent, 'atomic write parent directory');
    return { path: target, sha256: sha256(Buffer.from(contents, 'utf8')) };
  } catch (error) {
    if (isTrioError(error) || error?.name === 'AbortError') throw error;
    throw storeError(`Atomic write failed for ${target}.`, 'ERR_TRIO_ATOMIC_WRITE', error);
  } finally {
    if (!renamed) {
      try {
        await unlink(temporaryPath);
      } catch (error) {
        if (!isMissingPathError(error)) {
          throw storeError(`Unable to clean atomic write temporary file: ${temporaryPath}.`, 'ERR_TRIO_ATOMIC_CLEANUP', error);
        }
      }
    }
  }
}

export async function atomicWriteText(targetPath, contents, options = {}) {
  if (typeof contents !== 'string') throw storeError('Atomic write contents must be text.', 'ERR_TRIO_INVALID_INPUT');
  assertExpectedSha256(options.expectedSha256);
  assertNotAborted(options.signal);
  const target = path.resolve(targetPath);
  return withTransientLock(`target\u0000${target}`, () => atomicWriteTextLocked(target, contents, options));
}

async function validateStagingTrio(taskDir) {
  await exactTaskFiles(taskDir);
  const contents = {};
  for (const { fileName, key } of TRIO_FILE_ENTRIES) {
    let bytes;
    try {
      bytes = await readFile(path.join(taskDir, fileName));
    } catch (error) {
      throw storeError(`Unable to validate staged Trio file ${fileName}.`, 'ERR_TRIO_IO', error);
    }
    if (bytes.length === 0) throw storeError(`Staged Trio file cannot be empty: ${fileName}.`, 'ERR_TRIO_INCOMPLETE');
    contents[key] = exactUtf8Text(bytes, fileName);
  }
  if (topLevelFieldValue(contents.taskPlan, 'Status') !== 'active'
    || topLevelFieldValue(contents.taskPlan, 'Archive Eligible') !== 'no'
    || topLevelFieldValue(contents.taskPlan, 'Close Reason') !== '') {
    throw storeError('Staged Trio task plan does not have the required active lifecycle fields.', 'ERR_TRIO_CORRUPT');
  }
}

async function cleanupOwnedStaging(stagingDir, planningRoot) {
  try {
    await rm(stagingDir, { recursive: true, force: true });
    await fsyncDirectory(planningRoot, 'Trio planning directory after staging cleanup');
  } catch (error) {
    if (isTrioError(error)) throw error;
    throw storeError(`Unable to clean owned Trio staging directory: ${stagingDir}.`, 'ERR_TRIO_STAGING_CLEANUP', error);
  }
}

export async function initializeTrioTask(rootDir, taskId, goal) {
  assertValidTaskId(taskId);
  const normalizedGoal = requireSingleLine(goal, 'goal');
  const authorityRoot = await authorityRootFor(rootDir);

  return withTaskLock(authorityRoot, taskId, async () => {
    const planningRoot = await ensureDirectory(authorityRoot, path.join(authorityRoot, 'planning'), 'Trio planning directory');
    const activeRoot = await ensureDirectory(planningRoot, path.join(planningRoot, 'active'), 'Trio active directory');
    const taskDir = path.join(activeRoot, taskId);
    const taskStat = await safeLstat(taskDir, `Trio task ${taskId}`);
    if (taskStat?.isSymbolicLink()) throw storeError(`Symlinked Trio task is not allowed: ${taskDir}.`, 'ERR_TRIO_SYMLINK');
    if (taskStat) throw storeError(`Trio task already exists or is partial: ${taskDir}.`, 'ERR_TRIO_EXISTS');

    let stagingDir;
    let published = false;
    try {
      stagingDir = await mkdtemp(path.join(planningRoot, '.trio-init-'));
      await fsyncDirectory(planningRoot, 'Trio planning directory after staging creation');
      stagingDir = await canonicalDirectory(stagingDir, 'Trio initialization staging directory');
      assertDirectChild(planningRoot, stagingDir, 'Trio initialization staging directory');

      const taskPlan = (await readTemplate('task_plan.md')).replace('{{goal}}', () => normalizedGoal);
      const findings = await readTemplate('findings.md');
      const progress = await readTemplate('progress.md');
      await atomicWriteText(path.join(stagingDir, 'task_plan.md'), taskPlan);
      await atomicWriteText(path.join(stagingDir, 'findings.md'), findings);
      await atomicWriteText(path.join(stagingDir, 'progress.md'), progress);
      await validateStagingTrio(stagingDir);
      await fsyncDirectory(stagingDir, 'Trio initialization staging directory');

      const finalStat = await safeLstat(taskDir, `Trio task ${taskId}`);
      if (finalStat?.isSymbolicLink()) throw storeError(`Symlinked Trio task is not allowed: ${taskDir}.`, 'ERR_TRIO_SYMLINK');
      if (finalStat) throw storeError(`Trio task already exists or is partial: ${taskDir}.`, 'ERR_TRIO_EXISTS');
      await rename(stagingDir, taskDir);
      published = true;
      await fsyncDirectory(planningRoot, 'Trio planning directory after initialization publish');
      await fsyncDirectory(activeRoot, 'Trio active directory after initialization publish');
    } catch (error) {
      if (!published && stagingDir) await cleanupOwnedStaging(stagingDir, planningRoot);
      throw error;
    }

    return readExactTrioTask(authorityRoot, { taskId });
  });
}

async function appendEventLocked(trio, input) {
  const current = await currentTrioBytes(trio);
  const progress = exactUtf8Text(current.progress, 'progress.md');
  const events = progressEvents(progress);
  const timestamp = timestampFor(events, input.timestamp);
  const block = `Event: ${input.event}\nTimestamp: ${timestamp}\nActor: ${input.actor}\nDetail: ${input.detail}\n`;
  const nextProgress = `${progress.endsWith('\n') ? `${progress}\n` : `${progress}\n\n`}${block}`;
  const result = await atomicWriteText(trio.paths.progress, nextProgress, {
    expectedSha256: trio.binding.files.progress.sha256
  });
  return { ...result, event: input.event, actor: input.actor, detail: input.detail, timestamp, taskId: trio.taskId };
}

async function appendActiveEvent(rootDir, taskId, input, options = {}) {
  const event = requireSingleLine(input.event ?? input.type, 'event');
  const actor = requireSingleLine(input.actor, 'actor');
  const detail = requireSingleLine(input.detail, 'detail');
  const reserved = RESERVED_PROGRESS_EVENTS.has(event.toLowerCase());
  if (reserved && !options.allowReserved) {
    throw storeError(`Progress event is reserved for a lifecycle transition: ${event}.`, 'ERR_TRIO_RESERVED_EVENT');
  }
  if (options.allowedReserved && !options.allowedReserved.has(event)) {
    throw storeError(`Lifecycle event is not permitted by this transition: ${event}.`, 'ERR_TRIO_RESERVED_EVENT');
  }

  return withTaskMutation(rootDir, taskId, async (trio) => {
    assertActive(trio);
    assertExpectedBinding(input.expectedBinding, trio);
    return appendEventLocked(trio, { event, actor, detail, timestamp: input.timestamp });
  });
}

export async function appendProgressEvent(rootDir, taskId, input = {}) {
  return appendActiveEvent(rootDir, taskId, input);
}

export async function acceptTrioTask(rootDir, taskId, options = {}) {
  const actor = requireChief(options.actor);
  return appendActiveEvent(rootDir, taskId, {
    event: 'accepted',
    actor,
    detail: options.detail,
    timestamp: options.timestamp,
    expectedBinding: options.expectedBinding
  }, {
    allowReserved: true,
    allowedReserved: new Set(['accepted'])
  });
}

export async function stopTrioTask(rootDir, taskId, options = {}) {
  const actor = requireChief(options.actor);
  return appendActiveEvent(rootDir, taskId, {
    event: 'stopped',
    actor,
    detail: options.reason,
    timestamp: options.timestamp,
    expectedBinding: options.expectedBinding
  }, {
    allowReserved: true,
    allowedReserved: new Set(['stopped'])
  });
}

export async function closeTrioTask(rootDir, taskId, options = {}) {
  requireChief(options.actor);
  const reason = requireSingleLine(options.reason, 'reason');
  return withTaskMutation(rootDir, taskId, async (trio) => {
    assertExpectedBinding(options.expectedBinding, trio);
    assertActive(trio);
    const current = await currentTrioBytes(trio);
    const taskPlan = exactUtf8Text(current.taskPlan, 'task_plan.md');
    const progress = exactUtf8Text(current.progress, 'progress.md');
    if (topLevelFieldValue(taskPlan, 'Status') !== 'active') {
      throw storeError('Only an active Trio can be closed.', 'ERR_TRIO_LIFECYCLE');
    }
    if (topLevelFieldValue(taskPlan, 'Archive Eligible') !== 'no') {
      throw storeError('Trio archive eligibility is corrupt before close.', 'ERR_TRIO_CORRUPT');
    }
    topLevelFieldValue(taskPlan, 'Close Reason');
    const evidence = progressEvents(progress).filter((entry) => (
      (entry.event === 'accepted' || entry.event === 'stopped') && entry.actor === 'chief'
    ));
    if (evidence.length === 0) {
      throw storeError('Close requires durable chief accepted or stopped evidence.', 'ERR_TRIO_ACCEPTANCE_REQUIRED');
    }

    const updatedPlan = setTopLevelFields(taskPlan, {
      Status: 'closed',
      'Archive Eligible': 'yes',
      'Close Reason': reason
    });
    await atomicWriteText(trio.paths.taskPlan, updatedPlan, {
      expectedSha256: trio.binding.files.taskPlan.sha256
    });
    return readExactTrioTask(trio.authorityRoot, { taskId: trio.taskId });
  });
}

function validateArchivePlan(taskPlan) {
  if (topLevelFieldValue(taskPlan, 'Status') !== 'closed') {
    throw storeError('Only a closed Trio can be archived.', 'ERR_TRIO_LIFECYCLE');
  }
  if (topLevelFieldValue(taskPlan, 'Archive Eligible') !== 'yes') {
    throw storeError('Trio is not archive eligible.', 'ERR_TRIO_LIFECYCLE');
  }
  if (!topLevelFieldValue(taskPlan, 'Close Reason')) {
    throw storeError('Closed Trio must have a close reason.', 'ERR_TRIO_CORRUPT');
  }
}

function archiveOwnershipError(message, cause = undefined) {
  return storeError(message, 'ERR_TRIO_ARCHIVE_OWNERSHIP', cause);
}

function archivePublicationError(message, cause = undefined) {
  return storeError(message, 'ERR_TRIO_ARCHIVE_PUBLICATION', cause);
}

function archiveCloseError(errors) {
  const cause = errors.length === 1
    ? errors[0]
    : new AggregateError(errors, 'Multiple archive lease close operations failed.');
  const error = storeError('Unable to finalize archive publication leases.', 'ERR_TRIO_ARCHIVE_CLOSE', cause);
  error.leaseErrors = errors;
  return error;
}

function archiveCleanupFailure(destination, archiveError, cleanupErrors) {
  const errors = Array.isArray(cleanupErrors) ? cleanupErrors : [cleanupErrors];
  const cause = errors.length === 1
    ? errors[0]
    : new AggregateError(errors, 'Multiple archive cleanup operations failed.');
  const archiveCode = archiveError?.code ?? archiveError?.name ?? 'unknown archive error';
  const cleanupCodes = errors.map((error) => error?.code ?? error?.name ?? 'unknown cleanup error').join(', ');
  const error = storeError(
    `Unable to clean archive destination after ${archiveCode} (${cleanupCodes}): ${destination}.`,
    'ERR_TRIO_ARCHIVE_CLEANUP',
    cause
  );
  error.archiveError = archiveError;
  error.cleanupErrors = errors;
  return error;
}

function archiveMutationObservationCause(mutationError, observationError) {
  return new AggregateError(
    [mutationError, observationError],
    'Archive mutation and settlement observation both failed.'
  );
}

async function archivePathStat(targetPath, label) {
  try {
    return await lstat(targetPath, { bigint: true });
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw storeError(`Unable to inspect ${label}: ${targetPath}.`, 'ERR_TRIO_IO', error);
  }
}

function archiveIdentityFromStat(stat, label) {
  if (!stat || typeof stat.dev !== 'bigint' || typeof stat.ino !== 'bigint') {
    throw archiveOwnershipError(`${label} does not expose a BigInt device and inode identity.`);
  }
  return { dev: stat.dev, ino: stat.ino };
}

function sameArchiveIdentity(identity, stat, kind) {
  const expectedType = kind === 'directory'
    ? stat?.isDirectory?.()
    : stat?.isFile?.();
  return Boolean(identity
    && stat
    && !stat.isSymbolicLink()
    && expectedType
    && stat.dev === identity.dev
    && stat.ino === identity.ino);
}

function createArchiveAttempt(archiveRoot, destination) {
  return {
    archiveRoot,
    destination,
    directory: {
      path: destination,
      phase: 'unclaimed',
      handle: null,
      identity: null,
      claimedIdentity: null,
      claimAmbiguous: false,
      closeAttempted: false,
      closed: false
    },
    temporaryLeases: [],
    publications: []
  };
}

async function captureArchiveLeaseIdentity(lease, kind, label, expectedIdentity = undefined) {
  const handleStat = await lease.handle.stat({ bigint: true });
  if (!sameArchiveIdentity(archiveIdentityFromStat(handleStat, label), handleStat, kind)) {
    throw archiveOwnershipError(`${label} handle is not the expected ${kind}.`);
  }
  const identity = archiveIdentityFromStat(handleStat, label);
  if (expectedIdentity && (identity.dev !== expectedIdentity.dev || identity.ino !== expectedIdentity.ino)) {
    throw archiveOwnershipError(`${label} changed before its live lease was identified.`);
  }
  const pathStat = await archivePathStat(lease.path, label);
  if (!sameArchiveIdentity(identity, pathStat, kind)) {
    throw archiveOwnershipError(`${label} path does not match its live lease.`);
  }
  lease.identity = identity;
  lease.phase = 'identified';
  return identity;
}

async function assertArchiveDirectoryLease(attempt) {
  const directory = attempt.directory;
  if (directory.phase !== 'identified' || !directory.identity) {
    throw archiveOwnershipError('Archive destination does not have an identified live directory lease.');
  }
  const stat = await archivePathStat(directory.path, 'Trio archive destination');
  if (!sameArchiveIdentity(directory.identity, stat, 'directory')) {
    throw archiveOwnershipError(`Trio archive destination identity changed: ${directory.path}.`);
  }
  return stat;
}

async function assertArchiveAliasLease(attempt, lease) {
  await assertArchiveDirectoryLease(attempt);
  if (!lease.identity) {
    throw archiveOwnershipError(`Archive ${lease.kind} lease is still identity-pending: ${lease.path}.`);
  }
  const stat = await archivePathStat(lease.path, `archive ${lease.kind}`);
  if (!sameArchiveIdentity(lease.identity, stat, 'file')) {
    throw archiveOwnershipError(`Archive ${lease.kind} identity changed: ${lease.path}.`);
  }
  return stat;
}

async function claimArchiveDestinationLease(attempt) {
  const destination = attempt.destination;
  try {
    await mkdir(destination, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const stat = await safeLstat(destination, 'Trio archive destination');
      if (stat?.isSymbolicLink()) throw storeError(`Trio archive destination is a symlink: ${destination}.`, 'ERR_TRIO_SYMLINK');
      throw storeError(`Trio archive destination already exists: ${destination}.`, 'ERR_TRIO_ARCHIVE_COLLISION');
    }
    attempt.directory.claimAmbiguous = true;
    throw storeError(`Unable to claim Trio archive destination: ${destination}.`, 'ERR_TRIO_IO', error);
  }

  attempt.directory.phase = 'claimProvisional';
  const claimedStat = await archivePathStat(destination, 'Trio archive destination');
  if (!claimedStat || claimedStat.isSymbolicLink() || !claimedStat.isDirectory()) {
    throw archiveOwnershipError(`Trio archive destination is not a real directory: ${destination}.`);
  }
  attempt.directory.claimedIdentity = archiveIdentityFromStat(claimedStat, 'Trio archive destination');

  const canonicalDestination = await realpath(destination);
  assertDirectChild(attempt.archiveRoot, canonicalDestination, 'Trio archive destination');
  attempt.destination = canonicalDestination;
  attempt.directory.path = canonicalDestination;

  const handle = await open(canonicalDestination, 'r');
  attempt.directory.handle = handle;
  attempt.directory.phase = 'provisional';
  await captureArchiveLeaseIdentity(
    attempt.directory,
    'directory',
    'Trio archive destination',
    attempt.directory.claimedIdentity
  );
  await assertArchiveDirectoryLease(attempt);
  await fsyncDirectory(attempt.archiveRoot, 'Trio archive directory after destination claim');
  return attempt.destination;
}

function registerArchivePublication(attempt, temporaryLease, fileName, contents) {
  if (attempt.publications.some((publication) => publication.fileName === fileName)) {
    throw archiveOwnershipError(`Archive publication was registered twice: ${fileName}.`);
  }
  const publication = {
    kind: 'final',
    fileName,
    path: path.join(attempt.destination, fileName),
    identity: temporaryLease.identity,
    expectedLength: contents.length,
    expectedSha256: sha256(contents),
    phase: 'published',
    unlinkAttempted: false,
    settled: false,
    temporaryLease
  };
  attempt.publications.push(publication);
  temporaryLease.phase = 'published';
  return publication;
}

async function observeArchiveAliasAfterMutation(attempt, lease) {
  await assertArchiveDirectoryLease(attempt);
  const stat = await archivePathStat(lease.path, `archive ${lease.kind}`);
  if (!stat) return 'missing';
  return sameArchiveIdentity(lease.identity, stat, 'file') ? 'matching' : 'mismatch';
}

async function settleArchiveTemporaryLease(attempt, temporaryLease) {
  await assertArchiveAliasLease(attempt, temporaryLease);
  temporaryLease.phase = 'tempUnlinkAttempted';
  try {
    await unlink(temporaryLease.path);
    temporaryLease.phase = 'tempSettled';
    temporaryLease.settled = true;
  } catch (error) {
    let outcome;
    try {
      outcome = await observeArchiveAliasAfterMutation(attempt, temporaryLease);
    } catch (observationError) {
      throw archivePublicationError(
        `Unable to observe archive temporary file after settlement mutation: ${temporaryLease.path}.`,
        archiveMutationObservationCause(error, observationError)
      );
    }
    if (outcome === 'missing') {
      temporaryLease.phase = 'tempSettled';
      temporaryLease.settled = true;
      throw archivePublicationError(`Archive temporary file was removed before reporting an error: ${temporaryLease.path}.`, error);
    } else if (outcome === 'matching') {
      throw archivePublicationError(`Unable to settle archive temporary file: ${temporaryLease.path}.`, error);
    } else {
      throw archiveOwnershipError(`Archive temporary file changed during settlement: ${temporaryLease.path}.`, error);
    }
  }
  await fsyncDirectory(attempt.destination, 'Trio archive destination after temporary settlement');
}

async function publishArchiveFileCreateOnly({ attempt, fileName, contents }) {
  if (!Buffer.isBuffer(contents)) {
    throw storeError('Archive publication contents must be a Buffer.', 'ERR_TRIO_INVALID_INPUT');
  }
  const finalPath = path.join(attempt.destination, fileName);
  assertDirectChild(attempt.destination, finalPath, 'Trio archive file');
  const temporaryPath = path.join(attempt.destination, `.${fileName}.${randomUUID()}.tmp`);
  let temporaryLease;
  try {
    await assertArchiveDirectoryLease(attempt);
    const handle = await open(temporaryPath, 'wx', 0o600);
    temporaryLease = {
      kind: 'temporary',
      fileName,
      path: temporaryPath,
      handle,
      identity: null,
      expectedLength: null,
      expectedSha256: null,
      phase: 'provisional',
      unlinkAttempted: false,
      settled: false,
      closeAttempted: false,
      closed: false
    };
    attempt.temporaryLeases.push(temporaryLease);
    await captureArchiveLeaseIdentity(temporaryLease, 'file', `archive temporary file ${fileName}`);
    await temporaryLease.handle.writeFile(contents);
    await temporaryLease.handle.sync();
    temporaryLease.expectedLength = contents.length;
    temporaryLease.expectedSha256 = sha256(contents);
    temporaryLease.phase = 'tempSynced';

    await assertArchiveDirectoryLease(attempt);
    temporaryLease.phase = 'linkAttempted';
    try {
      await link(temporaryPath, finalPath);
      registerArchivePublication(attempt, temporaryLease, fileName, contents);
    } catch (error) {
      let published = false;
      try {
        const finalStat = await archivePathStat(finalPath, `archive final file ${fileName}`);
        if (sameArchiveIdentity(temporaryLease.identity, finalStat, 'file')) {
          registerArchivePublication(attempt, temporaryLease, fileName, contents);
          published = true;
        }
      } catch (inspectionError) {
        throw archivePublicationError(
          `Unable to inspect an ambiguous archive publication result: ${finalPath}.`,
          new AggregateError([error, inspectionError], 'Archive hard-link publication and inspection both failed.')
        );
      }
      if (published) {
        throw archivePublicationError(`Archive hard-link publication has an ambiguous result: ${finalPath}.`, error);
      }
      const unsupported = new Set(['EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'EMLINK']).has(error?.code);
      throw archivePublicationError(
        unsupported
          ? `Archive publication requires supported same-directory hard links: ${finalPath}.`
          : `Unable to publish archive file create-only: ${finalPath}.`,
        error
      );
    }

    await fsyncDirectory(attempt.destination, 'Trio archive destination after hard-link publication');
    await settleArchiveTemporaryLease(attempt, temporaryLease);
  } catch (error) {
    if (isTrioError(error)) throw error;
    throw archivePublicationError(`Unable to prepare archive publication: ${finalPath}.`, error);
  }
}

async function verifyExactArchiveSource(attempt, sourceBytes) {
  await assertArchiveDirectoryLease(attempt);
  await exactTaskFiles(attempt.destination);
  if (attempt.publications.length !== TRIO_FILE_ENTRIES.length) {
    throw archiveOwnershipError('Archive publication set is incomplete.');
  }
  for (const { fileName, key } of TRIO_FILE_ENTRIES) {
    const publication = attempt.publications.find((entry) => entry.fileName === fileName);
    if (!publication || publication.settled) {
      throw archiveOwnershipError(`Archive publication is missing: ${fileName}.`);
    }
    await assertArchiveAliasLease(attempt, publication);
    let archivedBytes;
    try {
      archivedBytes = await readFile(publication.path);
    } catch (error) {
      throw storeError(`Unable to verify archive file: ${publication.path}.`, 'ERR_TRIO_ARCHIVE_VERIFY', error);
    }
    if (archivedBytes.length !== publication.expectedLength
      || sha256(archivedBytes) !== publication.expectedSha256
      || !archivedBytes.equals(sourceBytes[key])) {
      throw storeError(`Archive bytes do not match the active Trio source: ${fileName}.`, 'ERR_TRIO_ARCHIVE_VERIFY');
    }
  }
  await fsyncDirectory(attempt.destination, 'Trio archive destination after exact verification');
}

async function closeArchiveLease(lease, label) {
  if (!lease.handle || lease.closeAttempted) return [];
  lease.closeAttempted = true;
  try {
    await lease.handle.close();
    lease.closed = true;
    return [];
  } catch (error) {
    return [storeError(`Unable to close ${label}.`, 'ERR_TRIO_ARCHIVE_CLOSE', error)];
  }
}

async function finalizeArchivePublicationLeases(attempt) {
  const errors = [];
  for (const temporaryLease of attempt.temporaryLeases) {
    errors.push(...await closeArchiveLease(temporaryLease, `archive temporary lease ${temporaryLease.path}`));
  }
  errors.push(...await closeArchiveLease(attempt.directory, `archive directory lease ${attempt.directory.path}`));
  return errors;
}

function liveArchiveCleanupAliases(attempt) {
  const temporary = [];
  for (const lease of attempt.temporaryLeases) {
    if (lease.settled) continue;
    if (lease.phase === 'provisional' || !lease.identity) {
      throw archiveOwnershipError(`Archive temporary lease is identity-pending: ${lease.path}.`);
    }
    temporary.push(lease);
  }
  const publications = [];
  for (const publication of attempt.publications) {
    if (publication.settled) continue;
    if (!publication.identity) {
      throw archiveOwnershipError(`Archive final publication is identity-pending: ${publication.path}.`);
    }
    publications.push(publication);
  }
  return { temporary, publications };
}

async function validateArchiveCleanupSet(attempt) {
  await assertArchiveDirectoryLease(attempt);
  const aliases = liveArchiveCleanupAliases(attempt);
  const expected = new Map();
  for (const lease of [...aliases.temporary, ...aliases.publications]) {
    if (expected.has(path.basename(lease.path))) {
      throw archiveOwnershipError(`Archive cleanup has duplicate owned aliases: ${lease.path}.`);
    }
    expected.set(path.basename(lease.path), lease);
  }

  let entries;
  try {
    entries = await readdir(attempt.destination, { withFileTypes: true });
  } catch (error) {
    throw storeError(`Unable to inspect archive cleanup destination: ${attempt.destination}.`, 'ERR_TRIO_ARCHIVE_CLEANUP', error);
  }
  if (entries.length !== expected.size || entries.some((entry) => !expected.has(entry.name))) {
    throw archiveOwnershipError(`Archive cleanup destination contains unknown or missing entries: ${attempt.destination}.`);
  }

  for (const [name, lease] of expected) {
    const entry = entries.find((candidate) => candidate.name === name);
    if (!entry || entry.isSymbolicLink() || !entry.isFile()) {
      throw archiveOwnershipError(`Archive cleanup entry is not a regular owned file: ${path.join(attempt.destination, name)}.`);
    }
    await assertArchiveAliasLease(attempt, lease);
    if (lease.kind === 'final') {
      let bytes;
      try {
        bytes = await readFile(lease.path);
      } catch (error) {
        throw storeError(`Unable to inspect archive publication during cleanup: ${lease.path}.`, 'ERR_TRIO_ARCHIVE_CLEANUP', error);
      }
      if (bytes.length !== lease.expectedLength || sha256(bytes) !== lease.expectedSha256) {
        throw archiveOwnershipError(`Archive publication bytes drifted before cleanup: ${lease.path}.`);
      }
    }
  }
  return aliases;
}

async function unlinkOwnedArchiveAlias(attempt, lease) {
  await assertArchiveAliasLease(attempt, lease);
  lease.unlinkAttempted = true;
  try {
    await unlink(lease.path);
    lease.settled = true;
    lease.phase = lease.kind === 'temporary' ? 'tempSettled' : 'finalSettled';
    return;
  } catch (error) {
    let outcome;
    try {
      outcome = await observeArchiveAliasAfterMutation(attempt, lease);
    } catch (observationError) {
      throw storeError(
        `Unable to observe owned archive ${lease.kind} after cleanup mutation: ${lease.path}.`,
        'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveMutationObservationCause(error, observationError)
      );
    }
    if (outcome === 'missing') {
      lease.settled = true;
      lease.phase = lease.kind === 'temporary' ? 'tempSettled' : 'finalSettled';
      return;
    }
    if (outcome === 'matching') {
      throw storeError(`Unable to remove owned archive ${lease.kind}: ${lease.path}.`, 'ERR_TRIO_ARCHIVE_CLEANUP', error);
    }
    throw archiveOwnershipError(`Archive ${lease.kind} changed during cleanup: ${lease.path}.`, error);
  }
}

async function removeOwnedArchiveDestination(attempt) {
  await assertArchiveDirectoryLease(attempt);
  attempt.directory.phase = 'removalAttempted';
  try {
    await rmdir(attempt.destination);
    attempt.directory.phase = 'removed';
  } catch (error) {
    let stat;
    try {
      stat = await archivePathStat(attempt.destination, 'Trio archive destination');
    } catch (observationError) {
      throw storeError(
        `Unable to observe owned archive destination after cleanup removal: ${attempt.destination}.`,
        'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveMutationObservationCause(error, observationError)
      );
    }
    if (!stat) {
      attempt.directory.phase = 'removed';
    } else if (sameArchiveIdentity(attempt.directory.identity, stat, 'directory')) {
      attempt.directory.phase = 'identified';
      throw storeError(`Unable to remove owned archive destination: ${attempt.destination}.`, 'ERR_TRIO_ARCHIVE_CLEANUP', error);
    } else {
      throw archiveOwnershipError(`Archive destination changed during cleanup: ${attempt.destination}.`, error);
    }
  }
  await fsyncDirectory(attempt.archiveRoot, 'Trio archive directory after destination cleanup');
}

async function cleanupArchiveAttempt(attempt) {
  const errors = [];
  let aliases;
  try {
    aliases = await validateArchiveCleanupSet(attempt);
  } catch (error) {
    errors.push(error);
  }

  if (errors.length === 0) {
    for (const lease of [...aliases.temporary, ...aliases.publications].reverse()) {
      try {
        await unlinkOwnedArchiveAlias(attempt, lease);
      } catch (error) {
        errors.push(error);
        break;
      }
    }
  }
  if (errors.length === 0) {
    try {
      await fsyncDirectory(attempt.destination, 'Trio archive destination after owned cleanup');
      await removeOwnedArchiveDestination(attempt);
    } catch (error) {
      errors.push(error);
    }
  }

  errors.push(...await finalizeArchivePublicationLeases(attempt));
  return errors;
}

async function copyExactArchiveSource(attempt, sourceBytes) {
  for (const { fileName, key } of TRIO_FILE_ENTRIES) {
    await publishArchiveFileCreateOnly({ attempt, fileName, contents: sourceBytes[key] });
  }
  await verifyExactArchiveSource(attempt, sourceBytes);
}

async function removeExactActiveTask(taskDir, activeRoot) {
  await exactTaskFiles(taskDir);
  for (const { fileName } of TRIO_FILE_ENTRIES) {
    try {
      await unlink(path.join(taskDir, fileName));
    } catch (error) {
      throw storeError(`Unable to remove archived active Trio file: ${fileName}.`, 'ERR_TRIO_ARCHIVE_REMOVE', error);
    }
  }
  await fsyncDirectory(taskDir, 'active Trio task directory before removal');
  try {
    await rmdir(taskDir);
  } catch (error) {
    throw storeError(`Unable to remove archived active Trio directory: ${taskDir}.`, 'ERR_TRIO_ARCHIVE_REMOVE', error);
  }
  await fsyncDirectory(activeRoot, 'Trio active directory after archive removal');
}

export async function archiveTrioTask(rootDir, taskId, options = {}) {
  assertValidTaskId(taskId);
  requireChief(options.actor);
  const timestamp = options.timestamp;
  if (typeof timestamp !== 'string' || !TIMESTAMP_PATTERN.test(timestamp)) {
    throw storeError('archive timestamp must match YYYYMMDD-HHmmss.', 'ERR_TRIO_INVALID_TIMESTAMP');
  }

  return withTaskMutation(rootDir, taskId, async (trio) => {
    assertExpectedBinding(options.expectedBinding, trio);
    const sourceBytes = await currentTrioBytes(trio);
    validateArchivePlan(exactUtf8Text(sourceBytes.taskPlan, 'task_plan.md'));

    const planningRoot = path.dirname(trio.activeRoot);
    const archiveRoot = await ensureDirectory(planningRoot, path.join(planningRoot, 'archive'), 'Trio archive directory');
    await fsyncDirectory(planningRoot, 'Trio planning directory after archive preparation');
    const destinationName = `${timestamp}-${taskId}`;
    const destinationCandidate = path.join(archiveRoot, destinationName);
    assertDirectChild(archiveRoot, destinationCandidate, 'Trio archive destination');

    const attempt = createArchiveAttempt(archiveRoot, destinationCandidate);
    let sourceRemovalStarted = false;
    try {
      await claimArchiveDestinationLease(attempt);
      await copyExactArchiveSource(attempt, sourceBytes);
      await fsyncDirectory(archiveRoot, 'Trio archive directory after archive copy');

      const latestSource = await currentTrioBytes(trio);
      for (const { fileName, key } of TRIO_FILE_ENTRIES) {
        if (!latestSource[key].equals(sourceBytes[key])) {
          throw storeError(`Active Trio bytes drifted before archive removal: ${fileName}.`, 'ERR_TRIO_SHA256_DRIFT');
        }
      }
      validateArchivePlan(exactUtf8Text(latestSource.taskPlan, 'task_plan.md'));
      const closeErrors = await finalizeArchivePublicationLeases(attempt);
      if (closeErrors.length > 0) throw archiveCloseError(closeErrors);
      sourceRemovalStarted = true;
      await removeExactActiveTask(trio.taskDir, trio.activeRoot);
      return { taskId, archiveDir: attempt.destination, status: 'archived' };
    } catch (error) {
      if (!sourceRemovalStarted && (attempt.directory.phase !== 'unclaimed' || attempt.directory.claimAmbiguous)) {
        const cleanupErrors = [
          ...(Array.isArray(error?.leaseErrors) ? error.leaseErrors : []),
          ...await cleanupArchiveAttempt(attempt)
        ];
        if (cleanupErrors.length > 0) {
          throw archiveCleanupFailure(attempt.destination, error, cleanupErrors);
        }
      }
      throw error;
    }
  });
}

export const initializeTrio = initializeTrioTask;
export const initTrioTask = initializeTrioTask;
export const init = initializeTrioTask;
export const progress = appendProgressEvent;
export const accept = acceptTrioTask;
export const stop = stopTrioTask;
export const close = closeTrioTask;
export const archive = archiveTrioTask;
