export const branchName = 'automation/upstream-refresh';
export const baseBranch = 'dev';
export const title = 'chore: refresh upstream baselines';
export const botUserName = 'github-actions[bot]';
export const botUserEmail = '41898282+github-actions[bot]@users.noreply.github.com';
export const defaultRefreshResultPath = '.harness/upstream-refresh-result.json';
export const defaultPullRequestBodyPath = '.harness/upstream-pr-body.md';
export const maxEligibleFilesInPullRequestBody = 50;

export function normalizeEligibleFiles(eligibleFiles = []) {
  return [...new Set(eligibleFiles.map((filePath) => String(filePath).trim()).filter(Boolean))];
}

export function shouldOpenPr({ eligibleFiles = [] } = {}) {
  return normalizeEligibleFiles(eligibleFiles).length > 0;
}

function quoteCommandPart(value) {
  const part = String(value);
  if (part.length === 0) return "''";
  if (/^[A-Za-z0-9_./:=@%+,\-[\]]+$/.test(part)) return part;
  return `'${part.replaceAll("'", "'\\''")}'`;
}

export function formatCommand(command) {
  return [command.file, ...(command.args ?? [])].map(quoteCommandPart).join(' ');
}

function buildStrategySummaryLines(strategySummary = {}) {
  const strategyEntries = Object.entries(strategySummary ?? {});
  if (strategyEntries.length === 0) {
    return ['- No resolved source updates were reported.'];
  }

  return strategyEntries.flatMap(([sourceName, summary]) => ([
    `- ${sourceName}: ${summary.strategy ?? 'unknown'} ${summary.previousVersion ?? '(none)'} -> ${summary.nextVersion ?? '(none)'}`,
    `  commits: ${summary.previousCommitSha ?? '(none)'} -> ${summary.nextCommitSha ?? '(none)'}`,
    `  fallbackUsed: ${summary.fallbackUsed ? 'yes' : 'no'}`
  ]));
}

export function buildPullRequestBody({
  eligibleFiles = [],
  sourceHeads = {},
  strategySummary = {}
} = {}) {
  const normalizedFiles = normalizeEligibleFiles(eligibleFiles);
  const includedFiles = normalizedFiles.slice(0, maxEligibleFilesInPullRequestBody);
  const omittedFileCount = Math.max(0, normalizedFiles.length - includedFiles.length);
  const fileLines = normalizedFiles.length > 0
    ? [
        ...(omittedFileCount > 0
          ? [
              `Showing the first ${includedFiles.length} of ${normalizedFiles.length} eligible files.`,
              'Review the PR diff for the complete refreshed file set.',
              ''
            ]
          : []),
        ...includedFiles.map((filePath) => `- ${filePath}`),
        ...(omittedFileCount > 0
          ? [
              '',
              `- ... ${omittedFileCount} additional files omitted from the PR body.`
            ]
          : [])
      ]
    : ['- No eligible files were reported.'];
  const sourceHeadEntries = Object.entries(sourceHeads ?? {});
  const sourceHeadLines = sourceHeadEntries.length > 0
    ? sourceHeadEntries.map(([sourceName, headSha]) => `- ${sourceName}: ${headSha}`)
    : ['- No source head changes were reported.'];
  const strategyLines = buildStrategySummaryLines(strategySummary);

  return [
    '## Summary',
    '',
    'Refresh upstream baselines from the configured Harness sources.',
    '',
    '## Eligible Files',
    '',
    ...fileLines,
    '',
    '## Source Heads',
    '',
    ...sourceHeadLines,
    '',
    '## Resolved Sources',
    '',
    ...strategyLines,
    '',
    '## Review Gate',
    '',
    'Automatic review and workflow checks are advisory. Final human review remains required before merge.',
    'No auto-merge is configured for this automation.',
    '',
    '## Automation Branch Updates',
    '',
    'A guarded --force-with-lease update is limited to the fixed automation branch after the open PR matches automation/upstream-refresh -> dev; this is not a general force-push path.'
  ].join('\n');
}

export function buildBotGitIdentityCommands() {
  return [
    { file: 'git', args: ['config', 'user.name', botUserName] },
    { file: 'git', args: ['config', 'user.email', botUserEmail] }
  ];
}

export function buildCommitCommands({ eligibleFiles = [] } = {}) {
  const normalizedFiles = normalizeEligibleFiles(eligibleFiles);

  return [
    { file: 'git', args: ['add', '--', ...normalizedFiles] },
    { file: 'git', args: ['commit', '-m', title] }
  ];
}

export function buildListOpenPullRequestsCommand() {
  return {
    file: 'gh',
    args: ['pr', 'list', '--head', branchName, '--base', baseBranch, '--state', 'open', '--json', 'number,url,headRefName,baseRefName', '--limit', '1']
  };
}

export function buildDetectRemoteBranchCommand() {
  return {
    file: 'git',
    args: ['ls-remote', '--heads', 'origin', branchName]
  };
}

export function parseOpenPullRequests(output) {
  if (!output.trim()) return [];

  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected gh pr list to return an array, received: ${output}`);
  }

  return parsed;
}

export function parseRemoteBranchExists(output) {
  return Boolean(String(output ?? '').trim());
}

export function findOpenAutomationPullRequest(openPullRequests = []) {
  return openPullRequests.find((pullRequest) => {
    const headRefName = pullRequest?.headRefName ?? pullRequest?.head;
    const baseRefName = pullRequest?.baseRefName ?? pullRequest?.base;

    return headRefName === branchName && baseRefName === baseBranch;
  });
}

export function buildPushBranchCommand({ setUpstream = false, forceWithLease = false } = {}) {
  return {
    file: 'git',
    args: ['push', ...(forceWithLease ? ['--force-with-lease'] : []), ...(setUpstream ? ['--set-upstream'] : []), 'origin', branchName]
  };
}

export function buildCreatePullRequestCommand({ bodyFilePath = defaultPullRequestBodyPath } = {}) {
  return {
    file: 'gh',
    args: ['pr', 'create', '--base', baseBranch, '--head', branchName, '--title', title, '--body-file', bodyFilePath]
  };
}

export function buildUpdatePullRequestCommand({ number, bodyFilePath = defaultPullRequestBodyPath } = {}) {
  return {
    file: 'gh',
    args: ['pr', 'edit', String(number), '--body-file', bodyFilePath]
  };
}

export function buildUpstreamPullRequestPlan({
  eligibleFiles = [],
  sourceHeads = {},
  previousLock = { sources: {} },
  resolvedLock = { sources: {} },
  strategySummary = {},
  openPullRequests = [],
  remoteBranchExists = false
} = {}) {
  const normalizedFiles = normalizeEligibleFiles(eligibleFiles);

  if (!shouldOpenPr({ eligibleFiles: normalizedFiles })) {
    return {
      shouldCreatePullRequest: false,
      shouldUpdatePullRequest: false,
      shouldOpenPullRequest: false,
      branchName,
      baseBranch,
      title,
      eligibleFiles: normalizedFiles,
      previousLock,
      resolvedLock,
      strategySummary
    };
  }

  const body = buildPullRequestBody({ eligibleFiles: normalizedFiles, sourceHeads, strategySummary });
  const existingPullRequest = findOpenAutomationPullRequest(openPullRequests);
  const shouldUpdatePullRequest = Boolean(existingPullRequest);
  const shouldCreatePullRequest = !shouldUpdatePullRequest;

  return {
    shouldCreatePullRequest,
    shouldUpdatePullRequest,
    shouldOpenPullRequest: true,
    branchName,
    baseBranch,
    title,
    eligibleFiles: normalizedFiles,
    previousLock,
    resolvedLock,
    strategySummary,
    existingPullRequest,
    pullRequest: shouldCreatePullRequest
      ? {
          base: baseBranch,
          head: branchName,
          title,
          body
        }
      : undefined,
    body,
    commands: {
      configureIdentity: buildBotGitIdentityCommands(),
      commit: buildCommitCommands({ eligibleFiles: normalizedFiles }),
      listOpenPullRequests: buildListOpenPullRequestsCommand(),
      push: buildPushBranchCommand({
        setUpstream: shouldCreatePullRequest && !remoteBranchExists,
        forceWithLease: shouldUpdatePullRequest || remoteBranchExists
      }),
      createPullRequest: shouldCreatePullRequest ? buildCreatePullRequestCommand() : undefined,
      updatePullRequest: shouldUpdatePullRequest
        ? buildUpdatePullRequestCommand({ number: existingPullRequest.number })
        : undefined
    }
  };
}
