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

const MODEL_EFFORT_DEFAULTS = Object.freeze({
  quick: Object.freeze({ model: 'gpt-5.6-luna', effort: 'max' }),
  tracked: Object.freeze({ model: 'gpt-5.6-luna', effort: 'max' })
});
const BINDING_FILES = Object.freeze([
  ['taskPlan', 'task_plan.md'],
  ['findings', 'findings.md'],
  ['progress', 'progress.md']
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;

function hasTrackedSignal(input) {
  return [
    input.multiplePhases,
    input.requiresResearch,
    input.research,
    input.comparison,
    input.requiresSubagents,
    input.subagents,
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

function hasAnySignal(input, keys) {
  return keys.some((key) => input[key] === true);
}

function hasRepeatedLunaFailure(input) {
  const count = input.lunaFailureCount
    ?? input.sameConditionLunaFailures
    ?? input.lunaFailures;
  return Number.isInteger(count) && count >= 2;
}

function policyOverride(input) {
  if (hasAnySignal(input, ['security', 'dataIntegrity', 'irreversibleMigration'])) {
    return { model: 'gpt-5.6-sol', effort: 'max' };
  }
  if (hasAnySignal(input, ['chiefArchitecture', 'chiefPlanning', 'majorGate', 'finalAcceptance'])) {
    return { model: 'gpt-5.6-sol', effort: 'ultra' };
  }
  if (hasAnySignal(input, ['multiFileIntegration', 'uncertainDebugging']) || hasRepeatedLunaFailure(input)) {
    return { model: 'gpt-5.6-terra', effort: 'max' };
  }
  return null;
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
  const defaults = MODEL_EFFORT_DEFAULTS[taskClass];
  const override = policyOverride(input);
  const requestedModel = override?.model ?? normalizedString(input.requestedModel) ?? defaults.model;
  const requestedEffort = override?.effort ?? normalizedString(input.requestedEffort) ?? defaults.effort;
  if (input.isChild === true && requestedEffort === 'ultra') {
    throw new Error('Child model requests may not use ultra effort.');
  }

  const authenticatedEvidence = input.evidence?.authenticated === true ? input.evidence : null;
  const actualModel = normalizedString(authenticatedEvidence?.actualModel) ?? 'unknown';
  const actualEffort = normalizedString(authenticatedEvidence?.actualEffort) ?? 'unknown';

  return {
    taskClass,
    requestedModel,
    requestedEffort,
    actualModel,
    actualEffort,
    actualObserved: actualModel !== 'unknown' || actualEffort !== 'unknown'
  };
}

export function buildAssignmentPacket(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Assignment packet input must be an object.');
  }
  const missing = ASSIGNMENT_PACKET_FIELDS.filter((field) => !Object.hasOwn(input, field));
  if (missing.length > 0) {
    throw new Error(`Assignment packet requires eight fields: ${missing.join(', ')}.`);
  }
  assertAuthorityBinding(input.authority);
  return Object.fromEntries(ASSIGNMENT_PACKET_FIELDS.map((field) => [field, input[field]]));
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
