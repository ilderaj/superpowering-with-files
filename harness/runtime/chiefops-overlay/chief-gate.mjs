import { normalizeTaskClassification, TASK_CLASSIFICATIONS } from './schema.mjs';

function same(left, right) {
  return left === right;
}

function sameArray(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function sameSourceProgressRef(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    left.file === right.file &&
    left.blockId === right.blockId &&
    left.contentHash === right.contentHash
  );
}

function sameBindingIdentity(bindingPacket, receipt) {
  const suppliedVersionMatches = !receipt.bindingVersion || receipt.bindingVersion === bindingPacket.bindingVersion;
  const suppliedTokenMatches = !receipt.bindingToken || receipt.bindingToken === bindingPacket.bindingToken;

  if (!suppliedVersionMatches || !suppliedTokenMatches) {
    return false;
  }

  return Boolean(receipt.bindingVersion || receipt.bindingToken);
}

function sameBoundSession(bindingPacket, receipt) {
  return (!bindingPacket.threadId || receipt.threadId === bindingPacket.threadId)
    && (!bindingPacket.sessionId || receipt.sessionId === bindingPacket.sessionId);
}

function isCompleteModelResolution(modelResolution) {
  return Boolean(modelResolution)
    && [
      'requestedCapabilityClass',
      'requestedReasoningDemand',
      'requestedCostPreference',
      'requestedLatencyClass',
      'resolvedModelAtRun',
      'resolvedThinkingAtRun',
      'modelResolutionReason'
    ].every((field) => typeof modelResolution[field] === 'string' && modelResolution[field].length > 0)
    && modelResolution.nativeThreadControl === false;
}

function isTerminalLifecycleStatus(status) {
  return ['closed', 'archived', 'done', 'complete'].includes(String(status || '').toLowerCase());
}

function sameDispatchDecision(left, right) {
  if (!left || !right) return left === right;
  return ['decidedBy', 'decidedAt', 'preferredModel', 'preferredThinking', 'applicationStatus']
    .every((field) => left[field] === right[field])
    && ['sourceRef', 'observedAt', 'fingerprint'].every((field) => left.inventory?.[field] === right.inventory?.[field]);
}

function hasAnyFields(value, fields) {
  return fields.some((field) => value?.[field] !== undefined);
}

function canonicalRouteEvidence(value) {
  if (value === undefined || value === null) {
    return { valid: true, value: null };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, value: null };
  }

  const taskClassification = normalizeTaskClassification(value.taskClassification);
  if (!TASK_CLASSIFICATIONS.includes(taskClassification)) {
    return { valid: false, value: null };
  }
  return { valid: true, value: { ...value, taskClassification } };
}

function sameCanonicalRouteDecision(left, right) {
  const canonicalLeft = canonicalRouteEvidence(left);
  const canonicalRight = canonicalRouteEvidence(right);
  return canonicalLeft.valid
    && canonicalRight.valid
    && JSON.stringify(canonicalLeft.value) === JSON.stringify(canonicalRight.value);
}

function routeEvidenceVerdict({ bindingPacket, receipt }) {
  const bindingRoute = bindingPacket.routeDecision;
  const receiptRoute = receipt.routeOutcome;
  if (Boolean(bindingRoute) !== Boolean(receiptRoute)) {
    return { outcome: 'block', reason: 'route_evidence_unbound' };
  }
  if (!bindingRoute) return null;

  const canonicalBindingRoute = canonicalRouteEvidence(bindingRoute);
  const canonicalReceiptRoute = canonicalRouteEvidence(receiptRoute);
  if (!canonicalBindingRoute.valid || !canonicalReceiptRoute.valid) {
    return { outcome: 'block', reason: 'route_transition_mismatch' };
  }

  const normalizedBindingRoute = canonicalBindingRoute.value;
  const normalizedReceiptRoute = canonicalReceiptRoute.value;

  if (normalizedBindingRoute.taskClassification !== normalizedReceiptRoute.taskClassification
    || normalizedBindingRoute.requestedRoute !== normalizedReceiptRoute.requestedRoute) {
    return { outcome: 'block', reason: 'route_transition_mismatch' };
  }

  const samePendingStatus = normalizedBindingRoute.resolutionStatus === normalizedReceiptRoute.resolutionStatus
    && ['handoff_pending', 'capability_unavailable'].includes(normalizedBindingRoute.resolutionStatus)
    && normalizedReceiptRoute.resolvedRoute === null;
  const nativeVerified = normalizedBindingRoute.resolutionStatus === 'native_control_requested'
    && normalizedReceiptRoute.resolutionStatus === 'native_control_verified'
    && normalizedReceiptRoute.resolvedRoute === normalizedReceiptRoute.requestedRoute;
  const manualHandoffCompleted = normalizedBindingRoute.resolutionStatus === 'handoff_pending'
    && normalizedBindingRoute.requestedRoute === 'visible_worker'
    && normalizedReceiptRoute.resolutionStatus === 'manual_handoff_completed'
    && normalizedReceiptRoute.resolvedRoute === normalizedReceiptRoute.requestedRoute
    && receipt.receiptType === 'done';
  const authorizedDowngrade = normalizedBindingRoute.resolutionStatus === 'chief_downgrade'
    && normalizedReceiptRoute.resolutionStatus === 'chief_downgrade'
    && normalizedReceiptRoute.resolvedRoute === normalizedBindingRoute.approvedResolvedRoute;

  if (receipt.receiptType === 'done' && samePendingStatus) {
    return { outcome: 'block', reason: 'route_transition_mismatch' };
  }
  if (!samePendingStatus && !nativeVerified && !manualHandoffCompleted && !authorizedDowngrade) {
    return { outcome: 'block', reason: 'route_transition_mismatch' };
  }
  return null;
}

function dispatchEvidenceVerdict({ bindingPacket, receipt }) {
  const dispatchRequest = bindingPacket.dispatchRequest;
  const dispatchOutcome = receipt.dispatchOutcome;
  if (Boolean(dispatchRequest) !== Boolean(dispatchOutcome)) {
    return { outcome: 'block', reason: 'dispatch_evidence_unbound' };
  }
  if (!dispatchRequest) return null;

  if (dispatchRequest.availabilityStatus !== dispatchOutcome.applicationStatus) {
    return { outcome: 'block', reason: 'dispatch_resolution_evidence_mismatch' };
  }

  if (dispatchOutcome.resolvedModel !== null
    || dispatchOutcome.resolvedReasoningEffort !== null
    || dispatchOutcome.resolvedSpeed !== null) {
    return { outcome: 'block', reason: 'dispatch_resolution_evidence_mismatch' };
  }

  if (dispatchRequest.availabilityStatus === 'manual_pending') {
    if (!bindingPacket.dispatchIntentVersion
      || !bindingPacket.dispatchDecision
      || bindingPacket.dispatchDecision.preferredModel !== dispatchRequest.requestedModel
      || bindingPacket.dispatchDecision.preferredThinking !== dispatchRequest.reasoningEffort
      || receipt.applicationStatus !== 'manual_pending') {
      return { outcome: 'block', reason: 'dispatch_resolution_evidence_mismatch' };
    }
  }

  if (dispatchRequest.availabilityStatus === 'capability_unavailable'
    && hasAnyFields(receipt, ['resolvedModelAtRun', 'resolvedThinkingAtRun', 'modelResolutionReason', 'applicationStatus'])) {
    return { outcome: 'block', reason: 'dispatch_resolution_evidence_mismatch' };
  }
  return null;
}

function gateWorkerReceiptCore({
  bindingPacket,
  receipt,
  approvalSatisfied = false,
  taskState = {},
  modelResolution = null
}) {
  const identityFields = [
    'authorityTaskId',
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
  ];
  const mismatch = identityFields.find((field) => !same(bindingPacket[field], receipt[field]));
  if (mismatch) {
    return { outcome: 'block', reason: 'binding_identity_mismatch' };
  }

  if (!sameArray(bindingPacket.allowedOps, receipt.allowedOps)) {
    return { outcome: 'block', reason: 'binding_identity_mismatch' };
  }

  if (!sameSourceProgressRef(bindingPacket.sourceProgressRef, receipt.sourceProgressRef)) {
    return { outcome: 'block', reason: 'binding_identity_mismatch' };
  }

  if (!sameBindingIdentity(bindingPacket, receipt)) {
    return { outcome: 'block', reason: 'binding_identity_mismatch' };
  }

  if (!sameBoundSession(bindingPacket, receipt)) {
    return { outcome: 'block', reason: 'binding_identity_mismatch' };
  }

  const hasOperatingModelProfile = [
    'reasoningDemand',
    'costPreference',
    'latencyClass'
  ].every((field) => bindingPacket[field] !== undefined);
  const dispatchUnavailable = bindingPacket.dispatchRequest?.availabilityStatus === 'capability_unavailable';
  const dispatchManualPending = bindingPacket.dispatchRequest?.availabilityStatus === 'manual_pending';
  if (dispatchUnavailable && hasAnyFields(receipt, ['resolvedModelAtRun', 'resolvedThinkingAtRun', 'modelResolutionReason', 'applicationStatus'])) {
    return { outcome: 'block', reason: 'dispatch_resolution_evidence_mismatch' };
  }
  if ((hasOperatingModelProfile || dispatchManualPending) && !dispatchUnavailable) {
    const resolutionFields = ['resolvedModelAtRun', 'resolvedThinkingAtRun', 'modelResolutionReason'];
    if (!isCompleteModelResolution(modelResolution) || resolutionFields.some((field) => !receipt[field])) {
      return { outcome: 'block', reason: 'model_resolution_evidence_mismatch' };
    }
    const requestedMatches = hasOperatingModelProfile
      ? modelResolution.requestedCapabilityClass === bindingPacket.capabilityClass
        && modelResolution.requestedReasoningDemand === bindingPacket.reasoningDemand
        && modelResolution.requestedCostPreference === bindingPacket.costPreference
        && modelResolution.requestedLatencyClass === bindingPacket.latencyClass
        && modelResolution.upgradeTrigger === (bindingPacket.upgradeTrigger ?? null)
      : modelResolution.requestedCapabilityClass === bindingPacket.capabilityClass
        && modelResolution.resolvedModelAtRun === bindingPacket.dispatchRequest.requestedModel
        && modelResolution.resolvedThinkingAtRun === bindingPacket.dispatchRequest.reasoningEffort;
    const resolvedMatches = receipt.resolvedModelAtRun === modelResolution.resolvedModelAtRun
      && receipt.resolvedThinkingAtRun === modelResolution.resolvedThinkingAtRun
      && receipt.modelResolutionReason === modelResolution.modelResolutionReason;
    if (!requestedMatches || !resolvedMatches) {
      return { outcome: 'block', reason: 'model_resolution_evidence_mismatch' };
    }
    if (bindingPacket.dispatchIntentVersion
      && (modelResolution.applicationStatus !== 'manual_pending'
        || receipt.applicationStatus !== 'manual_pending')) {
      return { outcome: 'block', reason: 'model_application_unverified' };
    }
  }

  if (bindingPacket.expectedReceipt && bindingPacket.expectedReceipt !== receipt.receiptType) {
    return { outcome: 'block', reason: 'unexpected_receipt_type' };
  }

  if (bindingPacket.requiresHumanApproval && !approvalSatisfied) {
    return { outcome: 'block', reason: 'approval_gate_missing' };
  }

  if (receipt.receiptType === 'done') {
    if (isTerminalLifecycleStatus(taskState.status)) {
      return { outcome: 'block', reason: 'task_lifecycle_not_active' };
    }

    if (taskState.supersededByReceiptId && taskState.supersededByReceiptId !== receipt.receiptId) {
      return { outcome: 'block', reason: 'receipt_superseded' };
    }

    if (receipt.status === 'blocked' || receipt.status === 'failed') {
      return { outcome: 'block', reason: 'receipt_status_conflict' };
    }

    if (!receipt.evidenceRefs || receipt.evidenceRefs.length === 0) {
      return { outcome: 'block', reason: 'evidence_missing' };
    }

    if (
      (bindingPacket.workType === 'office' || bindingPacket.authorityMode === 'source_authority') &&
      (!receipt.sourceRefs || receipt.sourceRefs.length === 0)
    ) {
      return { outcome: 'block', reason: 'source_evidence_missing' };
    }

    if (bindingPacket.allowedOps.some((op) => ['publish', 'send'].includes(op)) && !receipt.publishRef) {
      if (receipt.blockerReason) {
        return { outcome: 'block', reason: 'publish_blocked' };
      }
      return { outcome: 'block', reason: 'publish_evidence_missing' };
    }

    if (bindingPacket.nonGoals?.length > 0 && receipt.scopeCheck?.nonGoalsChecked !== true) {
      return { outcome: 'block', reason: 'scope_check_missing' };
    }

    if (receipt.scopeCheck?.violations?.length > 0 || receipt.scopeViolation === true) {
      return { outcome: 'block', reason: 'scope_violation_reported' };
    }

    return { outcome: 'accept', reason: null };
  }

  if (receipt.receiptType === 'blocked') {
    return { outcome: 'block', reason: 'worker_blocked' };
  }

  if (receipt.receiptType === 'new_trio_candidate') {
    return { outcome: 'new_trio_candidate', reason: null };
  }

  return { outcome: 'request_changes', reason: receipt.receiptType };
}

export function gateWorkerReceipt(args) {
  return { outcome: 'block', reason: 'trusted_authority_context_required' };
}

// The synchronous helper never accepts. The authority-aware wrapper is the
// sole accepting route so a receipt cannot supply its own binding, catalog,
// admission, or child-return evidence.
export async function gateWorkerReceiptWithAuthority({ root, codexHome, now, ...args }) {
  try {
    const { readAuthoritativeBinding, verifyTrustedDispatchContext } = await import('./overlay-service.mjs');
    const authoritative = await readAuthoritativeBinding({ root, bindingPacket: args.bindingPacket });
    const authoritativeBinding = authoritative.bindingPacket;
    const isV2Input = args.bindingPacket?.schemaVersion === 'chiefops.v2';
    const dispatchStateMatches = isV2Input || (authoritativeBinding.dispatchIntentVersion === args.bindingPacket.dispatchIntentVersion
      && sameDispatchDecision(authoritativeBinding.dispatchDecision, args.bindingPacket.dispatchDecision)
      && same(authoritativeBinding.detailedPlanEligibility?.eligibilityId, args.bindingPacket.detailedPlanEligibility?.eligibilityId)
      && same(authoritativeBinding.detailedPlanEligibility?.eligibilityBlockHash, args.bindingPacket.detailedPlanEligibility?.eligibilityBlockHash)
      && same(authoritativeBinding.upgradeAdmission?.admissionId, args.bindingPacket.upgradeAdmission?.admissionId)
      && same(authoritativeBinding.upgradeAdmission?.admissionBlockHash, args.bindingPacket.upgradeAdmission?.admissionBlockHash)
      && sameCanonicalRouteDecision(authoritativeBinding.routeDecision, args.bindingPacket.routeDecision)
      && JSON.stringify(authoritativeBinding.dispatchRequest ?? null) === JSON.stringify(args.bindingPacket.dispatchRequest ?? null));
    const childDispatchesMatch = isV2Input
      || JSON.stringify(authoritativeBinding.subagentDispatches ?? []) === JSON.stringify(args.bindingPacket.subagentDispatches ?? []);
    if (!dispatchStateMatches || !childDispatchesMatch) {
      return { outcome: 'block', reason: 'trusted_dispatch_context_mismatch' };
    }
    const routeVerdict = routeEvidenceVerdict({ bindingPacket: authoritativeBinding, receipt: args.receipt });
    if (routeVerdict) return routeVerdict;
    const dispatchVerdict = dispatchEvidenceVerdict({ bindingPacket: authoritativeBinding, receipt: args.receipt });
    if (dispatchVerdict) return dispatchVerdict;
    const verdict = gateWorkerReceiptCore({ ...args, bindingPacket: authoritativeBinding });
    const requiresAuthorityContext = Boolean(authoritativeBinding.dispatchIntentVersion
      || authoritativeBinding.dispatchRequest
      || authoritativeBinding.subagentDispatches?.length > 0);
    if (verdict.outcome !== 'accept' || !requiresAuthorityContext) return verdict;
    if (authoritativeBinding.dispatchIntentVersion) {
      await verifyTrustedDispatchContext({
        root,
        bindingPacket: authoritativeBinding,
        modelResolution: args.modelResolution,
        codexHome,
        now
      });
    }
    const declaredChildren = authoritativeBinding.subagentDispatches ?? [];
    const returnedChildren = args.receipt?.subagentReturns ?? [];
    if (declaredChildren.length === 0 && returnedChildren.length > 0) {
      return { outcome: 'block', reason: 'subagent_return_unexpected' };
    }
    if (declaredChildren.length > 0 && returnedChildren.length === 0) {
      return { outcome: 'block', reason: 'subagent_return_missing' };
    }
    const { prepareSubagentHandoff, validateSubagentReturn } = await import('./overlay-service.mjs');
    const declaredIds = new Set(declaredChildren.map((child) => child.childId));
    if (declaredIds.size !== declaredChildren.length || returnedChildren.some((child) => !declaredIds.has(child.childId))) {
      return { outcome: 'block', reason: 'subagent_return_unexpected' };
    }
    for (const childDispatch of declaredChildren) {
      const matches = returnedChildren.filter((child) => child.childId === childDispatch.childId);
      if (matches.length === 0) return { outcome: 'block', reason: 'subagent_return_missing' };
      if (matches.length !== 1) return { outcome: 'block', reason: 'subagent_return_duplicate' };
      const childContract = await prepareSubagentHandoff({
        root,
        parentBinding: authoritativeBinding,
        childDispatch,
        codexHome,
        now
      });
      await validateSubagentReturn({
        root,
        parentBinding: authoritativeBinding,
        childContract,
        childReturn: matches[0],
        codexHome,
        now
      });
    }
    return verdict;
  } catch (error) {
    if (typeof error?.message === 'string' && error.message.startsWith('subagent_return_')) {
      return { outcome: 'block', reason: error.message };
    }
    return { outcome: 'block', reason: 'trusted_dispatch_context_mismatch' };
  }
}
