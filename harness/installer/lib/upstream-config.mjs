import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const defaultSourceConfigPath = 'harness/upstream/sources.json';
export const defaultSourceLockPath = 'harness/upstream/.source-lock.json';
export const legacySourceHeadsPath = 'harness/upstream/.source-heads.json';

function resolveRootPath(rootDir, relativePath) {
  return path.resolve(rootDir ?? process.cwd(), relativePath);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function normalizeResolution(rawSource = {}) {
  const resolution = rawSource.resolution ?? {};
  const fallbacks = rawSource.fallbackStrategy
    ? [rawSource.fallbackStrategy]
    : Array.isArray(resolution.fallbacks)
      ? [...resolution.fallbacks]
      : [];

  return {
    strategy: rawSource.versionStrategy ?? resolution.strategy ?? 'branch-head',
    allowPrerelease: rawSource.allowPrerelease ?? resolution.allowPrerelease ?? false,
    fallbacks,
    pinnedRef: rawSource.pinnedRef ?? resolution.pinnedRef ?? null
  };
}

function normalizeResolvedFingerprint(rawResolved = {}) {
  return {
    kind: rawResolved.kind ?? 'branch-head',
    version: rawResolved.version ?? null,
    ref: rawResolved.ref ?? 'HEAD',
    commitSha: rawResolved.commitSha ?? rawResolved.headSha ?? null
  };
}

function normalizeLockSource(name, rawSource = {}) {
  return {
    name,
    strategy: rawSource.strategy ?? rawSource.resolution?.strategy ?? 'branch-head',
    fallbackUsed: rawSource.fallbackUsed ?? false,
    resolved: normalizeResolvedFingerprint(rawSource.resolved ?? rawSource),
    refreshedAt: rawSource.refreshedAt ?? null
  };
}

export function normalizeUpstreamSource(name, rawSource = {}) {
  return {
    name,
    type: rawSource.type ?? 'git',
    url: rawSource.url,
    path: rawSource.path,
    overlayPath: rawSource.overlayPath ?? null,
    github: rawSource.github ?? null,
    resolution: normalizeResolution(rawSource)
  };
}

export async function loadUpstreamSourceConfig(rootDir = process.cwd()) {
  const configPath = resolveRootPath(rootDir, defaultSourceConfigPath);
  const document = await readJsonIfExists(configPath);

  if (!document || document.schemaVersion !== 2 || !document.sources || typeof document.sources !== 'object') {
    throw new Error('Invalid upstream source config.');
  }

  return {
    schemaVersion: document.schemaVersion,
    sources: Object.fromEntries(
      Object.entries(document.sources).map(([name, rawSource]) => [
        name,
        normalizeUpstreamSource(name, rawSource)
      ])
    )
  };
}

export function legacyHeadEntryToLockSource(name, entry) {
  return normalizeLockSource(name, {
    strategy: 'branch-head',
    fallbackUsed: false,
    resolved: {
      kind: 'branch-head',
      version: null,
      ref: 'HEAD',
      commitSha: entry.headSha
    },
    refreshedAt: entry.refreshedAt ?? null
  });
}

function normalizeSourceLock(document) {
  return {
    schemaVersion: 2,
    refreshedAt: document.refreshedAt ?? null,
    sources: Object.fromEntries(
      Object.entries(document.sources ?? {}).map(([name, rawSource]) => [
        name,
        normalizeLockSource(name, rawSource)
      ])
    )
  };
}

function normalizeLegacySourceHeads(document) {
  return {
    schemaVersion: 2,
    refreshedAt: document.refreshedAt ?? null,
    sources: Object.fromEntries(
      Object.entries(document.sources ?? {}).map(([name, entry]) => [
        name,
        legacyHeadEntryToLockSource(name, entry)
      ])
    )
  };
}

export async function loadSourceLock({ rootDir = process.cwd() } = {}) {
  const lockPath = resolveRootPath(rootDir, defaultSourceLockPath);
  const lockDocument = await readJsonIfExists(lockPath);
  if (lockDocument) {
    return normalizeSourceLock(lockDocument);
  }

  const legacyPath = resolveRootPath(rootDir, legacySourceHeadsPath);
  const legacyDocument = await readJsonIfExists(legacyPath);
  if (legacyDocument) {
    return normalizeLegacySourceHeads(legacyDocument);
  }

  return {
    schemaVersion: 2,
    refreshedAt: null,
    sources: {}
  };
}

export async function writeSourceLock(record, { rootDir = process.cwd() } = {}) {
  const lockPath = resolveRootPath(rootDir, defaultSourceLockPath);
  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(lockPath, `${JSON.stringify(normalizeSourceLock(record), null, 2)}\n`, 'utf8');
}

function compareResolvedSourceFingerprints(recordedSource, resolvedSource) {
  const recordedFingerprint = JSON.stringify(recordedSource?.resolved ?? null);
  const resolvedFingerprint = JSON.stringify(resolvedSource?.resolved ?? null);

  return recordedFingerprint === resolvedFingerprint;
}

export function compareResolvedFingerprints({ recordedLock, resolvedLock }) {
  const sourceNames = new Set([
    ...Object.keys(recordedLock?.sources ?? {}),
    ...Object.keys(resolvedLock?.sources ?? {})
  ]);
  const changedSources = [];

  for (const name of sourceNames) {
    if (!compareResolvedSourceFingerprints(recordedLock?.sources?.[name], resolvedLock?.sources?.[name])) {
      changedSources.push(name);
    }
  }

  return {
    status: changedSources.length === 0 ? 'no_changes' : 'changes_detected',
    changedSources
  };
}
