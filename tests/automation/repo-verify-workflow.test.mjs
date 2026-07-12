import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const workflowPath = path.join(process.cwd(), '.github/workflows/repo-verify.yml');

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

function extractStepNames(documentText) {
  return [...documentText.matchAll(/^\s{6}- name:\s*(.+?)\s*$/gm)].map((match) => match[1]);
}

test('repo verify workflow triggers on pull requests and protected branch pushes', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const onBlock = extractTopLevelBlock(workflow, 'on');

  assert.match(onBlock, /^\s+pull_request:\s*$/m);
  assert.match(onBlock, /^\s{4}branches:\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*main\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*dev\s*$/m);
  assert.match(onBlock, /^\s+push:\s*$/m);
  assert.match(onBlock, /^\s{4}branches:\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*main\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*dev\s*$/m);
});

test('repo verify workflow keeps read-only permissions and the expected verification steps', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const permissionsBlock = extractTopLevelBlock(workflow, 'permissions');
  const jobBlock = extractJobBlock(workflow, 'repo-verify');
  const checkoutBlock = extractStepBlock(workflow, 'Check out repository');
  const setupNodeBlock = extractStepBlock(workflow, 'Set up Node.js');
  const rootInstallBlock = extractStepBlock(workflow, 'Install root dependencies');
  const homepageInstallBlock = extractStepBlock(workflow, 'Install homepage dependencies');
  const skillCheckBlock = extractStepBlock(workflow, 'Check repository skill projections');
  const verifyBlock = extractStepBlock(workflow, 'Run repository verification');

  assert.match(permissionsBlock, /^\s+contents:\s*read\s*$/m);
  assert.doesNotMatch(permissionsBlock, /write/);
  assert.match(jobBlock, /^\s{4}runs-on:\s*ubuntu-latest\s*$/m);
  assert.match(checkoutBlock, /^\s{8}uses:\s*actions\/checkout@v6\s*$/m);
  assert.match(setupNodeBlock, /^\s{8}uses:\s*actions\/setup-node@v6\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}node-version:\s*'22'\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}cache:\s*npm\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}cache-dependency-path:\s*\|$/m);
  assert.match(setupNodeBlock, /^\s{12}package-lock\.json\s*$/m);
  assert.match(setupNodeBlock, /^\s{12}homepage\/package-lock\.json\s*$/m);
  assert.match(rootInstallBlock, /^\s{8}run:\s*npm ci\s*$/m);
  assert.match(homepageInstallBlock, /^\s{8}run:\s*npm ci --prefix homepage\s*$/m);
  assert.match(skillCheckBlock, /^\s{8}run:\s*\.\/scripts\/harness workspace-skills check\s*$/m);
  assert.match(verifyBlock, /^\s{8}run:\s*npm run verify:all\s*$/m);
});

test('repo verify workflow keeps the expected step order', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.deepEqual(extractStepNames(workflow), [
    'Check out repository',
    'Set up Node.js',
    'Install root dependencies',
    'Install homepage dependencies',
    'Check repository skill projections',
    'Run repository verification'
  ]);
});
