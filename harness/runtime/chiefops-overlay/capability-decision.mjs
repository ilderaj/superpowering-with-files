import { ROUTES, TASK_CLASSIFICATIONS } from './schema.mjs';

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
  manualHandoffAllowed = true,
  taskClassification,
  requestedRoute
}) {
  if ((taskClassification !== undefined && !TASK_CLASSIFICATIONS.includes(taskClassification))
    || (requestedRoute !== undefined && !ROUTES.includes(requestedRoute))
    || (requestedRoute !== undefined && taskClassification === undefined)) {
    return { mode: 'blocked', receiptType: 'binding_mismatch', canProceedAsStarted: false };
  }

  const route = requestedRoute ?? (['tracked', 'deep_reasoning'].includes(taskClassification) ? 'visible_worker' : null);
  const withRouteDecision = (decision, resolutionStatus) => route
    ? {
        ...decision,
        routeDecision: {
          taskClassification,
          requestedRoute: route,
          resolutionStatus,
          approvedResolvedRoute: null
        }
      }
    : decision;

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
    return withRouteDecision({ mode: 'restore_rebind', receiptType: 'binding_mismatch', canProceedAsStarted: false }, 'capability_unavailable');
  }

  if (effectiveAction !== 'respawn_worker' && contextDrift) {
    return withRouteDecision({ mode: 'blocked', receiptType: 'binding_mismatch', canProceedAsStarted: false }, 'capability_unavailable');
  }

  if (effectiveAction === 'respawn_worker') {
    if (capabilities.create) {
      return withRouteDecision({
        mode: 'native_control_requested',
        receiptType: 'binding_verified',
        canProceedAsStarted: false,
        requiresWorkerReceipt: true,
        respawnReason: effectiveRespawnReason
      }, 'native_control_requested');
    }

    return manualHandoffAllowed
      ? withRouteDecision({
          mode: 'manual_handoff',
          receiptType: 'handoff_pending',
          canProceedAsStarted: false,
          respawnReason: effectiveRespawnReason
        }, 'handoff_pending')
      : withRouteDecision({
          mode: 'unsupported',
          receiptType: 'capability_unavailable',
          canProceedAsStarted: false,
          respawnReason: effectiveRespawnReason
        }, 'capability_unavailable');
  }

  if (effectiveAction === 'spawn_worker') {
    if (capabilities.create) {
      return withRouteDecision({
        mode: 'native_control_requested',
        receiptType: 'binding_verified',
        canProceedAsStarted: false,
        requiresWorkerReceipt: true
      }, 'native_control_requested');
    }

    return manualHandoffAllowed
      ? withRouteDecision({ mode: 'manual_handoff', receiptType: 'handoff_pending', canProceedAsStarted: false }, 'handoff_pending')
      : withRouteDecision({ mode: 'unsupported', receiptType: 'capability_unavailable', canProceedAsStarted: false }, 'capability_unavailable');
  }

  if (effectiveAction === 'continue_worker') {
    if (capabilities.continue) {
      return withRouteDecision({
        mode: 'native_control_requested',
        receiptType: 'binding_verified',
        canProceedAsStarted: false,
        requiresWorkerReceipt: true
      }, 'native_control_requested');
    }

    if (manualHandoffAllowed) {
      return withRouteDecision({ mode: 'manual_handoff', receiptType: 'handoff_pending', canProceedAsStarted: false }, 'handoff_pending');
    }

    return sliceStillMatters
      ? withRouteDecision({ mode: 'respawn', receiptType: 'respawn_recommended', canProceedAsStarted: false }, 'capability_unavailable')
      : withRouteDecision({ mode: 'abandon', receiptType: 'abandoned', canProceedAsStarted: false }, 'capability_unavailable');
  }

  if (effectiveAction === 'handoff_worker' || effectiveAction === 'send_instruction') {
    if (capabilities.message || capabilities.handoff) {
      return withRouteDecision({
        mode: 'native_control_requested',
        receiptType: 'binding_verified',
        canProceedAsStarted: false,
        requiresWorkerReceipt: true
      }, 'native_control_requested');
    }

    return manualHandoffAllowed
      ? withRouteDecision({ mode: 'manual_handoff', receiptType: 'manual_handoff_required', canProceedAsStarted: false }, 'handoff_pending')
      : withRouteDecision({ mode: 'unsupported', receiptType: 'capability_unavailable', canProceedAsStarted: false }, 'capability_unavailable');
  }

  return withRouteDecision({ mode: 'unsupported', receiptType: 'capability_unavailable', canProceedAsStarted: false }, 'capability_unavailable');
}
