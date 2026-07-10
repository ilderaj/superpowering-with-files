const APPROVED_RESPAWN_REASONS = new Set([
  'session_unavailable',
  'rebind_impossible',
  'explicit_fresh_context',
  'trust_boundary_change',
  'persistent_context_failure'
]);

export function decideCapabilityAction({
  action,
  capabilities = {},
  bindingValid,
  materialDrift,
  contextDrift = materialDrift,
  sessionAvailable = true,
  safeRebindPossible = true,
  explicitFreshContext = false,
  trustBoundaryChanged = false,
  rebindAttempted = false,
  contextIntegrityFailure = false,
  respawnReason = null,
  sliceStillMatters = true,
  manualHandoffAllowed = true
}) {
  if (!bindingValid) {
    return { mode: 'blocked', receiptType: 'binding_mismatch', canProceedAsStarted: false };
  }

  if (action === 'respawn_worker'
      && respawnReason !== null
      && !APPROVED_RESPAWN_REASONS.has(respawnReason)) {
    return { mode: 'blocked', receiptType: 'binding_mismatch', canProceedAsStarted: false };
  }

  let effectiveAction = action;
  let effectiveRespawnReason = respawnReason;

  if (!sessionAvailable) {
    effectiveAction = 'respawn_worker';
    effectiveRespawnReason = 'session_unavailable';
  } else if (!safeRebindPossible) {
    effectiveAction = 'respawn_worker';
    effectiveRespawnReason = 'rebind_impossible';
  } else if (explicitFreshContext) {
    effectiveAction = 'respawn_worker';
    effectiveRespawnReason = 'explicit_fresh_context';
  } else if (trustBoundaryChanged) {
    effectiveAction = 'respawn_worker';
    effectiveRespawnReason = 'trust_boundary_change';
  } else if (contextIntegrityFailure && rebindAttempted) {
    effectiveAction = 'respawn_worker';
    effectiveRespawnReason = 'persistent_context_failure';
  }

  if (effectiveAction !== 'respawn_worker' && contextDrift && !rebindAttempted) {
    return { mode: 'restore_rebind', receiptType: 'binding_mismatch', canProceedAsStarted: false };
  }

  if (effectiveAction !== 'respawn_worker' && contextDrift) {
    return { mode: 'blocked', receiptType: 'binding_mismatch', canProceedAsStarted: false };
  }

  if (effectiveAction === 'respawn_worker') {
    if (capabilities.create) {
      return {
        mode: 'native_control_requested',
        receiptType: 'binding_verified',
        canProceedAsStarted: false,
        requiresWorkerReceipt: true,
        respawnReason: effectiveRespawnReason
      };
    }

    return manualHandoffAllowed
      ? {
          mode: 'manual_handoff',
          receiptType: 'handoff_pending',
          canProceedAsStarted: false,
          respawnReason: effectiveRespawnReason
        }
      : {
          mode: 'unsupported',
          receiptType: 'capability_unavailable',
          canProceedAsStarted: false,
          respawnReason: effectiveRespawnReason
        };
  }

  if (effectiveAction === 'spawn_worker') {
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

  if (effectiveAction === 'continue_worker') {
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

  if (effectiveAction === 'handoff_worker' || effectiveAction === 'send_instruction') {
    if (capabilities.message || capabilities.handoff) {
      return {
        mode: 'native_control_requested',
        receiptType: 'binding_verified',
        canProceedAsStarted: false,
        requiresWorkerReceipt: true
      };
    }

    return manualHandoffAllowed
      ? { mode: 'manual_handoff', receiptType: 'manual_handoff_required', canProceedAsStarted: false }
      : { mode: 'unsupported', receiptType: 'capability_unavailable', canProceedAsStarted: false };
  }

  return { mode: 'unsupported', receiptType: 'capability_unavailable', canProceedAsStarted: false };
}
