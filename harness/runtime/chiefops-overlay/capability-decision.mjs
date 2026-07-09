export function decideCapabilityAction({
  action,
  capabilities = {},
  bindingValid,
  materialDrift,
  sliceStillMatters = true,
  manualHandoffAllowed = true
}) {
  if (!bindingValid) {
    return { mode: 'blocked', receiptType: 'binding_mismatch', canProceedAsStarted: false };
  }

  if (materialDrift) {
    return { mode: 'respawn', receiptType: 'respawn_recommended', canProceedAsStarted: false };
  }

  if (action === 'spawn_worker' || action === 'respawn_worker') {
    if (capabilities.create) {
      return {
        mode: 'native_control_requested',
        receiptType: 'binding_verified',
        canProceedAsStarted: false,
        requiresWorkerReceipt: true
      };
    }

    return manualHandoffAllowed
      ? { mode: 'manual_handoff', receiptType: 'handoff_pending', canProceedAsStarted: false }
      : { mode: 'unsupported', receiptType: 'capability_unavailable', canProceedAsStarted: false };
  }

  if (action === 'continue_worker') {
    if (capabilities.continue) {
      return {
        mode: 'native_control_requested',
        receiptType: 'binding_verified',
        canProceedAsStarted: false,
        requiresWorkerReceipt: true
      };
    }

    if (manualHandoffAllowed) {
      return { mode: 'manual_handoff', receiptType: 'handoff_pending', canProceedAsStarted: false };
    }

    return sliceStillMatters
      ? { mode: 'respawn', receiptType: 'respawn_recommended', canProceedAsStarted: false }
      : { mode: 'abandon', receiptType: 'abandoned', canProceedAsStarted: false };
  }

  if (action === 'handoff_worker' || action === 'send_instruction') {
    return capabilities.message || capabilities.handoff
      ? {
          mode: 'native_control_requested',
          receiptType: 'binding_verified',
          canProceedAsStarted: false,
          requiresWorkerReceipt: true
        }
      : { mode: 'manual_handoff', receiptType: 'manual_handoff_required', canProceedAsStarted: false };
  }

  return { mode: 'unsupported', receiptType: 'capability_unavailable', canProceedAsStarted: false };
}
