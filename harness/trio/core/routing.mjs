import { createHash } from 'node:crypto';
import path from 'node:path';

export const ROUTE_KINDS = Object.freeze(['quick', 'tracked']);
export const ASSIGNMENT_PACKET_FIELDS = Object.freeze([
  'authority',
  'currentSlice',
  'nonGoals',
  'proof',
  'capability',
  'allowedOperations',
  'deadline',
  'expectedReturn'
]);
export const WORK_ROLE_KINDS = Object.freeze([
  'chief',
  'thinking',
  'planning',
  'orchestrating',
  'high_density_judgment',
  'executing',
  'searching',
  'researching',
  'coding',
  'exploring',
  'repetitive_execution'
]);
export const CHIEF_WORK_ROLES = Object.freeze([
  'chief',
  'thinking',
  'planning',
  'orchestrating',
  'high_density_judgment'
]);
export const EXECUTION_WORK_ROLES = Object.freeze([
  'executing',
  'searching',
  'researching',
  'coding',
  'exploring',
  'repetitive_execution'
]);
export const COMPLEXITY_KINDS = Object.freeze(['high', 'xhigh', 'max']);
export const FLASH_EXECUTION_MODEL = 'opencode-go/deepseek-v4-flash';
export const CHIEF_REQUESTED_MODELS = Object.freeze(['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);
export const CHIEF_REQUESTED_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

const COMPLEXITY_SIGNALS = Object.freeze({
  high: Object.freeze(['bounded', 'routine']),
  xhigh: Object.freeze(['multiFile', 'verificationHeavy', 'research', 'iterative']),
  max: Object.freeze(['longRunning', 'repeatedRepair', 'broadIntegration', 'highComplexity'])
});
const EFFORT_RANK = Object.freeze({ low: 1, medium: 2, high: 3, xhigh: 4, max: 5 });
const GOAL_CONTRACT_FIELDS = Object.freeze([
  'objective',
  'successCriteria',
  'stopConditions',
  'expectedEvidence',
  'maxIterations',
  'milestoneCheckIn',
  'returnCondition'
]);

const BINDING_FILES = Object.freeze([
  ['taskPlan', 'task_plan.md'],
  ['findings', 'findings.md'],
  ['progress', 'progress.md']
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;

export const HOST_OPERATIONS = Object.freeze([
  'spawn',
  'continue',
  'status',
  'interrupt',
  'collect'
]);
export const PRIMARY_EXECUTION_KINDS = Object.freeze([
  'default',
  'visible_worker_required'
]);
export const PRIMARY_EXECUTION_REQUIRED = 'visible_worker_required';
export const LEGACY_VISIBLE_WORKER_REQUIRED_BLOCKER = 'legacy_visible_worker_required_retired';
export const CHILD_DELEGATION_KINDS = Object.freeze([
  'prohibited',
  'worker_discretion',
  'encouraged'
]);
export const EXECUTION_MODE_KINDS = Object.freeze([
  'bounded_slice',
  'worker_self_goal'
]);
export const HOST_ROUTE_KINDS = Object.freeze([
  'visible_worker',
  'native_subagent',
  'manual_pending'
]);
export const ROUTE_EVIDENCE_FIELDS = Object.freeze([
  'routeKind',
  'requestedModel',
  'requestedEffort',
  'actualModel',
  'actualEffort',
  'workerId',
  'capabilityEvidence',
  'permissionEnvelope',
  'pathEnvelope',
  'fallbackReason',
  'status'
]);

const HOST_WORKER_STATUSES = new Set([
  'planned',
  'observed',
  'idle',
  'executing',
  'awaiting_approval',
  'candidate_done',
  'stopped',
  'blocked'
]);

function hasTrackedSignal(input) {
  return [
    input.multiplePhases,
    input.worktree,
    input.crossSession,
    input.durableResearch,
    input.durableDecisions,
    input.requiresRecovery,
    input.tracked
  ].some(Boolean)
    || (Array.isArray(input.phases) && input.phases.length > 1)
    || (Number.isInteger(input.phases) && input.phases > 1);
}

function normalizedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function classifyWorkRole(input = {}) {
  const workRole = input.workRole;
  if (workRole === undefined) return null;
  if (typeof workRole !== 'string' || !WORK_ROLE_KINDS.includes(workRole)) {
    throw new Error(`Unknown work role: ${String(workRole)}`);
  }
  return workRole;
}

export function classifyComplexity(input = {}) {
  if (input.complexity !== undefined) {
    if (typeof input.complexity !== 'string' || !COMPLEXITY_KINDS.includes(input.complexity)) {
      throw new Error(`Unknown complexity: ${String(input.complexity)}`);
    }
    return input.complexity;
  }
  const matched = Object.keys(COMPLEXITY_SIGNALS).filter((complexity) =>
    COMPLEXITY_SIGNALS[complexity].some((key) => input[key] === true));
  if (matched.length === 1) return matched[0];
  if (matched.length === 0) return null;
  throw new Error('Ambiguous complexity signals are a blocker for execution work; no implicit model escalation.');
}

function normalizeOverride(override) {
  if (override === undefined) return null;
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    throw new Error('Human override requires a structured reason and provenance.');
  }
  const reason = normalizedString(override.reason);
  const provenance = normalizedString(override.provenance);
  if (!reason || !provenance) {
    throw new Error('Human override requires a structured reason and provenance.');
  }
  return { reason, provenance };
}

// Host routing aliases are transport identifiers; only apiModel goes to OpenAI.
export function modelIdentity(model) {
  const match = /^(main|p646e20)\/(.+)$/u.exec(model);
  const apiModel = match ? match[2] : model;
  if (CHIEF_REQUESTED_MODELS.includes(apiModel)) {
    return { provider: 'openai', apiModel, hostPrefix: match ? match[1] : null };
  }
  return { provider: model.includes('/') ? model.split('/')[0] : 'openai', apiModel, hostPrefix: null };
}

// Recommendations are opt-in for new explicit packets. Existing packets keep
// their legacy defaults, so resolving them never rewrites frozen bindings.
export const RECOMMENDED_MODEL_SELECTIONS = Object.freeze({
  demanding: Object.freeze({ requestedModel: 'gpt-6-astra', requestedEffort: 'high' }),
  complex: Object.freeze({ requestedModel: 'gpt-5.6-sol', requestedEffort: 'high' }),
  balanced: Object.freeze({ requestedModel: 'gpt-5.6-terra', requestedEffort: 'medium' }),
  fast: Object.freeze({ requestedModel: 'gpt-5.6-luna', requestedEffort: 'medium' })
});

export function recommendedEffortOf(model) {
  const apiModel = modelIdentity(model).apiModel;
  return Object.values(RECOMMENDED_MODEL_SELECTIONS).find((selection) => selection.requestedModel === apiModel)?.requestedEffort;
}

export function validateModelEffort(model, effort, { workRole = null, isChild = false, hostEvidence = undefined } = {}) {
  const identity = modelIdentity(model);
  const openai = CHIEF_REQUESTED_MODELS.includes(identity.apiModel);
  if (!openai && model !== FLASH_EXECUTION_MODEL) {
    throw new Error(`Unsupported requested model: ${model}; select gpt-6-astra, gpt-5.6-sol/terra/luna, or the legacy Flash model.`);
  }
  if (isChild && effort === 'ultra') throw new Error('Child model requests may not use ultra effort.');
  if (openai && effort === 'ultra') {
    const evidence = objectRecord(hostEvidence);
    const supported = objectRecord(evidence.supportedModelEfforts)[model];
    if (CHIEF_WORK_ROLES.includes(workRole)
      && (identity.apiModel !== 'gpt-6-astra' || identity.hostPrefix !== null)
      && evidence.authenticated === true && normalizedString(evidence.evidenceRef)
      && Array.isArray(supported) && supported.includes('ultra')) return;
    throw new Error(`Effort ultra for ${model} requires authenticated Host supportedModelEfforts evidence for this exact Chief selection; use max or a supported OpenAI effort instead.`);
  }
  const efforts = openai ? CHIEF_REQUESTED_EFFORTS : COMPLEXITY_KINDS;
  if (!efforts.includes(effort)) {
    throw new Error(`Unsupported effort ${effort} for ${model}; use ${efforts.join(', ')}.`);
  }
}

function requestedProviderOf(model) {
  return modelIdentity(model).provider;
}

function topologyOf(input) {
  const topology = {};
  if (input.primaryExecution !== undefined) topology.primaryExecution = input.primaryExecution;
  if (input.executionMode !== undefined) topology.executionMode = input.executionMode;
  return Object.keys(topology).length > 0 ? topology : null;
}

function normalizeModelEffortInput(input) {
  for (const [primary, alias] of [['requestedModel', 'model'], ['requestedEffort', 'effort']]) {
    for (const key of [primary, alias]) {
      if (input[key] !== undefined && normalizedString(input[key]) === null) {
        throw new Error(`Explicit ${key} must be non-empty text.`);
      }
    }
    if (input[primary] !== undefined && input[alias] !== undefined && input[primary] !== input[alias]) {
      throw new Error(`Conflicting ${primary} and ${alias}; bind one explicit selection.`);
    }
  }
  return { ...input, requestedModel: input.requestedModel ?? input.model, requestedEffort: input.requestedEffort ?? input.effort };
}

function resolveEconomicPolicy(input, taskClass) {
  input = normalizeModelEffortInput(input);
  const workRole = classifyWorkRole(input);
  const override = normalizeOverride(input.override);
  const complexity = classifyComplexity(input);
  let requestedModel;
  let requestedEffort;
  let resolvedComplexity = null;

  if (EXECUTION_WORK_ROLES.includes(workRole)) {
    if (override) {
      throw new Error('A human override may only classify a Chief/high-density slice; execution roles never upgrade model or effort.');
    }
    if (complexity === null) {
      throw new Error('Unknown complexity is a blocker for execution work; no implicit model escalation.');
    }
    resolvedComplexity = complexity;
    requestedModel = normalizedString(input.requestedModel) ?? FLASH_EXECUTION_MODEL;
    requestedEffort = normalizedString(input.requestedEffort)
      ?? (normalizedString(input.requestedModel) ? recommendedEffortOf(requestedModel) : undefined)
      ?? complexity;
  } else if (CHIEF_WORK_ROLES.includes(workRole)) {
    if (complexity !== null) {
      throw new Error(`Complexity is execution-scoped and cannot classify Chief work role ${workRole}.`);
    }
    const callerModel = normalizedString(input.requestedModel);
    const callerEffort = normalizedString(input.requestedEffort);
    requestedModel = callerModel ?? 'gpt-5.6-sol';
    // Omitted Chief effort means max in legacy frozen Sol/Terra packets.
    // Recommendations must be chosen explicitly before freezing a new packet.
    requestedEffort = callerEffort ?? 'max';
  } else {
    throw new Error(`Unknown work role: ${String(input.workRole)}`);
  }

  validateModelEffort(requestedModel, requestedEffort, {
    workRole, isChild: input.isChild === true, hostEvidence: input.hostEvidence
  });

  const authenticatedEvidence = input.evidence?.authenticated === true ? input.evidence : null;
  const actualModel = normalizedString(authenticatedEvidence?.actualModel) ?? 'unknown';
  const actualEffort = normalizedString(authenticatedEvidence?.actualEffort) ?? 'unknown';

  return {
    taskClass,
    route: taskClass,
    workRole,
    complexity: resolvedComplexity,
    requestedProvider: requestedProviderOf(requestedModel),
    requestedModel,
    requestedEffort,
    topology: topologyOf(input),
    override,
    actualModel,
    actualEffort,
    actualObserved: actualModel !== 'unknown' || actualEffort !== 'unknown'
  };
}

function isValidTaskId(taskId) {
  return typeof taskId === 'string'
    && taskId.trim() === taskId
    && taskId.length > 0
    && taskId !== '.'
    && taskId !== '..'
    && !path.isAbsolute(taskId)
    && !/[\\/]/.test(taskId)
    && !/[\u0000-\u001f\u007f]/.test(taskId);
}

function assertBindingShape(binding, label) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new Error(`Assignment packet ${label} must be an object.`);
  }
  if (typeof binding.authorityRoot !== 'string' || !path.isAbsolute(binding.authorityRoot)) {
    throw new Error(`Assignment packet ${label} authorityRoot must be an absolute path.`);
  }
  if (!isValidTaskId(binding.taskId)) {
    throw new Error(`Assignment packet ${label} taskId is invalid.`);
  }
  if (!binding.files || typeof binding.files !== 'object' || Array.isArray(binding.files)) {
    throw new Error(`Assignment packet ${label} files must be an object.`);
  }
  if (Object.keys(binding.files).length !== BINDING_FILES.length
    || BINDING_FILES.some(([key]) => !Object.hasOwn(binding.files, key))) {
    throw new Error(`Assignment packet ${label} must contain exactly three Trio file bindings.`);
  }

  const taskDir = path.join(binding.authorityRoot, 'planning', 'active', binding.taskId);
  for (const [key, fileName] of BINDING_FILES) {
    const file = binding.files[key];
    if (!file || typeof file !== 'object'
      || !path.isAbsolute(file.path)
      || file.path !== path.join(taskDir, fileName)
      || typeof file.sha256 !== 'string'
      || !SHA256_PATTERN.test(file.sha256)) {
      throw new Error(`Assignment packet ${label} has an invalid ${key} file binding.`);
    }
  }
  return binding;
}

function bindingsMatch(left, right) {
  if (left.authorityRoot !== right.authorityRoot || left.taskId !== right.taskId) return false;
  return BINDING_FILES.every(([key]) => {
    const leftFile = left.files[key];
    const rightFile = right.files[key];
    return leftFile.path === rightFile.path
      && leftFile.sha256.toLowerCase() === rightFile.sha256.toLowerCase();
  });
}

function assertAuthorityBinding(authority) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    throw new Error('Assignment packet authority must be an object.');
  }
  const binding = assertBindingShape(authority.binding, 'authority binding');
  const observation = assertBindingShape(authority.bindingObservation, 'binding observation');
  if (!bindingsMatch(binding, observation)) {
    throw new Error('Assignment packet binding observation does not match the authority binding.');
  }
}

export function classifyTask(input = {}) {
  const explicit = input.taskClass ?? input.classification ?? input.route;
  if (explicit === 'quick') return 'quick';
  if (explicit === 'tracked' || explicit === 'deep-reasoning') return 'tracked';
  return hasTrackedSignal(input) ? 'tracked' : 'quick';
}

export function routeTask(input = {}) {
  const taskClass = classifyTask(input);
  return {
    taskClass,
    route: taskClass,
    createTrio: taskClass === 'tracked',
    reason: taskClass === 'tracked'
      ? 'durable or multi-phase work uses the tracked route'
      : 'single-stage work stays inline without Trio creation'
  };
}

export function resolveModelEffort(input = {}) {
  const taskClass = classifyTask(input);
  if (classifyWorkRole(input) === null) {
    throw new Error('A requested model decision requires a declared workRole; no unclassified model may be requested.');
  }
  return resolveEconomicPolicy(input, taskClass);
}

export function resolveAssignmentPacketModelPolicy(assignmentPacket, { isChild = false, hostEvidence } = {}) {
  if (!assignmentPacket || typeof assignmentPacket !== 'object' || Array.isArray(assignmentPacket)) {
    throw new Error('Assignment packet model policy requires an Assignment Packet.');
  }
  const capability = assignmentPacket.capability;
  return resolveEconomicPolicy({
    ...capability,
    isChild,
    hostEvidence,
    evidence: { authenticated: false }
  }, null);
}

function assertNonEmptyStringArray(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must be a non-empty array of non-empty strings.`);
  }
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
      throw new Error(`${label} must be a non-empty array of non-empty strings.`);
    }
  }
}

function assertGoalContract(goalContract) {
  if (!goalContract || typeof goalContract !== 'object' || Array.isArray(goalContract)) {
    throw new Error('worker_self_goal requires a complete nested goal contract.');
  }
  const keys = Object.keys(goalContract);
  if (keys.length !== GOAL_CONTRACT_FIELDS.length
    || keys.some((key) => !GOAL_CONTRACT_FIELDS.includes(key))
    || GOAL_CONTRACT_FIELDS.some((key) => !Object.hasOwn(goalContract, key))) {
    throw new Error('Goal contract must have the exact closed shape: objective, successCriteria, stopConditions, expectedEvidence, maxIterations, milestoneCheckIn, returnCondition.');
  }
  if (typeof goalContract.objective !== 'string' || goalContract.objective.trim() === '') {
    throw new Error('Goal contract objective must be non-empty text.');
  }
  assertNonEmptyStringArray(goalContract.successCriteria, 'Goal contract successCriteria');
  assertNonEmptyStringArray(goalContract.stopConditions, 'Goal contract stopConditions');
  assertNonEmptyStringArray(goalContract.expectedEvidence, 'Goal contract expectedEvidence');
  if (!Number.isSafeInteger(goalContract.maxIterations)
    || goalContract.maxIterations < 1
    || goalContract.maxIterations > 100) {
    throw new Error('Goal contract maxIterations must be a positive safe integer not exceeding 100.');
  }
  if (typeof goalContract.milestoneCheckIn !== 'string' || goalContract.milestoneCheckIn.trim() === '') {
    throw new Error('Goal contract milestoneCheckIn must be non-empty text.');
  }
  if (typeof goalContract.returnCondition !== 'string' || goalContract.returnCondition.trim() === '') {
    throw new Error('Goal contract returnCondition must be non-empty text.');
  }
}

function assertCapabilityPolicy(capability) {
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
    throw new Error('Assignment packet capability must be an object.');
  }
  const workRole = classifyWorkRole(capability);
  if (workRole === null) {
    throw new Error('Assignment packet capability requires a declared workRole; no unclassified model may be requested.');
  }
  const complexity = classifyComplexity(capability);
  if (EXECUTION_WORK_ROLES.includes(workRole)) {
    if (complexity === null) {
      throw new Error(`Execution work role ${workRole} requires exactly one valid complexity; no implicit model escalation.`);
    }
  } else if (complexity !== null) {
    throw new Error(`Complexity is execution-scoped and cannot classify Chief work role ${workRole}.`);
  }
  if (capability.primaryExecution !== undefined
    && (typeof capability.primaryExecution !== 'string'
      || !PRIMARY_EXECUTION_KINDS.includes(capability.primaryExecution))) {
    throw new Error(`Unknown primaryExecution kind: ${String(capability.primaryExecution)}`);
  }
  if (capability.childDelegation !== undefined && typeof capability.childDelegation !== 'string') {
    throw new Error('capability.childDelegation must be a string policy.');
  }
  if (capability.executionMode !== undefined && typeof capability.executionMode !== 'string') {
    throw new Error('capability.executionMode must be a string mode.');
  }
  if (capability.executionMode === 'worker_self_goal') {
    assertGoalContract(capability.goalContract);
  }
  return capability;
}

export function buildAssignmentPacket(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Assignment packet input must be an object.');
  }
  const missing = ASSIGNMENT_PACKET_FIELDS.filter((field) => !Object.hasOwn(input, field));
  if (missing.length > 0) {
    throw new Error(`Assignment packet requires eight fields: ${missing.join(', ')}.`);
  }
  const unexpected = Object.keys(input).filter((field) => !ASSIGNMENT_PACKET_FIELDS.includes(field));
  if (unexpected.length > 0) {
    throw new Error(`Assignment packet rejects unexpected top-level fields: ${unexpected.join(', ')}.`);
  }
  assertAuthorityBinding(input.authority);
  assertCapabilityPolicy(input.capability);
  return structuredClone(Object.fromEntries(ASSIGNMENT_PACKET_FIELDS.map((field) => [field, input[field]])));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

export function freezeAssignmentPacket(input = {}) {
  return deepFreeze(buildAssignmentPacket(input));
}

export function calculateNextAction(input = {}) {
  if (input.dryRun !== true) {
    throw new Error('calculateNextAction is read-only only with --dry-run.');
  }

  const route = typeof input.route === 'string' ? routeTask({ taskClass: input.route }) : input.route ?? routeTask(input);
  const taskClass = route.taskClass ?? classifyTask(route);

  if (taskClass === 'quick') {
    return {
      action: 'execute-inline',
      route: 'quick',
      dryRun: true,
      readOnly: true,
      createTrio: false,
      writes: []
    };
  }

  if (input.hasTrio) {
    return {
      action: 'resume-trio',
      route: 'tracked',
      dryRun: true,
      readOnly: true,
      createTrio: false,
      writes: []
    };
  }

  return {
    action: 'create-trio',
    route: 'tracked',
    dryRun: true,
    readOnly: true,
    createTrio: true,
    writes: []
  };
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function assertHostOperation(operation) {
  if (!HOST_OPERATIONS.includes(operation)) {
    throw new Error(`Unsupported Host operation: ${String(operation)}`);
  }
  return operation;
}

function normalizeSet(values, label) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array.`);
  }
  const normalized = values.map((value) => {
    if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
      throw new Error(`${label} contains an invalid entry.`);
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error(`${label} contains a control character.`);
    }
    return value;
  });
  return [...new Set(normalized)].sort();
}

function normalizeRelativePath(value, label = 'path') {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)
    || path.isAbsolute(value)
    || /^[A-Za-z]:[\\/]/.test(value)
    || /^[\\/]/.test(value)) {
    throw new Error(`${label} must be authority-relative.`);
  }
  const segments = value.split(/[\\/]/);
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`${label} contains an unsafe segment.`);
  }
  return segments.join('/');
}

function normalizePathSet(values, label) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array.`);
  }
  return [...new Set(values.map((value) => normalizeRelativePath(value, label)))].sort();
}

function normalizeEnvelope(input, label = 'envelope') {
  const source = objectRecord(input);
  const permissionSource = objectRecord(source.permissionEnvelope);
  const pathSource = objectRecord(source.pathEnvelope);
  const permissions = source.permissions ?? permissionSource.permissions;
  const operations = source.operations ?? permissionSource.operations;
  const externalEffects = source.externalEffects ?? permissionSource.externalEffects;
  const mutablePaths = source.mutablePaths
    ?? pathSource.mutablePaths;
  return {
    permissions: normalizeSet(permissions, `${label}.permissions`),
    mutablePaths: normalizePathSet(mutablePaths, `${label}.mutablePaths`),
    operations: normalizeSet(operations, `${label}.operations`),
    externalEffects: normalizeSet(externalEffects, `${label}.externalEffects`)
  };
}

function publicPermissionEnvelope(envelope) {
  return {
    permissions: [...envelope.permissions],
    operations: [...envelope.operations],
    externalEffects: [...envelope.externalEffects]
  };
}

function publicPathEnvelope(envelope) {
  return { mutablePaths: [...envelope.mutablePaths] };
}

function pathIsWithin(child, parent) {
  return child === parent || child.startsWith(`${parent}/`);
}

export function pathsConflict(left, right) {
  const normalizedLeft = normalizeRelativePath(left, 'left path');
  const normalizedRight = normalizeRelativePath(right, 'right path');
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(`${normalizedRight}/`)
    || normalizedRight.startsWith(`${normalizedLeft}/`);
}

export function hasMutablePathConflict(leftPaths = [], rightPaths = []) {
  const left = normalizePathSet(leftPaths, 'left paths');
  const right = normalizePathSet(rightPaths, 'right paths');
  return left.some((leftPath) => right.some((rightPath) => pathsConflict(leftPath, rightPath)));
}

function setIsSubset(child, parent) {
  return child.every((value) => parent.includes(value));
}

function pathSetIsSubset(child, parent) {
  return child.every((childPath) => parent.some((parentPath) => pathIsWithin(childPath, parentPath)));
}

function setsEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function envelopeIsSubset(child, parent) {
  return setIsSubset(child.permissions, parent.permissions)
    && pathSetIsSubset(child.mutablePaths, parent.mutablePaths)
    && setIsSubset(child.operations, parent.operations)
    && setIsSubset(child.externalEffects, parent.externalEffects);
}

function envelopeIsProperSubset(child, parent) {
  return !setsEqual(child.permissions, parent.permissions)
    || !setsEqual(child.mutablePaths, parent.mutablePaths)
    || !setsEqual(child.operations, parent.operations)
    || !setsEqual(child.externalEffects, parent.externalEffects);
}

export function isEnvelopeSubset(childInput, parentInput) {
  const child = normalizeEnvelope(childInput, 'child envelope');
  const parent = normalizeEnvelope(parentInput, 'parent envelope');
  return envelopeIsSubset(child, parent);
}

function normalizeObservationRecord(input) {
  const source = objectRecord(input);
  const capabilities = objectRecord(source.capabilities);
  const visibleWorker = objectRecord(
    source.visibleWorker
      ?? capabilities.visible_worker
  );
  const nativeSubagent = objectRecord(
    source.nativeSubagent
      ?? capabilities.native_subagent
  );
  const worktreeSetup = objectRecord(source.worktreeSetup);
  const createAttempts = source.createAttempts;
  if (createAttempts !== undefined
    && (!Number.isSafeInteger(createAttempts) || createAttempts < 0)) {
    throw new Error('Host createAttempts must be a non-negative safe integer.');
  }
  return {
    authenticated: source.authenticated === true,
    evidenceRef: normalizedString(source.evidenceRef),
    packetDigest: normalizedString(source.packetDigest),
    actualModel: source.actualModel,
    actualEffort: source.actualEffort,
    visibleWorker,
    nativeSubagent,
    workerId: normalizedString(source.workerId),
    status: normalizedString(source.status ?? source.workerStatus),
    lanes: source.lanes ?? source.laneObservations ?? [],
    worktreeSetup: {
      clientThreadId: normalizedString(worktreeSetup.clientThreadId),
      resolved: worktreeSetup.resolved === true
    },
    createAttempts: createAttempts === undefined ? null : createAttempts
  };
}

function unknownActual() {
  return { actualModel: 'unknown', actualEffort: 'unknown' };
}

function operationSupport(capability, operation) {
  const source = objectRecord(capability);
  const operations = source.operations;
  if (operations && typeof operations === 'object' && !Array.isArray(operations)) {
    if (Object.hasOwn(operations, operation)) {
      return operations[operation] === true ? 'supported'
        : operations[operation] === false ? 'unsupported' : 'unknown';
    }
    return source.operationsComplete === true
      ? 'unsupported'
      : 'unknown';
  }
  if (source.supported === false) return 'unsupported';
  return 'unknown';
}

function nativeCapabilityEvidence(capability, operation, observation) {
  const source = objectRecord(capability);
  return {
    kind: 'native_subagent',
    authenticated: observation.authenticated,
    evidenceRef: observation.evidenceRef ?? null,
    visible: false,
    operation,
    operationSupport: operationSupport(source, operation),
    requestedModelEffortControls: source.requestedModelEffortControls === true,
    permissionBinding: source.permissionBinding === true,
    pathBinding: source.pathBinding === true,
    nativeCollaboration: source.nativeCollaboration === true || source.supported === true
  };
}

function matchesChiefRelease(source, workerId, mutablePaths) {
  const release = objectRecord(source.chiefRelease);
  if (release.authenticated !== true
    || release.disposition !== 'release'
    || !workerId
    || normalizedString(release.workerId) !== workerId
    || !normalizedString(release.evidenceRef)) {
    return false;
  }
  const releasedPaths = normalizePathSet(release.mutablePaths, 'chiefRelease.mutablePaths');
  return setsEqual(releasedPaths, mutablePaths);
}

function normalizeLanes(input, observation) {
  const rawLanes = input.lanes ?? observation.lanes;
  if (rawLanes === undefined) return [];
  if (!Array.isArray(rawLanes)) throw new Error('lane observations must be an array.');
  return rawLanes.map((lane, index) => {
    const source = objectRecord(lane);
    const routeKind = normalizedString(source.routeKind);
    if (!routeKind || !HOST_ROUTE_KINDS.includes(routeKind)) {
      throw new Error(`Host lane route kind is invalid: ${String(source.routeKind)}`);
    }
    const status = normalizedString(source.status);
    if (!status || !HOST_WORKER_STATUSES.has(status)) {
      throw new Error(`Host lane status is invalid: ${String(source.status)}`);
    }
    const lanePathEnvelope = normalizeEnvelope(source.pathEnvelope ?? source, `lane ${index}`);
    const workerId = normalizedString(source.workerId);
    const taskId = normalizedString(source.taskId);
    const currentSlice = normalizedString(source.currentSlice);
    const packetDigest = normalizedString(source.packetDigest);
    if (source.packetDigest !== undefined
      && (packetDigest === null || !SHA256_PATTERN.test(packetDigest))) {
      throw new Error(`Host lane packet digest is invalid: ${String(source.packetDigest)}`);
    }
    return {
      routeKind,
      workerId,
      status,
      released: matchesChiefRelease(source, workerId, lanePathEnvelope.mutablePaths),
      mutablePaths: lanePathEnvelope.mutablePaths,
      taskId,
      currentSlice,
      packetDigest
    };
  });
}

function laneIsReserved(lane) {
  return lane.mutablePaths.length > 0 && lane.released !== true;
}

function laneConflicts(lanes, candidatePaths, workerId, operation) {
  return lanes.some((lane) => {
    if (!laneIsReserved(lane) || (operation !== 'spawn' && workerId && lane.workerId === workerId)) return false;
    return hasMutablePathConflict(candidatePaths, lane.mutablePaths);
  });
}

// ---------------------------------------------------------------------------
// Semantic dispatch lanes: derived from the immutable packet, never a ninth
// packet field or a durable worker registry.
// ---------------------------------------------------------------------------

const ACTIVE_SEMANTIC_STATUSES = Object.freeze([
  'planned',
  'observed',
  'idle',
  'executing',
  'awaiting_approval',
  'blocked',
  'candidate_done'
]);

function packetSemanticLane(assignmentPacket) {
  if (!assignmentPacket) return null;
  const binding = objectRecord(objectRecord(assignmentPacket.authority).binding);
  const taskId = normalizedString(binding.taskId);
  const slice = objectRecord(assignmentPacket.currentSlice);
  const sliceName = normalizedString(slice.name);
  if (!taskId || !sliceName) return null;
  return { taskId, sliceName };
}

function laneSemanticIdentity(lane) {
  if (!lane.taskId || !lane.currentSlice) return null;
  return { taskId: lane.taskId, sliceName: lane.currentSlice };
}

function semanticSpawnBlocker({ lanes, assignmentPacket, candidatePaths }) {
  if (lanes.length === 0) return null;
  const candidate = packetSemanticLane(assignmentPacket);
  for (const lane of lanes) {
    if (lane.released === true || !ACTIVE_SEMANTIC_STATUSES.includes(lane.status)) {
      continue;
    }
    const identity = laneSemanticIdentity(lane);
    if (identity === null) {
      if (!hasMutablePathConflict(candidatePaths, lane.mutablePaths)) {
        return {
          blocker: `semantic_identity_unbound:${lane.status}`,
          workerId: lane.workerId,
          status: lane.status,
          resumeCondition: `Reserved ${lane.status} lane ${lane.workerId ?? 'unknown'} lacks authority task and frozen current-slice identity. Do not spawn a replacement: supply the lane's task ID and current-slice identity, or settle the lane with an authenticated Chief release (chiefRelease disposition release with matching workerId and mutable paths).`
        };
      }
      continue;
    }
    if (candidate
      && identity.taskId === candidate.taskId
      && identity.sliceName === candidate.sliceName) {
      return {
        blocker: `semantic_lane_reserved:${lane.status}`,
        workerId: lane.workerId,
        status: lane.status,
        resumeCondition: `Semantic lane ${candidate.taskId}/${candidate.sliceName} is reserved by worker ${lane.workerId ?? 'unknown'} in status ${lane.status}. Do not spawn a replacement: observe, approve, and continue that exact worker, or supply an authenticated Chief release (chiefRelease disposition release with the matching workerId and mutable paths) before any new spawn.`
      };
    }
    if (!candidate && !hasMutablePathConflict(candidatePaths, lane.mutablePaths)) {
      return {
        blocker: `semantic_identity_unbound:${lane.status}`,
        workerId: lane.workerId,
        status: lane.status,
        resumeCondition: `Semantic lane ${identity.taskId}/${identity.sliceName} is reserved by worker ${lane.workerId ?? 'unknown'} in status ${lane.status}, but this request carries no immutable assignment packet. Do not spawn a replacement: supply the immutable assignment packet (authority task ID and frozen currentSlice), or settle the lane with an authenticated Chief release (chiefRelease disposition release with matching workerId and mutable paths).`
      };
    }
  }
  return null;
}

function worktreePendingBlocker(observation) {
  const setup = observation.worktreeSetup ?? {};
  const clientThreadId = setup.clientThreadId;
  if (!clientThreadId || setup.resolved === true) return null;
  return {
    blocker: `worktree_setup_pending:${clientThreadId}`,
    resumeCondition: `Resolve the pending worktree setup ${clientThreadId} with a bounded status/wait on that exact setup before any fallback spawn; one corrected create-request attempt is the maximum.`
  };
}

function createAttemptsBlocker(observation) {
  const attempts = observation.createAttempts;
  if (attempts === null || attempts < 2) return null;
  return {
    blocker: 'worker_create_attempts_exhausted',
    resumeCondition: 'One bounded create correction is the maximum; a second Host validation error returns manual_pending for Chief/human correction, not another retry.'
  };
}

function validateObservedStatus(status) {
  if (status === 'accepted' || status === 'chief_accepted') {
    throw new Error('Host worker observation cannot claim Chief acceptance.');
  }
  if (status !== null && !HOST_WORKER_STATUSES.has(status)) {
    throw new Error(`Unknown Host worker status: ${status}`);
  }
}

function nativeSafety({ operation, capability, observation, parentEnvelope, childEnvelope, requestedEffort, lanes }) {
  const support = operationSupport(capability, operation);
  if (operation !== 'spawn') {
    return { safe: false, reason: 'native_target_unbound', support };
  }
  if (observation.authenticated !== true || !observation.evidenceRef) {
    return { safe: false, reason: 'native_observation_unknown', support };
  }
  if (capability.supported !== true && capability.nativeCollaboration !== true) {
    return { safe: false, reason: capability.supported === false ? 'native_unsupported' : 'native_unknown', support };
  }
  if (capability.visible === true) {
    return { safe: false, reason: 'native_visible_identity_conflict', support };
  }
  if (support !== 'supported') {
    return { safe: false, reason: `native_operation_${support}`, support };
  }
  if (requestedEffort.toLowerCase() === 'ultra') {
    return { safe: false, reason: 'native_ultra_forbidden', support };
  }
  if (!childEnvelope || !childEnvelope.operations.includes(operation)) {
    return { safe: false, reason: 'child_operation_unbound', support };
  }
  if (!envelopeIsSubset(childEnvelope, parentEnvelope)) {
    return { safe: false, reason: 'child_envelope_widened', support };
  }
  if (!envelopeIsProperSubset(childEnvelope, parentEnvelope)) {
    return { safe: false, reason: 'child_envelope_not_narrower', support };
  }
  if (laneConflicts(lanes, childEnvelope.mutablePaths, null, operation)) {
    return { safe: false, reason: 'mutable_path_conflict', support };
  }
  return { safe: true, reason: null, support };
}

function buildRouteEvidence({
  routeKind,
  requestedModel,
  requestedEffort,
  actual,
  workerId,
  capability,
  permissionEnvelope,
  pathEnvelope,
  fallbackReason,
  status
}) {
  return Object.fromEntries([
    ['routeKind', routeKind],
    ['requestedModel', requestedModel],
    ['requestedEffort', requestedEffort],
    ['actualModel', actual.actualModel],
    ['actualEffort', actual.actualEffort],
    ['workerId', workerId],
    ['capabilityEvidence', capability],
    ['permissionEnvelope', publicPermissionEnvelope(permissionEnvelope)],
    ['pathEnvelope', publicPathEnvelope(pathEnvelope)],
    ['fallbackReason', fallbackReason],
    ['status', status]
  ]);
}

function buildOperationDescriptor({
  operation,
  routeKind,
  childEnvelope,
  assignmentPacket,
  packetDigest,
  blocker,
  resumeCondition,
  reservedLane
}) {
  const descriptorPacket = assignmentPacket === null ? null : freezeAssignmentPacket(assignmentPacket);
  const descriptor = {
    kind: 'host_operation',
    operation,
    routeKind,
    executed: false,
    writes: []
  };
  if (routeKind === 'native_subagent') descriptor.childEnvelope = {
    permissions: [...childEnvelope.permissions],
    mutablePaths: [...childEnvelope.mutablePaths],
    operations: [...childEnvelope.operations],
    externalEffects: [...childEnvelope.externalEffects]
  };
  if ((routeKind === 'visible_worker' || routeKind === 'native_subagent') && assignmentPacket) {
    descriptor.assignmentPacket = descriptorPacket;
    descriptor.packetDigest = packetDigest;
  }
  if (routeKind === 'manual_pending') {
    descriptor.kind = 'manual_pending';
    descriptor.assignmentPacket = descriptorPacket;
    descriptor.packetDigest = packetDigest;
    descriptor.blocker = blocker;
    descriptor.resumeCondition = resumeCondition;
    if (reservedLane) {
      descriptor.reservedLane = {
        workerId: reservedLane.workerId,
        status: reservedLane.status
      };
    }
  }
  return descriptor;
}

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function packetDigestOf(packet) {
  if (!packet) return null;
  return createHash('sha256').update(stableStringify(packet)).digest('hex');
}

function primaryExecutionKind(assignmentPacket) {
  const capability = objectRecord(assignmentPacket?.capability);
  const value = capability.primaryExecution ?? 'default';
  if (!PRIMARY_EXECUTION_KINDS.includes(value)) {
    throw new Error(`Unknown primaryExecution kind: ${String(value)}`);
  }
  return value;
}

function childScopeBlocker(input) {
  const parent = normalizeEnvelope(input.parentEnvelope ?? {
    permissionEnvelope: input.permissionEnvelope, pathEnvelope: input.pathEnvelope
  }, 'parent envelope');
  if (!input.childEnvelope) return 'child_envelope_missing';
  const child = normalizeEnvelope(input.childEnvelope, 'child envelope');
  if (!envelopeIsSubset(child, parent)) return 'child_envelope_widened';
  if (!envelopeIsProperSubset(child, parent)) return 'child_envelope_not_narrower';
  return null;
}

function childProfileBlocker(resolution, input) {
  const effort = resolution.requestedEffort;
  const model = resolution.requestedModel;
  const parentEffort = normalizedString(input.parentEffort);
  const parentModel = normalizedString(input.parentModel);
  if (!Object.hasOwn(EFFORT_RANK, effort)) return `child_profile_unbound:effort:${effort}`;
  if (!parentEffort || !Object.hasOwn(EFFORT_RANK, parentEffort)) {
    return `child_profile_unbound:parent_effort:${parentEffort ?? 'missing'}`;
  }
  if (!parentModel) return 'child_profile_unbound:parent_model:missing';
  // Equal effort words are not equal budgets across models. Aliases of the
  // same OpenAI API model are comparable, but different models need allowance.
  const parent = modelIdentity(parentModel);
  const child = modelIdentity(model);
  if (parent.provider !== child.provider || parent.apiModel !== child.apiModel) {
    const allowance = objectRecord(input.childModelAllowance);
    const cap = normalizedString(allowance.maxEffort);
    if (allowance.model !== model || !cap || !Object.hasOwn(EFFORT_RANK, cap)
      || !normalizedString(allowance.reason) || !normalizedString(allowance.provenance)) {
      return `child_cross_model_allowance_required:${parentModel}_to_${model}`;
    }
    return EFFORT_RANK[effort] <= EFFORT_RANK[cap] ? null : `child_profile_widened:${effort}_over_${cap}`;
  }
  if (EFFORT_RANK[effort] > EFFORT_RANK[parentEffort]) {
    return `child_profile_widened:${effort}_over_${parentEffort}`;
  }
  return null;
}

function resolveHostModelPolicy(input, assignmentPacket) {
  const capability = objectRecord(assignmentPacket?.capability);
  const taskClass = capability.taskClass ?? classifyTask(input);
  const rawHost = objectRecord(input.observation ?? input.hostObservation);
  const hostEvidence = !assignmentPacket || rawHost.packetDigest === packetDigestOf(assignmentPacket)
    ? rawHost : undefined;
  let resolution;
  if (assignmentPacket) {
    resolution = resolveEconomicPolicy({ ...capability, taskClass, isChild: input.isChild === true, hostEvidence, evidence: { authenticated: false } }, taskClass);
    const outerModel = normalizedString(input.requestedModel);
    const outerEffort = normalizedString(input.requestedEffort);
    if (outerModel !== null && outerModel !== resolution.requestedModel) {
      throw new Error(`Outer requested model ${outerModel} conflicts with the validated packet policy ${resolution.requestedModel}.`);
    }
    if (outerEffort !== null && outerEffort !== resolution.requestedEffort) {
      throw new Error(`Outer requested effort ${outerEffort} conflicts with the validated packet policy ${resolution.requestedEffort}.`);
    }
  } else {
    resolution = resolveModelEffort({
      taskClass,
      workRole: input.workRole,
      complexity: input.complexity,
      override: input.override,
      requestedModel: input.requestedModel,
      requestedEffort: input.requestedEffort,
      primaryExecution: input.primaryExecution,
      executionMode: input.executionMode,
      isChild: input.isChild === true,
      hostEvidence, evidence: { authenticated: false }
    });
  }
  return resolution;
}

function childDelegationPolicy(capability, primaryExecution) {
  const source = objectRecord(capability);
  const declared = source.childDelegation;
  if (declared === undefined) {
    return primaryExecution === PRIMARY_EXECUTION_REQUIRED
      ? { valid: false, blocker: 'child_delegation_missing' }
      : { valid: true, policy: null };
  }
  if (typeof declared !== 'string' || !CHILD_DELEGATION_KINDS.includes(declared)) {
    return { valid: false, blocker: `child_delegation_unknown:${String(declared)}` };
  }
  return { valid: true, policy: declared };
}

function executionModePolicy(capability) {
  const source = objectRecord(capability);
  const declared = source.executionMode;
  if (declared === undefined) {
    return { valid: true, mode: null };
  }
  if (typeof declared !== 'string' || !EXECUTION_MODE_KINDS.includes(declared)) {
    return { valid: false, blocker: `execution_mode_unknown:${String(declared)}` };
  }
  return { valid: true, mode: declared };
}

function manualCapabilityEvidence({ operation, observation, visibleCapability, nativeCapability, nativeResult }) {
  const visibleSource = objectRecord(visibleCapability);
  const nativeSource = objectRecord(nativeCapability);
  return {
    kind: 'manual_pending',
    authenticated: observation.authenticated,
    evidenceRef: observation.evidenceRef ?? null,
    visible: visibleSource.visible === true,
    operation,
    visibleOperationSupport: operationSupport(visibleSource, operation),
    requestedModelEffortControls: visibleSource.requestedModelEffortControls === true,
    permissionBinding: visibleSource.permissionBinding === true,
    pathBinding: visibleSource.pathBinding === true,
    nativeCollaboration: nativeSource.nativeCollaboration === true || nativeSource.supported === true,
    nativeOperationSupport: nativeResult.support
  };
}

// ---------------------------------------------------------------------------
// Scope-first permission governance: Trio scope -> Host sandbox -> approval.
// Scope authorizes first; neither Host sandbox privilege nor approval may
// expand the assignment scope. Materialized outputs stay generated targets.
// ---------------------------------------------------------------------------

export const SANDBOX_MODE_KINDS = Object.freeze(['bounded', 'full_access']);
export const APPROVAL_KINDS = Object.freeze(['user', 'auto_review']);
export const PERMISSION_STAGES = Object.freeze(['scope', 'sandbox', 'approval']);
export const DEFAULT_GENERATED_TARGETS = Object.freeze(['.agents', 'AGENTS.md', '.codex/AGENTS.md']);

function normalizeSandboxMode(value, label) {
  if (typeof value !== 'string' || !SANDBOX_MODE_KINDS.includes(value)) {
    throw new Error(`${label} must be bounded or full_access.`);
  }
  return value;
}

function normalizeApproval(input) {
  if (input === undefined || input === null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('approval requires a structured signal.');
  }
  const kind = normalizedString(input.kind);
  if (!kind || !APPROVAL_KINDS.includes(kind)) {
    throw new Error('approval kind must be user or auto_review.');
  }
  if (typeof input.granted !== 'boolean') {
    throw new Error('approval granted must be a boolean.');
  }
  return { kind, granted: input.granted };
}

function scopeDecision(assignmentPacket, targetPaths, generatedTargets) {
  const allowedFiles = normalizePathSet(
    objectRecord(objectRecord(assignmentPacket).allowedOperations).files,
    'assignment scope files'
  );
  for (const target of targetPaths) {
    if (generatedTargets.some((root) => pathIsWithin(target, root))) {
      return { decision: 'blocked', reason: `generated_target:${target}` };
    }
  }
  for (const target of targetPaths) {
    if (!allowedFiles.some((root) => pathIsWithin(target, root))) {
      return { decision: 'blocked', reason: `outside_assignment_scope:${target}` };
    }
  }
  return { decision: 'allowed', reason: null };
}

function permissionActual(hostObservation, packetDigest) {
  const authenticated = hostObservation.authenticated === true
    && normalizedString(hostObservation.evidenceRef) !== null;
  if (!authenticated || (packetDigest !== null && hostObservation.packetDigest !== packetDigest)) {
    return { authenticated: false, evidenceRef: null, sandbox: 'unknown', writableRoots: 'unknown' };
  }
  const sandbox = normalizedString(hostObservation.actualSandbox);
  return {
    authenticated: true,
    evidenceRef: normalizedString(hostObservation.evidenceRef),
    sandbox: sandbox !== null && SANDBOX_MODE_KINDS.includes(sandbox) ? sandbox : 'unknown',
    writableRoots: Array.isArray(hostObservation.actualWritableRoots)
      ? normalizePathSet(hostObservation.actualWritableRoots, 'actual writable roots')
      : 'unknown'
  };
}

function sandboxDecision(hostObservation, packetDigest, targetPaths) {
  const actual = permissionActual(hostObservation, packetDigest);
  if (actual.sandbox === 'unknown' || actual.writableRoots === 'unknown') {
    return { decision: 'blocked', reason: 'sandbox_actual_unknown', actual };
  }
  if (actual.sandbox === 'bounded') {
    const covered = targetPaths.every((target) =>
      actual.writableRoots.some((root) => pathIsWithin(target, root)));
    if (!covered) {
      return { decision: 'blocked', reason: 'sandbox_writable_roots_unbound', actual };
    }
  }
  return { decision: 'allowed', reason: null, actual };
}

function permissionVerdict({ stage, reason, scope, sandbox, approval, requested, actual }) {
  return {
    verdict: reason === null ? 'allowed' : 'blocked',
    stage,
    reason,
    approvalEligible: scope.decision === 'allowed' && sandbox.decision === 'allowed',
    stages: {
      scope: { decision: scope.decision, reason: scope.reason },
      sandbox: { decision: sandbox.decision, reason: sandbox.reason },
      approval: { decision: approval.decision, reason: approval.reason }
    },
    requested: {
      sandboxMode: requested.sandboxMode,
      writableRoots: [...requested.writableRoots],
      approval: requested.approval === null
        ? null
        : { kind: requested.approval.kind, granted: requested.approval.granted }
    },
    actual: {
      authenticated: actual.authenticated,
      evidenceRef: actual.evidenceRef,
      sandbox: actual.sandbox,
      writableRoots: Array.isArray(actual.writableRoots) ? [...actual.writableRoots] : actual.writableRoots
    }
  };
}

export function adjudicatePermission(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Permission adjudication input must be an object.');
  }
  const assignmentPacket = buildAssignmentPacket(input.assignmentPacket);
  const targetPaths = normalizePathSet(input.targetPaths, 'target paths');
  if (targetPaths.length === 0) {
    throw new Error('Permission adjudication requires at least one target path.');
  }
  const callerGeneratedTargets = input.generatedTargets ?? [];
  if (!Array.isArray(callerGeneratedTargets)) {
    throw new Error('generated targets must be an array.');
  }
  const generatedTargets = normalizePathSet(
    [...DEFAULT_GENERATED_TARGETS, ...callerGeneratedTargets],
    'generated targets'
  );
  const intent = objectRecord(input.permissionIntent);
  const requested = {
    sandboxMode: normalizeSandboxMode(intent.sandboxMode, 'permissionIntent.sandboxMode'),
    writableRoots: normalizePathSet(intent.writableRoots, 'permissionIntent.writableRoots'),
    approval: normalizeApproval(input.approval)
  };
  const hostObservation = objectRecord(input.hostObservation);
  const packetDigest = packetDigestOf(assignmentPacket);

  const scope = scopeDecision(assignmentPacket, targetPaths, generatedTargets);
  if (scope.decision === 'blocked') {
    return permissionVerdict({
      stage: 'scope',
      reason: scope.reason,
      scope,
      sandbox: { decision: 'skipped', reason: null },
      approval: { decision: 'skipped', reason: null },
      requested,
      actual: permissionActual(hostObservation, packetDigest)
    });
  }
  const sandbox = sandboxDecision(hostObservation, packetDigest, targetPaths);
  if (sandbox.decision === 'blocked') {
    return permissionVerdict({
      stage: 'sandbox',
      reason: sandbox.reason,
      scope,
      sandbox,
      approval: { decision: 'skipped', reason: null },
      requested,
      actual: sandbox.actual
    });
  }
  const approval = requested.approval === null || requested.approval.granted
    ? { decision: 'allowed', reason: null }
    : { decision: 'blocked', reason: 'approval_denied' };
  return permissionVerdict({
    stage: 'approval',
    reason: approval.reason,
    scope,
    sandbox,
    approval,
    requested,
    actual: sandbox.actual
  });
}

export function resolveHostOperation(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Host operation input must be an object.');
  }
  input = normalizeModelEffortInput(input);
  const operation = assertHostOperation(input.operation);
  const packetInput = input.assignmentPacket ?? input.packet;
  const assignmentPacket = packetInput === undefined ? null : buildAssignmentPacket(packetInput);
  const packetDigest = packetDigestOf(assignmentPacket);
  const modelResolution = resolveHostModelPolicy(input, assignmentPacket);
  const observation = normalizeObservationRecord(input.observation ?? input.hostObservation);
  const primaryExecution = primaryExecutionKind(assignmentPacket);
  validateObservedStatus(observation.status);
  const parentEnvelope = normalizeEnvelope(
    input.parentEnvelope ?? {
      permissionEnvelope: input.permissionEnvelope,
      pathEnvelope: input.pathEnvelope
    },
    'parent envelope'
  );
  const childEnvelope = input.childEnvelope === undefined
    ? null
    : normalizeEnvelope(input.childEnvelope, 'child envelope');
  if (primaryExecution === PRIMARY_EXECUTION_REQUIRED) {
    const blocker = LEGACY_VISIBLE_WORKER_REQUIRED_BLOCKER;
    const routeEvidence = buildRouteEvidence({
      routeKind: 'manual_pending',
      requestedModel: modelResolution.requestedModel,
      requestedEffort: modelResolution.requestedEffort,
      actual: unknownActual(),
      workerId: null,
      capability: manualCapabilityEvidence({
        operation,
        observation,
        visibleCapability: observation.visibleWorker,
        nativeCapability: observation.nativeSubagent,
        nativeResult: { support: 'unknown' }
      }),
      permissionEnvelope: parentEnvelope,
      pathEnvelope: parentEnvelope,
      fallbackReason: blocker,
      status: 'manual_pending'
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'manual_pending',
        childEnvelope: null,
        assignmentPacket,
        packetDigest,
        blocker,
        resumeCondition: 'Rebind capability.primaryExecution to default under the current Trio authority before requesting Host execution; no silent fallback is allowed.'
      })
    };
  }
  const childBlocker = input.isChild === true
    ? childProfileBlocker(modelResolution, input) ?? childScopeBlocker(input)
    : null;
  if (childBlocker) {
    const routeEvidence = buildRouteEvidence({
      routeKind: 'manual_pending',
      requestedModel: modelResolution.requestedModel,
      requestedEffort: modelResolution.requestedEffort,
      actual: unknownActual(),
      workerId: null,
      capability: manualCapabilityEvidence({
        operation,
        observation,
        visibleCapability: observation.visibleWorker,
        nativeCapability: observation.nativeSubagent,
        nativeResult: { support: 'unknown' }
      }),
      permissionEnvelope: normalizeEnvelope(
        input.parentEnvelope ?? {
          permissionEnvelope: input.permissionEnvelope,
          pathEnvelope: input.pathEnvelope
        },
        'parent envelope'
      ),
      pathEnvelope: normalizeEnvelope(
        input.parentEnvelope ?? {
          permissionEnvelope: input.permissionEnvelope,
          pathEnvelope: input.pathEnvelope
        },
        'parent envelope'
      ),
      fallbackReason: childBlocker,
      status: 'manual_pending'
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'manual_pending',
        childEnvelope: null,
        assignmentPacket,
        packetDigest,
        blocker: childBlocker,
        resumeCondition: 'Bind the parent model and effort; keep same-model child effort within that budget, or supply an explicit childModelAllowance with model, maxEffort, reason and provenance for a cross-model child.'
      })
    };
  }
  const lanes = normalizeLanes(input, observation);
  if (operation === 'spawn') {
    const worktreeBlock = worktreePendingBlocker(observation);
    if (worktreeBlock) {
      const routeEvidence = buildRouteEvidence({
        routeKind: 'manual_pending',
        requestedModel: modelResolution.requestedModel,
        requestedEffort: modelResolution.requestedEffort,
        actual: unknownActual(),
        workerId: null,
        capability: manualCapabilityEvidence({
          operation,
          observation,
          visibleCapability: observation.visibleWorker,
          nativeCapability: observation.nativeSubagent,
          nativeResult: { support: 'unknown' }
        }),
        permissionEnvelope: parentEnvelope,
        pathEnvelope: parentEnvelope,
        fallbackReason: worktreeBlock.blocker,
        status: 'manual_pending'
      });
      return {
        operation,
        routeEvidence,
        descriptor: buildOperationDescriptor({
          operation,
          routeKind: 'manual_pending',
          childEnvelope: null,
          assignmentPacket,
          packetDigest,
          blocker: worktreeBlock.blocker,
          resumeCondition: worktreeBlock.resumeCondition
        })
      };
    }
    const attemptsBlock = createAttemptsBlocker(observation);
    if (attemptsBlock) {
      const routeEvidence = buildRouteEvidence({
        routeKind: 'manual_pending',
        requestedModel: modelResolution.requestedModel,
        requestedEffort: modelResolution.requestedEffort,
        actual: unknownActual(),
        workerId: null,
        capability: manualCapabilityEvidence({
          operation,
          observation,
          visibleCapability: observation.visibleWorker,
          nativeCapability: observation.nativeSubagent,
          nativeResult: { support: 'unknown' }
        }),
        permissionEnvelope: parentEnvelope,
        pathEnvelope: parentEnvelope,
        fallbackReason: attemptsBlock.blocker,
        status: 'manual_pending'
      });
      return {
        operation,
        routeEvidence,
        descriptor: buildOperationDescriptor({
          operation,
          routeKind: 'manual_pending',
          childEnvelope: null,
          assignmentPacket,
          packetDigest,
          blocker: attemptsBlock.blocker,
          resumeCondition: attemptsBlock.resumeCondition
        })
      };
    }
    const semanticBlock = semanticSpawnBlocker({
      lanes,
      assignmentPacket,
      candidatePaths: parentEnvelope.mutablePaths
    });
    if (semanticBlock) {
      const routeEvidence = buildRouteEvidence({
        routeKind: 'manual_pending',
        requestedModel: modelResolution.requestedModel,
        requestedEffort: modelResolution.requestedEffort,
        actual: unknownActual(),
        workerId: semanticBlock.workerId,
        capability: manualCapabilityEvidence({
          operation,
          observation,
          visibleCapability: observation.visibleWorker,
          nativeCapability: observation.nativeSubagent,
          nativeResult: { support: 'unknown' }
        }),
        permissionEnvelope: parentEnvelope,
        pathEnvelope: parentEnvelope,
        fallbackReason: semanticBlock.blocker,
        status: 'manual_pending'
      });
      return {
        operation,
        routeEvidence,
        descriptor: buildOperationDescriptor({
          operation,
          routeKind: 'manual_pending',
          childEnvelope: null,
          assignmentPacket,
          packetDigest,
          blocker: semanticBlock.blocker,
          resumeCondition: semanticBlock.resumeCondition,
          reservedLane: {
            workerId: semanticBlock.workerId,
            status: semanticBlock.status
          }
        })
      };
    }
  }
  const visibleCapability = observation.visibleWorker;
  const nativeCapability = observation.nativeSubagent;
  const nativeResult = nativeSafety({
    operation,
    capability: nativeCapability,
    observation,
    parentEnvelope,
    childEnvelope,
    requestedEffort: normalizedString(input.requestedEffort) ?? modelResolution.requestedEffort,
    lanes
  });
  if (nativeResult.safe && modelIdentity(modelResolution.requestedModel).provider === 'openai'
    && nativeCapability.requestedModelEffortControls !== true) {
    nativeResult.safe = false;
    nativeResult.reason = 'native_model_controls_unbound';
  }

  const capabilitySource = objectRecord(assignmentPacket?.capability);
  const childPolicy = childDelegationPolicy(capabilitySource, primaryExecution);
  const modePolicy = executionModePolicy(capabilitySource);
  const policyBlocker = !childPolicy.valid
    ? childPolicy.blocker
    : (!modePolicy.valid ? modePolicy.blocker : null);
  if (policyBlocker) {
    const routeEvidence = buildRouteEvidence({
      routeKind: 'manual_pending',
      requestedModel: modelResolution.requestedModel,
      requestedEffort: modelResolution.requestedEffort,
      actual: unknownActual(),
      workerId: null,
      capability: manualCapabilityEvidence({
        operation,
        observation,
        visibleCapability,
        nativeCapability,
        nativeResult
      }),
      permissionEnvelope: parentEnvelope,
      pathEnvelope: parentEnvelope,
      fallbackReason: policyBlocker,
      status: 'manual_pending'
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'manual_pending',
        childEnvelope: null,
        assignmentPacket,
        packetDigest,
        blocker: policyBlocker,
        resumeCondition: policyBlocker === 'child_delegation_missing'
          ? 'Declare an explicit childDelegation policy (prohibited | worker_discretion | encouraged) on the assignment packet before routing.'
          : policyBlocker.startsWith('child_delegation_unknown')
            ? 'Replace the unknown childDelegation value with an explicit prohibited, worker_discretion, or encouraged policy.'
            : 'Replace the unknown executionMode value with bounded_slice or worker_self_goal.'
      })
    };
  }
  if (childPolicy.policy === 'prohibited') {
    const blocker = 'child_delegation_prohibited';
    const routeEvidence = buildRouteEvidence({
      routeKind: 'manual_pending',
      requestedModel: modelResolution.requestedModel,
      requestedEffort: modelResolution.requestedEffort,
      actual: unknownActual(),
      workerId: null,
      capability: manualCapabilityEvidence({
        operation,
        observation,
        visibleCapability,
        nativeCapability,
        nativeResult
      }),
      permissionEnvelope: parentEnvelope,
      pathEnvelope: parentEnvelope,
      fallbackReason: blocker,
      status: 'manual_pending'
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'manual_pending',
        childEnvelope: null,
        assignmentPacket,
        packetDigest,
        blocker,
        resumeCondition: 'childDelegation: prohibited denies native child creation; admit a native child only under an explicit worker_discretion or encouraged policy.'
      })
    };
  }
  const nativeEvidence = nativeCapabilityEvidence(nativeCapability, operation, observation);
  if (nativeResult.safe) {
    const routeEvidence = buildRouteEvidence({
      routeKind: 'native_subagent',
      requestedModel: modelResolution.requestedModel,
      requestedEffort: modelResolution.requestedEffort,
      actual: unknownActual(),
      workerId: null,
      capability: nativeEvidence,
      permissionEnvelope: childEnvelope,
      pathEnvelope: childEnvelope,
      fallbackReason: null,
      status: 'planned'
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'native_subagent',
        childEnvelope,
        assignmentPacket,
        packetDigest
      })
    };
  }

  const fallbackReason = nativeResult.reason;
  const routeEvidence = buildRouteEvidence({
    routeKind: 'manual_pending',
    requestedModel: modelResolution.requestedModel,
    requestedEffort: modelResolution.requestedEffort,
    actual: unknownActual(),
    workerId: null,
    capability: manualCapabilityEvidence({
      operation,
      observation,
      visibleCapability,
      nativeCapability,
      nativeResult
    }),
    permissionEnvelope: parentEnvelope,
    pathEnvelope: parentEnvelope,
    fallbackReason,
    status: 'manual_pending'
  });
  return {
    operation,
    routeEvidence,
    descriptor: buildOperationDescriptor({
      operation,
      routeKind: 'manual_pending',
      childEnvelope: null,
      assignmentPacket,
      packetDigest,
      blocker: fallbackReason,
      resumeCondition: `Obtain authenticated Host support for ${operation} with a bound permission and path envelope.`
    })
  };
}
