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
  if (hasOperatingModelProfile) {
    const resolutionFields = ['resolvedModelAtRun', 'resolvedThinkingAtRun', 'modelResolutionReason'];
    if (!isCompleteModelResolution(modelResolution) || resolutionFields.some((field) => !receipt[field])) {
      return { outcome: 'block', reason: 'model_resolution_evidence_mismatch' };
    }
    const requestedMatches = modelResolution.requestedCapabilityClass === bindingPacket.capabilityClass
      && modelResolution.requestedReasoningDemand === bindingPacket.reasoningDemand
      && modelResolution.requestedCostPreference === bindingPacket.costPreference
      && modelResolution.requestedLatencyClass === bindingPacket.latencyClass
      && modelResolution.upgradeTrigger === (bindingPacket.upgradeTrigger ?? null);
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
  if (args.bindingPacket?.dispatchIntentVersion) {
    return { outcome: 'block', reason: 'trusted_authority_context_required' };
  }
  return gateWorkerReceiptCore(args);
}

// The synchronous gate retains legacy compatibility. New explicit-dispatch
// callers must use this authority-aware wrapper so a receipt cannot supply
// its own catalog or frontier-admission evidence.
export async function gateWorkerReceiptWithAuthority({ root, codexHome, now, ...args }) {
  const verdict = gateWorkerReceiptCore(args);
  if (verdict.outcome !== 'accept' || !args.bindingPacket.dispatchIntentVersion) return verdict;
  const { verifyTrustedDispatchContext } = await import('./overlay-service.mjs');
  try {
    await verifyTrustedDispatchContext({
      root,
      bindingPacket: args.bindingPacket,
      modelResolution: args.modelResolution,
      codexHome,
      now
    });
    const declaredChildren = args.bindingPacket.subagentDispatches ?? [];
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
        parentBinding: args.bindingPacket,
        childDispatch,
        codexHome,
        now
      });
      await validateSubagentReturn({
        root,
        parentBinding: args.bindingPacket,
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
