export function buildManualHandoffPrompt({ bindingPacket }) {
  if (!bindingPacket.bindingVersion) {
    throw new Error('bindingVersion is required for manual handoff');
  }

  return [
    'You are a ChiefOps V0b worker. First verify the binding below.',
    '',
    `authorityTaskId: ${bindingPacket.authorityTaskId}`,
    'planningRootRef: authority_root',
    `workerId: ${bindingPacket.workerId}`,
    `bindingVersion: ${bindingPacket.bindingVersion}`,
    `currentSlice: ${bindingPacket.currentSlice}`,
    `proofTarget: ${bindingPacket.proofTarget}`,
    `evidenceSink: ${bindingPacket.evidenceSink}`,
    `capabilityClass: ${bindingPacket.capabilityClass}`,
    `riskClass: ${bindingPacket.riskClass}`,
    `workType: ${bindingPacket.workType}`,
    `authorityMode: ${bindingPacket.authorityMode}`,
    `allowedOps: ${bindingPacket.allowedOps.join(', ')}`,
    `nonGoals: ${bindingPacket.nonGoals?.join(' | ') ?? ''}`,
    `sourceProgressRef.file: ${bindingPacket.sourceProgressRef?.file ?? ''}`,
    `sourceProgressRef.blockId: ${bindingPacket.sourceProgressRef?.blockId ?? ''}`,
    `sourceProgressRef.contentHash: ${bindingPacket.sourceProgressRef?.contentHash ?? ''}`,
    `sourceProgressRef.observedAt: ${bindingPacket.sourceProgressRef?.observedAt ?? ''}`,
    '',
    'If the binding does not match the restored planning trio, stop and return receiptType: binding_mismatch.',
    'Return a ChiefOpsWorkerReceipt with the same binding identity. Do not claim started/done unless you actually performed the bounded slice and can provide evidenceRefs.'
  ].join('\n');
}
