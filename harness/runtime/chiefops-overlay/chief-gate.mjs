function same(left, right) {
  return left === right;
}

function sameArray(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
  if (receipt.bindingVersion) {
    return receipt.bindingVersion === bindingPacket.bindingVersion;
  }

  if (receipt.bindingToken) {
    return receipt.bindingToken === bindingPacket.bindingToken;
  }

  return false;
}

export function gateWorkerReceipt({ bindingPacket, receipt, approvalSatisfied = false }) {
  const identityFields = [
    'authorityTaskId',
    'workerId',
    'currentSlice',
    'proofTarget',
    'evidenceSink',
    'capabilityClass',
    'riskClass',
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

  if (bindingPacket.requiresHumanApproval && !approvalSatisfied) {
    return { outcome: 'block', reason: 'approval_gate_missing' };
  }

  if (receipt.receiptType === 'done') {
    if (!receipt.evidenceRefs || receipt.evidenceRefs.length === 0) {
      return { outcome: 'block', reason: 'evidence_missing' };
    }

    if (
      (bindingPacket.workType === 'office' || bindingPacket.authorityMode === 'source_authority') &&
      (!receipt.sourceRefs || receipt.sourceRefs.length === 0)
    ) {
      return { outcome: 'block', reason: 'source_evidence_missing' };
    }

    if (bindingPacket.allowedOps.some((op) => ['write', 'publish', 'send'].includes(op)) && !receipt.publishRef) {
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
