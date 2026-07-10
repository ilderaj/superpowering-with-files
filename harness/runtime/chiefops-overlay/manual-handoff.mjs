import path from 'node:path';

const PERMISSION_RANK = new Map([
  ['observe', 0],
  ['workspace', 1],
  ['egress_gated', 2],
  ['release', 3]
]);

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

  return operationsCovered
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

export function buildManualHandoffPrompt({ bindingPacket, bindingObservation }) {
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
    'Return a ChiefOpsWorkerReceipt with the same binding identity. Do not claim started/done unless you actually performed the bounded slice and can provide evidenceRefs.'
  ].join('\n');
}
