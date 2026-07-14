import path from 'node:path';
import { measureText } from '../../installer/lib/context-budget.mjs';

const V2_DELTA_HANDOFF_BUDGET = {
  chars: 4000,
  lines: 48,
  approxTokens: 1000
};

const PERMISSION_RANK = new Map([
  ['observe', 0],
  ['workspace', 1],
  ['egress_gated', 2],
  ['release', 3]
]);

const LEGAL_OPS_BY_PERMISSION_CLASS = new Map([
  ['observe', new Set(['inspect', 'draft', 'propose'])],
  ['workspace', new Set(['inspect', 'draft', 'propose', 'write'])],
  ['egress_gated', new Set(['inspect', 'draft', 'propose', 'write', 'publish', 'send'])],
  ['release', new Set(['inspect', 'draft', 'propose', 'write', 'publish', 'send'])]
]);

function capabilityUnavailableDispatchOutcomeGuidance() {
  return [
    'dispatchOutcome.resolvedModel: null',
    'dispatchOutcome.resolvedReasoningEffort: null',
    'dispatchOutcome.resolvedSpeed: null',
    'dispatchOutcome.applicationStatus: capability_unavailable'
  ];
}

export function assessPermissionEnforcement({ requestedClass, allowedOps, observation }) {
  const verified = observation?.status === 'verified'
    && typeof observation.evidenceRef === 'string'
    && observation.evidenceRef.length > 0;
  const withinCeiling = verified
    && PERMISSION_RANK.has(observation.effectiveClass)
    && PERMISSION_RANK.get(observation.effectiveClass) <= PERMISSION_RANK.get(requestedClass);
  const operationsCovered = withinCeiling
    && Array.isArray(observation.effectiveOps)
    && allowedOps.every((op) => observation.effectiveOps.includes(op));
  const effectiveOpsAreLegal = operationsCovered
    && observation.effectiveOps.every((op) => LEGAL_OPS_BY_PERMISSION_CLASS
      .get(observation.effectiveClass)?.has(op));

  return effectiveOpsAreLegal
    ? {
        allowed: true,
        effectiveClass: observation.effectiveClass,
        effectiveOps: observation.effectiveOps,
        evidenceRef: observation.evidenceRef
      }
    : {
        allowed: false,
        receiptType: 'manual_handoff_required',
        reason: 'permission_enforcement_unverified'
      };
}

export function buildManualHandoffPrompt({
  bindingPacket,
  bindingObservation,
  permissionEnforcementObservation = null,
  modelResolution = null
}) {
  if (!bindingPacket.bindingVersion) {
    throw new Error('bindingVersion is required for manual handoff');
  }
  if (!bindingObservation?.observedAt
    || !bindingObservation.taskPlanHash
    || !bindingObservation.findingsHash
    || !bindingObservation.progressHash) {
    throw new Error('current trio bindingObservation is required for manual handoff');
  }

  const authorityRoot = path.resolve(bindingPacket.planningRoot);
  if (/[\u0000-\u001f\u007f]/.test(authorityRoot)) {
    throw new Error('canonical authority root must not contain control characters');
  }
  const taskDir = path.join(authorityRoot, 'planning/active', bindingPacket.authorityTaskId);
  const dispatchUnavailable = bindingPacket.dispatchRequest?.availabilityStatus === 'capability_unavailable';
  const selectionEvidence = dispatchUnavailable
    ? []
    : [
        `resolvedModelAtRun: ${modelResolution?.resolvedModelAtRun ?? ''}`,
        `resolvedThinkingAtRun: ${modelResolution?.resolvedThinkingAtRun ?? ''}`,
        `modelResolutionReason: ${modelResolution?.modelResolutionReason ?? ''}`
      ];
  const actualDispatchEvidence = dispatchUnavailable
    ? capabilityUnavailableDispatchOutcomeGuidance()
    : [
        `resolvedModel: ${bindingPacket.dispatchRequest ? 'null' : ''}`,
        `resolvedReasoningEffort: ${bindingPacket.dispatchRequest ? 'null' : ''}`,
        `resolvedSpeed: ${bindingPacket.dispatchRequest ? 'null' : ''}`
      ];
  const applicationEvidence = dispatchUnavailable
    ? []
    : [`applicationStatus: ${modelResolution?.applicationStatus ?? bindingPacket.dispatchRequest?.availabilityStatus ?? 'unverified'}`];

  return [
    'You are a ChiefOps V0b worker. First verify the binding below.',
    '',
    `authorityTaskId: ${bindingPacket.authorityTaskId}`,
    `authorityRoot: ${authorityRoot}`,
    `taskPlanPath: ${path.join(taskDir, 'task_plan.md')}`,
    `findingsPath: ${path.join(taskDir, 'findings.md')}`,
    `progressPath: ${path.join(taskDir, 'progress.md')}`,
    `workerId: ${bindingPacket.workerId}`,
    `bindingVersion: ${bindingPacket.bindingVersion}`,
    `majorPhase: ${bindingPacket.majorPhase ?? ''}`,
    `currentSlice: ${bindingPacket.currentSlice}`,
    `proofTarget: ${bindingPacket.proofTarget}`,
    `evidenceSink: ${bindingPacket.evidenceSink}`,
    `primaryProof: ${bindingPacket.primaryProof ?? ''}`,
    `capabilityClass: ${bindingPacket.capabilityClass}`,
    `reasoningDemand: ${bindingPacket.reasoningDemand ?? ''}`,
    `costPreference: ${bindingPacket.costPreference ?? ''}`,
    `latencyClass: ${bindingPacket.latencyClass ?? ''}`,
    `taskClassification: ${bindingPacket.routeDecision?.taskClassification ?? ''}`,
    `requestedRoute: ${bindingPacket.routeDecision?.requestedRoute ?? ''}`,
    `routeResolutionStatus: ${bindingPacket.routeDecision?.resolutionStatus ?? ''}`,
    `approvedResolvedRoute: ${bindingPacket.routeDecision ? bindingPacket.routeDecision.approvedResolvedRoute : ''}`,
    `downgradeReason: ${bindingPacket.routeDecision?.downgradeReason ?? ''}`,
    `requestedModel: ${bindingPacket.dispatchRequest?.requestedModel ?? ''}`,
    `reasoningEffort: ${bindingPacket.dispatchRequest?.reasoningEffort ?? ''}`,
    `speed: ${bindingPacket.dispatchRequest?.speed ?? ''}`,
    `availabilityStatus: ${bindingPacket.dispatchRequest?.availabilityStatus ?? ''}`,
    ...selectionEvidence,
    ...actualDispatchEvidence,
    ...applicationEvidence,
    `nativeThreadControl: ${modelResolution?.nativeThreadControl ?? false}`,
    `permissionEnforcementStatus: ${permissionEnforcementObservation?.status ?? 'unverified'}`,
    `riskClass: ${bindingPacket.riskClass}`,
    `permissionClass: ${bindingPacket.permissionClass ?? ''}`,
    `delegationPolicy: ${bindingPacket.delegationPolicy ?? ''}`,
    `workType: ${bindingPacket.workType}`,
    `authorityMode: ${bindingPacket.authorityMode}`,
    `allowedOps: ${bindingPacket.allowedOps.join(', ')}`,
    `nonGoals: ${bindingPacket.nonGoals?.join(' | ') ?? ''}`,
    `upgradeTrigger: ${bindingPacket.upgradeTrigger ?? ''}`,
    `expectedCheckInBy: ${bindingPacket.expectedCheckInBy ?? ''}`,
    `stopCondition: ${bindingPacket.stopCondition ?? ''}`,
    `expectedReceipt: ${bindingPacket.expectedReceipt ?? ''}`,
    `returnToChiefInstruction: ${bindingPacket.returnToChiefInstruction ?? ''}`,
    `sourceProgressRef.file: ${bindingPacket.sourceProgressRef?.file ?? ''}`,
    `sourceProgressRef.blockId: ${bindingPacket.sourceProgressRef?.blockId ?? ''}`,
    `sourceProgressRef.contentHash: ${bindingPacket.sourceProgressRef?.contentHash ?? ''}`,
    `sourceProgressRef.observedAt: ${bindingPacket.sourceProgressRef?.observedAt ?? ''}`,
    `bindingObservation.observedAt: ${bindingObservation.observedAt}`,
    `bindingObservation.taskPlanHash: ${bindingObservation.taskPlanHash}`,
    `bindingObservation.findingsHash: ${bindingObservation.findingsHash}`,
    `bindingObservation.progressHash: ${bindingObservation.progressHash}`,
    '',
    'Read taskPlanPath, findingsPath, and progressPath before tracked edits. These are the exact authoritative files even when the worker checkout has no local planning directory. Compare all three file hashes with bindingObservation.',
    'Run Harness commands with HARNESS_PROJECT_ROOT set to authorityRoot, or pass the explicit authority root through --root when the command supports it.',
    'If an exact file is missing, the binding observation is stale, or the restored trio contradicts the assignment, stop and return receiptType: binding_mismatch.',
    'Do not scan the entire home directory. Do not copy, symlink, or unignore the planning trio inside the worker checkout.',
    'Every worker-local subagent dispatch must declare an exact model and thinking value. Do not inherit an ambient session model; use only a validated manual child contract that is mechanically narrower than this parent envelope.',
    'A child contract remains manual_pending and does not prove native spawn, model application, or runtime permission enforcement.',
    'Return a ChiefOpsWorkerReceipt with the same binding identity. Do not claim started/done unless you actually performed the bounded slice and can provide evidenceRefs.'
  ].join('\n');
}

export function measureChiefOpsHandoffText(prompt) {
  return measureText(prompt);
}

function assertV2DeltaHandoffBudget(prompt) {
  const measurement = measureChiefOpsHandoffText(prompt);
  if (measurement.chars > V2_DELTA_HANDOFF_BUDGET.chars
    || measurement.lines > V2_DELTA_HANDOFF_BUDGET.lines
    || measurement.approxTokens > V2_DELTA_HANDOFF_BUDGET.approxTokens) {
    throw new Error('v2_delta_handoff_budget_exceeded');
  }
}

export function buildV2DeltaHandoffPrompt({ delta, effectiveV0bBinding, bindingObservation, modelResolution = null }) {
  if (!delta || delta.schemaVersion !== 'chiefops.v2' || delta.kind !== 'execution_delta') {
    throw new Error('v2_delta_handoff_identity_mismatch');
  }
  if (!effectiveV0bBinding?.bindingVersion
    || !bindingObservation?.observedAt
    || !bindingObservation.taskPlanHash
    || !bindingObservation.findingsHash
    || !bindingObservation.progressHash
    || effectiveV0bBinding.bindingId !== delta.prefixBindingId
    || effectiveV0bBinding.currentSlice !== delta.currentSlice
    || effectiveV0bBinding.majorPhase !== delta.majorPhase
    || effectiveV0bBinding.sourceProgressRef?.blockId !== delta.deltaBindingId
    || (delta.expectedCheckInBy !== undefined && effectiveV0bBinding.expectedCheckInBy !== delta.expectedCheckInBy)) {
    throw new Error('v2_delta_handoff_identity_mismatch');
  }

  const authorityRoot = path.resolve(effectiveV0bBinding.planningRoot);
  if (/[\u0000-\u001f\u007f]/.test(authorityRoot)) {
    throw new Error('canonical authority root must not contain control characters');
  }
  const manualPendingDispatch = effectiveV0bBinding.dispatchRequest?.availabilityStatus === 'manual_pending';
  if (manualPendingDispatch
    && (!modelResolution
      || typeof modelResolution.resolvedModelAtRun !== 'string'
      || typeof modelResolution.resolvedThinkingAtRun !== 'string'
      || typeof modelResolution.modelResolutionReason !== 'string'
      || modelResolution.applicationStatus !== 'manual_pending')) {
    throw new Error('v2_manual_pending_model_resolution_required');
  }
  const taskDir = path.join(authorityRoot, 'planning/active', effectiveV0bBinding.authorityTaskId);
  const dispatchUnavailable = effectiveV0bBinding.dispatchRequest?.availabilityStatus === 'capability_unavailable';
  const trustedSelectionEvidence = manualPendingDispatch
    ? [
        `resolvedModelAtRun: ${modelResolution.resolvedModelAtRun}`,
        `resolvedThinkingAtRun: ${modelResolution.resolvedThinkingAtRun}`,
        `modelResolutionReason: ${modelResolution.modelResolutionReason}`
      ]
    : [];
  const actualDispatchEvidence = dispatchUnavailable
    ? capabilityUnavailableDispatchOutcomeGuidance()
    : [
        `resolvedModel: ${effectiveV0bBinding.dispatchRequest ? 'null' : ''}`,
        `resolvedReasoningEffort: ${effectiveV0bBinding.dispatchRequest ? 'null' : ''}`,
        `resolvedSpeed: ${effectiveV0bBinding.dispatchRequest ? 'null' : ''}`
      ];
  const applicationEvidence = dispatchUnavailable
    ? []
    : [`applicationStatus: ${modelResolution?.applicationStatus ?? effectiveV0bBinding.dispatchRequest?.availabilityStatus ?? 'unverified'}`];
  const prompt = [
    'You are a ChiefOps V2 delta worker. Verify the delta and exact authority before acting.',
    '',
    `authorityTaskId: ${effectiveV0bBinding.authorityTaskId}`,
    `authorityRoot: ${authorityRoot}`,
    `taskPlanPath: ${path.join(taskDir, 'task_plan.md')}`,
    `findingsPath: ${path.join(taskDir, 'findings.md')}`,
    `progressPath: ${path.join(taskDir, 'progress.md')}`,
    `bindingVersion: ${effectiveV0bBinding.bindingVersion}`,
    `prefixBindingId: ${delta.prefixBindingId}`,
    `prefixHash: ${delta.prefixHash}`,
    `deltaBindingId: ${delta.deltaBindingId}`,
    `sequence: ${delta.sequence}`,
    `majorPhase: ${delta.majorPhase}`,
    `currentSlice: ${delta.currentSlice}`,
    `expectedCheckInBy: ${effectiveV0bBinding.expectedCheckInBy ?? ''}`,
    `taskClassification: ${effectiveV0bBinding.routeDecision?.taskClassification ?? ''}`,
    `requestedRoute: ${effectiveV0bBinding.routeDecision?.requestedRoute ?? ''}`,
    `routeResolutionStatus: ${effectiveV0bBinding.routeDecision?.resolutionStatus ?? ''}`,
    `approvedResolvedRoute: ${effectiveV0bBinding.routeDecision ? effectiveV0bBinding.routeDecision.approvedResolvedRoute : ''}`,
    `requestedModel: ${effectiveV0bBinding.dispatchRequest?.requestedModel ?? ''}`,
    `reasoningEffort: ${effectiveV0bBinding.dispatchRequest?.reasoningEffort ?? ''}`,
    `speed: ${effectiveV0bBinding.dispatchRequest?.speed ?? ''}`,
    `availabilityStatus: ${effectiveV0bBinding.dispatchRequest?.availabilityStatus ?? ''}`,
    ...trustedSelectionEvidence,
    ...actualDispatchEvidence,
    ...applicationEvidence,
    `sourceProgressRef.file: ${effectiveV0bBinding.sourceProgressRef.file}`,
    `sourceProgressRef.blockId: ${effectiveV0bBinding.sourceProgressRef.blockId}`,
    `sourceProgressRef.contentHash: ${effectiveV0bBinding.sourceProgressRef.contentHash}`,
    `sourceProgressRef.observedAt: ${effectiveV0bBinding.sourceProgressRef.observedAt}`,
    `bindingObservation.observedAt: ${bindingObservation.observedAt}`,
    `bindingObservation.taskPlanHash: ${bindingObservation.taskPlanHash}`,
    `bindingObservation.findingsHash: ${bindingObservation.findingsHash}`,
    `bindingObservation.progressHash: ${bindingObservation.progressHash}`,
    '',
    'Read taskPlanPath, findingsPath, and progressPath before tracked edits. Locate the stable prefix and latest delta there; restore immutable authority only through the normal resolver.',
    'Compare all three file hashes with bindingObservation. If the trio, prefix, delta, or source reference drifts or contradicts this assignment, stop and return receiptType: binding_mismatch.',
    'Do not scan the entire home directory. Do not copy, symlink, or unignore the planning trio inside the worker checkout.',
    'Every worker-local subagent dispatch must declare an exact model and thinking value under the restored parent envelope. A child contract remains manual_pending and does not prove native spawn, model application, or runtime permission enforcement.',
    'Return a ChiefOpsWorkerReceipt with the resolved binding identity only after the bounded slice has evidenceRefs.'
  ].join('\n');
  assertV2DeltaHandoffBudget(prompt);
  return prompt;
}
