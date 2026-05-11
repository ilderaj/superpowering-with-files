import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const syncWorkflowPath = path.join(process.cwd(), '.github/workflows/cloud-dev-sync.yml');
const syncResultPath = '.harness/cloud-dev-sync-result.json';
const issueTriageWorkflowPath = path.join(process.cwd(), '.github/workflows/cloud-dev-issue-triage.yml');
const issueTriageResultPath = '.harness/cloud-dev-issue-triage-result.json';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTopLevelBlock(documentText, blockName) {
  const lines = documentText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => {
    const match = line.match(/^(['"]?)([A-Za-z0-9_-]+)\1:\s*(?:#.*)?$/);
    return match?.[2] === blockName;
  });

  assert.notEqual(startIndex, -1, `Expected top-level ${blockName} block`);

  const blockLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^\S[^:]*:\s*(?:#.*)?$/.test(lines[index])) break;
    blockLines.push(lines[index]);
  }

  return blockLines.join('\n');
}

function extractNestedBlock(documentText, parentBlockName, childBlockName) {
  const parentBlock = extractTopLevelBlock(documentText, parentBlockName);
  const lines = parentBlock.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line === `  ${childBlockName}:`);

  assert.notEqual(startIndex, -1, `Expected ${childBlockName} block under ${parentBlockName}`);

  const blockLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^\s{2}[A-Za-z0-9_-]+:\s*(?:#.*)?$/.test(lines[index])) break;
    blockLines.push(lines[index]);
  }

  return blockLines.join('\n');
}

function parsePermissionsBlock(blockText) {
  const entries = [];

  for (const line of blockText.split(/\r?\n/)) {
    if (line.trim() === '') continue;

    const match = line.match(/^\s+([A-Za-z0-9_-]+):\s*([^#\s]+)\s*(?:#.*)?$/);
    assert.ok(match, `Unexpected permissions block line: ${line}`);
    entries.push([match[1], match[2]]);
  }

  return Object.fromEntries(entries);
}

function extractJobBlock(documentText, jobName) {
  const lines = documentText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line === `  ${jobName}:`);

  assert.notEqual(startIndex, -1, `Expected ${jobName} job block`);

  const blockLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) break;
    blockLines.push(lines[index]);
  }

  return blockLines.join('\n');
}

function extractStepNames(documentText) {
  return [...documentText.matchAll(/^\s{6}- name:\s*(.+?)\s*$/gm)].map((match) => match[1]);
}

function extractStepBlock(documentText, stepName) {
  const lines = documentText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line === `      - name: ${stepName}`);

  assert.notEqual(startIndex, -1, `Expected ${stepName} step block`);

  const blockLines = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    if (index !== startIndex && /^\s{6}- name:\s+/.test(lines[index])) break;
    blockLines.push(lines[index]);
  }

  return blockLines.join('\n');
}

test('cloud dev sync workflow exposes manual and scheduled triggers', async () => {
  const workflow = await readFile(syncWorkflowPath, 'utf8');
  const onBlock = extractTopLevelBlock(workflow, 'on');

  assert.match(onBlock, /^\s+workflow_dispatch:\s*$/m);
  assert.match(onBlock, /^\s{4}inputs:\s*$/m);
  assert.match(onBlock, /^\s{6}mode:\s*$/m);
  assert.match(onBlock, /^\s{8}description:\s*Choose whether to check or sync the cloud-dev branch\s*$/m);
  assert.match(onBlock, /^\s{8}required:\s*false\s*$/m);
  assert.match(onBlock, /^\s{8}default:\s*check\s*$/m);
  assert.match(onBlock, /^\s{8}type:\s*choice\s*$/m);
  assert.match(onBlock, /^\s{8}options:\s*$/m);
  assert.match(onBlock, /^\s{10}-\s*check\s*$/m);
  assert.match(onBlock, /^\s{10}-\s*sync\s*$/m);
  assert.match(onBlock, /^\s+schedule:\s*$/m);
  assert.match(onBlock, /^\s+-\s*cron:\s*['"]0 2 \* \* 1-5['"]\s*$/m);
});

test('cloud dev sync workflow grants only the branch sync permissions it needs', async () => {
  const workflow = await readFile(syncWorkflowPath, 'utf8');
  const permissionsBlock = extractTopLevelBlock(workflow, 'permissions');

  assert.deepEqual(parsePermissionsBlock(permissionsBlock), {
    contents: 'write',
    'pull-requests': 'read'
  });
});

test('cloud dev sync workflow runs on ubuntu with the guarded cloud-dev-sync job', async () => {
  const workflow = await readFile(syncWorkflowPath, 'utf8');
  const jobBlock = extractJobBlock(workflow, 'cloud-dev-sync');
  const checkoutBlock = extractStepBlock(workflow, 'Check out repository');
  const setupNodeBlock = extractStepBlock(workflow, 'Set up Node.js');
  const installBlock = extractStepBlock(workflow, 'Install dependencies');
  const checkBlock = extractStepBlock(workflow, 'Check cloud-dev branch state');
  const uploadBlock = extractStepBlock(workflow, 'Upload cloud-dev sync result');

  assert.match(jobBlock, /^\s{4}if:\s*\$\{\{\s*github\.event_name\s*!=\s*'schedule'\s*\|\|\s*vars\.CLOUD_DEV_SYNC_ENABLED\s*==\s*'true'\s*\}\}\s*$/m);
  assert.match(jobBlock, /^\s{4}runs-on:\s*ubuntu-latest\s*$/m);
  assert.match(checkoutBlock, /^\s{8}uses:\s*actions\/checkout@v6\s*$/m);
  assert.match(checkoutBlock, /^\s{10}ref:\s*main\s*$/m);
  assert.match(checkoutBlock, /^\s{10}fetch-depth:\s*0\s*$/m);
  assert.match(setupNodeBlock, /^\s{8}uses:\s*actions\/setup-node@v6\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}node-version:\s*'22'\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}cache:\s*npm\s*$/m);
  assert.match(installBlock, /^\s{8}run:\s*npm ci\s*$/m);
  assert.match(checkBlock, /^\s{8}env:\s*$/m);
  assert.match(checkBlock, /^\s{10}GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}\s*$/m);
  assert.match(checkBlock, /^\s{10}CLOUD_DEV_SYNC_ENABLED:\s*\$\{\{\s*vars\.CLOUD_DEV_SYNC_ENABLED\s*\}\}\s*$/m);
  assert.match(
    checkBlock,
    /^\s{8}run:\s*node scripts\/ci\/check-cloud-dev-branch\.mjs --mode=\$\{\{\s*github\.event_name == 'workflow_dispatch' && inputs\.mode \|\| 'check'\s*\}\}\s*$/m
  );
  assert.match(uploadBlock, /^\s{8}uses:\s*actions\/upload-artifact@v7\s*$/m);
  assert.match(
    uploadBlock,
    /^\s{8}if:\s*\$\{\{\s*always\(\)\s*&&\s*hashFiles\('\.harness\/cloud-dev-sync-result\.json'\)\s*!=\s*''\s*\}\}\s*$/m
  );
  assert.match(uploadBlock, /^\s{10}path:\s*\.harness\/cloud-dev-sync-result\.json\s*$/m);
  assert.match(uploadBlock, /^\s{10}if-no-files-found:\s*error\s*$/m);
});

test('cloud dev sync workflow keeps the expected step order', async () => {
  const workflow = await readFile(syncWorkflowPath, 'utf8');

  assert.deepEqual(extractStepNames(workflow), [
    'Check out repository',
    'Set up Node.js',
    'Install dependencies',
    'Check cloud-dev branch state',
    'Upload cloud-dev sync result'
  ]);
});

test('cloud dev sync workflow uploads the guarded cloud-dev sync result artifact', async () => {
  const workflow = await readFile(syncWorkflowPath, 'utf8');
  const uploadBlock = extractStepBlock(workflow, 'Upload cloud-dev sync result');

  assert.match(uploadBlock, /^\s{10}name:\s*cloud-dev-sync-result\s*$/m);
  assert.match(uploadBlock, new RegExp(`^\\s{10}path:\\s*${escapeRegExp(syncResultPath)}\\s*$`, 'm'));
  assert.match(uploadBlock, /^\s{10}if-no-files-found:\s*error\s*$/m);
});

test('cloud dev sync workflow avoids auto-merge and unsafe force pushes', async () => {
  const workflow = await readFile(syncWorkflowPath, 'utf8');

  assert.doesNotMatch(workflow, /\bgh\s+pr\s+merge\b/);
  assert.doesNotMatch(workflow, /--auto\b/);
  assert.doesNotMatch(workflow, /--force(?!-with-lease)\b/);
});

test('cloud dev issue triage workflow listens to issue, comment, and manual triggers', async () => {
  const workflow = await readFile(issueTriageWorkflowPath, 'utf8');
  const onBlock = extractTopLevelBlock(workflow, 'on');
  const issuesBlock = extractNestedBlock(workflow, 'on', 'issues');
  const issueCommentBlock = extractNestedBlock(workflow, 'on', 'issue_comment');
  const workflowDispatchBlock = extractNestedBlock(workflow, 'on', 'workflow_dispatch');

  assert.match(onBlock, /^\s+issues:\s*$/m);
  assert.match(issuesBlock, /^\s{4}types:\s*$/m);
  assert.match(issuesBlock, /^\s{6}-\s*opened\s*$/m);
  assert.match(issuesBlock, /^\s{6}-\s*labeled\s*$/m);
  assert.match(issuesBlock, /^\s{6}-\s*assigned\s*$/m);
  assert.match(onBlock, /^\s+issue_comment:\s*$/m);
  assert.match(issueCommentBlock, /^\s{4}types:\s*$/m);
  assert.match(issueCommentBlock, /^\s{6}-\s*created\s*$/m);
  assert.match(onBlock, /^\s+workflow_dispatch:\s*$/m);
  assert.match(workflowDispatchBlock, /^\s{4}inputs:\s*$/m);
  assert.match(workflowDispatchBlock, /^\s{6}issue_number:\s*$/m);
  assert.match(
    workflowDispatchBlock,
    /^\s{8}description:\s*Issue number to triage when manually dispatching the workflow\s*$/m
  );
  assert.match(workflowDispatchBlock, /^\s{8}required:\s*true\s*$/m);
  assert.match(workflowDispatchBlock, /^\s{8}type:\s*string\s*$/m);
});

test('cloud dev issue triage workflow keeps permissions minimal', async () => {
  const workflow = await readFile(issueTriageWorkflowPath, 'utf8');
  const permissionsBlock = extractTopLevelBlock(workflow, 'permissions');

  assert.deepEqual(parsePermissionsBlock(permissionsBlock), {
    contents: 'read',
    issues: 'write',
    'pull-requests': 'read'
  });
});

test('cloud dev issue triage workflow excludes pull request comments and uses structured readiness handoff before triage', async () => {
  const workflow = await readFile(issueTriageWorkflowPath, 'utf8');
  const jobBlock = extractJobBlock(workflow, 'cloud-dev-issue-triage');
  const checkoutBlock = extractStepBlock(workflow, 'Check out repository');
  const setupNodeBlock = extractStepBlock(workflow, 'Set up Node.js');
  const installBlock = extractStepBlock(workflow, 'Install dependencies');
  const concurrencyBlock = extractTopLevelBlock(workflow, 'concurrency');
  const checkBlock = extractStepBlock(workflow, 'Check cloud-dev branch state');
  const readinessBlock = extractStepBlock(workflow, 'Tighten readiness handoff');
  const triageBlock = extractStepBlock(workflow, 'Run cloud-dev issue triage');
  const uploadBlock = extractStepBlock(workflow, 'Upload cloud-dev issue triage result');

  assert.match(
    jobBlock,
    /^\s{4}if:\s*\$\{\{\s*vars\.CLOUD_DEV_ISSUE_TRIAGE_ENABLED\s*==\s*'true'\s*&&\s*\(\s*github\.event_name\s*!=\s*'issue_comment'\s*\|\|\s*github\.event\.issue\.pull_request\s*==\s*null\s*\)\s*\}\}\s*$/m
  );
  assert.match(
    concurrencyBlock,
    /^\s+group:\s*cloud-dev-issue-triage-\$\{\{\s*github\.event\.issue\.number\s*\|\|\s*inputs\.issue_number\s*\|\|\s*github\.run_id\s*\}\}\s*$/m
  );
  assert.match(concurrencyBlock, /^\s+cancel-in-progress:\s*false\s*$/m);
  assert.match(jobBlock, /^\s{4}runs-on:\s*ubuntu-latest\s*$/m);
  assert.match(checkoutBlock, /^\s{8}uses:\s*actions\/checkout@v6\s*$/m);
  assert.match(checkoutBlock, /^\s{10}ref:\s*main\s*$/m);
  assert.match(checkoutBlock, /^\s{10}fetch-depth:\s*0\s*$/m);
  assert.match(setupNodeBlock, /^\s{8}uses:\s*actions\/setup-node@v6\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}node-version:\s*'22'\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}cache:\s*npm\s*$/m);
  assert.match(installBlock, /^\s{8}run:\s*npm ci\s*$/m);
  assert.match(checkBlock, /^\s{8}env:\s*$/m);
  assert.match(checkBlock, /^\s{10}GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}\s*$/m);
  assert.match(checkBlock, /^\s{10}CLOUD_DEV_SYNC_ENABLED:\s*'false'\s*$/m);
  assert.match(checkBlock, /^\s{8}run:\s*node scripts\/ci\/check-cloud-dev-branch\.mjs --mode=check\s*$/m);
  assert.match(readinessBlock, /^\s{8}id:\s*cloud_dev_ready\s*$/m);
  assert.match(readinessBlock, /^\s{8}run:\s*\|\s*$/m);
  assert.match(readinessBlock, /^\s{10}node <<'NODE'\s*$/m);
  assert.match(readinessBlock, /^\s{10}const \{ readFileSync, appendFileSync \} = require\('node:fs'\);\s*$/m);
  assert.match(readinessBlock, /^\s{10}const result = JSON\.parse\(readFileSync\('\.harness\/cloud-dev-sync-result\.json', 'utf8'\)\);\s*$/m);
  assert.match(readinessBlock, /^\s{10}const statusOk = result\.status !== 'failed';\s*$/m);
  assert.match(
    readinessBlock,
    /^\s{10}const openPullRequestsTargetingCloudDev = result\.report\?\.openPullRequestsTargetingCloudDev \?\? Number\.POSITIVE_INFINITY;\s*$/m
  );
  assert.match(
    readinessBlock,
    /^\s{10}const stagingOnly = result\.report\?\.aheadBehind\?\.stagingOnly \?\? Number\.POSITIVE_INFINITY;\s*$/m
  );
  assert.match(
    readinessBlock,
    /^\s{10}const ready = statusOk && openPullRequestsTargetingCloudDev === 0 && stagingOnly === 0 \? 'true' : 'false';\s*$/m
  );
  assert.doesNotMatch(readinessBlock, /result\.report\?\.reason/);
  assert.match(readinessBlock, /^\s{10}appendFileSync\(process\.env\.GITHUB_OUTPUT, `ready=\$\{ready\}\\n`\);\s*$/m);
  assert.match(readinessBlock, /^\s{10}NODE\s*$/m);
  assert.match(triageBlock, /^\s{8}env:\s*$/m);
  assert.match(triageBlock, /^\s{10}GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}\s*$/m);
  assert.match(triageBlock, /^\s{10}CLOUD_DEV_READY:\s*\$\{\{\s*steps\.cloud_dev_ready\.outputs\.ready\s*\}\}\s*$/m);
  assert.match(triageBlock, /^\s{8}run:\s*node scripts\/ci\/run-cloud-dev-issue-triage\.mjs\s*$/m);
  assert.match(uploadBlock, /^\s{8}uses:\s*actions\/upload-artifact@v7\s*$/m);
  assert.match(
    uploadBlock,
    /^\s{8}if:\s*\$\{\{\s*always\(\)\s*&&\s*hashFiles\('\.harness\/cloud-dev-issue-triage-result\.json'\)\s*!=\s*''\s*\}\}\s*$/m
  );
  assert.match(uploadBlock, /^\s{10}path:\s*\.harness\/cloud-dev-issue-triage-result\.json\s*$/m);
  assert.match(uploadBlock, /^\s{10}if-no-files-found:\s*error\s*$/m);
});

test('cloud dev issue triage workflow keeps the expected step order', async () => {
  const workflow = await readFile(issueTriageWorkflowPath, 'utf8');

  assert.deepEqual(extractStepNames(workflow), [
    'Check out repository',
    'Set up Node.js',
    'Install dependencies',
    'Check cloud-dev branch state',
    'Tighten readiness handoff',
    'Run cloud-dev issue triage',
    'Upload cloud-dev issue triage result'
  ]);
});

test('cloud dev issue triage workflow uploads the guarded triage artifact', async () => {
  const workflow = await readFile(issueTriageWorkflowPath, 'utf8');
  const uploadBlock = extractStepBlock(workflow, 'Upload cloud-dev issue triage result');

  assert.match(uploadBlock, /^\s{10}name:\s*cloud-dev-issue-triage-result\s*$/m);
  assert.match(uploadBlock, new RegExp(`^\\s{10}path:\\s*${escapeRegExp(issueTriageResultPath)}\\s*$`, 'm'));
  assert.match(uploadBlock, /^\s{10}if-no-files-found:\s*error\s*$/m);
});
