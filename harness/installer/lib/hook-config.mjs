function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertHookConfig(config, target) {
  if (!isPlainObject(config) || !isPlainObject(config.hooks)) {
    throw new TypeError(`Hook config for ${target} must contain a hooks object.`);
  }
}

export function hookEntryMarker(entry) {
  if (!isPlainObject(entry)) return undefined;
  if (typeof entry.description === 'string' && entry.description.startsWith('Harness-managed ')) {
    return entry.description;
  }

  if (Array.isArray(entry.hooks)) {
    const child = entry.hooks.find(
      (hook) =>
        isPlainObject(hook) &&
        typeof hook.description === 'string' &&
        hook.description.startsWith('Harness-managed ')
    );
    return child?.description;
  }

  return undefined;
}

function incomingMarkers(entries) {
  return new Set(entries.map(hookEntryMarker).filter(Boolean));
}

function mergeHookEntries(existingEntries = [], incomingEntries = []) {
  const markers = incomingMarkers(incomingEntries);
  const preserved = existingEntries.filter((entry) => {
    const marker = hookEntryMarker(entry);
    return !marker || !markers.has(marker);
  });

  return [...preserved, ...incomingEntries];
}

export function mergeHookConfig(existingConfig, incomingConfig, target) {
  assertHookConfig(existingConfig, target);
  assertHookConfig(incomingConfig, target);

  const merged = {
    ...existingConfig,
    ...incomingConfig,
    hooks: {
      ...existingConfig.hooks
    }
  };

  for (const [eventName, incomingEntries] of Object.entries(incomingConfig.hooks)) {
    if (!Array.isArray(incomingEntries)) {
      throw new TypeError(`Hook config for ${target} event ${eventName} must be an array.`);
    }

    const existingEntries = existingConfig.hooks[eventName] ?? [];
    if (!Array.isArray(existingEntries)) {
      throw new TypeError(`Hook config for ${target} event ${eventName} must be an array.`);
    }

    merged.hooks[eventName] = mergeHookEntries(existingEntries, incomingEntries);
  }

  return merged;
}

export function mergeHookSettings(existingSettings = {}, incomingConfig, target) {
  if (!isPlainObject(existingSettings)) {
    throw new TypeError(`Hook settings for ${target} must be a JSON object.`);
  }

  if (existingSettings.hooks !== undefined && !isPlainObject(existingSettings.hooks)) {
    throw new TypeError(`Hook settings for ${target} settings hooks must be an object.`);
  }

  const existingConfig = {
    hooks: existingSettings.hooks ?? {}
  };
  const mergedConfig = mergeHookConfig(existingConfig, incomingConfig, target);

  return {
    ...existingSettings,
    hooks: mergedConfig.hooks
  };
}
