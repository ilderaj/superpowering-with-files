#!/usr/bin/env node

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const defaultRepoRoot = path.resolve(scriptDirectory, '../..');

const unknownValue = 'unknown';
const localDevRef = 'refs/heads/dev';
const originDevRef = 'refs/remotes/origin/dev';
const devAheadBehindRange = `${localDevRef}...${originDevRef}`;

const recoverySuggestions = {
  ready_to_fast_forward: [
    'No manual recovery is required.'
  ],
  synced: [
    'No manual recovery is required.'
  ],
  current_repository_mismatch: [
    'Run this helper from the SuperpoweringWithFiles repository root.',
    'Confirm the checkout with: git rev-parse --show-toplevel'
  ],
  worktree_not_clean: [
    'Review local changes with: git status --short',
    'Commit, move, or discard local changes before rerunning this helper.'
  ],
  local_dev_missing: [
    'Create or restore local dev from the remote branch: git checkout -b dev origin/dev',
    'Rerun the helper after local dev exists.'
  ],
  origin_dev_missing: [
    'Refresh remote refs with: git fetch origin dev',
    `Confirm the remote branch exists with: git rev-parse --verify ${originDevRef}`
  ],
  local_dev_ahead_of_origin_dev: [
    `Inspect local-only commits with: git log --oneline ${originDevRef}..${localDevRef}`,
    'Decide manually whether to merge, cherry-pick, or reset local dev.'
  ],
  fast_forward_not_available: [
    `Inspect divergence with: git log --oneline --left-right ${devAheadBehindRange}`,
    'Resolve the branch state manually; this helper will not rebase or resolve conflicts.'
  ],
  fetch_origin_dev_failed: [
    'Check network access and the origin remote with: git remote -v',
    'Retry the fetch manually with: git fetch origin dev'
  ],
  checkout_dev_failed: [
    'Inspect checkout failure details above.',
    'Resolve the local branch state manually before rerunning this helper.'
  ],
  fast_forward_merge_failed: [
    `Inspect divergence with: git log --oneline --left-right ${devAheadBehindRange}`,
    'Resolve conflicts manually; this helper will not stash, rebase, or auto-resolve.'
  ],
  preflight_command_failed: [
    'Inspect the failed command above.',
    'Fix the local repository state manually before rerunning this helper.'
  ]
};

export function buildLocalDevSyncCommandPlan() {
  return [
    { file: 'git', args: ['fetch', 'origin', 'dev'] },
    { file: 'git', args: ['checkout', 'dev'] },
    { file: 'git', args: ['merge', '--ff-only', 'origin/dev'] }
  ];
}


function quoteCommandPart(value) {
  const part = String(value);
  if (part.length === 0) return "''";
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(part)) return part;
  return `'${part.replaceAll("'", "'\\''")}'`;
}

export function formatCommand(command) {
  return [command.file, ...(command.args ?? [])].map(quoteCommandPart).join(' ');
}

function trimOutput(value) {
  return String(value ?? '').trim();
}

function normalizePath(filePath) {
  return path.resolve(String(filePath)).replaceAll('\\', '/');
}

function isCleanWorktree(statusOutput) {
  return trimOutput(statusOutput).length === 0;
}

export function parseAheadBehindCount(output) {
  const match = trimOutput(output).match(/^(\d+)\s+(\d+)$/);

  if (!match) {
    throw new Error(`Unable to parse ahead/behind counts: ${output}`);
  }

  return {
    ahead: Number(match[1]),
    behind: Number(match[2])
  };
}

function makePreflightReport({
  canSync,
  reason,
  currentBranch = unknownValue,
  localHead = unknownValue,
  originDevHead = unknownValue,
  repoRoot = unknownValue,
  expectedRepoRoot = unknownValue,
  aheadBehind = { ahead: 0, behind: 0 },
  details = ''
}) {
  return {
    canSync,
    reason,
    currentBranch: currentBranch || '(detached)',
    localHead: localHead || unknownValue,
    originDevHead: originDevHead || unknownValue,
    repoRoot: repoRoot || unknownValue,
    expectedRepoRoot: expectedRepoRoot || unknownValue,
    aheadBehind,
    details,
    recoverySuggestions: recoverySuggestions[reason] ?? recoverySuggestions.preflight_command_failed
  };
}

export function analyzeLocalDevPreflight({
  expectedRepoRoot,
  repoRoot,
  currentBranch,
  worktreeStatus,
  localHead,
  originDevHead,
  localDevExists,
  originDevExists,
  aheadBehind,
  details = ''
} = {}) {
  const ahead = aheadBehind?.ahead ?? 0;
  const behind = aheadBehind?.behind ?? 0;
  const baseReport = {
    currentBranch,
    localHead,
    originDevHead,
    repoRoot,
    expectedRepoRoot,
    aheadBehind,
    details
  };

  if (normalizePath(repoRoot || '.') !== normalizePath(expectedRepoRoot || '.')) {
    return makePreflightReport({
      ...baseReport,
      canSync: false,
      reason: 'current_repository_mismatch'
    });
  }

  if (!isCleanWorktree(worktreeStatus)) {
    return makePreflightReport({
      ...baseReport,
      canSync: false,
      reason: 'worktree_not_clean',
      details: trimOutput(worktreeStatus)
    });
  }

  if (!localDevExists) {
    return makePreflightReport({
      ...baseReport,
      canSync: false,
      reason: 'local_dev_missing'
    });
  }

  if (!originDevExists) {
    return makePreflightReport({
      ...baseReport,
      canSync: false,
      reason: 'origin_dev_missing'
    });
  }

  if (ahead > 0 && behind > 0) {
    return makePreflightReport({
      ...baseReport,
      canSync: false,
      reason: 'fast_forward_not_available'
    });
  }

  if (ahead > 0) {
    return makePreflightReport({
      ...baseReport,
      canSync: false,
      reason: 'local_dev_ahead_of_origin_dev'
    });
  }

  if (ahead < 0 || behind < 0) {
    return makePreflightReport({
      ...baseReport,
      canSync: false,
      reason: 'fast_forward_not_available'
    });
  }

  return makePreflightReport({
    ...baseReport,
    canSync: true,
    reason: 'ready_to_fast_forward'
  });
}

export function formatLocalDevSyncReport(report) {
  const suggestions = report.recoverySuggestions?.length > 0
    ? report.recoverySuggestions
    : recoverySuggestions[report.reason] ?? recoverySuggestions.preflight_command_failed;

  const lines = [
    'Local dev sync report',
    `Current branch: ${report.currentBranch ?? unknownValue}`,
    `Local HEAD: ${report.localHead ?? unknownValue}`,
    `origin/dev HEAD: ${report.originDevHead ?? unknownValue}`,
    `Reason sync stopped: ${report.reason ?? unknownValue}`
  ];

  if (report.aheadBehind) {
    lines.push(`Ahead/behind ${devAheadBehindRange}: ${report.aheadBehind.ahead}/${report.aheadBehind.behind}`);
  }

  if (report.details) {
    lines.push(`Details: ${report.details}`);
  }

  lines.push('Manual recovery suggestions:');
  for (const suggestion of suggestions) {
    lines.push(`- ${suggestion}`);
  }

  return `${lines.join('\n')}\n`;
}

function createCommandError({ command, error, stdout = '', stderr = '' }) {
  const wrapped = new Error(`Command failed: ${formatCommand(command)}${error?.message ? `\n${error.message}` : ''}`);
  wrapped.command = formatCommand(command);
  wrapped.stdout = stdout || error?.stdout || '';
  wrapped.stderr = stderr || error?.stderr || '';
  wrapped.cause = error;
  return wrapped;
}

export async function runCommand(command, {
  cwd = process.cwd(),
  env = process.env,
  execFileImpl = execFile
} = {}) {
  return new Promise((resolve, reject) => {
    execFileImpl(command.file, command.args ?? [], {
      cwd,
      env,
      shell: false,
      maxBuffer: 1024 * 1024
    }, (error, stdout = '', stderr = '') => {
      if (error) {
        reject(createCommandError({ command, error, stdout, stderr }));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function runGit(commandArgs, options) {
  return options.runCommand({ file: 'git', args: commandArgs }, options);
}

async function commandSucceeds(commandArgs, options) {
  try {
    const result = await runGit(commandArgs, options);
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, error };
  }
}

function commandFailureReport(reason, error, partialReport) {
  return makePreflightReport({
    ...partialReport,
    canSync: false,
    reason,
    details: error instanceof Error ? error.message : String(error)
  });
}

async function collectPreflight(options) {
  const partialReport = {
    currentBranch: unknownValue,
    localHead: unknownValue,
    originDevHead: unknownValue,
    repoRoot: unknownValue,
    expectedRepoRoot: options.expectedRepoRoot,
    aheadBehind: { ahead: 0, behind: 0 }
  };

  let repoRoot;
  let currentBranch;
  let worktreeStatus;
  let localDev;
  let originDev;
  let aheadBehind;

  try {
    repoRoot = trimOutput((await runGit(['rev-parse', '--show-toplevel'], options)).stdout);
    partialReport.repoRoot = repoRoot;

    currentBranch = trimOutput((await runGit(['branch', '--show-current'], options)).stdout);
    partialReport.currentBranch = currentBranch || '(detached)';

    worktreeStatus = (await runGit(['status', '--porcelain'], options)).stdout;
  } catch (error) {
    return commandFailureReport('preflight_command_failed', error, partialReport);
  }

  const earlyReport = analyzeLocalDevPreflight({
    expectedRepoRoot: options.expectedRepoRoot,
    repoRoot,
    currentBranch,
    worktreeStatus,
    localHead: unknownValue,
    originDevHead: unknownValue,
    localDevExists: true,
    originDevExists: true,
    aheadBehind: { ahead: 0, behind: 0 }
  });

  if (!earlyReport.canSync && ['current_repository_mismatch', 'worktree_not_clean'].includes(earlyReport.reason)) {
    return earlyReport;
  }

  localDev = await commandSucceeds(['rev-parse', '--verify', localDevRef], options);
  partialReport.localHead = localDev.ok ? trimOutput(localDev.stdout) : unknownValue;

  if (!localDev.ok) {
    return analyzeLocalDevPreflight({
      expectedRepoRoot: options.expectedRepoRoot,
      repoRoot,
      currentBranch,
      worktreeStatus,
      localHead: unknownValue,
      originDevHead: unknownValue,
      localDevExists: false,
      originDevExists: true,
      aheadBehind: { ahead: 0, behind: 0 },
      details: localDev.error.message
    });
  }

  originDev = await commandSucceeds(['rev-parse', '--verify', originDevRef], options);
  partialReport.originDevHead = originDev.ok ? trimOutput(originDev.stdout) : unknownValue;

  if (!originDev.ok) {
    return analyzeLocalDevPreflight({
      expectedRepoRoot: options.expectedRepoRoot,
      repoRoot,
      currentBranch,
      worktreeStatus,
      localHead: trimOutput(localDev.stdout),
      originDevHead: unknownValue,
      localDevExists: true,
      originDevExists: false,
      aheadBehind: { ahead: 0, behind: 0 },
      details: originDev.error.message
    });
  }

  try {
    aheadBehind = parseAheadBehindCount((await runGit(['rev-list', '--left-right', '--count', devAheadBehindRange], options)).stdout);
  } catch (error) {
    return commandFailureReport('preflight_command_failed', error, partialReport);
  }

  return analyzeLocalDevPreflight({
    expectedRepoRoot: options.expectedRepoRoot,
    repoRoot,
    currentBranch,
    worktreeStatus,
    localHead: trimOutput(localDev.stdout),
    originDevHead: trimOutput(originDev.stdout),
    localDevExists: true,
    originDevExists: true,
    aheadBehind
  });
}

function writeReport(stream, report) {
  stream.write(formatLocalDevSyncReport(report));
}

export async function runLocalDevSync({
  cwd = defaultRepoRoot,
  expectedRepoRoot = defaultRepoRoot,
  env = process.env,
  runCommand: commandRunner = runCommand,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  const commandOptions = {
    cwd,
    env,
    runCommand: commandRunner
  };

  const report = await collectPreflight({
    ...commandOptions,
    expectedRepoRoot
  });

  if (!report.canSync) {
    writeReport(stderr, report);
    return {
      status: 'blocked',
      report
    };
  }

  const [fetchCommand, checkoutCommand, mergeCommand] = buildLocalDevSyncCommandPlan();

  try {
    await commandRunner(fetchCommand, commandOptions);
  } catch (error) {
    const blockedReport = commandFailureReport('fetch_origin_dev_failed', error, report);
    writeReport(stderr, blockedReport);
    return { status: 'blocked', report: blockedReport };
  }

  try {
    await commandRunner(checkoutCommand, commandOptions);
  } catch (error) {
    const blockedReport = commandFailureReport('checkout_dev_failed', error, report);
    writeReport(stderr, blockedReport);
    return { status: 'blocked', report: blockedReport };
  }

  try {
    await commandRunner(mergeCommand, commandOptions);
  } catch (error) {
    const blockedReport = commandFailureReport('fast_forward_merge_failed', error, report);
    writeReport(stderr, blockedReport);
    return { status: 'blocked', report: blockedReport };
  }

  const syncedReport = {
    ...report,
    reason: 'synced',
    recoverySuggestions: recoverySuggestions.synced
  };
  writeReport(stdout, syncedReport);

  return {
    status: 'synced',
    report: syncedReport
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runLocalDevSync();
    process.exitCode = result.status === 'synced' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
