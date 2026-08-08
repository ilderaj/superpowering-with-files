import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { discoverAuthorityRoot } from './authority.mjs';

export const TRIO_FILE_NAMES = Object.freeze(['task_plan.md', 'findings.md', 'progress.md']);
const TRIO_FILE_KEYS = Object.freeze({
  'task_plan.md': 'taskPlan',
  'findings.md': 'findings',
  'progress.md': 'progress'
});
export const TERMINAL_STATUSES = Object.freeze(new Set([
  'accepted',
  'archived',
  'cancelled',
  'canceled',
  'closed',
  'complete',
  'completed',
  'done'
]));

const STATUS_PATTERN = /^Status:\s*([^\r\n]+)$/gm;
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;

function trioError(message, code, cause = undefined) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function isMissingPathError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

function isWithin(parentDir, candidateDir) {
  const relative = path.relative(parentDir, candidateDir);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertDirectChild(parentDir, candidateDir, label) {
  if (!isWithin(parentDir, candidateDir) || path.dirname(candidateDir) !== parentDir) {
    throw trioError(`${label} must be a direct child of ${parentDir}.`, 'ERR_TRIO_PATH_BOUNDARY');
  }
}

async function lstatOrNull(targetPath, label) {
  try {
    return await lstat(targetPath);
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw trioError(`Unable to inspect ${label}: ${targetPath}.`, 'ERR_TRIO_IO', error);
  }
}

async function resolveExistingPath(targetPath, label) {
  try {
    return await realpath(targetPath);
  } catch (error) {
    throw trioError(`Unable to resolve ${label}: ${targetPath}.`, 'ERR_TRIO_IO', error);
  }
}

function assertDirectory(stat, targetPath, label) {
  if (stat.isSymbolicLink()) {
    throw trioError(`Symlinked ${label} is not allowed: ${targetPath}.`, 'ERR_TRIO_SYMLINK');
  }
  if (!stat.isDirectory()) {
    throw trioError(`${label} must be a directory: ${targetPath}.`, 'ERR_TRIO_CORRUPT');
  }
}

function assertRegularFile(stat, targetPath, label) {
  if (stat.isSymbolicLink()) {
    throw trioError(`Symlinked ${label} is not allowed: ${targetPath}.`, 'ERR_TRIO_SYMLINK');
  }
  if (!stat.isFile()) {
    throw trioError(`${label} must be a regular file: ${targetPath}.`, 'ERR_TRIO_CORRUPT');
  }
}

async function resolveAuthorityRoot(rootDir) {
  const candidate = path.resolve(rootDir);
  const candidateStat = await lstatOrNull(candidate, 'authority root');
  if (!candidateStat) {
    throw trioError(`Authority root does not exist: ${candidate}.`, 'ERR_TRIO_IO');
  }

  const resolvedRoot = await resolveExistingPath(candidate, 'authority root');
  const resolvedStat = await lstatOrNull(resolvedRoot, 'authority root');
  if (!resolvedStat || !resolvedStat.isDirectory()) {
    throw trioError(`Authority root must be a directory: ${resolvedRoot}.`, 'ERR_TRIO_CORRUPT');
  }
  return resolvedRoot;
}

async function activeRootFor(rootDir) {
  const authorityRoot = await resolveAuthorityRoot(rootDir);
  const planningPath = path.join(authorityRoot, 'planning');
  const planningStat = await lstatOrNull(planningPath, 'Trio planning directory');
  if (!planningStat) {
    return {
      authorityRoot,
      rootDir: authorityRoot,
      planningRoot: planningPath,
      activeRoot: path.join(planningPath, 'active'),
      activeExists: false
    };
  }
  assertDirectory(planningStat, planningPath, 'Trio planning directory');
  const planningRoot = await resolveExistingPath(planningPath, 'Trio planning directory');
  assertDirectChild(authorityRoot, planningRoot, 'Trio planning directory');

  const activePath = path.join(planningRoot, 'active');
  const activeStat = await lstatOrNull(activePath, 'Trio active directory');
  if (!activeStat) {
    return {
      authorityRoot,
      rootDir: authorityRoot,
      planningRoot,
      activeRoot: activePath,
      activeExists: false
    };
  }
  assertDirectory(activeStat, activePath, 'Trio active directory');
  const activeRoot = await resolveExistingPath(activePath, 'Trio active directory');
  assertDirectChild(planningRoot, activeRoot, 'Trio active directory');

  return {
    authorityRoot,
    rootDir: authorityRoot,
    planningRoot,
    activeRoot,
    activeExists: true
  };
}

async function resolveTaskDirectory(structure, taskId) {
  const candidateDir = path.join(structure.activeRoot, taskId);
  const candidateStat = await lstatOrNull(candidateDir, `Trio task "${taskId}"`);
  if (!candidateStat) {
    throw trioError(`Task "${taskId}" not found under planning/active.`, 'ERR_TRIO_TASK_NOT_FOUND');
  }
  assertDirectory(candidateStat, candidateDir, `Trio task "${taskId}"`);
  const taskDir = await resolveExistingPath(candidateDir, `Trio task "${taskId}"`);
  assertDirectChild(structure.activeRoot, taskDir, `Trio task "${taskId}"`);
  return taskDir;
}

function assertResolvedTaskShape(resolved) {
  if (!resolved || typeof resolved !== 'object') {
    throw trioError('Resolved Trio task must be an object.', 'ERR_TRIO_INVALID_RESOLUTION');
  }

  const authorityRoot = resolved.authorityRoot ?? resolved.rootDir;
  if (typeof authorityRoot !== 'string' || !path.isAbsolute(authorityRoot)) {
    throw trioError('Resolved Trio task has an invalid authority root.', 'ERR_TRIO_INVALID_RESOLUTION');
  }
  assertValidTaskId(resolved.taskId);

  const expectedActiveRoot = path.join(authorityRoot, 'planning', 'active');
  const expectedTaskDir = path.join(expectedActiveRoot, resolved.taskId);
  if (resolved.activeRoot !== expectedActiveRoot || resolved.taskDir !== expectedTaskDir) {
    throw trioError('Resolved Trio task is outside the direct authority structure.', 'ERR_TRIO_PATH_BOUNDARY');
  }

  return { authorityRoot, activeRoot: expectedActiveRoot, taskDir: expectedTaskDir };
}

function fileKeyFor(fileName) {
  const key = TRIO_FILE_KEYS[fileName];
  if (!key) throw trioError(`Unknown Trio file: ${String(fileName)}.`, 'ERR_TRIO_INVALID_FILE');
  return key;
}

export function isValidTaskId(taskId) {
  return typeof taskId === 'string'
    && taskId.trim() === taskId
    && taskId.length > 0
    && taskId !== '.'
    && taskId !== '..'
    && !path.isAbsolute(taskId)
    && !/[\\/]/.test(taskId)
    && !/[\u0000-\u001f\u007f]/.test(taskId);
}

export function assertValidTaskId(taskId) {
  if (!isValidTaskId(taskId)) {
    throw trioError(`Invalid task id: ${String(taskId)}`, 'ERR_INVALID_TASK_ID');
  }
  return taskId;
}

export function isNoActiveTaskError(error) {
  return error?.code === 'ERR_TRIO_NO_ACTIVE_TASK';
}

export function isTaskNotFoundError(error) {
  return error?.code === 'ERR_TRIO_TASK_NOT_FOUND';
}

export const isNoActiveTrioError = isNoActiveTaskError;
export const isTrioTaskNotFoundError = isTaskNotFoundError;

export function parseTaskStatus(taskPlan) {
  if (typeof taskPlan !== 'string' || taskPlan.trim() === '') return null;
  const statuses = [...taskPlan.matchAll(STATUS_PATTERN)].map((match) => match[1].trim());
  if (statuses.length !== 1 || !statuses[0]) return null;
  return statuses[0];
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

export async function readTrioFile(resolved, fileName, options = {}) {
  const { optional = false } = options;
  fileKeyFor(fileName);
  const { authorityRoot, taskDir } = assertResolvedTaskShape(resolved);
  const filePath = path.join(taskDir, fileName);
  const fileStat = await lstatOrNull(filePath, `Trio file ${fileName}`);
  if (!fileStat) {
    if (optional) return null;
    throw trioError(
      `Incomplete Trio for task "${resolved.taskId}": missing ${fileName}.`,
      'ERR_TRIO_INCOMPLETE'
    );
  }
  assertRegularFile(fileStat, filePath, `Trio file ${fileName}`);
  const resolvedFilePath = await resolveExistingPath(filePath, `Trio file ${fileName}`);
  assertDirectChild(taskDir, resolvedFilePath, `Trio file ${fileName}`);
  if (!isWithin(authorityRoot, resolvedFilePath)) {
    throw trioError(`Trio file ${fileName} escapes the authority root.`, 'ERR_TRIO_PATH_BOUNDARY');
  }

  let bytes;
  try {
    bytes = await readFile(resolvedFilePath);
  } catch (error) {
    if (optional && isMissingPathError(error)) return null;
    if (isMissingPathError(error)) {
      throw trioError(
        `Incomplete Trio for task "${resolved.taskId}": missing ${fileName}.`,
        'ERR_TRIO_INCOMPLETE',
        error
      );
    }
    throw trioError(`Unable to read Trio file ${fileName}: ${resolvedFilePath}.`, 'ERR_TRIO_IO', error);
  }

  return {
    key: fileKeyFor(fileName),
    path: resolvedFilePath,
    bytes,
    contents: bytes.toString('utf8')
  };
}

export async function listActiveTrioTaskIds(rootDir) {
  const structure = await activeRootFor(rootDir);
  if (!structure.activeExists) return [];

  let entries;
  try {
    entries = await readdir(structure.activeRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw trioError(`Unable to list Trio active directory: ${structure.activeRoot}.`, 'ERR_TRIO_IO', error);
  }

  const activeTaskIds = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw trioError(
        `Symlinked entry is not allowed under planning/active: ${entry.name}.`,
        'ERR_TRIO_SYMLINK'
      );
    }
    if (!entry.isDirectory()) continue;
    if (!isValidTaskId(entry.name)) {
      throw trioError(`Invalid task directory under planning/active: ${entry.name}.`, 'ERR_TRIO_CORRUPT');
    }

    const taskDir = await resolveTaskDirectory(structure, entry.name);
    const taskPlan = await readTrioFile({
      authorityRoot: structure.authorityRoot,
      rootDir: structure.rootDir,
      activeRoot: structure.activeRoot,
      taskId: entry.name,
      taskDir
    }, 'task_plan.md');
    const status = parseTaskStatus(taskPlan.contents);
    if (!status) {
      throw trioError(`Invalid Trio task plan status for task "${entry.name}".`, 'ERR_TRIO_CORRUPT');
    }
    if (status === 'active') activeTaskIds.push(entry.name);
  }

  return activeTaskIds.sort();
}

function normalizeResolveOptions(options) {
  if (typeof options === 'string') return { taskId: options };
  return options ?? {};
}

export async function resolveTrioTask(rootDir, options = {}) {
  const normalizedOptions = normalizeResolveOptions(options);
  const hasExplicitTaskId = Object.hasOwn(normalizedOptions, 'taskId')
    || Object.hasOwn(normalizedOptions, 'explicitTaskId');
  const explicitTaskId = normalizedOptions.taskId ?? normalizedOptions.explicitTaskId;
  if (hasExplicitTaskId) assertValidTaskId(explicitTaskId);

  const structure = await activeRootFor(rootDir);
  let taskId;
  let source;

  if (hasExplicitTaskId) {
    if (!structure.activeExists) {
      throw trioError(`Task "${explicitTaskId}" not found under planning/active.`, 'ERR_TRIO_TASK_NOT_FOUND');
    }
    taskId = explicitTaskId;
    source = 'explicit';
  } else {
    if (!structure.activeExists) {
      throw trioError('No active task found under planning/active.', 'ERR_TRIO_NO_ACTIVE_TASK');
    }
    const activeTaskIds = await listActiveTrioTaskIds(structure.rootDir);
    if (activeTaskIds.length === 0) {
      throw trioError('No active task found under planning/active.', 'ERR_TRIO_NO_ACTIVE_TASK');
    }
    if (activeTaskIds.length > 1) {
      throw trioError(
        `Multiple active tasks found under planning/active: ${activeTaskIds.join(', ')}. Use --task <id>.`,
        'ERR_TRIO_MULTIPLE_ACTIVE_TASKS'
      );
    }
    taskId = activeTaskIds[0];
    source = 'unique-active';
  }

  const taskDir = await resolveTaskDirectory(structure, taskId);
  return {
    authorityRoot: structure.authorityRoot,
    rootDir: structure.rootDir,
    activeRoot: structure.activeRoot,
    taskId,
    taskDir,
    source
  };
}

export async function readTrioTask(rootDir, options = {}) {
  const resolved = await resolveTrioTask(rootDir, options);
  const files = {};
  const paths = {};
  const bindingFiles = {};

  for (const fileName of TRIO_FILE_NAMES) {
    const file = await readTrioFile(resolved, fileName);
    if (file.contents.trim() === '') {
      throw trioError(
        `Incomplete Trio for task "${resolved.taskId}": empty ${fileName}.`,
        'ERR_TRIO_INCOMPLETE'
      );
    }
    files[file.key] = file.contents;
    paths[file.key] = file.path;
    bindingFiles[file.key] = {
      path: file.path,
      sha256: createHash('sha256').update(file.bytes).digest('hex')
    };
  }

  const status = parseTaskStatus(files.taskPlan);
  if (!status) {
    throw trioError(`Invalid Trio task plan status for task "${resolved.taskId}".`, 'ERR_TRIO_CORRUPT');
  }

  return {
    ...resolved,
    status,
    terminal: isTerminalStatus(status),
    files,
    paths,
    binding: {
      authorityRoot: resolved.authorityRoot,
      taskId: resolved.taskId,
      files: bindingFiles
    }
  };
}

export function assertTrioBinding(binding) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw trioError('Trio binding must be an object.', 'ERR_TRIO_INVALID_BINDING');
  }
  if (typeof binding.authorityRoot !== 'string' || !path.isAbsolute(binding.authorityRoot)) {
    throw trioError('Trio binding authorityRoot must be an absolute path.', 'ERR_TRIO_INVALID_BINDING');
  }
  assertValidTaskId(binding.taskId);
  if (!binding.files || typeof binding.files !== 'object' || Array.isArray(binding.files)) {
    throw trioError('Trio binding files must be an object.', 'ERR_TRIO_INVALID_BINDING');
  }

  const expectedKeys = Object.values(TRIO_FILE_KEYS);
  if (Object.keys(binding.files).length !== expectedKeys.length
    || expectedKeys.some((key) => !Object.hasOwn(binding.files, key))) {
    throw trioError('Trio binding must include exactly the three Trio files.', 'ERR_TRIO_INVALID_BINDING');
  }

  const taskDir = path.join(binding.authorityRoot, 'planning', 'active', binding.taskId);
  for (const fileName of TRIO_FILE_NAMES) {
    const key = TRIO_FILE_KEYS[fileName];
    const file = binding.files[key];
    const expectedPath = path.join(taskDir, fileName);
    if (!file || typeof file !== 'object'
      || file.path !== expectedPath
      || !path.isAbsolute(file.path)
      || typeof file.sha256 !== 'string'
      || !SHA256_PATTERN.test(file.sha256)) {
      throw trioError(`Trio binding has an invalid ${key} entry.`, 'ERR_TRIO_INVALID_BINDING');
    }
  }

  return binding;
}

export async function verifyTrioBinding(binding) {
  const expectedBinding = assertTrioBinding(binding);
  const current = await readTrioTask(expectedBinding.authorityRoot, { taskId: expectedBinding.taskId });
  const mismatches = [];

  for (const key of Object.values(TRIO_FILE_KEYS)) {
    const expected = expectedBinding.files[key];
    const observed = current.binding.files[key];
    if (expected.path !== observed.path || expected.sha256.toLowerCase() !== observed.sha256.toLowerCase()) {
      mismatches.push(key);
    }
  }

  return {
    status: mismatches.length === 0 ? 'match' : 'mismatch',
    matches: mismatches.length === 0,
    mismatches,
    binding: expectedBinding,
    observedBinding: current.binding
  };
}

export const readTrio = readTrioTask;
export const readTask = readTrioTask;

export async function readTrioFromCwd(cwd, options = {}) {
  const authority = await discoverAuthorityRoot(cwd, options);
  const trio = await readTrioTask(authority.rootDir, options);
  return { ...trio, authority };
}
