import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { hashChiefOpsBlock, parseChiefOpsBlocks } from './coordination-blocks.mjs';
import {
  CAPABILITY_CLASSES,
  COST_PREFERENCES,
  LATENCY_CLASSES,
  validateBindingInput,
  REASONING_DEMANDS,
  validateBindingPacket,
  validateOperatingModelBindingPacket
} from './schema.mjs';
import { rebuildChiefOpsIndex } from './index-service.mjs';
import { assessPermissionEnforcement, buildManualHandoffPrompt, buildV2DeltaHandoffPrompt } from './manual-handoff.mjs';
import { resolveModel } from './model-resolver.mjs';
import { readLiveCodexModelInventory } from './model-inventory.mjs';
import { resolveAuthorityBinding } from './authority-binding.mjs';
import { hashContent, makeChiefOpsBlockSourceProgressRef } from './source-progress-ref.mjs';
import { validateBoundSubagentReturn, validateNarrowSubagentDispatch } from './subagent-dispatch.mjs';
import { classifyPhaseEnvelopeTransition } from './phase-envelope.mjs';

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

  const routeAndDispatchRequestsMatch = JSON.stringify(left.routeDecision ?? null) === JSON.stringify(right.routeDecision ?? null)
    && JSON.stringify(left.dispatchRequest ?? null) === JSON.stringify(right.dispatchRequest ?? null);
  const subagentDispatchesMatch = JSON.stringify(left.subagentDispatches ?? []) === JSON.stringify(right.subagentDispatches ?? []);
  return sharedFieldsMatch
    && routeAndDispatchRequestsMatch
    && subagentDispatchesMatch
    && !tokenContradictsTruth
    && (publicVersionMatches || privateTokenMatches);
}

async function readAuthoritativeV0bBinding({ root, bindingPacket }) {
  const progressPath = path.join(root, 'planning/active', bindingPacket.authorityTaskId, 'progress.md');
  const markdown = await readFile(progressPath, 'utf8');
  const bindingBlocks = parseChiefOpsBlocks(markdown)
    .filter((block) => block.type === 'ChiefOpsWorkerBinding')
    .map((block) => validateBindingPacket(block.value));

  const candidates = bindingBlocks.filter((binding) => binding.bindingId === bindingPacket.bindingId);
  if (candidates.length === 0) {
    throw new Error('binding packet is not present in authoritative progress truth');
  }
  if (candidates.length > 1) {
    throw new Error('binding packet has duplicate bindingId in authoritative progress truth');
  }
  const [authoritative] = candidates;

  if (!sameAuthoritativeBinding(authoritative, bindingPacket)) {
    throw new Error('binding packet does not match authoritative progress truth');
  }

  return {
    effectiveV0bBinding: authoritative,
    origin: { kind: 'v0b' },
    progress: markdown
  };
}

function bindingMismatch() {
  throw new Error('binding_mismatch');
}

function uniqueBy(values, key) {
  return new Set(values.map(key)).size === values.length;
}

function canonicalProgressFile(taskId) {
  return path.posix.join('planning/active', taskId, 'progress.md');
}

async function buildTrustedEnvelopeFacts({ root, authorityTaskId, progress, prefix }) {
  await readTrioObservation({ root, taskId: authorityTaskId, progress });
  const releaseOrExternalEffect = prefix.allowedOps.some((op) => ['publish', 'send'].includes(op)
    || prefix.permissionClass === 'release');
  return {
    bindingVerified: true,
    trioConsistent: true,
    objectiveChanged: false,
    nonGoalChanged: false,
    architectureOutsideAllowedSurfaces: false,
    proofTargetChanged: false,
    newMutableSurface: false,
    crossTaskConflict: false,
    permissionEscalation: false,
    releaseOrExternalEffect,
    destructiveOrIrreversible: false,
    evidenceOrTrioConflict: false,
    bindingInvalid: false,
    userAuthorityChange: false,
    finalOutcomeAcceptance: false,
    lifecycleClosure: false,
    proofUnchanged: true,
    mutableSurfacesSubset: true
  };
}

async function resolveEffectiveV2Binding({ root, candidate }) {
  const [resolvedRoot, resolvedCandidateRoot] = await Promise.all([
    canonicalPath(root),
    canonicalPath(candidate.planningRoot)
  ]);
  if (resolvedRoot !== resolvedCandidateRoot) bindingMismatch();
  const progressPath = path.join(root, 'planning/active', candidate.authorityTaskId, 'progress.md');
  const markdown = await readFile(progressPath, 'utf8');
  let prefixes;
  let deltas;
  try {
    const blocks = parseChiefOpsBlocks(markdown);
    prefixes = blocks
      .filter((block) => block.type === 'ChiefOpsV2StablePrefix')
      .map((block) => ({ ...block, input: validateBindingInput(block.value) }));
    deltas = blocks
      .filter((block) => block.type === 'ChiefOpsV2ExecutionDelta')
      .map((block) => ({ ...block, input: validateBindingInput(block.value) }));
  } catch {
    bindingMismatch();
  }

  if (!uniqueBy(prefixes, (block) => block.input.prefixBindingId)
    || !uniqueBy(deltas, (block) => block.input.deltaBindingId)) {
    bindingMismatch();
  }

  const prefix = prefixes.find((block) => block.input.prefixBindingId === candidate.prefixBindingId);
  if (!prefix
    || hashChiefOpsBlock(prefix) !== candidate.prefixHash
    || prefix.input.authorityTaskId !== candidate.authorityTaskId
    || prefix.input.planningRoot !== candidate.planningRoot
    || prefix.input.bindingVersion !== candidate.bindingVersion) {
    bindingMismatch();
  }

  const chain = deltas
    .filter((block) => block.input.prefixBindingId === prefix.input.prefixBindingId)
    .sort((left, right) => left.input.sequence - right.input.sequence);
  if (chain.length === 0) bindingMismatch();

  let deadline = prefix.input.expectedCheckInBy;
  let previousHash = null;
  let previousPhase = prefix.input.majorPhase;
  let previousSlice = prefix.input.currentSlice;
  let trustedEnvelopeFacts = null;
  if (prefix.input.phaseEnvelope) {
    try {
      trustedEnvelopeFacts = await buildTrustedEnvelopeFacts({
        root,
        authorityTaskId: candidate.authorityTaskId,
        progress: markdown,
        prefix: prefix.input
      });
    } catch {
      bindingMismatch();
    }
  }
  for (let index = 0; index < chain.length; index += 1) {
    const delta = chain[index].input;
    const expectedSequence = index + 1;
    if (delta.sequence !== expectedSequence
      || delta.authorityTaskId !== prefix.input.authorityTaskId
      || delta.planningRoot !== prefix.input.planningRoot
      || delta.bindingVersion !== prefix.input.bindingVersion
      || delta.prefixHash !== candidate.prefixHash
      || delta.predecessorDeltaHash !== previousHash) {
      bindingMismatch();
    }
    if (prefix.input.phaseEnvelope) {
      const transition = classifyPhaseEnvelopeTransition({
        priorEffectiveBinding: { ...prefix.input, majorPhase: previousPhase, currentSlice: previousSlice },
        envelope: prefix.input.phaseEnvelope,
        candidateDelta: delta,
        trustedFacts: trustedEnvelopeFacts
      });
      if (transition === 'binding_mismatch') bindingMismatch();
      if (transition === 'chief_gate_required') throw new Error('chief_gate_required');
    } else if (delta.majorPhase !== previousPhase) {
      throw new Error('chief_gate_required');
    }
    if (delta.expectedCheckInBy !== undefined) {
      if (Date.parse(delta.expectedCheckInBy) > Date.parse(deadline)) bindingMismatch();
      deadline = delta.expectedCheckInBy;
    }
    previousHash = hashChiefOpsBlock(chain[index]);
    previousPhase = delta.majorPhase;
    previousSlice = delta.currentSlice;
  }

  const latest = chain.at(-1);
  const sourceCandidate = chain.find((block) => block.input.deltaBindingId === candidate.deltaBindingId);
  if (!sourceCandidate
    || sourceCandidate.input.sequence !== latest.input.sequence
    || hashChiefOpsBlock(sourceCandidate) !== hashChiefOpsBlock({
      type: 'ChiefOpsV2ExecutionDelta',
      value: candidate
    })) {
    bindingMismatch();
  }

  const { kind, prefixBindingId, phaseEnvelope, ...stableFields } = prefix.input;
  const sourceProgressRef = makeChiefOpsBlockSourceProgressRef({
    file: canonicalProgressFile(candidate.authorityTaskId),
    block: latest,
    observedAt: latest.input.observedAt
  });
  const effectiveV0bBinding = validateBindingPacket({
    ...stableFields,
    schemaVersion: 'chiefops.v0b',
    currentSlice: latest.input.currentSlice,
    majorPhase: latest.input.majorPhase,
    expectedCheckInBy: deadline,
    observedAt: latest.input.observedAt,
    sourceProgressRef
  });
  return {
    effectiveV0bBinding,
    origin: {
      kind: 'v2',
      prefixBindingId: prefix.input.prefixBindingId,
      deltaBindingId: latest.input.deltaBindingId,
      sourceProgressRef
    },
    progress: markdown
  };
}

export async function resolveAuthoritativeBindingInput({ root, bindingPacket }) {
  const input = validateBindingInput(bindingPacket);
  if (input.schemaVersion === 'chiefops.v0b') {
    return readAuthoritativeV0bBinding({ root, bindingPacket: input });
  }
  if (input.kind === 'stable_prefix') {
    throw new Error('v2_delta_required');
  }
  return resolveEffectiveV2Binding({ root, candidate: input });
}

export async function readAuthoritativeBinding({ root, bindingPacket }) {
  const resolved = await resolveAuthoritativeBindingInput({ root, bindingPacket });
  return {
    bindingPacket: resolved.effectiveV0bBinding,
    progress: resolved.progress,
    origin: resolved.origin
  };
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

const DETAILED_PLAN_CHECKLIST_KEYS = [
  'codeSteps',
  'interfacesAndScope',
  'validationCommands',
  'rollback',
  'stopConditions'
];

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

function isWithin(root, candidate) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function validDetailedPlanEligibilityShape(eligibility, bindingPacket, now) {
  const keys = [
    'eligibilityId',
    'authorityTaskId',
    'bindingId',
    'approvedPlanPath',
    'approvedPlanHash',
    'checkedAt',
    'expiresAt',
    'status',
    'actor',
    'checklist',
    'upgradeSignals'
  ];
  if (!eligibility || Object.keys(eligibility).length !== keys.length || keys.some((key) => !(key in eligibility))) return false;
  const nowMs = Date.parse(now);
  const checkedAtMs = Date.parse(eligibility.checkedAt);
  const expiresAtMs = Date.parse(eligibility.expiresAt);
  const checklist = eligibility.checklist;
  const checklistKeys = checklist && typeof checklist === 'object' && !Array.isArray(checklist)
    ? Object.keys(checklist).sort()
    : [];
  const expectedChecklistKeys = [...DETAILED_PLAN_CHECKLIST_KEYS].sort();
  const relativePlanPath = typeof eligibility.approvedPlanPath === 'string'
    && eligibility.approvedPlanPath.replace(/\\/g, '/');

  return bindingPacket.capabilityClass === 'economy_mechanical'
    && eligibility.authorityTaskId === bindingPacket.authorityTaskId
    && eligibility.bindingId === bindingPacket.bindingId
    && eligibility.actor === bindingPacket.chiefThreadId
    && eligibility.status === 'eligible'
    && typeof relativePlanPath === 'string'
    && relativePlanPath.startsWith('docs/superpowers/plans/')
    && !relativePlanPath.split('/').includes('..')
    && /^sha256:[a-f0-9]{64}$/.test(eligibility.approvedPlanHash)
    && [eligibility.checkedAt, eligibility.expiresAt].every(isRfc3339Utc)
    && checkedAtMs <= nowMs + 60000
    && nowMs < expiresAtMs
    && checkedAtMs <= expiresAtMs
    && expiresAtMs - checkedAtMs <= 86400000
    && JSON.stringify(checklistKeys) === JSON.stringify(expectedChecklistKeys)
    && checklistKeys.every((key) => checklist[key] === true)
    && Array.isArray(eligibility.upgradeSignals)
    && eligibility.upgradeSignals.length === 0;
}

async function readHeldApprovedPlan({ root, approvedPlanPath, fsOps = { lstat, open, realpath, stat, constants } }) {
  const resolvedRoot = await fsOps.realpath(root);
  const expectedPlanRoot = path.join(resolvedRoot, 'docs', 'superpowers', 'plans');
  const resolvedPlanRoot = await fsOps.realpath(expectedPlanRoot);
  const normalized = approvedPlanPath.replace(/\\/g, '/');
  const expectedPath = path.resolve(resolvedRoot, normalized);
  if (!isWithin(resolvedPlanRoot, expectedPath)) throw new Error('detailed_plan_eligibility_invalid');
  const link = await fsOps.lstat(expectedPath);
  if (link.isSymbolicLink()) throw new Error('detailed_plan_eligibility_invalid');
  const resolvedPlan = await fsOps.realpath(expectedPath);
  if (!isWithin(resolvedPlanRoot, resolvedPlan)) throw new Error('detailed_plan_eligibility_invalid');

  let handle;
  try {
    handle = await fsOps.open(resolvedPlan, fsOps.constants.O_RDONLY | fsOps.constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error('detailed_plan_eligibility_invalid');
    throw error;
  }
  try {
    const held = await handle.stat();
    if (!held.isFile()) throw new Error('detailed_plan_eligibility_invalid');
    const [currentPlanRoot, currentPlan, currentMetadata] = await Promise.all([
      fsOps.realpath(expectedPlanRoot),
      fsOps.realpath(expectedPath),
      fsOps.stat(resolvedPlan)
    ]);
    if (currentPlanRoot !== resolvedPlanRoot
      || currentPlan !== resolvedPlan
      || !isWithin(resolvedPlanRoot, currentPlan)
      || currentMetadata.dev !== held.dev
      || currentMetadata.ino !== held.ino) {
      throw new Error('detailed_plan_eligibility_invalid');
    }
    const raw = await handle.readFile({ encoding: 'utf8' });
    return 'sha256:' + createHash('sha256').update(raw).digest('hex');
  } finally {
    await handle.close();
  }
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

export async function readDetailedPlanEligibility({
  root,
  bindingPacket,
  now = new Date().toISOString(),
  fsOps
}) {
  const wrapper = bindingPacket.detailedPlanEligibility;
  if (!wrapper?.eligibilityId || !wrapper.eligibilityBlockHash) {
    throw new Error('detailed_plan_eligibility_invalid');
  }
  const findingsPath = path.join(root, 'planning/active', bindingPacket.authorityTaskId, 'findings.md');
  const markdown = await readFile(findingsPath, 'utf8');
  const blocks = parseChiefOpsBlocks(markdown)
    .filter((block) => block.type === 'ChiefOpsDetailedPlanEligibility');
  const matches = blocks.filter((block) => block.value.eligibilityId === wrapper.eligibilityId);
  if (blocks.length !== 1 || matches.length !== 1) {
    throw new Error('detailed_plan_eligibility_invalid');
  }
  const eligibility = matches[0].value;
  if (wrapper.eligibilityBlockHash !== hashChiefOpsBlock({
    type: 'ChiefOpsDetailedPlanEligibility',
    value: eligibility
  }) || !validDetailedPlanEligibilityShape(eligibility, bindingPacket, now)) {
    throw new Error('detailed_plan_eligibility_invalid');
  }
  const approvedPlanHash = await readHeldApprovedPlan({
    root,
    approvedPlanPath: eligibility.approvedPlanPath,
    fsOps
  });
  if (approvedPlanHash !== eligibility.approvedPlanHash) {
    throw new Error('detailed_plan_eligibility_invalid');
  }
  return eligibility;
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
  if (bindingPacket.capabilityClass === 'economy_mechanical') {
    const authoritative = await readAuthoritativeBinding({ root, bindingPacket });
    await readDetailedPlanEligibility({ root, bindingPacket: authoritative.bindingPacket, now });
  }
  return inventory;
}

export async function resolveAuthorityAwareModel({
  root,
  bindingPacket,
  modelRequest,
  codexHome,
  now = new Date().toISOString()
}) {
  const authoritative = await readAuthoritativeBinding({ root, bindingPacket });
  const authoritativeBinding = authoritative.bindingPacket;
  if (!authoritativeBinding.dispatchIntentVersion || authoritativeBinding.capabilityClass !== 'economy_mechanical') {
    throw new Error('detailed_plan_eligibility_required');
  }
  if (!codexHome) throw new Error('trusted_dispatch_context_required');
  const availableModels = validateAvailableModels(modelRequest?.availableModels);
  const mapping = modelRequest?.mapping;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new Error('model_mapping_required');
  }
  const liveInventory = await readLiveCodexModelInventory({ codexHome, now });
  try {
    await readDetailedPlanEligibility({ root, bindingPacket: authoritativeBinding, now });
  } catch (error) {
    if (error?.message !== 'detailed_plan_eligibility_invalid') throw error;
    const fallback = resolveModel({
      capabilityClass: 'balanced_execution',
      reasoningDemand: 'deep',
      costPreference: 'balanced',
      latencyClass: authoritativeBinding.latencyClass,
      upgradeTrigger: authoritativeBinding.upgradeTrigger ?? null,
      availableModels,
      mapping
    });
    if (fallback.resolvedThinkingAtRun !== 'high') throw new Error('resolver_failed: balanced fallback must resolve high thinking');
    return {
      ...fallback,
      modelResolutionReason: 'detailed_plan_eligibility_missing_fallback',
      applicationStatus: 'unverified'
    };
  }
  const preferredModel = mapping.economy_mechanical;
  const selected = availableModels.find((entry) => entry.capabilityClass === 'economy_mechanical'
    && entry.model === preferredModel
    && entry.reasoningByDemand?.[authoritativeBinding.reasoningDemand] === 'high'
    && entry.costPreferences?.includes(authoritativeBinding.costPreference)
    && entry.latencyClasses?.includes(authoritativeBinding.latencyClass));
  if (!selected || !liveInventory.models.some((entry) => entry.model === selected.model && entry.supportedReasoningLevels.includes('high'))) {
    throw new Error('resolver_failed: no model satisfies verified economy profile');
  }
  return {
    requestedCapabilityClass: 'economy_mechanical',
    requestedReasoningDemand: authoritativeBinding.reasoningDemand,
    requestedCostPreference: authoritativeBinding.costPreference,
    requestedLatencyClass: authoritativeBinding.latencyClass,
    upgradeTrigger: authoritativeBinding.upgradeTrigger ?? null,
    resolvedModelAtRun: selected.model,
    resolvedThinkingAtRun: 'high',
    modelResolutionReason: 'verified_detailed_plan_profile_match',
    nativeThreadControl: false,
    inventorySourceRef: liveInventory.sourceRef,
    inventoryObservedAt: liveInventory.observedAt,
    inventoryFingerprint: liveInventory.fingerprint,
    applicationStatus: 'manual_pending'
  };
}

function childDispatchFromContract(contract) {
  const {
    contractHash,
    applicationStatus,
    nativeThreadControl,
    ...childDispatch
  } = contract;
  return childDispatch;
}

export async function prepareSubagentHandoff({ root, parentBinding, childDispatch, codexHome, now = new Date().toISOString() }) {
  const authoritative = await readAuthoritativeBinding({ root, bindingPacket: parentBinding });
  const parent = authoritative.bindingPacket;
  if (!codexHome) throw new Error('trusted_dispatch_context_required');
  const inventory = await readLiveCodexModelInventory({ codexHome, now });
  const child = validateNarrowSubagentDispatch({ parentBinding: parent, childDispatch, inventory });
  if (child.capabilityClass === 'economy_mechanical') {
    await readDetailedPlanEligibility({ root, bindingPacket: parent, now });
  }
  if (child.capabilityClass === 'frontier_reasoning') {
    await readVerifiedUpgradeAdmission({ root, bindingPacket: parent, now });
  }
  return child;
}

export async function validateSubagentReturn({ root, parentBinding, childContract, childReturn, codexHome, now = new Date().toISOString() }) {
  const verifiedContract = await prepareSubagentHandoff({
    root,
    parentBinding,
    childDispatch: childDispatchFromContract(childContract),
    codexHome,
    now
  });
  return validateBoundSubagentReturn({ childContract: verifiedContract, childReturn });
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
  return validateBindingInput(await readJsonFile(file));
}

export async function buildHandoffFromFile({
  root,
  file,
  permissionEnforcementObservation = null,
  modelResolutionFile = null,
  codexHome = null,
  now = new Date().toISOString()
}) {
  const bindingInput = await validateBindingFile({ file });
  const [expectedRoot, packetRoot] = await Promise.all([
    canonicalPath(root),
    canonicalPath(bindingInput.planningRoot)
  ]);

  if (expectedRoot !== packetRoot) {
    throw new Error('planningRoot points outside the expected authority root');
  }

  const authoritative = await readAuthoritativeBinding({ root, bindingPacket: bindingInput });
  await resolveAuthorityBinding({
    root,
    authorityTaskId: authoritative.bindingPacket.authorityTaskId,
    planningRoot: root,
    activeTaskIds: [authoritative.bindingPacket.authorityTaskId],
    bindingPacket: authoritative.bindingPacket
  });
  const isOperatingModelBinding = OPERATING_MODEL_MARKER_FIELDS
    .some((field) => authoritative.bindingPacket[field] !== undefined);
  const handoffPacket = isOperatingModelBinding
    ? validateOperatingModelBindingPacket(authoritative.bindingPacket)
    : authoritative.bindingPacket;
  const hasAuthoritativeDispatchRequest = handoffPacket.dispatchRequest !== undefined;
  const dispatchUnavailable = handoffPacket.dispatchRequest?.availabilityStatus === 'capability_unavailable';
  if (dispatchUnavailable && modelResolutionFile) {
    throw new Error('model_resolution_forbidden');
  }

  let modelResolution = null;
  let assessedPermissionObservation = null;
  if (isOperatingModelBinding || hasAuthoritativeDispatchRequest) {
    if (dispatchUnavailable) {
      // Unavailable is the only dispatch branch that does not require a
      // trusted selection file.
    } else {
      if (!modelResolutionFile) {
        throw new Error('model_resolution_required');
      }
      modelResolution = validateModelResolution(await readJsonFile(modelResolutionFile));
      const profileMatches = isOperatingModelBinding
        ? modelResolution.requestedCapabilityClass === handoffPacket.capabilityClass
          && modelResolution.requestedReasoningDemand === handoffPacket.reasoningDemand
          && modelResolution.requestedCostPreference === handoffPacket.costPreference
          && modelResolution.requestedLatencyClass === handoffPacket.latencyClass
          && modelResolution.upgradeTrigger === (handoffPacket.upgradeTrigger ?? null)
        : modelResolution.requestedCapabilityClass === handoffPacket.capabilityClass
          && modelResolution.resolvedModelAtRun === handoffPacket.dispatchRequest.requestedModel
          && modelResolution.resolvedThinkingAtRun === handoffPacket.dispatchRequest.reasoningEffort;
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
    }

    if (hasAuthoritativeDispatchRequest
      || (isOperatingModelBinding && (permissionEnforcementObservation || !handoffPacket.dispatchIntentVersion))) {
      const permission = assessPermissionEnforcement({
        requestedClass: handoffPacket.permissionClass ?? (hasAuthoritativeDispatchRequest ? 'observe' : undefined),
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
    taskId: authoritative.bindingPacket.authorityTaskId,
    progress: authoritative.progress
  });
  if (bindingInput.schemaVersion === 'chiefops.v2') {
    return buildV2DeltaHandoffPrompt({
      delta: bindingInput,
      effectiveV0bBinding: { ...handoffPacket, planningRoot: expectedRoot },
      bindingObservation,
      modelResolution
    });
  }

  return buildManualHandoffPrompt({
    bindingPacket: { ...handoffPacket, planningRoot: expectedRoot },
    bindingObservation,
    permissionEnforcementObservation: assessedPermissionObservation,
    modelResolution
  });
}

export async function resolveModelFromFile({
  root = null,
  capabilityClass,
  reasoningDemand,
  costPreference,
  latencyClass,
  upgradeTrigger = null,
  availableFile,
  dispatchIntent = false,
  codexHome = null,
  mappingFile = null,
  bindingFile = null
}) {
  if (dispatchIntent) {
    if (availableFile || !codexHome || !mappingFile) {
      throw new Error('explicit dispatch requires --codex-home and --mapping, and forbids --available');
    }
    const availableModels = validateAvailableModels(await readJsonFile(mappingFile));
    const mapping = Object.fromEntries(availableModels.map((entry) => [entry.capabilityClass, entry.model]));
    if (capabilityClass === 'economy_mechanical') {
      if (!root || !bindingFile) throw new Error('explicit economy dispatch requires --binding and authority root');
      return resolveAuthorityAwareModel({
        root,
        bindingPacket: await validateBindingFile({ file: bindingFile }),
        modelRequest: { availableModels, mapping },
        codexHome,
        now: new Date().toISOString()
      });
    }
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
