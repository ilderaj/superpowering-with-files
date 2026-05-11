import { test } from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  return import('../../scripts/ci/lib/cloud-dev-branch.mjs');
}

async function loadRunnerModule() {
  return import('../../scripts/ci/check-cloud-dev-branch.mjs');
}

test('cloud dev constants use origin dev as source and cloud-dev as staging branch', async () => {
  const { sourceBranch, sourceRef, stagingRef, stagingBranch, syncRange, resultPath } = await loadModule();

  assert.equal(sourceBranch, 'dev');
  assert.equal(sourceRef, 'refs/remotes/origin/dev');
  assert.equal(stagingRef, 'refs/remotes/origin/cloud-dev');
  assert.equal(stagingBranch, 'cloud-dev');
  assert.equal(syncRange, 'refs/remotes/origin/dev...refs/remotes/origin/cloud-dev');
  assert.equal(resultPath, '.harness/cloud-dev-sync-result.json');
});

test('buildCloudDevCheckCommands fetches exact branch refs only', async () => {
  const { buildCloudDevCheckCommands } = await loadModule();

  assert.deepEqual(buildCloudDevCheckCommands(), [
    { file: 'git', args: ['fetch', 'origin', 'dev', 'cloud-dev'] },
    { file: 'git', args: ['rev-parse', '--verify', 'refs/remotes/origin/dev'] },
    { file: 'git', args: ['rev-parse', '--verify', 'refs/remotes/origin/cloud-dev'] },
    { file: 'git', args: ['rev-list', '--left-right', '--count', 'refs/remotes/origin/dev...refs/remotes/origin/cloud-dev'] }
  ]);
});

test('parseAheadBehindCount parses source-only and staging-only counts', async () => {
  const { parseAheadBehindCount } = await loadModule();

  assert.deepEqual(parseAheadBehindCount('3\t0\n'), { sourceOnly: 3, stagingOnly: 0 });
  assert.deepEqual(parseAheadBehindCount('0 2'), { sourceOnly: 0, stagingOnly: 2 });
  assert.throws(() => parseAheadBehindCount('nope'), /Unable to parse ahead\/behind counts/);
});

test('buildCloudDevFastForwardCommands pushes origin dev to cloud-dev directly', async () => {
  const { buildCloudDevFastForwardCommands } = await loadModule();

  assert.deepEqual(buildCloudDevFastForwardCommands(), [
    { file: 'git', args: ['fetch', 'origin', 'dev', 'cloud-dev'] },
    { file: 'git', args: ['push', 'origin', 'refs/remotes/origin/dev:refs/heads/cloud-dev'] }
  ]);
});

test('analyzeCloudDevSync allows fast-forward when staging is strictly behind source', async () => {
  const { analyzeCloudDevSync } = await loadModule();

  const report = analyzeCloudDevSync({
    sourceHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    stagingHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    aheadBehind: { sourceOnly: 3, stagingOnly: 0 },
    openPullRequestsTargetingCloudDev: 0,
    syncEnabled: true,
    mode: 'sync'
  });

  assert.equal(report.canSync, true);
  assert.equal(report.reason, 'ready_to_fast_forward');
});

test('analyzeCloudDevSync blocks when cloud-dev has unpromoted commits', async () => {
  const { analyzeCloudDevSync } = await loadModule();

  const report = analyzeCloudDevSync({
    sourceHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    stagingHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    aheadBehind: { sourceOnly: 0, stagingOnly: 2 },
    openPullRequestsTargetingCloudDev: 0,
    syncEnabled: true,
    mode: 'sync'
  });

  assert.equal(report.canSync, false);
  assert.equal(report.reason, 'cloud_dev_ahead_of_origin_dev');
});

test('analyzeCloudDevSync blocks sync when open PRs target cloud-dev', async () => {
  const { analyzeCloudDevSync } = await loadModule();

  const report = analyzeCloudDevSync({
    sourceHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    stagingHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    aheadBehind: { sourceOnly: 1, stagingOnly: 0 },
    openPullRequestsTargetingCloudDev: 1,
    syncEnabled: true,
    mode: 'sync'
  });

  assert.equal(report.canSync, false);
  assert.equal(report.reason, 'open_cloud_dev_prs');
});

test('formatCloudDevSyncReport includes reason and ahead/behind details', async () => {
  const { analyzeCloudDevSync, formatCloudDevSyncReport, syncRange } = await loadModule();

  const report = analyzeCloudDevSync({
    sourceHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    stagingHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    aheadBehind: { sourceOnly: 0, stagingOnly: 0 },
    openPullRequestsTargetingCloudDev: 0,
    syncEnabled: false,
    mode: 'check'
  });

  assert.equal(report.canSync, false);
  assert.equal(report.reason, 'check_only');

  const formatted = formatCloudDevSyncReport(report);
  assert.match(formatted, /Cloud dev sync report/);
  assert.ok(formatted.split('\n').includes(`Ahead/behind ${syncRange}: 0/0`));
  assert.match(formatted, /Reason: check_only/);
});

test('analyzeCloudDevSync reports sync_disabled when sync mode is requested but disabled', async () => {
  const { analyzeCloudDevSync } = await loadModule();

  const report = analyzeCloudDevSync({
    aheadBehind: { sourceOnly: 3, stagingOnly: 0 },
    openPullRequestsTargetingCloudDev: 0,
    syncEnabled: false,
    mode: 'sync'
  });

  assert.equal(report.canSync, false);
  assert.equal(report.reason, 'sync_disabled');
});

test('analyzeCloudDevSync reports already_up_to_date when refs match', async () => {
  const { analyzeCloudDevSync } = await loadModule();

  const report = analyzeCloudDevSync({
    aheadBehind: { sourceOnly: 0, stagingOnly: 0 },
    openPullRequestsTargetingCloudDev: 0,
    syncEnabled: true,
    mode: 'sync'
  });

  assert.equal(report.canSync, false);
  assert.equal(report.reason, 'already_up_to_date');
});

test('analyzeCloudDevSync reports branches_diverged when both refs have unique commits', async () => {
  const { analyzeCloudDevSync } = await loadModule();

  const report = analyzeCloudDevSync({
    aheadBehind: { sourceOnly: 1, stagingOnly: 1 },
    openPullRequestsTargetingCloudDev: 0,
    syncEnabled: true,
    mode: 'sync'
  });

  assert.equal(report.canSync, false);
  assert.equal(report.reason, 'branches_diverged');
});

test('runCloudDevBranchCheck writes blocked check-only result without pushing', async () => {
  const { runCloudDevBranchCheck } = await loadRunnerModule();
  const commands = [];
  const writtenResults = [];
  const sourceHead = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const stagingHead = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  const result = await runCloudDevBranchCheck({
    cwd: '/repo/SuperpoweringWithFiles',
    mode: 'check',
    syncEnabled: false,
    runCommand: async (command) => {
      commands.push([command.file, ...(command.args ?? [])].join(' '));

      if (command.args.join(' ') === 'fetch origin dev cloud-dev') return { stdout: '', stderr: '' };
      if (command.args.join(' ') === 'rev-parse --verify refs/remotes/origin/dev') return { stdout: `${sourceHead}\n`, stderr: '' };
      if (command.args.join(' ') === 'rev-parse --verify refs/remotes/origin/cloud-dev') return { stdout: `${stagingHead}\n`, stderr: '' };
      if (command.args.join(' ') === 'rev-list --left-right --count refs/remotes/origin/dev...refs/remotes/origin/cloud-dev') return { stdout: '1\t0\n', stderr: '' };
      if (command.args.join(' ') === 'pr list --base cloud-dev --state open --json number --limit 100') return { stdout: '[]\n', stderr: '' };

      throw new Error(`Unexpected command: ${[command.file, ...(command.args ?? [])].join(' ')}`);
    },
    writeResult: async (value) => {
      writtenResults.push(value);
    }
  });

  assert.equal(result.status, 'checked');
  assert.equal(result.report.reason, 'check_only');
  assert.equal(writtenResults.length, 1);
  assert.equal(writtenResults[0].status, 'checked');
  assert.equal(writtenResults[0].report.reason, 'check_only');
  assert.equal(commands.some((command) => command.includes('git push origin refs/remotes/origin/dev:refs/heads/cloud-dev')), false);
});

test('runCloudDevBranchCheck reports a missing cloud-dev branch as a checked bootstrap prerequisite', async () => {
  const { runCloudDevBranchCheck } = await loadRunnerModule();
  const writtenResults = [];

  const result = await runCloudDevBranchCheck({
    cwd: '/repo/SuperpoweringWithFiles',
    mode: 'check',
    syncEnabled: false,
    runCommand: async (command) => {
      if (command.args.join(' ') === 'fetch origin dev cloud-dev') {
        throw new Error("Command failed: git fetch origin dev cloud-dev\nfatal: couldn't find remote ref cloud-dev");
      }

      throw new Error(`Unexpected command: ${[command.file, ...(command.args ?? [])].join(' ')}`);
    },
    writeResult: async (value) => {
      writtenResults.push(value);
    }
  });

  assert.equal(result.status, 'checked');
  assert.equal(result.report.reason, 'staging_branch_missing');
  assert.match(result.report.details, /couldn't find remote ref cloud-dev/);
  assert.equal(writtenResults.length, 1);
  assert.equal(writtenResults[0].status, 'checked');
  assert.equal(writtenResults[0].report.reason, 'staging_branch_missing');
});

test('getCloudDevExitCode fails check mode when the result failed', async () => {
  const { getCloudDevExitCode } = await loadRunnerModule();

  assert.equal(getCloudDevExitCode({
    mode: 'check',
    result: { status: 'failed' }
  }), 1);
});

test('getCloudDevExitCode fails sync mode when the result failed', async () => {
  const { getCloudDevExitCode } = await loadRunnerModule();

  assert.equal(getCloudDevExitCode({
    mode: 'sync',
    result: { status: 'failed' }
  }), 1);
});

test('getCloudDevExitCode keeps successful check mode results green', async () => {
  const { getCloudDevExitCode } = await loadRunnerModule();

  assert.equal(getCloudDevExitCode({
    mode: 'check',
    result: { status: 'checked' }
  }), 0);
});

test('runCloudDevBranchCheck pushes cloud-dev only during enabled sync fast-forward', async () => {
  const { runCloudDevBranchCheck } = await loadRunnerModule();
  const commands = [];
  const writtenResults = [];

  const result = await runCloudDevBranchCheck({
    cwd: '/repo/SuperpoweringWithFiles',
    mode: 'sync',
    syncEnabled: true,
    runCommand: async (command) => {
      commands.push([command.file, ...(command.args ?? [])].join(' '));

      if (command.args.join(' ') === 'fetch origin dev cloud-dev') return { stdout: '', stderr: '' };
      if (command.args.join(' ') === 'rev-parse --verify refs/remotes/origin/dev') return { stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', stderr: '' };
      if (command.args.join(' ') === 'rev-parse --verify refs/remotes/origin/cloud-dev') return { stdout: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n', stderr: '' };
      if (command.args.join(' ') === 'rev-list --left-right --count refs/remotes/origin/dev...refs/remotes/origin/cloud-dev') return { stdout: '1\t0\n', stderr: '' };
      if (command.args.join(' ') === 'pr list --base cloud-dev --state open --json number --limit 100') return { stdout: '[]\n', stderr: '' };
      if (command.args.join(' ') === 'push origin refs/remotes/origin/dev:refs/heads/cloud-dev') return { stdout: 'updated\n', stderr: '' };

      throw new Error(`Unexpected command: ${[command.file, ...(command.args ?? [])].join(' ')}`);
    },
    writeResult: async (value) => {
      writtenResults.push(value);
    }
  });

  assert.equal(result.status, 'synced');
  assert.equal(result.report.reason, 'synced');
  assert.match(result.text, /Reason: synced/);
  assert.equal(writtenResults.length, 1);
  assert.equal(writtenResults[0].status, 'synced');
  assert.equal(writtenResults[0].report.reason, 'synced');
  assert.equal(commands.filter((command) => command === 'git push origin refs/remotes/origin/dev:refs/heads/cloud-dev').length, 1);
});

test('runCloudDevBranchCheck records post-push refs after the sync fetch updates origin dev', async () => {
  const { runCloudDevBranchCheck } = await loadRunnerModule();
  const commands = [];
  const writtenResults = [];
  let devRevParseCount = 0;
  let cloudDevRevParseCount = 0;
  let aheadBehindCount = 0;

  const result = await runCloudDevBranchCheck({
    cwd: '/repo/SuperpoweringWithFiles',
    mode: 'sync',
    syncEnabled: true,
    runCommand: async (command) => {
      const commandText = [command.file, ...(command.args ?? [])].join(' ');
      commands.push(commandText);

      if (command.args.join(' ') === 'fetch origin dev cloud-dev') return { stdout: '', stderr: '' };
      if (command.args.join(' ') === 'rev-parse --verify refs/remotes/origin/dev') {
        devRevParseCount += 1;
        return {
          stdout: `${devRevParseCount === 1
            ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
            : 'cccccccccccccccccccccccccccccccccccccccc'}\n`,
          stderr: ''
        };
      }
      if (command.args.join(' ') === 'rev-parse --verify refs/remotes/origin/cloud-dev') {
        cloudDevRevParseCount += 1;
        return {
          stdout: `${cloudDevRevParseCount === 1
            ? 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
            : 'cccccccccccccccccccccccccccccccccccccccc'}\n`,
          stderr: ''
        };
      }
      if (command.args.join(' ') === 'rev-list --left-right --count refs/remotes/origin/dev...refs/remotes/origin/cloud-dev') {
        aheadBehindCount += 1;
        return { stdout: aheadBehindCount === 1 ? '1\t0\n' : '0\t0\n', stderr: '' };
      }
      if (command.args.join(' ') === 'pr list --base cloud-dev --state open --json number --limit 100') return { stdout: '[]\n', stderr: '' };
      if (command.args.join(' ') === 'push origin refs/remotes/origin/dev:refs/heads/cloud-dev') return { stdout: 'updated\n', stderr: '' };

      throw new Error(`Unexpected command: ${commandText}`);
    },
    writeResult: async (value) => {
      writtenResults.push(value);
    }
  });

  assert.equal(result.status, 'synced');
  assert.equal(result.report.sourceHead, 'cccccccccccccccccccccccccccccccccccccccc');
  assert.equal(result.report.stagingHead, 'cccccccccccccccccccccccccccccccccccccccc');
  assert.deepEqual(result.report.aheadBehind, { sourceOnly: 0, stagingOnly: 0 });
  assert.equal(writtenResults[0].report.sourceHead, 'cccccccccccccccccccccccccccccccccccccccc');
  assert.equal(writtenResults[0].report.stagingHead, 'cccccccccccccccccccccccccccccccccccccccc');
  assert.equal(commands.filter((command) => command === 'git fetch origin dev cloud-dev').length, 3);
});

test('runCloudDevBranchCheck writes a failure result when sync push fails', async () => {
  const { runCloudDevBranchCheck } = await loadRunnerModule();
  const commands = [];
  const writtenResults = [];

  const result = await runCloudDevBranchCheck({
    cwd: '/repo/SuperpoweringWithFiles',
    mode: 'sync',
    syncEnabled: true,
    runCommand: async (command) => {
      commands.push([command.file, ...(command.args ?? [])].join(' '));

      if (command.args.join(' ') === 'fetch origin dev cloud-dev') return { stdout: '', stderr: '' };
      if (command.args.join(' ') === 'rev-parse --verify refs/remotes/origin/dev') return { stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', stderr: '' };
      if (command.args.join(' ') === 'rev-parse --verify refs/remotes/origin/cloud-dev') return { stdout: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n', stderr: '' };
      if (command.args.join(' ') === 'rev-list --left-right --count refs/remotes/origin/dev...refs/remotes/origin/cloud-dev') return { stdout: '1\t0\n', stderr: '' };
      if (command.args.join(' ') === 'pr list --base cloud-dev --state open --json number --limit 100') return { stdout: '[]\n', stderr: '' };
      if (command.args.join(' ') === 'push origin refs/remotes/origin/dev:refs/heads/cloud-dev') {
        throw new Error('push rejected');
      }

      throw new Error(`Unexpected command: ${[command.file, ...(command.args ?? [])].join(' ')}`);
    },
    writeResult: async (value) => {
      writtenResults.push(value);
    }
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.report.reason, 'push_failed');
  assert.match(result.report.details, /push rejected/);
  assert.match(result.text, /Reason: push_failed/);
  assert.equal(writtenResults.length, 1);
  assert.equal(writtenResults[0].status, 'failed');
  assert.equal(writtenResults[0].report.reason, 'push_failed');
  assert.equal(commands.filter((command) => command === 'git push origin refs/remotes/origin/dev:refs/heads/cloud-dev').length, 1);
});
