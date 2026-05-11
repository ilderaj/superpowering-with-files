import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const workflowPath = path.join(process.cwd(), '.github/workflows/homepage-deploy.yml');

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

test('homepage deploy workflow runs only on main homepage changes and manual dispatch', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const onBlock = extractTopLevelBlock(workflow, 'on');

  assert.match(onBlock, /^\s+push:\s*$/m);
  assert.match(onBlock, /^\s{4}branches:\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*main\s*$/m);
  assert.match(onBlock, /^\s{4}paths:\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*'homepage\/\*\*'\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*'\.github\/workflows\/homepage-deploy\.yml'\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*'docs\/install\/homepage-cloudflare-worker\.md'\s*$/m);
  assert.match(onBlock, /^\s+workflow_dispatch:\s*$/m);
});

test('homepage deploy workflow grants read-only repository permissions', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const permissionsBlock = extractTopLevelBlock(workflow, 'permissions');

  assert.match(permissionsBlock, /^\s+contents:\s*read\s*$/m);
  assert.doesNotMatch(permissionsBlock, /write/);
});

test('homepage deploy workflow builds, tests, and deploys the homepage Worker', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const jobBlock = extractJobBlock(workflow, 'deploy-homepage');
  const setupNodeBlock = extractStepBlock(workflow, 'Set up Node.js');
  const installBlock = extractStepBlock(workflow, 'Install homepage dependencies');
  const typecheckBlock = extractStepBlock(workflow, 'Typecheck homepage');
  const testBlock = extractStepBlock(workflow, 'Test homepage');
  const buildBlock = extractStepBlock(workflow, 'Build homepage');
  const deployBlock = extractStepBlock(workflow, 'Deploy homepage Worker');

  assert.match(jobBlock, /^\s{4}if:\s*\$\{\{\s*github\.repository\s*==\s*'ilderaj\/superpowering-with-files'\s*\}\}\s*$/m);
  assert.match(jobBlock, /^\s{4}runs-on:\s*ubuntu-latest\s*$/m);
  assert.match(setupNodeBlock, /^\s{8}uses:\s*actions\/setup-node@v6\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}node-version:\s*'22'\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}cache-dependency-path:\s*homepage\/package-lock\.json\s*$/m);
  assert.match(installBlock, /^\s{8}run:\s*npm ci --prefix homepage\s*$/m);
  assert.match(typecheckBlock, /^\s{8}run:\s*npm run typecheck --prefix homepage\s*$/m);
  assert.match(testBlock, /^\s{8}run:\s*npm test --prefix homepage\s*$/m);
  assert.match(buildBlock, /^\s{8}run:\s*npm run build --prefix homepage\s*$/m);
  assert.match(deployBlock, /^\s{10}CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}\s*$/m);
  assert.match(deployBlock, /^\s{10}CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}\s*$/m);
  assert.match(deployBlock, /^\s{8}run:\s*npx --prefix homepage wrangler deploy --config homepage\/wrangler\.jsonc\s*$/m);
});

test('homepage deploy workflow avoids auto-merge and unsafe force pushes', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.doesNotMatch(workflow, /\bgh\s+pr\s+merge\b/);
  assert.doesNotMatch(workflow, /--auto\b/);
  assert.doesNotMatch(workflow, /--force(?!-with-lease)\b/);
});
