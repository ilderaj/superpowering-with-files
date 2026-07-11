import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export const MODEL_INVENTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MODEL_INVENTORY_MAX_FUTURE_SKEW_MS = 60 * 1000;

function normalizeModels(value) {
  if (!Array.isArray(value?.models)) throw new Error('model_inventory_invalid');
  const seen = new Set();
  const models = value.models.map((entry) => {
    if (!entry || typeof entry.slug !== 'string' || entry.slug.trim() === '') {
      throw new Error('model_inventory_invalid');
    }
    if (seen.has(entry.slug)) throw new Error('model_inventory_ambiguous');
    seen.add(entry.slug);
    if (!Array.isArray(entry.supported_reasoning_levels)) {
      throw new Error('model_inventory_invalid');
    }
    const supportedReasoningLevels = entry.supported_reasoning_levels.map((level) => {
      if (!level || typeof level.effort !== 'string' || level.effort.trim() === '') {
        throw new Error('model_inventory_invalid');
      }
      return level.effort;
    });
    if (new Set(supportedReasoningLevels).size !== supportedReasoningLevels.length) {
      throw new Error('model_inventory_ambiguous');
    }
    return { model: entry.slug, supportedReasoningLevels: supportedReasoningLevels.sort() };
  });
  return models.sort((left, right) => left.model.localeCompare(right.model));
}

export async function readLiveCodexModelInventory({
  codexHome,
  now = new Date().toISOString(),
  fsOps = { lstat, open, realpath, stat, constants }
}) {
  const expectedPath = path.resolve(codexHome, 'models_cache.json');
  const resolvedHome = await fsOps.realpath(codexHome);
  const sourceLinkMetadata = await fsOps.lstat(expectedPath);
  if (sourceLinkMetadata.isSymbolicLink()) {
    throw new Error('model_inventory_source_symlink');
  }
  const resolvedCache = await fsOps.realpath(expectedPath);
  if (path.resolve(resolvedCache) !== path.join(path.resolve(resolvedHome), 'models_cache.json')) {
    throw new Error('model_inventory_source_outside_root');
  }
  let handle;
  try {
    handle = await fsOps.open(
      resolvedCache,
      fsOps.constants.O_RDONLY | fsOps.constants.O_NOFOLLOW
    );
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error('model_inventory_source_symlink');
    throw error;
  }
  let sourceMetadata;
  let raw;
  try {
    sourceMetadata = await handle.stat();
    if (!sourceMetadata.isFile()) throw new Error('model_inventory_source_invalid');
    const [currentHome, currentCache, currentMetadata] = await Promise.all([
      fsOps.realpath(codexHome),
      fsOps.realpath(expectedPath),
      fsOps.stat(resolvedCache)
    ]);
    if (currentHome !== resolvedHome
      || currentCache !== resolvedCache
      || currentMetadata.dev !== sourceMetadata.dev
      || currentMetadata.ino !== sourceMetadata.ino) {
      throw new Error('model_inventory_source_identity_changed');
    }
    raw = await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
  const observedAtMs = sourceMetadata.mtimeMs;
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs) || !Number.isFinite(observedAtMs)) {
    throw new Error('model_inventory_invalid');
  }
  if (observedAtMs > nowMs + MODEL_INVENTORY_MAX_FUTURE_SKEW_MS) {
    throw new Error('model_inventory_future');
  }
  if (nowMs - observedAtMs > MODEL_INVENTORY_MAX_AGE_MS) {
    throw new Error('model_inventory_stale');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('model_inventory_invalid');
  }
  const models = normalizeModels(parsed);
  return {
    sourceRef: 'codex.models_cache',
    observedAt: new Date(observedAtMs).toISOString(),
    fingerprint: 'sha256:' + createHash('sha256').update(JSON.stringify({ models })).digest('hex'),
    models
  };
}
