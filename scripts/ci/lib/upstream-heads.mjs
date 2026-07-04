import {
  compareResolvedFingerprints,
  defaultSourceConfigPath,
  defaultSourceLockPath,
  loadSourceLock,
  loadUpstreamSourceConfig,
  writeSourceLock
} from '../../../harness/installer/lib/upstream-config.mjs';
import { resolveSourceTarget } from './upstream-resolver.mjs';

export const defaultSourcesPath = defaultSourceConfigPath;
export const defaultSourceHeadsPath = 'harness/upstream/.source-heads.json';
export const defaultResolvedLockPath = defaultSourceLockPath;

export function normalizeUpstreamSources(sourcesDocument) {
  if (Array.isArray(sourcesDocument)) {
    return sourcesDocument;
  }

  return Object.values(sourcesDocument?.sources ?? {});
}

export async function loadUpstreamSources({
  cwd = process.cwd()
} = {}) {
  return loadUpstreamSourceConfig(cwd);
}

export async function loadRecordedSourceHeads({
  cwd = process.cwd()
} = {}) {
  return loadSourceLock({ rootDir: cwd });
}

export async function writeSourceHeadsRecord(record, {
  cwd = process.cwd()
} = {}) {
  return writeSourceLock(record, { rootDir: cwd });
}

export function buildSourceHeadsRecord(record) {
  return record;
}

export function buildSourceLockRecord(resolvedSources, { refreshedAt = null } = {}) {
  return {
    schemaVersion: 2,
    refreshedAt,
    sources: Object.fromEntries(
      resolvedSources.map((source) => [
        source.name,
        {
          strategy: source.strategy,
          fallbackUsed: source.fallbackUsed ?? false,
          resolved: {
            kind: source.resolved.kind,
            version: source.resolved.version ?? null,
            ref: source.resolved.ref,
            commitSha: source.resolved.commitSha
          },
          refreshedAt
        }
      ])
    )
  };
}

export function compareSourceHeads({ recordedHeads, resolvedLock }) {
  return compareResolvedFingerprints({
    recordedLock: recordedHeads,
    resolvedLock
  });
}

export function buildStrategySummary({ previousLock, resolvedLock, changedSources }) {
  return Object.fromEntries(
    changedSources.map((sourceName) => {
      const previousSource = previousLock?.sources?.[sourceName];
      const nextSource = resolvedLock?.sources?.[sourceName];

      return [
        sourceName,
        {
          strategy: nextSource?.strategy ?? previousSource?.strategy ?? null,
          previousVersion: previousSource?.resolved?.version ?? null,
          nextVersion: nextSource?.resolved?.version ?? null,
          previousCommitSha: previousSource?.resolved?.commitSha ?? null,
          nextCommitSha: nextSource?.resolved?.commitSha ?? null,
          fallbackUsed: nextSource?.fallbackUsed ?? false
        }
      ];
    })
  );
}

export function selectSourceLock(recordedLock, selectedSourceNames = []) {
  const allowedNames = new Set(selectedSourceNames);

  return {
    schemaVersion: recordedLock?.schemaVersion ?? 2,
    refreshedAt: recordedLock?.refreshedAt ?? null,
    sources: Object.fromEntries(
      Object.entries(recordedLock?.sources ?? {}).filter(([name]) => allowedNames.has(name))
    )
  };
}

export async function probeUpstreamHeads({
  cwd = process.cwd(),
  sources,
  recordedHeads,
  resolveSource = resolveSourceTarget
} = {}) {
  const normalizedSources = sources ?? await loadUpstreamSourceConfig(cwd);
  const configuredSources = normalizeUpstreamSources(normalizedSources)
    .filter((source) => (source.type ?? 'git') === 'git');
  const previousLock = recordedHeads ?? await loadSourceLock({ rootDir: cwd });
  const selectedSourceNames = configuredSources.map((source) => source.name);
  const selectedPreviousLock = selectSourceLock(previousLock, selectedSourceNames);
  const resolvedSources = [];

  for (const source of configuredSources) {
    resolvedSources.push(await resolveSource(source));
  }

  const resolvedLock = buildSourceLockRecord(resolvedSources);
  const comparison = compareResolvedFingerprints({
    recordedLock: selectedPreviousLock,
    resolvedLock
  });

  return {
    ...comparison,
    sources: configuredSources,
    sourceHeads: Object.fromEntries(
      resolvedSources.map((source) => [source.name, source.resolved.commitSha])
    ),
    previousLock: selectedPreviousLock,
    resolvedLock,
    strategySummary: buildStrategySummary({
      previousLock: selectedPreviousLock,
      resolvedLock,
      changedSources: comparison.changedSources
    }),
    shouldCreateBranch: comparison.status !== 'no_changes',
    shouldOpenPullRequest: comparison.status !== 'no_changes',
    shouldRunRefreshChain: comparison.status !== 'no_changes'
  };
}
