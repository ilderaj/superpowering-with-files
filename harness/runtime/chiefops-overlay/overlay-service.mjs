import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseChiefOpsBlocks } from './coordination-blocks.mjs';
import {
  CAPABILITY_CLASSES,
  COST_PREFERENCES,
  LATENCY_CLASSES,
  REASONING_DEMANDS,
  validateBindingPacket,
  validateOperatingModelBindingPacket
} from './schema.mjs';
import { rebuildChiefOpsIndex } from './index-service.mjs';
import { assessPermissionEnforcement, buildManualHandoffPrompt } from './manual-handoff.mjs';
import { resolveModel } from './model-resolver.mjs';
import { resolveAuthorityBinding } from './authority-binding.mjs';
import { hashContent } from './source-progress-ref.mjs';

const OPERATING_MODEL_MARKER_FIELDS = [
  'majorPhase',
  'primaryProof',
  'reasoningDemand',
  'costPreference',
  'latencyClass',
  'permissionClass',
  'delegationPolicy',
  'stopCondition',
  'expectedReceipt',
  'returnToChiefInstruction'
];

export async function readJsonFile(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function canonicalPath(target) {
  return realpath(target).catch(() => path.resolve(target));
}

function sameStringSet(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = new Set(left);
  return right.every((value) => normalizedLeft.has(value));
}

function sameSourceProgressRef(left = {}, right = {}) {
  return ['file', 'blockId', 'contentHash', 'observedAt'].every((field) => left[field] === right[field]);
}

function sameAuthoritativeBinding(left, right) {
  const sharedFieldsMatch = [
    'bindingId',
    'authorityTaskId',
    'planningRoot',
    'workerId',
    'currentSlice',
    'proofTarget',
    'evidenceSink',
    'capabilityClass',
    'riskClass',
    'majorPhase',
    'reasoningDemand',
    'costPreference',
    'latencyClass',
    'permissionClass',
    'delegationPolicy',
    'workType',
    'authorityMode'
  ].every((field) => left[field] === right[field])
    && sameStringSet(left.allowedOps, right.allowedOps)
    && sameSourceProgressRef(left.sourceProgressRef, right.sourceProgressRef);

  const publicVersionMatches = Boolean(right.bindingVersion) && right.bindingVersion === left.bindingVersion;
  const privateTokenMatches = Boolean(right.bindingToken) && right.bindingToken === left.bindingToken;
  const tokenContradictsTruth = Boolean(right.bindingToken) && right.bindingToken !== left.bindingToken;

  return sharedFieldsMatch && !tokenContradictsTruth && (publicVersionMatches || privateTokenMatches);
}

async function readAuthoritativeBinding({ root, bindingPacket }) {
  const progressPath = path.join(root, 'planning/active', bindingPacket.authorityTaskId, 'progress.md');
  const markdown = await readFile(progressPath, 'utf8');
  const bindingBlocks = parseChiefOpsBlocks(markdown)
    .filter((block) => block.type === 'ChiefOpsWorkerBinding')
    .map((block) => validateBindingPacket(block.value));

  const authoritative = bindingBlocks.find((binding) => binding.bindingId === bindingPacket.bindingId);
  if (!authoritative) {
    throw new Error('binding packet is not present in authoritative progress truth');
  }

  if (!sameAuthoritativeBinding(authoritative, bindingPacket)) {
    throw new Error('binding packet does not match authoritative progress truth');
  }

  return { bindingPacket: authoritative, progress: markdown };
}

async function readTrioObservation({ root, taskId, progress }) {
  const taskDir = path.join(root, 'planning/active', taskId);
  const [taskPlan, findings] = await Promise.all([
    readFile(path.join(taskDir, 'task_plan.md'), 'utf8'),
    readFile(path.join(taskDir, 'findings.md'), 'utf8')
  ]);

  return {
    observedAt: new Date().toISOString(),
    taskPlanHash: hashContent(taskPlan),
    findingsHash: hashContent(findings),
    progressHash: hashContent(progress)
  };
}

function validateAvailableModels(value) {
  if (!Array.isArray(value)) {
    throw new Error('available models must be a JSON array');
  }

  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`available model entry ${index} must be an object`);
    }
    if (typeof entry.model !== 'string' || entry.model.trim() === '') {
      throw new Error(`available model entry ${index} missing model`);
    }
    if (typeof entry.capabilityClass !== 'string' || entry.capabilityClass.trim() === '') {
      throw new Error(`available model entry ${index} missing capabilityClass`);
    }
    if (!CAPABILITY_CLASSES.includes(entry.capabilityClass)) {
      throw new Error(`available model entry ${index} has invalid capabilityClass`);
    }
    const allowedKeys = new Set([
      'model',
      'capabilityClass',
      'reasoningByDemand',
      'costPreferences',
      'latencyClasses'
    ]);
    const unknown = Object.keys(entry).find((key) => !allowedKeys.has(key));
    if (unknown) {
      throw new Error(`available model entry ${index} has unknown field ${unknown}`);
    }
    if (!entry.reasoningByDemand || typeof entry.reasoningByDemand !== 'object' || Array.isArray(entry.reasoningByDemand)) {
      throw new Error(`available model entry ${index} missing reasoningByDemand`);
    }
    const reasoningKeys = Object.keys(entry.reasoningByDemand);
    if (reasoningKeys.length === 0 || reasoningKeys.some((key) => !REASONING_DEMANDS.includes(key))) {
      throw new Error(`available model entry ${index} has invalid reasoningByDemand`);
    }
    if (reasoningKeys.some((key) => typeof entry.reasoningByDemand[key] !== 'string' || entry.reasoningByDemand[key].trim() === '')) {
      throw new Error(`available model entry ${index} has invalid reasoningByDemand values`);
    }
    for (const field of ['costPreferences', 'latencyClasses']) {
      if (!Array.isArray(entry[field]) || entry[field].length === 0) {
        throw new Error(`available model entry ${index} missing ${field}`);
      }
    }
    if (entry.costPreferences.some((value) => !COST_PREFERENCES.includes(value))) {
      throw new Error(`available model entry ${index} has invalid costPreferences`);
    }
    if (entry.latencyClasses.some((value) => !LATENCY_CLASSES.includes(value))) {
      throw new Error(`available model entry ${index} has invalid latencyClasses`);
    }
  }

  return value;
}

function validateModelResolution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('model_resolution_invalid');
  }
  const requiredStrings = [
    'requestedCapabilityClass',
    'requestedReasoningDemand',
    'requestedCostPreference',
    'requestedLatencyClass',
    'resolvedModelAtRun',
    'resolvedThinkingAtRun',
    'modelResolutionReason'
  ];
  if (requiredStrings.some((field) => typeof value[field] !== 'string' || value[field].trim() === '')) {
    throw new Error('model_resolution_invalid');
  }
  if (value.upgradeTrigger !== null && typeof value.upgradeTrigger !== 'string') {
    throw new Error('model_resolution_invalid');
  }
  if (value.nativeThreadControl !== false) {
    throw new Error('model_resolution_invalid');
  }
  return value;
}

export async function buildOverlayIndex({ root, taskId }) {
  await resolveAuthorityBinding({
    root,
    authorityTaskId: taskId,
    planningRoot: root,
    activeTaskIds: [taskId]
  });

  return rebuildChiefOpsIndex({ root, taskIds: [taskId] });
}

export function buildOverlayIndexText(index) {
  const workerCount = Array.isArray(index?.workers) ? index.workers.length : 0;
  const conflictCount = Array.isArray(index?.conflicts) ? index.conflicts.length : 0;

  return [
    `ChiefOps overlay index ${index?.schemaVersion || 'unknown'}`,
    `workers=${workerCount} conflicts=${conflictCount}`,
    `generated_from=${index?.generatedFrom || 'unknown'}`
  ].join('\n');
}

export async function validateBindingFile({ file }) {
  return validateBindingPacket(await readJsonFile(file));
}

export async function buildHandoffFromFile({
  root,
  file,
  permissionEnforcementObservation = null,
  modelResolutionFile = null
}) {
  const bindingPacket = await validateBindingFile({ file });
  const [expectedRoot, packetRoot] = await Promise.all([
    canonicalPath(root),
    canonicalPath(bindingPacket.planningRoot)
  ]);

  if (expectedRoot !== packetRoot) {
    throw new Error('planningRoot points outside the expected authority root');
  }

  await resolveAuthorityBinding({
    root,
    authorityTaskId: bindingPacket.authorityTaskId,
    planningRoot: root,
    activeTaskIds: [bindingPacket.authorityTaskId],
    bindingPacket
  });

  const authoritative = await readAuthoritativeBinding({ root, bindingPacket });
  const isOperatingModelBinding = OPERATING_MODEL_MARKER_FIELDS
    .some((field) => authoritative.bindingPacket[field] !== undefined);
  const handoffPacket = isOperatingModelBinding
    ? validateOperatingModelBindingPacket(authoritative.bindingPacket)
    : authoritative.bindingPacket;

  let modelResolution = null;
  if (isOperatingModelBinding) {
    if (!modelResolutionFile) {
      throw new Error('model_resolution_required');
    }
    modelResolution = validateModelResolution(await readJsonFile(modelResolutionFile));
    const profileMatches = modelResolution.requestedCapabilityClass === handoffPacket.capabilityClass
      && modelResolution.requestedReasoningDemand === handoffPacket.reasoningDemand
      && modelResolution.requestedCostPreference === handoffPacket.costPreference
      && modelResolution.requestedLatencyClass === handoffPacket.latencyClass
      && modelResolution.upgradeTrigger === (handoffPacket.upgradeTrigger ?? null);
    if (!profileMatches) {
      throw new Error('model_resolution_profile_mismatch');
    }

    const permission = assessPermissionEnforcement({
      requestedClass: handoffPacket.permissionClass,
      allowedOps: handoffPacket.allowedOps,
      observation: permissionEnforcementObservation
    });
    if (!permission.allowed) {
      const error = new Error(permission.reason);
      error.code = permission.receiptType;
      throw error;
    }
  }

  if (modelResolutionFile && !modelResolution) {
    modelResolution = await readJsonFile(modelResolutionFile);
  }

  const bindingObservation = await readTrioObservation({
    root: expectedRoot,
    taskId: bindingPacket.authorityTaskId,
    progress: authoritative.progress
  });
  return buildManualHandoffPrompt({
    bindingPacket: { ...handoffPacket, planningRoot: expectedRoot },
    bindingObservation,
    permissionEnforcementObservation,
    modelResolution
  });
}

export async function resolveModelFromFile({
  capabilityClass,
  reasoningDemand,
  costPreference,
  latencyClass,
  upgradeTrigger = null,
  availableFile
}) {
  return resolveModel({
    capabilityClass,
    reasoningDemand,
    costPreference,
    latencyClass,
    upgradeTrigger,
    availableModels: validateAvailableModels(await readJsonFile(availableFile)),
    mapping: {}
  });
}
