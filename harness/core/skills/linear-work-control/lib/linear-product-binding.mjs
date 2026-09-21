// LMP-02 product identity and task binding helpers.
//
// Product configuration and task binding are intentionally separate from Trio
// state. These helpers only validate and resolve local JSON; they do not call
// Linear, create a registry, or migrate files implicitly.

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  findSecretKeys,
  validateBinding
} from './linear-work-control.mjs';

export const PRODUCT_CONFIG_SCHEMA_VERSION = 2;
export const TASK_BINDING_SCHEMA_VERSION = 2;
export const ROOT_REGISTRATION_SCHEMA_VERSION = 2;

const PRODUCT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'productKey',
  'workspaceId',
  'teamId',
  'allowedProjectIds',
  'hostProjectId',
  'executionMode',
  'labelIds',
  'statusIds'
]);

const TASK_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'productKey',
  'taskId',
  'configVersion',
  'workspaceId',
  'teamId',
  'projectId',
  'issueId',
  'statusCommentId',
  'rootRegistrationId',
  'sync'
]);

const ROOT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'registrationId',
  'productKey',
  'canonicalRepoId',
  'canonicalRoot',
  'gitCommonDir'
]);

const PRODUCT_KEY = /^[a-z0-9][a-z0-9-]*$/;

const execFileAsync = promisify(execFile);

function plainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function uniqueStrings(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every(nonEmptyString)
    && new Set(value).size === value.length;
}

function unknownKeys(value, allowed, label, errors) {
  if (!plainObject(value)) {
    errors.push(label + ' must be an object');
    return;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push('unknown ' + label + ' key: ' + key);
    }
  }
}

function rejectCredentials(value, errors, label) {
  for (const trail of findSecretKeys(value)) {
    errors.push(label + ' must not store credentials: ' + trail);
  }
}

function validateIdMap(value, label, errors) {
  if (value === undefined) {
    return;
  }
  if (!plainObject(value)) {
    errors.push(label + ' must be an object when present');
    return;
  }
  for (const [key, id] of Object.entries(value)) {
    if (!nonEmptyString(key) || !nonEmptyString(id)) {
      errors.push(label + ' must map non-empty names to non-empty IDs');
    }
  }
}

export function validateProductConfig(input) {
  const errors = [];
  if (!plainObject(input)) {
    return { ok: false, errors: ['product config must be a JSON object'], productConfig: null };
  }
  unknownKeys(input, PRODUCT_KEYS, 'product config', errors);
  rejectCredentials(input, errors, 'product config');
  if (input.schemaVersion !== PRODUCT_CONFIG_SCHEMA_VERSION) {
    errors.push('schemaVersion must be ' + PRODUCT_CONFIG_SCHEMA_VERSION);
  }
  if (input.kind !== 'product-config') {
    errors.push('kind must be product-config');
  }
  if (!nonEmptyString(input.productKey) || !PRODUCT_KEY.test(input.productKey)) {
    errors.push('productKey must be a lowercase slug');
  }
  for (const key of ['workspaceId', 'teamId']) {
    if (!nonEmptyString(input[key])) {
      errors.push(key + ' must be a non-empty string');
    }
  }
  if (!uniqueStrings(input.allowedProjectIds)) {
    errors.push('allowedProjectIds must be a non-empty array of unique IDs');
  }
  if (!(input.hostProjectId === null || nonEmptyString(input.hostProjectId))) {
    errors.push('hostProjectId must be a string or null');
  }
  if (!['manual', 'nightly'].includes(input.executionMode)) {
    errors.push('executionMode must be manual or nightly');
  }
  validateIdMap(input.labelIds, 'labelIds', errors);
  validateIdMap(input.statusIds, 'statusIds', errors);
  return {
    ok: errors.length === 0,
    errors,
    productConfig: errors.length === 0 ? input : null
  };
}

export function validateTaskBinding(input) {
  const errors = [];
  if (!plainObject(input)) {
    return { ok: false, errors: ['task binding must be a JSON object'], taskBinding: null };
  }
  unknownKeys(input, TASK_KEYS, 'task binding', errors);
  rejectCredentials(input, errors, 'task binding');
  if (input.schemaVersion !== TASK_BINDING_SCHEMA_VERSION) {
    errors.push('schemaVersion must be ' + TASK_BINDING_SCHEMA_VERSION);
  }
  if (input.kind !== 'task-binding') {
    errors.push('kind must be task-binding');
  }
  if (!nonEmptyString(input.productKey) || !PRODUCT_KEY.test(input.productKey)) {
    errors.push('productKey must be a lowercase slug');
  }
  for (const key of ['taskId', 'workspaceId', 'teamId', 'projectId', 'issueId', 'statusCommentId', 'rootRegistrationId']) {
    if (!nonEmptyString(input[key])) {
      errors.push(key + ' must be a non-empty string');
    }
  }
  if (input.configVersion !== PRODUCT_CONFIG_SCHEMA_VERSION) {
    errors.push('configVersion must be ' + PRODUCT_CONFIG_SCHEMA_VERSION);
  }
  if (input.sync !== undefined) {
    if (!plainObject(input.sync)) {
      errors.push('sync must be an object when present');
    } else {
      for (const key of Object.keys(input.sync)) {
        if (!['cursor', 'lastSyncedAt', 'lifecycle', 'pendingRetry', 'lastResult', 'lastError'].includes(key)) {
          errors.push('unknown task binding sync key: ' + key);
        }
      }
      if (input.sync.pendingRetry !== undefined && typeof input.sync.pendingRetry !== 'boolean') errors.push('sync.pendingRetry must be boolean');
      if (input.sync.lastResult !== undefined && !['ok','failed','never'].includes(input.sync.lastResult)) errors.push('invalid sync.lastResult');
      if (input.sync.lastError !== undefined && input.sync.lastError !== null && !nonEmptyString(input.sync.lastError)) errors.push('invalid sync.lastError');
      if (input.sync.lifecycle !== undefined) {
        const event = input.sync.lifecycle;
        if (!plainObject(event) || !nonEmptyString(event.eventId) || event.taskId !== input.taskId || !['close','archive','reopen'].includes(event.event) || !nonEmptyString(event.trioPath) || !nonEmptyString(event.recordedAt)) errors.push('invalid sync.lifecycle');
      }
      if (input.sync.cursor !== undefined && !nonEmptyString(input.sync.cursor)) {
        errors.push('sync.cursor must be a non-empty string when present');
      }
      if (input.sync.lastSyncedAt !== undefined && !nonEmptyString(input.sync.lastSyncedAt)) {
        errors.push('sync.lastSyncedAt must be a non-empty string when present');
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    taskBinding: errors.length === 0 ? input : null
  };
}

export function validateRootRegistration(input) {
  const errors = [];
  if (!plainObject(input)) {
    return { ok: false, errors: ['root registration must be a JSON object'], rootRegistration: null };
  }
  unknownKeys(input, ROOT_KEYS, 'root registration', errors);
  rejectCredentials(input, errors, 'root registration');
  if (input.schemaVersion !== ROOT_REGISTRATION_SCHEMA_VERSION) {
    errors.push('root registration schemaVersion must be ' + ROOT_REGISTRATION_SCHEMA_VERSION);
  }
  if (input.kind !== 'repo-root-registration') {
    errors.push('kind must be repo-root-registration');
  }
  for (const key of ['registrationId', 'canonicalRepoId']) {
    if (!nonEmptyString(input[key])) {
      errors.push(key + ' must be a non-empty string');
    }
  }
  if (!nonEmptyString(input.productKey) || !PRODUCT_KEY.test(input.productKey)) {
    errors.push('root registration productKey must be a lowercase slug');
  }
  for (const key of ['canonicalRoot', 'gitCommonDir']) {
    if (!nonEmptyString(input[key]) || !path.isAbsolute(input[key])) {
      errors.push(key + ' must be an absolute path');
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    rootRegistration: errors.length === 0 ? input : null
  };
}

export function detectDuplicateProductKeys(configs) {
  const errors = [];
  const seen = new Map();
  for (const [index, config] of (configs || []).entries()) {
    const key = config && config.productKey;
    if (!nonEmptyString(key)) {
      continue;
    }
    if (seen.has(key)) {
      errors.push('duplicate productKey ' + key + ' at indexes ' + seen.get(key) + ' and ' + index);
    } else {
      seen.set(key, index);
    }
  }
  return { ok: errors.length === 0, errors };
}

async function readCandidate(file, label = file) {
  try {
    await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { state: 'absent', file, label };
    }
    return { state: 'invalid', file, label, error: label + ' could not be inspected (' + (error.code || error.message) + ')' };
  }
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    return { state: 'invalid', file, label, error: label + ' could not be read (' + (error.code || error.message) + ')' };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { state: 'invalid', file, label, error: label + ' is not valid JSON (' + error.message + ')' };
  }
  return { state: 'present', file, label, text, value };
}

async function resolvePreferred(preferred, legacy = []) {
  const primary = await readCandidate(preferred.file, preferred.label);
  if (primary.state !== 'absent') {
    return primary;
  }
  for (const candidate of legacy) {
    const result = await readCandidate(candidate.file, candidate.label);
    if (result.state !== 'absent') {
      return result;
    }
  }
  return { state: 'absent', file: preferred.file, label: preferred.label };
}

async function taskIdFromPaths(repoRoot, explicitTaskId, explicitBinding, taskDir) {
  if (taskDir) {
    const absolute=path.resolve(taskDir), relative=path.relative(repoRoot,absolute).split(path.sep);
    if(relative.length!==3 || relative[0]!=='planning' || !['active','archive'].includes(relative[1])) throw new Error('taskDir must be an exact planning active/archive path');
    for(let current=absolute;current!==repoRoot;current=path.dirname(current)) {
      if((await lstat(current)).isSymbolicLink()) throw new Error('symlink task path rejected');
    }
    let plan='';try { plan=await readFile(path.join(absolute,'task_plan.md'),'utf8'); } catch(error) {if(error.code!=='ENOENT') throw error;}
    const fields=[...plan.matchAll(/^Task ID:[ \t]*([^\r\n]*)$/gm)];
    if(fields.length>1) throw new Error('duplicate stable Task ID');
    const stable=fields[0]?.[1]?.trim() || (relative[1]==='active'?relative[2]:null);
    if(!stable || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(stable)) throw new Error('stable Task ID required for archive');
    if(relative[1]==='active' && stable!==relative[2]) throw new Error('active path/stable identity mismatch');
    if(explicitTaskId && explicitTaskId!==stable) throw new Error('explicit task selector conflicts with stable identity');
    return stable;
  }
  if(explicitTaskId) return explicitTaskId;
  if(explicitBinding) return path.basename(path.dirname(explicitBinding));
  return null;
}

async function discoverTaskId(repoRoot) {
  const reports = path.join(repoRoot, 'reports', 'linear');
  let entries;
  try {
    entries = await readdir(reports, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { ok: false, error: 'no reports/linear task binding directory exists' };
    }
    return { ok: false, error: 'cannot read reports/linear (' + (error.code || error.message) + ')' };
  }
  const ids = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (ids.length !== 1) {
    return { ok: false, error: ids.length === 0 ? 'no task binding was found' : 'task binding is ambiguous; pass --task-id' };
  }
  return { ok: true, taskId: ids[0] };
}

async function discoverProductRegistry(repoRoot) {
  const directory = path.join(repoRoot, '.harness', 'linear', 'products');
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { ok: true, files: [] };
    }
    return { ok: false, error: 'cannot read product registry (' + (error.code || error.message) + ')' };
  }
  return {
    ok: true,
    files: entries
      .filter((entry) => entry.name.endsWith('.json'))
      .map((entry) => path.join(directory, entry.name))
  };
}

async function inspectGitFamily(repoRoot) {
  let top;
  let common;
  try {
    top = (await execFileAsync('git', ['-C', repoRoot, 'rev-parse', '--show-toplevel'])).stdout.trim();
    common = (await execFileAsync('git', ['-C', repoRoot, 'rev-parse', '--git-common-dir'])).stdout.trim();
  } catch (error) {
    return { ok: false, error: 'cannot inspect Git root/worktree family (' + (error.stderr || error.code || error.message).trim() + ')' };
  }
  try {
    const currentRoot = await realpath(top);
    const gitCommonDir = await realpath(path.resolve(top, common));
    return { ok: true, currentRoot, gitCommonDir };
  } catch (error) {
    return { ok: false, error: 'cannot canonicalize Git root/worktree family (' + (error.code || error.message) + ')' };
  }
}

export async function verifyRepoFamily(repoRoot, registration, productKey) {
  const validation = validateRootRegistration(registration);
  if (!validation.ok) {
    return { ok: false, code: 'root-registration-invalid', errors: validation.errors };
  }
  if (productKey && registration.productKey !== productKey) {
    return { ok: false, code: 'root-product-mismatch', error: 'root registration productKey does not match product config' };
  }
  const observed = await inspectGitFamily(repoRoot);
  if (!observed.ok) {
    return { ok: false, code: 'root-unknown', error: observed.error };
  }
  const expectedCommon = await realpath(registration.gitCommonDir).catch(() => null);
  if (!expectedCommon) {
    return {
      ok: false,
      code: 'root-registration-invalid',
      error: 'registered gitCommonDir cannot be canonicalized'
    };
  }
  const registeredRoot = await inspectGitFamily(registration.canonicalRoot);
  if (!registeredRoot.ok) {
    return {
      ok: false,
      code: 'root-registration-invalid',
      error: 'registered canonicalRoot is not a readable Git root/worktree family: ' + registeredRoot.error
    };
  }
  if (registeredRoot.gitCommonDir !== expectedCommon) {
    return {
      ok: false,
      code: 'root-registration-invalid',
      error: 'registered canonicalRoot does not map to registered gitCommonDir'
    };
  }
  if (observed.gitCommonDir !== registeredRoot.gitCommonDir) {
    return {
      ok: false,
      code: 'root-mismatch',
      error: 'current Git root/worktree is outside the registered canonical Git family',
      observed,
      expected: { canonicalRoot: registration.canonicalRoot, gitCommonDir: registration.gitCommonDir }
    };
  }
  return { ok: true, code: 'ok', observed, registrationId: registration.registrationId };
}

async function loadProductConfig(productConfigFile, registryFiles = []) {
  const primary = await readCandidate(productConfigFile, productConfigFile);
  if (primary.state !== 'present') {
    return { ok: false, error: primary.state === 'absent' ? productConfigFile + ' is absent' : primary.error, source: productConfigFile };
  }
  const validation = validateProductConfig(primary.value);
  if (!validation.ok) {
    return { ok: false, error: validation.errors.join('; '), source: primary.label };
  }
  const configs = [validation.productConfig];
  for (const file of registryFiles) {
    if (path.resolve(file) === path.resolve(productConfigFile)) {
      continue;
    }
    const candidate = await readCandidate(file, file);
    if (candidate.state !== 'present') {
      return { ok: false, error: candidate.state === 'absent' ? file + ' is absent' : candidate.error, source: candidate.label };
    }
    const candidateValidation = validateProductConfig(candidate.value);
    if (!candidateValidation.ok) {
      return { ok: false, error: candidateValidation.errors.join('; '), source: candidate.label };
    }
    configs.push(candidateValidation.productConfig);
  }
  const duplicates = detectDuplicateProductKeys(configs);
  if (!duplicates.ok) {
    return { ok: false, error: duplicates.errors.join('; '), source: productConfigFile };
  }
  return { ok: true, config: validation.productConfig, configs, source: primary.label };
}

export async function resolveProductBinding({
  repoRoot,
  taskId,
  taskDir,
  productConfig,
  taskBinding,
  rootRegistration,
  registry = []
} = {}) {
  if (!nonEmptyString(repoRoot)) {
    return { ok: false, error: 'repoRoot is required', code: 'root-unknown' };
  }
  const absoluteRoot = path.resolve(repoRoot);
  let resolvedTaskId;
  try { resolvedTaskId = await taskIdFromPaths(absoluteRoot, taskId, taskBinding, taskDir) || (await discoverTaskId(absoluteRoot)).taskId; }
  catch(error) { return {ok:false,error:error.message,code:'task-binding-unknown'}; }
  if (!resolvedTaskId) {
    return { ok: false, error: 'task binding is ambiguous or absent; pass taskId', code: 'task-binding-unknown' };
  }
  const taskPreferred = taskBinding || path.join(absoluteRoot, 'reports', 'linear', resolvedTaskId, 'linear.json');
  const taskLegacy = taskBinding
    ? []
    : [
        ...(taskDir ? [{ file: path.join(taskDir, 'linear.json'), label: path.join(taskDir, 'linear.json') }] : []),
        { file: path.join(absoluteRoot, 'planning', 'active', resolvedTaskId, 'linear.json'), label: 'planning/active/' + resolvedTaskId + '/linear.json' },
        { file: path.join(absoluteRoot, 'planning', 'archive', resolvedTaskId, 'linear.json'), label: 'planning/archive/' + resolvedTaskId + '/linear.json' },
        { file: path.join(absoluteRoot, '.goal', 'LINEAR.json'), label: '.goal/LINEAR.json' }
      ];
  const taskSource = await resolvePreferred(
    { file: taskPreferred, label: taskBinding || 'reports/linear/' + resolvedTaskId + '/linear.json' },
    taskLegacy
  );
  if (taskSource.state === 'absent') {
    return { ok: false, error: taskSource.label + ' is absent', source: taskSource.label, code: 'task-binding-unknown' };
  }
  if (taskSource.state === 'invalid') {
    return { ok: false, error: taskSource.error, source: taskSource.label, code: 'task-binding-invalid' };
  }

  if (taskSource.value && taskSource.value.schemaVersion === 1) {
    const legacy = validateBinding(taskSource.value);
    if (!legacy.ok) {
      return { ok: false, error: legacy.errors.join('; '), source: taskSource.label, code: 'legacy-binding-invalid' };
    }
    return {
      ok: true,
      mode: 'legacy',
      eligibleForMultiProduct: false,
      source: taskSource.label,
      task: legacy.binding,
      product: null,
      note: 'v1 binding is readable for explicit compatibility; it is not a v2 multi-product queue identity'
    };
  }

  const taskValidation = validateTaskBinding(taskSource.value);
  if (!taskValidation.ok) {
    return { ok: false, error: taskValidation.errors.join('; '), source: taskSource.label, code: 'task-binding-invalid' };
  }
  const configFile = productConfig || path.join(absoluteRoot, '.harness', 'linear', 'project.json');
  const discoveredRegistry = await discoverProductRegistry(absoluteRoot);
  if (!discoveredRegistry.ok) {
    return { ok: false, error: discoveredRegistry.error, source: path.join(absoluteRoot, '.harness', 'linear', 'products'), code: 'product-config-invalid' };
  }
  const productResult = await loadProductConfig(configFile, [...discoveredRegistry.files, ...registry]);
  if (!productResult.ok) {
    return { ok: false, error: productResult.error, source: productResult.source, code: 'product-config-invalid' };
  }
  const config = productResult.config;
  const binding = taskValidation.taskBinding;
  const crossErrors = [];
  if (binding.taskId !== resolvedTaskId) crossErrors.push('task binding taskId does not match the requested task');
  if (binding.productKey !== config.productKey) crossErrors.push('task binding productKey does not match product config');
  if (binding.workspaceId !== config.workspaceId) crossErrors.push('task binding workspaceId does not match product config');
  if (binding.teamId !== config.teamId) crossErrors.push('task binding teamId does not match product config');
  if (!config.allowedProjectIds.includes(binding.projectId)) crossErrors.push('task binding projectId is not allowed by product config');
  if (crossErrors.length > 0) {
    return { ok: false, error: crossErrors.join('; '), source: taskSource.label, code: 'identity-mismatch' };
  }

  const rootFile = rootRegistration || path.join(absoluteRoot, '.harness', 'linear', 'root-registration.json');
  const rootSource = await readCandidate(rootFile, rootFile);
  if (rootSource.state !== 'present') {
    return { ok: false, error: rootSource.state === 'absent' ? rootFile + ' is absent' : rootSource.error, source: rootFile, code: 'root-unknown' };
  }
  const rootValidation = validateRootRegistration(rootSource.value);
  if (!rootValidation.ok) {
    return { ok: false, error: rootValidation.errors.join('; '), source: rootFile, code: 'root-registration-invalid' };
  }
  if (binding.rootRegistrationId !== rootValidation.rootRegistration.registrationId) {
    return { ok: false, error: 'task binding rootRegistrationId does not match independent root registration', source: taskSource.label, code: 'root-mismatch' };
  }
  const family = await verifyRepoFamily(absoluteRoot, rootValidation.rootRegistration, config.productKey);
  if (!family.ok) {
    return { ok: false, error: family.error || family.errors.join('; '), source: rootFile, code: family.code };
  }
  return {
    ok: true,
    mode: 'v2',
    eligibleForMultiProduct: true,
    source: taskSource.label,
    productSource: productResult.source,
    rootSource: rootFile,
    product: config,
    task: binding,
    root: family
  };
}

async function writeJsonAtomic(file, value, validate, label) {
  const result = validate(value);
  if (!result.ok) {
    const error = new Error(label + ' is invalid: ' + result.errors.join('; '));
    error.code = 'ERR_INVALID_' + label.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    error.errors = result.errors;
    throw error;
  }
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + randomUUID());
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, file);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
  return { ok: true, file, bytes: Buffer.byteLength(JSON.stringify(value, null, 2) + '\n') };
}

export function writeProductConfigAtomic(file, value) {
  return writeJsonAtomic(file, value, validateProductConfig, 'product config');
}

export function writeTaskBindingAtomic(file, value) {
  return writeJsonAtomic(file, value, validateTaskBinding, 'task binding');
}

export function planV1Migration({ legacyBinding, productConfig, rootRegistration, taskId }) {
  const legacy = validateBinding(legacyBinding);
  if (!legacy.ok) {
    return { ok: false, dryRun: true, errors: legacy.errors };
  }
  const product = validateProductConfig(productConfig);
  if (!product.ok) {
    return { ok: false, dryRun: true, errors: product.errors };
  }
  const root = validateRootRegistration(rootRegistration);
  if (!root.ok) {
    return { ok: false, dryRun: true, errors: root.errors };
  }
  const errors = [];
  if (root.rootRegistration.productKey !== product.productConfig.productKey) {
    errors.push('root registration productKey does not match product config');
  }
  const map = legacy.binding.taskMap || {};
  const entry = map[taskId] || {};
  const legacyTeamId = entry.teamId || (legacy.binding.team && legacy.binding.team.id);
  const legacyProjectId = entry.projectId || (legacy.binding.project && legacy.binding.project.id);
  const recordedTeamId = legacy.binding.team && legacy.binding.team.id;
  const recordedProjectId = legacy.binding.project && legacy.binding.project.id;
  if (entry.teamId && recordedTeamId && entry.teamId !== recordedTeamId) {
    errors.push('legacy task teamId disagrees with legacy product teamId');
  }
  if (entry.projectId && recordedProjectId && entry.projectId !== recordedProjectId) {
    errors.push('legacy task projectId disagrees with legacy product projectId');
  }
  if (legacyTeamId && legacyTeamId !== product.productConfig.teamId) {
    errors.push('legacy teamId does not match product config teamId');
  }
  if (legacyProjectId && !product.productConfig.allowedProjectIds.includes(legacyProjectId)) {
    errors.push('legacy projectId is not allowed by product config');
  }
  if (errors.length > 0) {
    return { ok: false, dryRun: true, errors };
  }
  const proposal = {
    schemaVersion: TASK_BINDING_SCHEMA_VERSION,
    kind: 'task-binding',
    productKey: product.productConfig.productKey,
    taskId,
    configVersion: PRODUCT_CONFIG_SCHEMA_VERSION,
    workspaceId: product.productConfig.workspaceId,
    teamId: legacyTeamId,
    projectId: legacyProjectId,
    issueId: entry.issueId,
    statusCommentId: entry.statusCommentId || (legacy.binding.statusComment && legacy.binding.statusComment.id),
    rootRegistrationId: root.rootRegistration.registrationId
  };
  const validation = validateTaskBinding(proposal);
  return validation.ok
    ? { ok: true, dryRun: true, wouldWrite: false, proposal }
    : { ok: false, dryRun: true, errors: validation.errors, proposal };
}
