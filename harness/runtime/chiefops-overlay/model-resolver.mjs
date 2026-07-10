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
  mapping = {}
}) {
  const compatible = availableModels.filter((entry) => supportsProfile(entry, {
    capabilityClass,
    reasoningDemand,
    costPreference,
    latencyClass
  }));
  const preferred = mapping[capabilityClass];
  const selected = compatible.find((entry) => entry.model === preferred) || compatible[0];

  if (!selected) {
    throw new Error(`resolver_failed: no model satisfies ${capabilityClass} and requested profile`);
  }

  return {
    requestedCapabilityClass: capabilityClass,
    requestedReasoningDemand: reasoningDemand,
    requestedCostPreference: costPreference,
    requestedLatencyClass: latencyClass,
    upgradeTrigger,
    resolvedModelAtRun: selected.model,
    resolvedThinkingAtRun: selected.reasoningByDemand[reasoningDemand],
    modelResolutionReason: preferred
      ? (selected.model === preferred ? 'preferred_profile_match' : 'preferred_unavailable_for_profile')
      : 'first_compatible_profile_match',
    nativeThreadControl: false
  };
}
