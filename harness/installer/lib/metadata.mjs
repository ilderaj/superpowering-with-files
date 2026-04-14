import { readFile } from 'node:fs/promises';
import path from 'node:path';

const scopes = new Set(['workspace', 'user-global', 'both']);

export async function loadPlatforms(rootDir) {
  const file = path.join(rootDir, 'harness/core/metadata/platforms.json');
  return JSON.parse(await readFile(file, 'utf8'));
}

export function normalizeScope(scope = 'workspace') {
  if (!scopes.has(scope)) {
    throw new Error(`Invalid scope: ${scope}. Expected workspace, user-global, or both.`);
  }

  return scope;
}

export function normalizeTargets(metadata, targets) {
  const available = Object.keys(metadata.platforms);
  const unsupported = metadata.unsupportedPlatforms ?? {};
  if (!targets.length || targets.includes('all')) return available;

  for (const target of targets) {
    if (unsupported[target]) {
      throw new Error(`Unsupported target: ${target}. ${unsupported[target].reason}`);
    }
    if (!available.includes(target)) {
      throw new Error(`Unknown target: ${target}`);
    }
  }

  return targets;
}
