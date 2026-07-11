function supportsProfile(entry, { capabilityClass, reasoningDemand, costPreference, latencyClass }) {
  return entry.capabilityClass === capabilityClass
    && typeof entry.reasoningByDemand?.[reasoningDemand] === 'string'
    && entry.costPreferences?.includes(costPreference)
    && entry.latencyClasses?.includes(latencyClass);
}

export function resolveModel({
  capabilityClass,
  reasoningDemand,
  costPreference,
  latencyClass,
  upgradeTrigger = null,
  availableModels = [],
  mapping = {},
  dispatchDecision = null,
  liveInventory = null
}) {
  const compatible = availableModels.filter((entry) => supportsProfile(entry, {
    capabilityClass,
    reasoningDemand,
    costPreference,
    latencyClass
  }));
  const preferred = mapping[capabilityClass];
  if (dispatchDecision && !liveInventory) {
    throw new Error('model_inventory_required');
  }
  if (dispatchDecision && !preferred) {
    throw new Error('model_mapping_required');
  }
  const selected = dispatchDecision
    ? compatible.find((entry) => entry.model === preferred)
    : compatible.find((entry) => entry.model === preferred) || compatible[0];

  if (!selected) {
    throw new Error(`resolver_failed: no model satisfies ${capabilityClass} and requested profile`);
  }

  const resolvedThinkingAtRun = selected.reasoningByDemand[reasoningDemand];
  const inventoryEntry = dispatchDecision
    ? liveInventory.models?.find((entry) => entry.model === selected.model)
    : null;
  if (dispatchDecision && (!inventoryEntry || !inventoryEntry.supportedReasoningLevels?.includes(resolvedThinkingAtRun))) {
    throw new Error('model_inventory_mismatch');
  }

  const resolution = {
    requestedCapabilityClass: capabilityClass,
    requestedReasoningDemand: reasoningDemand,
    requestedCostPreference: costPreference,
    requestedLatencyClass: latencyClass,
    upgradeTrigger,
    resolvedModelAtRun: selected.model,
    resolvedThinkingAtRun,
    modelResolutionReason: preferred
      ? (selected.model === preferred ? 'preferred_profile_match' : 'preferred_unavailable_for_profile')
      : 'first_compatible_profile_match',
    nativeThreadControl: false
  };
  if (dispatchDecision) {
    return {
      ...resolution,
      inventorySourceRef: liveInventory.sourceRef,
      inventoryObservedAt: liveInventory.observedAt,
      inventoryFingerprint: liveInventory.fingerprint,
      applicationStatus: 'manual_pending'
    };
  }
  return resolution;
}
