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

function pruneHookEntries(entries = [], marker) {
  return entries.filter((entry) => hookEntryMarker(entry) !== marker);
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

export function removeManagedHookConfig(existingConfig, marker, target) {
  assertHookConfig(existingConfig, target);

  let changed = false;
  const hooks = {};

  for (const [eventName, existingEntries] of Object.entries(existingConfig.hooks)) {
    if (!Array.isArray(existingEntries)) {
      throw new TypeError(`Hook config for ${target} event ${eventName} must be an array.`);
    }

    const filteredEntries = pruneHookEntries(existingEntries, marker);
    if (filteredEntries.length !== existingEntries.length) {
      changed = true;
    }
    if (filteredEntries.length > 0) {
      hooks[eventName] = filteredEntries;
    }
  }

  return {
    changed,
    config: {
      ...existingConfig,
      hooks
    },
    removeFile: Object.keys(hooks).length === 0
  };
}

export function removeManagedHookSettings(existingSettings = {}, marker, target) {
  if (!isPlainObject(existingSettings)) {
    throw new TypeError(`Hook settings for ${target} must be a JSON object.`);
  }

  if (existingSettings.hooks === undefined) {
    return {
      changed: false,
      settings: existingSettings,
      removeFile: Object.keys(existingSettings).length === 0
    };
  }

  if (!isPlainObject(existingSettings.hooks)) {
    throw new TypeError(`Hook settings for ${target} settings hooks must be an object.`);
  }

  const { changed, config } = removeManagedHookConfig({ hooks: existingSettings.hooks }, marker, target);
  const settings = { ...existingSettings };

  if (Object.keys(config.hooks).length === 0) {
    delete settings.hooks;
  } else {
    settings.hooks = config.hooks;
  }

  return {
    changed,
    settings,
    removeFile: Object.keys(settings).length === 0
  };
}
