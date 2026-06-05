import crypto from 'node:crypto';

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, sortValue(value[key])])
    );
  }

  return value;
}

export function stableJson(value) {
  return JSON.stringify(sortValue(value));
}

export function computePlanHash(plan) {
  return crypto.createHash('sha256').update(stableJson(plan)).digest('hex');
}

export function buildWritePlan({ operation, rootDir, payload, preview }) {
  const plan = {
    schemaVersion: 1,
    planId: crypto.randomUUID(),
    operation,
    rootDir,
    payload,
    preview
  };

  return {
    ...plan,
    planHash: computePlanHash(plan)
  };
}
