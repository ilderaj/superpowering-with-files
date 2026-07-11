import { constants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { hashChiefOpsBlock, parseChiefOpsBlocks } from './coordination-blocks.mjs';
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
import { readLiveCodexModelInventory } from './model-inventory.mjs';
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

function sameAdmissionProfile(bindingPacket, profile = {}) {
  return ['capabilityClass', 'reasoningDemand', 'riskClass', 'costPreference']
    .every((field) => bindingPacket[field] === profile[field]);
}

const ADMISSION_TRIGGER_CODES = new Set([
  'architecture_or_protocol_judgment',
  'security_data_loss_or_rollback_judgment',
  'conflicting_interpretations_or_missing_context',
  'balanced_model_blocked_after_bounded_attempt',
  'high_risk_release_or_compliance_review'
]);

function isRfc3339Utc(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function validAdmissionShape(admission, bindingPacket, now) {
  const keys = ['admissionId', 'authorityTaskId', 'bindingId', 'triggerCode', 'triggerObservedAt', 'triggerRationale', 'status', 'actor', 'approvedAt', 'expiresAt', 'profile'];
  if (!admission || Object.keys(admission).length !== keys.length || keys.some((key) => !(key in admission))) return false;
  const rationale = typeof admission.triggerRationale === 'string' ? admission.triggerRationale : '';
  const normalized = rationale.normalize('NFKC').trim();
  const triggerMs = Date.parse(admission.triggerObservedAt);
  const approvedMs = Date.parse(admission.approvedAt);
  const expiresMs = Date.parse(admission.expiresAt);
  const nowMs = Date.parse(now);
  return ADMISSION_TRIGGER_CODES.has(admission.triggerCode)
    && rationale === normalized && [...rationale].length >= 40 && [...rationale].length <= 500
    && [admission.triggerObservedAt, admission.approvedAt, admission.expiresAt].every(isRfc3339Utc)
    && triggerMs <= approvedMs && approvedMs <= nowMs + 60000 && approvedMs - triggerMs <= 86400000
    && nowMs < expiresMs && expiresMs - approvedMs <= 86400000
    && admission.authorityTaskId === bindingPacket.authorityTaskId && admission.bindingId === bindingPacket.bindingId
    && admission.status === 'satisfied' && admission.actor === bindingPacket.chiefThreadId && sameAdmissionProfile(bindingPacket, admission.profile);
}

async function evidenceRefsAreTrusted({ root, findingsPath, refs }) {
  if (!Array.isArray(refs) || refs.length === 0) return false;
  const resolvedRoot = await realpath(root);
  const resolvedFindings = await realpath(findingsPath);
  for (const ref of refs) {
    if (typeof ref !== 'string' || ref.includes('#')) return false;
    const candidate = path.resolve(resolvedRoot, ref);
    if (!candidate.startsWith(resolvedRoot + path.sep) || candidate === resolvedFindings) return false;
    let handle;
    try {
      handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
      const metadata = await handle.stat();
      if (!metadata.isFile() || (await lstat(candidate)).isSymbolicLink()) return false;
      if (await realpath(candidate) !== candidate) return false;
    } catch {
      return false;
    } finally {
      await handle?.close();
    }
  }
  return true;
}

export async function readVerifiedUpgradeAdmission({
  root,
  bindingPacket,
  now = new Date().toISOString()
}) {
  const wrapper = bindingPacket.upgradeAdmission;
  if (!wrapper?.admissionId || !wrapper.admissionBlockHash) {
    throw new Error('dispatch_admission_invalid');
  }
  const findingsPath = path.join(root, 'planning/active', bindingPacket.authorityTaskId, 'findings.md');
  const markdown = await readFile(findingsPath, 'utf8');
  const admissionBlocks = parseChiefOpsBlocks(markdown)
    .filter((block) => block.type === 'ChiefOpsModelUpgradeAdmission');
  const matches = admissionBlocks.filter((block) => block.value.admissionId === wrapper.admissionId);
  if (admissionBlocks.length !== 1 || matches.length !== 1) {
    throw new Error('dispatch_admission_invalid');
  }

  const admission = matches[0].value;
  const nowMs = Date.parse(now);
  const approvedAtMs = Date.parse(admission.approvedAt);
  const expiresAtMs = Date.parse(admission.expiresAt);
  if (
    wrapper.admissionBlockHash !== hashChiefOpsBlock({
      type: 'ChiefOpsModelUpgradeAdmission',
      value: admission
    })
    || !validAdmissionShape(admission, bindingPacket, now)
  ) {
    throw new Error('dispatch_admission_invalid');
  }
  return admission;
}

export async function verifyTrustedDispatchContext({ root, bindingPacket, modelResolution, codexHome, now }) {
  if (!bindingPacket.dispatchIntentVersion) return null;
  if (!codexHome || !modelResolution) throw new Error('trusted_dispatch_context_required');
  const inventory = await readLiveCodexModelInventory({ codexHome, now });
  const decisionInventory = bindingPacket.dispatchDecision?.inventory;
  const evidenceMatches = decisionInventory?.sourceRef === inventory.sourceRef
    && decisionInventory?.observedAt === inventory.observedAt
    && decisionInventory?.fingerprint === inventory.fingerprint
    && modelResolution.inventorySourceRef === inventory.sourceRef
    && modelResolution.inventoryObservedAt === inventory.observedAt
    && modelResolution.inventoryFingerprint === inventory.fingerprint;
  const catalogEntry = inventory.models.find((entry) => entry.model === modelResolution.resolvedModelAtRun);
  const preferredMatches = decisionInventory
    && bindingPacket.dispatchDecision?.preferredModel === modelResolution.resolvedModelAtRun
    && bindingPacket.dispatchDecision?.preferredThinking === modelResolution.resolvedThinkingAtRun;
  if (!evidenceMatches || !preferredMatches || !catalogEntry?.supportedReasoningLevels.includes(modelResolution.resolvedThinkingAtRun)) {
    throw new Error('trusted_dispatch_context_mismatch');
  }
  if (bindingPacket.capabilityClass === 'frontier_reasoning') {
    await readVerifiedUpgradeAdmission({ root, bindingPacket, now });
  }
  return inventory;
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
  modelResolutionFile = null,
  codexHome = null,
  now = new Date().toISOString()
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
  let assessedPermissionObservation = null;
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
    if (handoffPacket.dispatchIntentVersion) {
      await verifyTrustedDispatchContext({
        root: expectedRoot,
        bindingPacket: handoffPacket,
        modelResolution,
        codexHome,
        now
      });
      if (modelResolution.applicationStatus !== 'manual_pending') {
        throw new Error('model_application_unverified');
      }
    }

    if (permissionEnforcementObservation || !handoffPacket.dispatchIntentVersion) {
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
      assessedPermissionObservation = {
        status: 'verified',
        effectiveClass: permission.effectiveClass,
        effectiveOps: permission.effectiveOps,
        evidenceRef: permission.evidenceRef
      };
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
    permissionEnforcementObservation: assessedPermissionObservation,
    modelResolution
  });
}

export async function resolveModelFromFile({
  capabilityClass,
  reasoningDemand,
  costPreference,
  latencyClass,
  upgradeTrigger = null,
  availableFile,
  dispatchIntent = false,
  codexHome = null,
  mappingFile = null
}) {
  if (dispatchIntent) {
    if (availableFile || !codexHome || !mappingFile) {
      throw new Error('explicit dispatch requires --codex-home and --mapping, and forbids --available');
    }
    const availableModels = validateAvailableModels(await readJsonFile(mappingFile));
    const mapping = Object.fromEntries(availableModels.map((entry) => [entry.capabilityClass, entry.model]));
    const liveInventory = await readLiveCodexModelInventory({ codexHome });
    return resolveModel({
      capabilityClass,
      reasoningDemand,
      costPreference,
      latencyClass,
      upgradeTrigger,
      availableModels,
      mapping,
      dispatchDecision: { source: 'public_explicit_dispatch' },
      liveInventory
    });
  }
  if (!availableFile) throw new Error('available models are required for generic resolution');
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
