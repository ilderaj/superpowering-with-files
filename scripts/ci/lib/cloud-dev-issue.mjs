export const cloudDevLabel = 'cloud-dev';
export const taskLabels = new Set(['agent:plan', 'agent:impl', 'agent:test']);
export const cloudDevRetryCommand = '/cloud-dev retry';

function requireIssueNumber(issue = {}) {
  if (!Number.isInteger(issue.number) || issue.number <= 0) {
    throw new Error('Issue number is required for cloud-dev triage.');
  }

  return issue.number;
}

function requireIssueTitle(issue = {}) {
  if (typeof issue.title !== 'string' || issue.title.trim().length === 0) {
    throw new Error('Issue title is required for cloud-dev triage.');
  }

  return issue.title.trim();
}

function requireCloudDevIssueFields(issue = {}) {
  return {
    issueNumber: requireIssueNumber(issue),
    issueTitle: requireIssueTitle(issue)
  };
}

function labelNames(issue = {}) {
  return (issue.labels ?? [])
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean);
}

function hasRetryCommand(commentBody) {
  return typeof commentBody === 'string' && /^\s*\/cloud-dev retry\s*$/m.test(commentBody);
}

export function selectTaskKind(labels = []) {
  return labels.find((label) => taskLabels.has(label)) ?? 'agent:plan';
}

export function buildCopilotPrompt({ issueNumber, issueTitle, taskKind }) {
  requireIssueNumber({ number: issueNumber });
  requireIssueTitle({ title: issueTitle });

  return [
    '@copilot please work on this issue in the cloud-dev lane.',
    '',
    `Issue: #${issueNumber} ${issueTitle}`,
    `Task kind: ${taskKind}`,
    'base_branch=cloud-dev',
    'Base branch: `cloud-dev`',
    'Target PR base: `cloud-dev`',
    'Do not push to `dev` or `main`.',
    '',
    'Required verification:',
    '- `npm run verify`',
    '- `./scripts/harness verify --output=.harness/verification`',
    '- `./scripts/harness doctor --check-only`',
    '',
    'Open a pull request only after the focused work is complete and verified.'
  ].join('\n');
}

export function analyzeCloudDevIssue({
  issue,
  cloudDevReady = false,
  eventName,
  commentBody
} = {}) {
  if (eventName === 'issue_comment' && !hasRetryCommand(commentBody)) {
    return {
      shouldComment: false,
      shouldPromptCopilot: false,
      reason: 'comment_command_missing'
    };
  }

  const labels = labelNames(issue);

  if (!labels.includes(cloudDevLabel)) {
    return {
      shouldComment: false,
      shouldPromptCopilot: false,
      reason: 'missing_cloud_dev_label'
    };
  }

  const issueNumber = requireIssueNumber(issue);

  if (!cloudDevReady) {
    return {
      shouldComment: true,
      shouldPromptCopilot: false,
      reason: 'cloud_dev_not_ready',
      commentBody: 'Cloud dev preflight is not ready. The agent task was not started.'
    };
  }

  const taskKind = selectTaskKind(labels);
  const { issueTitle } = requireCloudDevIssueFields(issue);

  return {
    shouldComment: true,
    shouldPromptCopilot: true,
    reason: 'ready',
    taskKind,
    commentBody: buildCopilotPrompt({
      issueNumber,
      issueTitle,
      taskKind
    })
  };
}

export function buildIssueCommentCommand({ issueNumber, body }) {
  requireIssueNumber({ number: issueNumber });

  return {
    file: 'gh',
    args: ['issue', 'comment', String(issueNumber), '--body', body]
  };
}
