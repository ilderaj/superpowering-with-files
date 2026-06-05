#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  analyzeCloudDevSync,
  buildCloudDevCheckCommands,
  buildCloudDevFastForwardCommands,
  createCloudDevFailureResult,
  createCloudDevReport,
  createCloudDevResult,
  createSyncedCloudDevReport,
  formatCloudDevSyncReport,
  parseAheadBehindCount,
  resultPath,
  stagingBranch
} from './lib/cloud-dev-branch.mjs';

const execFileAsync = promisify(execFile);

function trimOutput(value) {
  return String(value ?? '').trim();
}

function isMissingRemoteRef(error, refName) {
  return trimOutput(error instanceof Error ? error.message : String(error)).includes(
    `couldn't find remote ref ${refName}`
  );
}

export function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

export async function runCommand(command, {
  cwd = process.cwd(),
  env = process.env
} = {}) {
  return execFileAsync(command.file, command.args ?? [], {
    cwd,
    env,
    shell: false,
    maxBuffer: 1024 * 1024
  });
}

async function defaultWriteResult(result, {
  cwd = process.cwd()
} = {}) {
  const targetPath = path.resolve(cwd, resultPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function parseOpenPullRequests(stdout) {
  let parsed;

  try {
    parsed = JSON.parse(stdout || '[]');
  } catch (error) {
    throw new Error(`Unable to parse gh pr list output: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    });
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Unable to parse gh pr list output: expected a JSON array');
  }

  return parsed;
}

async function readCloudDevBranchState({
  cwd,
  env,
  run,
  fetch = true,
  setFailureReason = () => {},
  failureReasons = {}
}) {
  const [fetchCommand, sourceHeadCommand, stagingHeadCommand, aheadBehindCommand] = buildCloudDevCheckCommands();
  const {
    fetch: fetchFailureReason = 'fetch_failed',
    sourceHead: sourceHeadFailureReason = 'source_head_read_failed',
    stagingHead: stagingHeadFailureReason = 'staging_head_read_failed',
    aheadBehind: aheadBehindFailureReason = 'ahead_behind_check_failed'
  } = failureReasons;

  if (fetch) {
    setFailureReason(fetchFailureReason);
    await run(fetchCommand, { cwd, env });
  }

  setFailureReason(sourceHeadFailureReason);
  const sourceHead = trimOutput((await run(sourceHeadCommand, { cwd, env })).stdout);
  setFailureReason(stagingHeadFailureReason);
  const stagingHead = trimOutput((await run(stagingHeadCommand, { cwd, env })).stdout);
  setFailureReason(aheadBehindFailureReason);
  const aheadBehind = parseAheadBehindCount((await run(aheadBehindCommand, { cwd, env })).stdout);

  return { sourceHead, stagingHead, aheadBehind };
}

export function getCloudDevExitCode({
  mode = 'check',
  result
} = {}) {
  if (result?.status === 'failed') {
    return 1;
  }

  if (mode === 'sync' && result?.status !== 'synced') {
    return 1;
  }

  return 0;
}

export async function runCloudDevBranchCheck({
  cwd = process.cwd(),
  env = process.env,
  mode = 'check',
  syncEnabled = env.CLOUD_DEV_SYNC_ENABLED === 'true',
  runCommand: run = runCommand,
  writeResult = defaultWriteResult
} = {}) {
  let failureReason = 'check_failed';
  let report;

  try {
    const initialState = await readCloudDevBranchState({
      cwd,
      env,
      run,
      fetch: true,
      setFailureReason: (value) => {
        failureReason = value;
      }
    });

    failureReason = 'pull_request_check_failed';
    const openPullRequestsTargetingCloudDev = parseOpenPullRequests((await run({
      file: 'gh',
      args: ['pr', 'list', '--base', stagingBranch, '--state', 'open', '--json', 'number', '--limit', '100']
    }, { cwd, env })).stdout).length;

    report = analyzeCloudDevSync({
      ...initialState,
      openPullRequestsTargetingCloudDev,
      syncEnabled,
      mode
    });

    let result = createCloudDevResult({
      status: report.canSync ? 'ready' : 'checked',
      report
    });

    if (report.canSync) {
      const [syncFetchCommand, pushCommand] = buildCloudDevFastForwardCommands();

      failureReason = 'sync_fetch_failed';
      await run(syncFetchCommand, { cwd, env });

      failureReason = 'push_failed';
      await run(pushCommand, { cwd, env });

      const syncedState = await readCloudDevBranchState({
        cwd,
        env,
        run,
        fetch: true,
        setFailureReason: (value) => {
          failureReason = value;
        },
        failureReasons: {
          fetch: 'post_sync_fetch_failed',
          sourceHead: 'post_sync_source_head_read_failed',
          stagingHead: 'post_sync_staging_head_read_failed',
          aheadBehind: 'post_sync_ahead_behind_check_failed'
        }
      });

      report = createSyncedCloudDevReport(report, syncedState);
      result = createCloudDevResult({
        status: 'synced',
        report
      });
    }

    await writeResult(result, { cwd });
    return result;
  } catch (error) {
    if (mode === 'check' && failureReason === 'fetch_failed' && isMissingRemoteRef(error, stagingBranch)) {
      const result = createCloudDevResult({
        status: 'checked',
        report: createCloudDevReport({
          mode,
          syncEnabled,
          canSync: false,
          reason: 'staging_branch_missing',
          details: trimOutput(error instanceof Error ? error.message : String(error))
        })
      });
      await writeResult(result, { cwd });
      return result;
    }

    const result = createCloudDevFailureResult({
      reason: failureReason,
      error,
      report,
      mode,
      syncEnabled
    });
    await writeResult(result, { cwd });
    return result;
  }
}

async function main() {
  const mode = readOption(process.argv.slice(2), 'mode', 'check');
  const result = await runCloudDevBranchCheck({ mode });
  process.stdout.write(result.text);
  process.exitCode = getCloudDevExitCode({ mode, result });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
