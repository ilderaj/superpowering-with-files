export const sourceBranch = 'dev';
export const stagingBranch = 'cloud-dev';
export const sourceRef = `refs/remotes/origin/${sourceBranch}`;
export const stagingRef = `refs/remotes/origin/${stagingBranch}`;
export const syncRange = `${sourceRef}...${stagingRef}`;
export const resultPath = '.harness/cloud-dev-sync-result.json';

function formatDetails(error) {
  return error instanceof Error ? error.message : String(error);
}

export function parseAheadBehindCount(output) {
  const match = String(output ?? '').trim().match(/^(\d+)\s+(\d+)$/);

  if (!match) {
    throw new Error(`Unable to parse ahead/behind counts: ${output}`);
  }

  return {
    sourceOnly: Number(match[1]),
    stagingOnly: Number(match[2])
  };
}

export function buildCloudDevCheckCommands() {
  return [
    { file: 'git', args: ['fetch', 'origin', sourceBranch, stagingBranch] },
    { file: 'git', args: ['rev-parse', '--verify', sourceRef] },
    { file: 'git', args: ['rev-parse', '--verify', stagingRef] },
    { file: 'git', args: ['rev-list', '--left-right', '--count', syncRange] }
  ];
}

export function buildCloudDevFastForwardCommands() {
  return [
    { file: 'git', args: ['fetch', 'origin', sourceBranch, stagingBranch] },
    { file: 'git', args: ['push', 'origin', `${sourceRef}:refs/heads/${stagingBranch}`] }
  ];
}

export function createCloudDevReport({
  sourceHead = 'unknown',
  stagingHead = 'unknown',
  aheadBehind = { sourceOnly: 0, stagingOnly: 0 },
  openPullRequestsTargetingCloudDev = 0,
  syncEnabled = false,
  mode = 'check',
  canSync = false,
  reason = 'check_only',
  details = ''
} = {}) {
  return {
    sourceBranch,
    stagingBranch,
    sourceHead,
    stagingHead,
    aheadBehind,
    openPullRequestsTargetingCloudDev,
    mode,
    syncEnabled,
    canSync,
    reason,
    details
  };
}

export function analyzeCloudDevSync(options = {}) {
  const report = createCloudDevReport(options);
  const {
    mode,
    syncEnabled,
    openPullRequestsTargetingCloudDev,
    aheadBehind
  } = report;

  if (mode !== 'sync') {
    return report;
  }

  if (!syncEnabled) {
    return { ...report, reason: 'sync_disabled' };
  }

  if (openPullRequestsTargetingCloudDev > 0) {
    return { ...report, reason: 'open_cloud_dev_prs' };
  }

  if (aheadBehind.sourceOnly > 0 && aheadBehind.stagingOnly === 0) {
    return { ...report, canSync: true, reason: 'ready_to_fast_forward' };
  }

  if (aheadBehind.sourceOnly === 0 && aheadBehind.stagingOnly === 0) {
    return { ...report, reason: 'already_up_to_date' };
  }

  if (aheadBehind.stagingOnly > 0 && aheadBehind.sourceOnly === 0) {
    return { ...report, reason: 'cloud_dev_ahead_of_origin_dev' };
  }

  return { ...report, reason: 'branches_diverged' };
}

export function createSyncedCloudDevReport(report, syncedState = {}) {
  const sourceHead = syncedState.sourceHead ?? report.sourceHead;
  const stagingHead = syncedState.stagingHead ?? sourceHead;
  const aheadBehind = syncedState.aheadBehind ?? report.aheadBehind;

  return {
    ...report,
    ...syncedState,
    sourceHead,
    stagingHead,
    aheadBehind,
    canSync: false,
    reason: 'synced',
    details: ''
  };
}

export function createCloudDevResult({
  status = 'checked',
  report
} = {}) {
  return {
    status,
    report,
    text: formatCloudDevSyncReport(report)
  };
}

export function createCloudDevFailureResult({
  reason = 'check_failed',
  error,
  report,
  mode = 'check',
  syncEnabled = false
} = {}) {
  return createCloudDevResult({
    status: 'failed',
    report: {
      ...(report ?? createCloudDevReport({ mode, syncEnabled })),
      canSync: false,
      reason,
      details: formatDetails(error)
    }
  });
}

export function formatCloudDevSyncReport(report) {
  const lines = [
    'Cloud dev sync report',
    `Source branch: ${report.sourceBranch}`,
    `Staging branch: ${report.stagingBranch}`,
    `Source HEAD: ${report.sourceHead}`,
    `Staging HEAD: ${report.stagingHead}`,
    `Ahead/behind ${syncRange}: ${report.aheadBehind.sourceOnly}/${report.aheadBehind.stagingOnly}`,
    `Open PRs targeting cloud-dev: ${report.openPullRequestsTargetingCloudDev}`,
    `Mode: ${report.mode}`,
    `Sync enabled: ${report.syncEnabled}`,
    `Can sync: ${report.canSync}`,
    `Reason: ${report.reason}`
  ];

  if (report.details) {
    lines.push(`Details: ${report.details}`);
  }

  return `${lines.join('\n')}\n`;
}
