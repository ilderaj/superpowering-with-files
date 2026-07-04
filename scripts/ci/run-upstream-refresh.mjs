#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  probeUpstreamHeads
} from './lib/upstream-heads.mjs';
import { writeSourceLock as writeSourceLockDefault } from '../../harness/installer/lib/upstream-config.mjs';
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

export async function runUpstreamRefresh({
  cwd = process.cwd(),
  now = () => new Date(),
  probeHeads = probeUpstreamHeads,
  loadBaseHealth: checkBaseHealth = ({ cwd, branch }) => loadBaseHealthDefault({ cwd, branch }),
  runRefresh = runRefreshCommandChain,
  captureChanges = captureChangedFiles,
  filterChanges = filterEligibleChanges,
  listTransientRuntimeArtifacts = listTransientRuntimeArtifactsDefault,
  listRepoLocalEntryChanges = listRepoLocalEntryFileChanges,
  cleanupRuntimeArtifacts = cleanupRuntimeArtifactsDefault,
  restoreRepoLocalEntries = restoreRepoLocalEntryFiles,
  writeSourceLock = (record, { cwd }) => writeSourceLockDefault(record, { rootDir: cwd }),
  runOverrides = { active: false },
  writeResult = writeRefreshResult
} = {}) {
  let probeResult = { sourceHeads: {}, previousLock: { sources: {} }, resolvedLock: { sources: {} }, strategySummary: {}, changedSources: [] };
  let eligibleFiles = [];
  let shouldCaptureFailureChanges = false;
  let changedFilesCaptured = false;

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
    probeResult = await probeHeads({ cwd });

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

    shouldCaptureFailureChanges = true;
    await runRefresh({ cwd });

    let lockPersistence = 'skipped_due_to_run_override';
    if (!runOverrides.active) {
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

    if (shouldCaptureFailureChanges && !changedFilesCaptured) {
      try {
        const effectiveChangedFiles = await captureChangesForAllowlist();
        const filteredChanges = filterChanges(effectiveChangedFiles);
        eligibleFiles = filteredChanges.eligibleFiles;

        if ((filteredChanges.excludedFiles ?? []).length > 0) {
          resultError = new Error(`${error instanceof Error ? error.message : String(error)}\n\n${createAllowlistViolationError(filteredChanges.excludedFiles).message}`, {
            cause: error
          });
        }
      } catch (captureError) {
        resultError = new Error(`${error instanceof Error ? error.message : String(error)}\n\nUnable to capture changed files after failure: ${captureError instanceof Error ? captureError.message : String(captureError)}`, {
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
