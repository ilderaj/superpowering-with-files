import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const workflowPath = path.join(process.cwd(), '.github/workflows/upstream-refresh.yml');
const resultPath = '.harness/upstream-refresh-result.json';

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

test('upstream refresh workflow exposes manual and weekly scheduled triggers', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const onBlock = extractTopLevelBlock(workflow, 'on');

  assert.match(onBlock, /^\s+workflow_dispatch:\s*$/m);
  assert.match(onBlock, /^\s{4}inputs:\s*$/m);
  assert.match(onBlock, /^\s{6}create_pr:\s*$/m);
  assert.match(onBlock, /^\s{8}description:\s*Create or update the upstream refresh pull request\s*$/m);
  assert.match(onBlock, /^\s{8}required:\s*false\s*$/m);
  assert.match(onBlock, /^\s{8}default:\s*false\s*$/m);
  assert.match(onBlock, /^\s{8}type:\s*boolean\s*$/m);
  assert.match(onBlock, /^\s+schedule:\s*$/m);
  assert.match(onBlock, /^\s+-\s*cron:\s*['"]0 12 \* \* 5['"]\s*$/m);
});

test('upstream refresh workflow grants the read and write permissions its current steps need', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const permissionsBlock = extractTopLevelBlock(workflow, 'permissions');

  assert.deepEqual(parsePermissionsBlock(permissionsBlock), {
    actions: 'read',
    contents: 'write',
    'pull-requests': 'write'
  });
});

test('upstream refresh workflow runs on ubuntu and checks out full triggering-ref history', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const jobBlock = extractJobBlock(workflow, 'upstream-refresh');
  const checkoutBlock = extractStepBlock(workflow, 'Check out workflow ref');
  const setupNodeBlock = extractStepBlock(workflow, 'Set up Node.js');
  const installBlock = extractStepBlock(workflow, 'Install dependencies');
  const runRefreshBlock = extractStepBlock(workflow, 'Run upstream refresh');

  assert.match(
    jobBlock,
    /^\s{4}if:\s*\$\{\{\s*github\.event_name\s*!=\s*'schedule'\s*\|\|\s*vars\.UPSTREAM_REFRESH_SCHEDULE_ENABLED\s*==\s*'true'\s*\}\}\s*$/m
  );
  assert.match(jobBlock, /^\s{4}runs-on:\s*ubuntu-latest\s*$/m);
  assert.match(checkoutBlock, /^\s{8}uses:\s*actions\/checkout@v6\s*$/m);
  assert.match(checkoutBlock, /^\s{10}fetch-depth:\s*0\s*$/m);
  assert.doesNotMatch(checkoutBlock, /^\s{10}ref:\s*main\s*$/m);
  assert.match(setupNodeBlock, /^\s{8}uses:\s*actions\/setup-node@v6\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}node-version:\s*'22'\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}cache:\s*npm\s*$/m);
  assert.match(installBlock, /^\s{8}run:\s*npm ci\s*$/m);
  assert.match(runRefreshBlock, /^\s{8}env:\s*$/m);
  assert.match(runRefreshBlock, /^\s{10}GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}\s*$/m);
  assert.match(runRefreshBlock, /^\s{10}GITHUB_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}\s*$/m);
  assert.match(runRefreshBlock, /^\s{10}XDG_CACHE_HOME:\s*\$\{\{\s*runner\.temp\s*\}\}\/xdg-cache\s*$/m);
  assert.match(runRefreshBlock, /^\s{10}WRANGLER_HOME:\s*\$\{\{\s*runner\.temp\s*\}\}\/wrangler\s*$/m);
  assert.match(runRefreshBlock, /^\s{8}run:\s*node scripts\/ci\/run-upstream-refresh\.mjs\s*$/m);
});

test('upstream refresh workflow keeps the expected step order', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.deepEqual(extractStepNames(workflow), [
    'Check out workflow ref',
    'Set up Node.js',
    'Install dependencies',
    'Run upstream refresh',
    'Upload upstream refresh result',
    'Read upstream refresh result',
    'Open upstream refresh pull request'
  ]);
});

test('upstream refresh workflow uploads the result artifact even after failed refreshes', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const uploadBlock = extractStepBlock(workflow, 'Upload upstream refresh result');

  assert.match(uploadBlock, /^\s{8}uses:\s*actions\/upload-artifact@v7\s*$/m);
  assert.match(uploadBlock, /^\s{8}if:\s*\$\{\{\s*always\(\).*\}\}\s*$/m);
  assert.match(uploadBlock, new RegExp(`^\\s{10}path:\\s*${escapeRegExp(resultPath)}\\s*$`, 'm'));
});

test('upstream refresh workflow reads the guarded result path into refresh_result outputs', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const readResultBlock = extractStepBlock(workflow, 'Read upstream refresh result');

  assert.match(readResultBlock, /^\s{8}id:\s*refresh_result\s*$/m);
  assert.match(readResultBlock, new RegExp(`hashFiles\\('${escapeRegExp(resultPath)}'\\)`));
  assert.match(readResultBlock, new RegExp(`readFileSync\\('${escapeRegExp(resultPath)}', 'utf8'\\)`));
  assert.match(readResultBlock, /status=\$\{result\.status \?\? ''\}/);
  assert.match(readResultBlock, /eligible_count=\$\{eligibleCount\}/);
});

test('upstream refresh workflow opens PRs only after successful non-empty refreshes and an explicit PR gate', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const pullRequestBlock = extractStepBlock(workflow, 'Open upstream refresh pull request');

  assert.match(
    pullRequestBlock,
    /^\s{8}if:\s*\$\{\{\s*success\(\)\s*&&\s*steps\.refresh_result\.outputs\.status\s*==\s*'success'\s*&&\s*steps\.refresh_result\.outputs\.eligible_count\s*!=\s*'0'\s*&&\s*\(github\.event_name\s*==\s*'schedule'\s*\|\|\s*inputs\.create_pr\s*==\s*true\)\s*\}\}\s*$/m
  );
  assert.match(pullRequestBlock, /^\s{8}run:\s*node scripts\/ci\/open-upstream-pr\.mjs\s*$/m);
});

test('upstream refresh workflow does not enable pull request auto-merge', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.doesNotMatch(workflow, /\bgh\s+pr\s+merge\b/);
  assert.doesNotMatch(workflow, /--auto\b/);
  assert.doesNotMatch(workflow, /auto-merge/i);
});
