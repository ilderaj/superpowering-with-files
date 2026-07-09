export function resolveModel({ capabilityClass, availableModels = [], mapping = {} }) {
  const preferred = mapping[capabilityClass];
  const preferredModel =
    preferred &&
    availableModels.find((entry) => entry.model === preferred && entry.capabilityClass === capabilityClass);

  if (preferredModel) {
    return {
      requestedCapabilityClass: capabilityClass,
      resolvedModelAtRun: preferredModel.model,
      fallbackReason: null
    };
  }

  const matching = availableModels.find((entry) => entry.capabilityClass === capabilityClass);
  if (matching) {
    return {
      requestedCapabilityClass: capabilityClass,
      resolvedModelAtRun: matching.model,
      fallbackReason: preferred ? 'preferred_unavailable' : null
    };
  }

  throw new Error(`resolver_failed: no model satisfies ${capabilityClass}`);
}
