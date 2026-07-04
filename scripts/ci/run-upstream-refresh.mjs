#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  probeUpstreamHeads
} from './lib/upstream-heads.mjs';
import {
  loadSourceLock,
  loadUpstreamSourceConfig,
  writeSourceLock as writeSourceLockDefault
} from '../../harness/installer/lib/upstream-config.mjs';
import {
  captureChangedFiles,
  cleanupRuntimeArtifacts as cleanupRuntimeArtifactsDefault,
  createAllowlistViolationError,
  createFailureRefreshResult,
  createRefreshResult,
  filterEligibleChanges,
  listTransientRuntimeArtifacts as listTransientRuntimeArtifactsDefault,
  listRepoLocalEntryFileChanges,
  restoreRepoLocalEntryFiles,
  runRefreshCommandChain,
  UpstreamRefreshBlockedError,
  writeRefreshResult
} from './lib/upstream-refresh.mjs';
import {
  createBaseHealthBlockedError,
  loadBaseHealth as loadBaseHealthDefault
} from './lib/upstream-base-health.mjs';

function parseWorkflowInputBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return defaultValue;
}

function parseSourceFilterInput(value) {
  if (typeof value !== 'string') return [];

  const normalized = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (normalized.length === 0 || (normalized.length === 1 && normalized[0] === 'all')) {
    return [];
  }

  return normalized;
}

function applyDispatchOverridesToSources(sourceConfig, {
  sourceFilter = [],
  strategyOverride = '',
  allowPrerelease = false
} = {}) {
  const configuredSources = sourceConfig?.sources ?? {};
  const selectedSourceNames = sourceFilter.length > 0
    ? sourceFilter
    : Object.keys(configuredSources);
  const unknownSources = selectedSourceNames.filter((name) => !(name in configuredSources));

  if (unknownSources.length > 0) {
    throw new Error(`Unknown upstream source filter: ${unknownSources.join(', ')}`);
  }

  return {
    schemaVersion: sourceConfig?.schemaVersion ?? 2,
    sources: Object.fromEntries(
      selectedSourceNames.map((name) => {
        const source = configuredSources[name];
        return [
          name,
          {
            ...source,
            resolution: {
              ...source.resolution,
              ...(strategyOverride ? { strategy: strategyOverride } : {}),
              ...(allowPrerelease ? { allowPrerelease: true } : {})
            }
          }
        ];
      })
    )
  };
}

function createWritableSourceLock(record) {
  return {
    schemaVersion: 2,
    refreshedAt: record?.refreshedAt ?? null,
    sources: record?.sources ?? {}
  };
}

function resolveExecutionSourceFilter(sourceFilter) {
  if (typeof sourceFilter === 'string') {
    return sourceFilter || null;
  }

  if (!Array.isArray(sourceFilter) || sourceFilter.length === 0) {
    return null;
  }

  if (sourceFilter.length > 1) {
    throw new Error('workflow_dispatch source_filter must resolve to a single source or "all".');
  }

  return sourceFilter[0];
}

async function loadWorkflowDispatchRunContext({
  cwd,
  env,
  readEventFile,
  loadSourceConfig
}) {
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    return {
      sources: undefined,
      runOverrides: { active: false }
    };
  }

  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error('workflow_dispatch run requires GITHUB_EVENT_PATH.');
  }

  const payload = JSON.parse(await readEventFile(eventPath, 'utf8'));
  const inputs = payload?.inputs ?? {};
  const sourceFilter = parseSourceFilterInput(inputs.source_filter);
  const strategyOverride = typeof inputs.strategy_override === 'string'
    ? inputs.strategy_override.trim()
    : '';
  const allowPrerelease = parseWorkflowInputBoolean(inputs.allow_prerelease, false);
  const dryRun = parseWorkflowInputBoolean(inputs.dry_run, false);
  const hasSourceOverrides = sourceFilter.length > 0 || Boolean(strategyOverride) || allowPrerelease;

  return {
    sources: hasSourceOverrides
      ? applyDispatchOverridesToSources(await loadSourceConfig(cwd), {
          sourceFilter,
          strategyOverride,
          allowPrerelease
        })
      : undefined,
    runOverrides: {
      active: hasSourceOverrides || dryRun,
      sourceFilter,
      strategyOverride: strategyOverride || null,
      allowPrerelease,
      dryRun
    }
  };
}

export async function runUpstreamRefresh({
  cwd = process.cwd(),
  env = process.env,
  now = () => new Date(),
  probeHeads = probeUpstreamHeads,
  readEventFile = readFile,
  loadSourceConfig = (rootDir) => loadUpstreamSourceConfig(rootDir),
  loadAuthoritativeLock = ({ cwd }) => loadSourceLock({ rootDir: cwd }),
  loadBaseHealth: checkBaseHealth = ({ cwd, branch }) => loadBaseHealthDefault({ cwd, branch }),
  runRefresh = runRefreshCommandChain,
  captureChanges = captureChangedFiles,
  filterChanges = filterEligibleChanges,
  listTransientRuntimeArtifacts = listTransientRuntimeArtifactsDefault,
  listRepoLocalEntryChanges = listRepoLocalEntryFileChanges,
  cleanupRuntimeArtifacts = cleanupRuntimeArtifactsDefault,
  restoreRepoLocalEntries = restoreRepoLocalEntryFiles,
  writeSourceLock = (record, { cwd }) => writeSourceLockDefault(record, { rootDir: cwd }),
  runOverrides = null,
  writeResult = writeRefreshResult
} = {}) {
  let probeResult = { sourceHeads: {}, previousLock: { sources: {} }, resolvedLock: { sources: {} }, strategySummary: {}, changedSources: [] };
  let eligibleFiles = [];
  let shouldCaptureFailureChanges = false;
  let changedFilesCaptured = false;
  let stagedRunLock = false;
  let authoritativeLock = { schemaVersion: 2, refreshedAt: null, sources: {} };
  const workflowDispatchContext = await loadWorkflowDispatchRunContext({
    cwd,
    env,
    readEventFile,
    loadSourceConfig
  });
  const effectiveRunOverrides = runOverrides ?? workflowDispatchContext.runOverrides;
  const executionSourceFilter = resolveExecutionSourceFilter(effectiveRunOverrides.sourceFilter);

  async function captureChangesForAllowlist() {
    const changedFiles = await captureChanges({ cwd });
    const repoLocalEntryChanges = listRepoLocalEntryChanges(changedFiles);

    if (repoLocalEntryChanges.length > 0) {
      await restoreRepoLocalEntries(repoLocalEntryChanges, { cwd });
    }

    const effectiveChangedFiles = repoLocalEntryChanges.length > 0
      ? await captureChanges({ cwd })
      : changedFiles;
    const transientRuntimeArtifacts = listTransientRuntimeArtifacts(effectiveChangedFiles);

    if (transientRuntimeArtifacts.length > 0) {
      await cleanupRuntimeArtifacts(transientRuntimeArtifacts, { cwd });
      return captureChanges({ cwd });
    }

    return effectiveChangedFiles;
  }

  try {
    probeResult = await probeHeads({
      cwd,
      ...(workflowDispatchContext.sources ? { sources: workflowDispatchContext.sources } : {})
    });

    if (probeResult.status === 'no_changes') {
      const result = createRefreshResult({
        status: 'no_changes',
        sourceHeads: probeResult.sourceHeads,
        eligibleFiles: [],
        previousLock: probeResult.previousLock,
        resolvedLock: probeResult.resolvedLock,
        changedSources: probeResult.changedSources,
        strategySummary: probeResult.strategySummary,
        lockPersistence: 'not_needed'
      });
      await writeResult(result, { cwd });
      return result;
    }

    const baseHealth = await checkBaseHealth({ cwd, branch: 'dev' });
    if (baseHealth.status === 'blocked') {
      throw createBaseHealthBlockedError({
        branch: 'dev',
        targetSha: baseHealth.targetSha,
        reason: baseHealth.reason
      });
    }

    authoritativeLock = createWritableSourceLock(await loadAuthoritativeLock({ cwd }));
    shouldCaptureFailureChanges = true;
    await writeSourceLock(createWritableSourceLock(probeResult.resolvedLock), { cwd });
    stagedRunLock = true;
    await runRefresh({ cwd, sourceFilter: executionSourceFilter });

    if (effectiveRunOverrides.active) {
      await writeSourceLock(authoritativeLock, { cwd });
      stagedRunLock = false;
    }

    let lockPersistence = 'skipped_due_to_run_override';
    if (!effectiveRunOverrides.active) {
      const refreshedAt = now().toISOString();
      const lockRecord = {
        ...probeResult.resolvedLock,
        refreshedAt,
        sources: Object.fromEntries(
          Object.entries(probeResult.resolvedLock?.sources ?? {}).map(([name, source]) => [
            name,
            {
              ...source,
              refreshedAt
            }
          ])
        )
      };
      await writeSourceLock(lockRecord, { cwd });
      probeResult = {
        ...probeResult,
        resolvedLock: lockRecord
      };
      lockPersistence = 'written';
    }

    const effectiveChangedFiles = await captureChangesForAllowlist();
    changedFilesCaptured = true;
    const filteredChanges = filterChanges(effectiveChangedFiles);
    eligibleFiles = filteredChanges.eligibleFiles;

    if ((filteredChanges.excludedFiles ?? []).length > 0) {
      throw createAllowlistViolationError(filteredChanges.excludedFiles);
    }

    const result = createRefreshResult({
      status: 'success',
      sourceHeads: probeResult.sourceHeads,
      eligibleFiles,
      previousLock: probeResult.previousLock,
      resolvedLock: probeResult.resolvedLock,
      changedSources: probeResult.changedSources,
      strategySummary: probeResult.strategySummary,
      lockPersistence
    });
    await writeResult(result, { cwd });
    return result;
  } catch (error) {
      let resultError = error;

      if (stagedRunLock) {
        try {
          await writeSourceLock(authoritativeLock, { cwd });
          stagedRunLock = false;
        } catch (restoreError) {
          resultError = new Error(`${resultError instanceof Error ? resultError.message : String(resultError)}\n\nUnable to restore authoritative source lock after failure: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`, {
            cause: error
          });
        }
      }

    if (shouldCaptureFailureChanges && !changedFilesCaptured) {
      try {
        const effectiveChangedFiles = await captureChangesForAllowlist();
        const filteredChanges = filterChanges(effectiveChangedFiles);
        eligibleFiles = filteredChanges.eligibleFiles;

        if ((filteredChanges.excludedFiles ?? []).length > 0) {
          resultError = new Error(`${resultError instanceof Error ? resultError.message : String(resultError)}\n\n${createAllowlistViolationError(filteredChanges.excludedFiles).message}`, {
            cause: error
          });
        }
      } catch (captureError) {
        resultError = new Error(`${resultError instanceof Error ? resultError.message : String(resultError)}\n\nUnable to capture changed files after failure: ${captureError instanceof Error ? captureError.message : String(captureError)}`, {
          cause: error
        });
      }
    }

    const result = createFailureRefreshResult({
      error: resultError,
      sourceHeads: probeResult.sourceHeads,
      eligibleFiles,
      previousLock: probeResult.previousLock,
      resolvedLock: probeResult.resolvedLock,
      changedSources: probeResult.changedSources,
      strategySummary: probeResult.strategySummary
    });
    await writeResult(result, { cwd });
    throw new UpstreamRefreshBlockedError(result, { cause: error });
  }
}

async function main() {
  try {
    await runUpstreamRefresh();
  } catch (error) {
    if (!(error instanceof UpstreamRefreshBlockedError)) {
      throw error;
    }

    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
