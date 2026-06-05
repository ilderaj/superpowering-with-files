# Cloud Dev Harness Implementation Plan

Active task path: `planning/active/cloud-dev-harness-feasibility/`
Lifecycle state: waiting_review
Sync-back status: complete
Feasibility report: `docs/superpowers/plans/2026-05-10-cloud-dev-harness-feasibility.md`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本仓库落地一个受保护的 GitHub cloud development lane，使 Copilot cloud agent 可以通过 issues/PRs 在 `cloud-dev` staging 分支上开发、测试和提交，同时不直写 `dev`、`main`，也不自动同步到本地 checkout。

**Architecture:** 采用 repo-local Copilot cloud overlay + branch/workflow governance。实现上沿用现有 automation 风格：纯函数放在 `scripts/ci/lib/*.mjs`，runner 放在 `scripts/ci/*.mjs`，workflow 放在 `.github/workflows/*.yml`，回归测试放在 `tests/automation/*.test.mjs`。Actions 只做 preflight、评论、artifact、受控 fast-forward，不做 auto-merge，也不主动 force-push 非固定分支。

**Tech Stack:** Node.js `node:test`、GitHub Actions、`gh` CLI、Git、Harness CLI、Markdown docs。

---

## 当前报告是否已经可以执行

当前可行性报告可以执行“人工 pilot”：创建 `cloud-dev`、配置 branch protection、手动通过 GitHub Copilot cloud agent 做 docs-only issue、人工 review PR。但它还不是工程级 implementation plan，因为它没有细化：

- 每个新增模块的文件路径与职责
- `cloud-dev` sync/preflight 的可测试纯函数
- issue triage workflow 的事件输入和输出
- workflow 的 required permissions、artifact 和 no-auto-merge 断言
- 本仓库应该跑哪些 focused tests 和 full verification

因此本文件是下一层可执行工程计划。

## File Structure

### New Files

- `.github/workflows/cloud-dev-sync.yml`
  - 手动和可选 schedule 触发。
  - 默认 check-only；只有 `mode=sync` 且 repo variable 允许时才更新 `cloud-dev`。
  - 上传 `.harness/cloud-dev-sync-result.json` artifact。

- `.github/workflows/cloud-dev-issue-triage.yml`
  - issue label/comment/manual dispatch 触发。
  - 检查 labels、branch refs、repo variables。
  - 评论规范化 Copilot prompt 或 blocking reason。
  - 不调用 merge，不做 force-push。

- `scripts/ci/lib/cloud-dev-branch.mjs`
  - 纯函数：branch/ref 常量、ahead/behind 解析、sync preflight 分析、result formatter、Git command builder。

- `scripts/ci/check-cloud-dev-branch.mjs`
  - Runner：读取 Git refs，输出 `.harness/cloud-dev-sync-result.json`。
  - `--mode=check|sync`；sync 只允许 fast-forward/ref update 条件通过。

- `scripts/ci/lib/cloud-dev-issue.mjs`
  - 纯函数：label 解析、issue/comment event 解析、prompt 生成、blocking reason 生成、`gh issue comment` command builder。

- `scripts/ci/run-cloud-dev-issue-triage.mjs`
  - Runner：读取 `GITHUB_EVENT_PATH`，调用 issue triage plan，必要时用 `gh issue comment` 写回。
  - 输出 `.harness/cloud-dev-issue-triage-result.json`。

- `tests/automation/cloud-dev-branch.test.mjs`
  - 覆盖 branch sync/preflight 纯函数与 runner command plan。

- `tests/automation/cloud-dev-issue.test.mjs`
  - 覆盖 label gating、prompt rendering、blocking result、comment command。

- `tests/automation/cloud-dev-workflow.test.mjs`
  - 静态断言两个 workflow 的 triggers、permissions、step order、artifact path、no auto-merge/no unsafe force-push。

- `docs/cloud-dev-harness.md`
  - 面向人类维护者的操作手册：branch roles、labels、pilot steps、promotion path、recovery playbook。

### Modified Files

- `docs/workflows.md`
  - 增加 `cloud-dev` lane，说明它是 remote-only staging lane，不自动 sync 本地。

- `docs/install/copilot.md`
  - 补充本仓库 cloud pilot 的推荐命令与默认不使用 user-global 的原因。

- `docs/maintenance.md`
  - 增加 cloud-dev scheduled/check-only 维护说明，和 upstream refresh automation 区分。

- `package.json`
  - 不需要新增 script；现有 `npm run verify` 已包含 `tests/automation/*.test.mjs`。

---

## Task 1: Cloud Dev Branch Pure Library

**Files:**
- Create: `scripts/ci/lib/cloud-dev-branch.mjs`
- Test: `tests/automation/cloud-dev-branch.test.mjs`

- [ ] **Step 1: Write failing tests for branch constants and command plans**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  return import('../../scripts/ci/lib/cloud-dev-branch.mjs');
}

test('cloud dev constants use origin dev as source and cloud-dev as staging branch', async () => {
  const { sourceRef, stagingRef, stagingBranch, resultPath } = await loadModule();

  assert.equal(sourceRef, 'refs/remotes/origin/dev');
  assert.equal(stagingRef, 'refs/remotes/origin/cloud-dev');
  assert.equal(stagingBranch, 'cloud-dev');
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
node --test tests/automation/cloud-dev-branch.test.mjs
```

Expected: FAIL because `scripts/ci/lib/cloud-dev-branch.mjs` does not exist.

- [ ] **Step 3: Implement branch constants, command builders, and parser**

Create `scripts/ci/lib/cloud-dev-branch.mjs`:

```js
export const sourceBranch = 'dev';
export const stagingBranch = 'cloud-dev';
export const sourceRef = `refs/remotes/origin/${sourceBranch}`;
export const stagingRef = `refs/remotes/origin/${stagingBranch}`;
export const syncRange = `${sourceRef}...${stagingRef}`;
export const resultPath = '.harness/cloud-dev-sync-result.json';

export function parseAheadBehindCount(output) {
  const match = String(output ?? '').trim().match(/^(\d+)\s+(\d+)$/);
  if (!match) {
    throw new Error(`Unable to parse ahead/behind counts: ${output}`);
  }
  return { sourceOnly: Number(match[1]), stagingOnly: Number(match[2]) };
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
```

- [ ] **Step 4: Add preflight analysis tests**

Append tests:

```js
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
```

- [ ] **Step 5: Implement `analyzeCloudDevSync` and formatting**

Add to `scripts/ci/lib/cloud-dev-branch.mjs`:

```js
export function analyzeCloudDevSync({
  sourceHead = 'unknown',
  stagingHead = 'unknown',
  aheadBehind = { sourceOnly: 0, stagingOnly: 0 },
  openPullRequestsTargetingCloudDev = 0,
  syncEnabled = false,
  mode = 'check'
} = {}) {
  const report = {
    sourceBranch,
    stagingBranch,
    sourceHead,
    stagingHead,
    aheadBehind,
    openPullRequestsTargetingCloudDev,
    mode,
    syncEnabled,
    canSync: false,
    reason: 'check_only'
  };

  if (mode !== 'sync') return report;
  if (!syncEnabled) return { ...report, reason: 'sync_disabled' };
  if (openPullRequestsTargetingCloudDev > 0) return { ...report, reason: 'open_cloud_dev_prs' };
  if (aheadBehind.sourceOnly > 0 && aheadBehind.stagingOnly === 0) {
    return { ...report, canSync: true, reason: 'ready_to_fast_forward' };
  }
  if (aheadBehind.sourceOnly === 0 && aheadBehind.stagingOnly === 0) {
    return { ...report, canSync: false, reason: 'already_up_to_date' };
  }
  if (aheadBehind.stagingOnly > 0 && aheadBehind.sourceOnly === 0) {
    return { ...report, canSync: false, reason: 'cloud_dev_ahead_of_origin_dev' };
  }
  return { ...report, canSync: false, reason: 'branches_diverged' };
}

export function formatCloudDevSyncReport(report) {
  return [
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
  ].join('\n') + '\n';
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/automation/cloud-dev-branch.test.mjs
```

Expected: PASS.

---

## Task 2: Cloud Dev Branch Runner

**Files:**
- Create: `scripts/ci/check-cloud-dev-branch.mjs`
- Modify: `tests/automation/cloud-dev-branch.test.mjs`

- [ ] **Step 1: Add runner tests using injected commands**

Append to `tests/automation/cloud-dev-branch.test.mjs`:

```js
test('runCloudDevBranchCheck writes blocked check-only result without pushing', async () => {
  const { runCloudDevBranchCheck } = await import('../../scripts/ci/check-cloud-dev-branch.mjs');
  const commands = [];
  let writtenResult;

  const result = await runCloudDevBranchCheck({
    mode: 'check',
    syncEnabled: false,
    runCommand: async (command) => {
      commands.push([command.file, ...(command.args ?? [])].join(' '));
      if (command.args.join(' ') === 'fetch origin dev cloud-dev') return { stdout: '' };
      if (command.args.join(' ') === 'rev-parse --verify refs/remotes/origin/dev') return { stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' };
      if (command.args.join(' ') === 'rev-parse --verify refs/remotes/origin/cloud-dev') return { stdout: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' };
      if (command.args.join(' ') === 'rev-list --left-right --count refs/remotes/origin/dev...refs/remotes/origin/cloud-dev') return { stdout: '1\t0\n' };
      if (command.args.join(' ') === 'pr list --base cloud-dev --state open --json number --limit 100') return { stdout: '[]\n' };
      throw new Error(`Unexpected command: ${command.args.join(' ')}`);
    },
    writeResult: async (resultBody) => {
      writtenResult = resultBody;
    }
  });

  assert.equal(result.status, 'checked');
  assert.equal(result.report.reason, 'check_only');
  assert.equal(writtenResult.report.reason, 'check_only');
  assert.equal(commands.some((command) => command.includes('push origin')), false);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
node --test tests/automation/cloud-dev-branch.test.mjs
```

Expected: FAIL because runner does not exist.

- [ ] **Step 3: Implement runner**

Create `scripts/ci/check-cloud-dev-branch.mjs`:

```js
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
  formatCloudDevSyncReport,
  parseAheadBehindCount,
  resultPath,
  stagingBranch
} from './lib/cloud-dev-branch.mjs';

const execFileAsync = promisify(execFile);

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

export async function runCommand(command, { cwd = process.cwd(), env = process.env } = {}) {
  const { stdout, stderr } = await execFileAsync(command.file, command.args ?? [], {
    cwd,
    env,
    shell: false,
    maxBuffer: 1024 * 1024
  });
  return { stdout, stderr };
}

async function defaultWriteResult(result, { cwd = process.cwd() } = {}) {
  const resolvedPath = path.resolve(cwd, resultPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

export async function runCloudDevBranchCheck({
  cwd = process.cwd(),
  env = process.env,
  mode = 'check',
  syncEnabled = env.CLOUD_DEV_SYNC_ENABLED === 'true',
  runCommand: run = runCommand,
  writeResult = defaultWriteResult
} = {}) {
  const [fetchCommand, sourceHeadCommand, stagingHeadCommand, aheadBehindCommand] = buildCloudDevCheckCommands();
  await run(fetchCommand, { cwd, env });
  const sourceHead = (await run(sourceHeadCommand, { cwd, env })).stdout.trim();
  const stagingHead = (await run(stagingHeadCommand, { cwd, env })).stdout.trim();
  const aheadBehind = parseAheadBehindCount((await run(aheadBehindCommand, { cwd, env })).stdout);
  const openPrs = JSON.parse((await run({
    file: 'gh',
    args: ['pr', 'list', '--base', stagingBranch, '--state', 'open', '--json', 'number', '--limit', '100']
  }, { cwd, env })).stdout || '[]');

  const report = analyzeCloudDevSync({
    sourceHead,
    stagingHead,
    aheadBehind,
    openPullRequestsTargetingCloudDev: openPrs.length,
    syncEnabled,
    mode
  });
  const result = { status: report.canSync ? 'ready' : 'checked', report, text: formatCloudDevSyncReport(report) };

  if (report.canSync) {
    for (const command of buildCloudDevFastForwardCommands()) {
      await run(command, { cwd, env });
    }
    result.status = 'synced';
  }

  await writeResult(result, { cwd });
  return result;
}

async function main() {
  const mode = readOption(process.argv.slice(2), 'mode', 'check');
  const result = await runCloudDevBranchCheck({ mode });
  process.stdout.write(result.text);
  if (mode === 'sync' && result.status !== 'synced') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [ ] **Step 4: Add sync success runner test**

Add a test that asserts `git push origin refs/remotes/origin/dev:refs/heads/cloud-dev` runs only when `mode='sync'`, `syncEnabled=true`, no open PRs, and ahead/behind is `sourceOnly > 0`, `stagingOnly=0`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/automation/cloud-dev-branch.test.mjs
```

Expected: PASS.

---

## Task 3: Cloud Dev Sync Workflow

**Files:**
- Create: `.github/workflows/cloud-dev-sync.yml`
- Create: `tests/automation/cloud-dev-workflow.test.mjs`

- [ ] **Step 1: Write workflow static tests**

Create `tests/automation/cloud-dev-workflow.test.mjs` with helper functions copied from `tests/automation/upstream-refresh-workflow.test.mjs`, then add tests:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const syncWorkflowPath = path.join(process.cwd(), '.github/workflows/cloud-dev-sync.yml');

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

function extractStepNames(documentText) {
  return [...documentText.matchAll(/^\s{6}- name:\s*(.+?)\s*$/gm)].map((match) => match[1]);
}

test('cloud dev sync workflow exposes check-first manual trigger and guarded schedule', async () => {
  const workflow = await readFile(syncWorkflowPath, 'utf8');
  const onBlock = extractTopLevelBlock(workflow, 'on');

  assert.match(onBlock, /^\s+workflow_dispatch:\s*$/m);
  assert.match(onBlock, /^\s{6}mode:\s*$/m);
  assert.match(onBlock, /^\s{8}default:\s*check\s*$/m);
  assert.match(onBlock, /^\s+schedule:\s*$/m);
});

test('cloud dev sync workflow keeps expected step order', async () => {
  const workflow = await readFile(syncWorkflowPath, 'utf8');

  assert.deepEqual(extractStepNames(workflow), [
    'Check out repository',
    'Set up Node.js',
    'Install dependencies',
    'Check cloud-dev branch state',
    'Upload cloud-dev sync result'
  ]);
});

test('cloud dev sync workflow does not auto-merge or unsafe force-push', async () => {
  const workflow = await readFile(syncWorkflowPath, 'utf8');

  assert.doesNotMatch(workflow, /gh\s+pr\s+merge/);
  assert.doesNotMatch(workflow, /--auto\b/);
  assert.doesNotMatch(workflow, /--force(?!-with-lease)/);
});
```

- [ ] **Step 2: Run workflow tests and verify failure**

Run:

```bash
node --test tests/automation/cloud-dev-workflow.test.mjs
```

Expected: FAIL because workflow does not exist.

- [ ] **Step 3: Create workflow**

Create `.github/workflows/cloud-dev-sync.yml`:

```yaml
name: Cloud Dev Sync

on:
  workflow_dispatch:
    inputs:
      mode:
        description: Check or fast-forward cloud-dev from origin/dev
        required: false
        default: check
        type: choice
        options:
          - check
          - sync
  schedule:
    - cron: '0 2 * * 1-5'

permissions:
  contents: write
  pull-requests: read

jobs:
  cloud-dev-sync:
    name: Check cloud-dev branch state
    if: ${{ github.event_name != 'schedule' || vars.CLOUD_DEV_SYNC_ENABLED == 'true' }}
    runs-on: ubuntu-latest

    steps:
      - name: Check out repository
        uses: actions/checkout@v6
        with:
          ref: main
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Check cloud-dev branch state
        env:
          GH_TOKEN: ${{ github.token }}
          CLOUD_DEV_SYNC_ENABLED: ${{ vars.CLOUD_DEV_SYNC_ENABLED }}
        run: node scripts/ci/check-cloud-dev-branch.mjs --mode=${{ github.event_name == 'workflow_dispatch' && inputs.mode || 'check' }}

      - name: Upload cloud-dev sync result
        if: ${{ always() && hashFiles('.harness/cloud-dev-sync-result.json') != '' }}
        uses: actions/upload-artifact@v7
        with:
          name: cloud-dev-sync-result
          path: .harness/cloud-dev-sync-result.json
          if-no-files-found: error
```

- [ ] **Step 4: Run workflow tests**

Run:

```bash
node --test tests/automation/cloud-dev-workflow.test.mjs
```

Expected: PASS.

---

## Task 4: Cloud Dev Issue Triage Library And Runner

**Files:**
- Create: `scripts/ci/lib/cloud-dev-issue.mjs`
- Create: `scripts/ci/run-cloud-dev-issue-triage.mjs`
- Test: `tests/automation/cloud-dev-issue.test.mjs`

- [ ] **Step 1: Write label and prompt tests**

Create `tests/automation/cloud-dev-issue.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  return import('../../scripts/ci/lib/cloud-dev-issue.mjs');
}

test('analyzeCloudDevIssue blocks issues without cloud-dev label', async () => {
  const { analyzeCloudDevIssue } = await loadModule();

  const result = analyzeCloudDevIssue({
    issue: { number: 12, title: 'Improve docs', labels: [{ name: 'documentation' }] },
    cloudDevReady: true
  });

  assert.equal(result.shouldComment, false);
  assert.equal(result.shouldPromptCopilot, false);
  assert.equal(result.reason, 'missing_cloud_dev_label');
});

test('analyzeCloudDevIssue builds normalized prompt for labeled planning issue', async () => {
  const { analyzeCloudDevIssue } = await loadModule();

  const result = analyzeCloudDevIssue({
    issue: {
      number: 12,
      title: 'Draft cloud pilot docs',
      labels: [{ name: 'cloud-dev' }, { name: 'agent:plan' }]
    },
    cloudDevReady: true
  });

  assert.equal(result.shouldComment, true);
  assert.equal(result.shouldPromptCopilot, true);
  assert.match(result.commentBody, /@copilot/);
  assert.match(result.commentBody, /Base branch: `cloud-dev`/);
  assert.match(result.commentBody, /Target PR base: `cloud-dev`/);
  assert.match(result.commentBody, /Do not push to `dev` or `main`/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/automation/cloud-dev-issue.test.mjs
```

Expected: FAIL because library does not exist.

- [ ] **Step 3: Implement issue library**

Create `scripts/ci/lib/cloud-dev-issue.mjs`:

```js
export const cloudDevLabel = 'cloud-dev';
export const taskLabels = new Set(['agent:plan', 'agent:impl', 'agent:test']);

function labelNames(issue = {}) {
  return (issue.labels ?? []).map((label) => typeof label === 'string' ? label : label.name).filter(Boolean);
}

export function selectTaskKind(labels = []) {
  return labels.find((label) => taskLabels.has(label)) ?? 'agent:plan';
}

export function buildCopilotPrompt({ issueNumber, issueTitle, taskKind }) {
  return [
    '@copilot please work on this issue in the cloud-dev lane.',
    '',
    `Issue: #${issueNumber} ${issueTitle}`,
    `Task kind: ${taskKind}`,
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

export function analyzeCloudDevIssue({ issue, cloudDevReady = false } = {}) {
  const labels = labelNames(issue);
  if (!labels.includes(cloudDevLabel)) {
    return { shouldComment: false, shouldPromptCopilot: false, reason: 'missing_cloud_dev_label' };
  }
  if (!cloudDevReady) {
    return {
      shouldComment: true,
      shouldPromptCopilot: false,
      reason: 'cloud_dev_not_ready',
      commentBody: 'Cloud dev preflight is not ready. The agent task was not started.'
    };
  }
  const taskKind = selectTaskKind(labels);
  return {
    shouldComment: true,
    shouldPromptCopilot: true,
    reason: 'ready',
    taskKind,
    commentBody: buildCopilotPrompt({
      issueNumber: issue.number,
      issueTitle: issue.title,
      taskKind
    })
  };
}

export function buildIssueCommentCommand({ issueNumber, body }) {
  return { file: 'gh', args: ['issue', 'comment', String(issueNumber), '--body', body] };
}
```

- [ ] **Step 4: Add runner tests with injected event**

Add tests that call `runCloudDevIssueTriage({ event, cloudDevReady: true, runCommand })` and assert it builds `gh issue comment <number> --body <prompt>` when ready, and skips comments when label is absent.

- [ ] **Step 5: Implement runner**

Create `scripts/ci/run-cloud-dev-issue-triage.mjs`:

```js
#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { analyzeCloudDevIssue, buildIssueCommentCommand } from './lib/cloud-dev-issue.mjs';

const execFileAsync = promisify(execFile);
const resultPath = '.harness/cloud-dev-issue-triage-result.json';

export async function runCommand(command, { cwd = process.cwd(), env = process.env } = {}) {
  const { stdout, stderr } = await execFileAsync(command.file, command.args ?? [], {
    cwd,
    env,
    shell: false,
    maxBuffer: 1024 * 1024
  });
  return { stdout, stderr };
}

async function writeResult(result, { cwd = process.cwd() } = {}) {
  const resolvedPath = path.resolve(cwd, resultPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

export async function runCloudDevIssueTriage({
  cwd = process.cwd(),
  env = process.env,
  event,
  cloudDevReady = env.CLOUD_DEV_READY === 'true',
  runCommand: run = runCommand
} = {}) {
  const issue = event?.issue;
  const analysis = analyzeCloudDevIssue({ issue, cloudDevReady });

  if (analysis.shouldComment) {
    await run(buildIssueCommentCommand({ issueNumber: issue.number, body: analysis.commentBody }), { cwd, env });
  }

  const result = { status: analysis.reason, issue: issue?.number, analysis };
  await writeResult(result, { cwd });
  return result;
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required.');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  await runCloudDevIssueTriage({ event });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/automation/cloud-dev-issue.test.mjs
```

Expected: PASS.

---

## Task 5: Cloud Dev Issue Triage Workflow

**Files:**
- Create: `.github/workflows/cloud-dev-issue-triage.yml`
- Modify: `tests/automation/cloud-dev-workflow.test.mjs`

- [ ] **Step 1: Add workflow tests**

Append tests:

```js
const issueWorkflowPath = path.join(process.cwd(), '.github/workflows/cloud-dev-issue-triage.yml');

test('cloud dev issue triage workflow listens to issues comments and manual dispatch', async () => {
  const workflow = await readFile(issueWorkflowPath, 'utf8');
  const onBlock = extractTopLevelBlock(workflow, 'on');

  assert.match(onBlock, /^\s+issues:\s*$/m);
  assert.match(onBlock, /^\s+issue_comment:\s*$/m);
  assert.match(onBlock, /^\s+workflow_dispatch:\s*$/m);
});

test('cloud dev issue triage workflow has read/write permissions only for issue comments', async () => {
  const workflow = await readFile(issueWorkflowPath, 'utf8');

  assert.match(workflow, /^\s{2}issues:\s*write\s*$/m);
  assert.match(workflow, /^\s{2}contents:\s*read\s*$/m);
  assert.doesNotMatch(workflow, /^\s{2}contents:\s*write\s*$/m);
  assert.doesNotMatch(workflow, /^\s{2}pull-requests:\s*write\s*$/m);
});
```

- [ ] **Step 2: Create workflow**

Create `.github/workflows/cloud-dev-issue-triage.yml`:

```yaml
name: Cloud Dev Issue Triage

on:
  issues:
    types: [opened, labeled, assigned]
  issue_comment:
    types: [created]
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  cloud-dev-issue-triage:
    name: Triage cloud-dev issue
    if: ${{ vars.CLOUD_DEV_ISSUE_TRIAGE_ENABLED == 'true' }}
    runs-on: ubuntu-latest

    steps:
      - name: Check out repository
        uses: actions/checkout@v6
        with:
          ref: main
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Check cloud-dev branch state
        env:
          GH_TOKEN: ${{ github.token }}
          CLOUD_DEV_SYNC_ENABLED: 'false'
        run: node scripts/ci/check-cloud-dev-branch.mjs --mode=check

      - name: Run cloud-dev issue triage
        env:
          GH_TOKEN: ${{ github.token }}
          CLOUD_DEV_READY: ${{ hashFiles('.harness/cloud-dev-sync-result.json') != '' }}
        run: node scripts/ci/run-cloud-dev-issue-triage.mjs

      - name: Upload cloud-dev issue triage result
        if: ${{ always() && hashFiles('.harness/cloud-dev-issue-triage-result.json') != '' }}
        uses: actions/upload-artifact@v7
        with:
          name: cloud-dev-issue-triage-result
          path: .harness/cloud-dev-issue-triage-result.json
          if-no-files-found: error
```

- [ ] **Step 3: Tighten readiness handoff**

The `CLOUD_DEV_READY` expression above only confirms result file existence. Replace it with a small Node step that reads `.harness/cloud-dev-sync-result.json` and writes `ready=true|false` to `GITHUB_OUTPUT` based on allowed reasons (`check_only`, `already_up_to_date`, `ready_to_fast_forward`) before issue triage.

- [ ] **Step 4: Run workflow tests**

Run:

```bash
node --test tests/automation/cloud-dev-workflow.test.mjs
```

Expected: PASS.

---

## Task 6: Documentation And Operator Workflow

**Files:**
- Create: `docs/cloud-dev-harness.md`
- Modify: `docs/workflows.md`
- Modify: `docs/install/copilot.md`
- Modify: `docs/maintenance.md`

- [ ] **Step 1: Add cloud dev operator doc**

Create `docs/cloud-dev-harness.md` with these sections:

```md
# Cloud Dev Harness

## Purpose

Cloud Dev Harness is a remote-only GitHub development lane for Copilot cloud agent work. It keeps cloud task output away from `dev` and `main` until PR review and verification pass.

## Branches

| Branch | Role |
| --- | --- |
| `cloud-dev` | Protected staging branch based on `origin/dev`. |
| `cloud-dev/<issue>-<slug>` | Per-task work branch. |
| `dev` | Human/local integration branch. |
| `main` | Release/default branch. |

## Labels

- `cloud-dev`: opt an issue into cloud lane triage.
- `agent:plan`: ask for planning/docs-first output.
- `agent:test`: ask for tests or verification work.
- `agent:impl`: ask for implementation after the pilot is trusted.

## Required Checks

- `npm run verify`
- `./scripts/harness verify --output=.harness/verification`
- `./scripts/harness doctor --check-only`

## Promotion

1. Cloud task branch opens PR to `cloud-dev`.
2. Human reviews and merges to `cloud-dev`.
3. A separate PR promotes `cloud-dev` to `dev`.
4. Local `dev` is updated only when a developer explicitly fetches or runs a local sync helper.

## Recovery

- If `cloud-dev` is ahead of `origin/dev`, do not force-sync it.
- If `cloud-dev` diverged from `origin/dev`, stop and inspect open PRs.
- If issue triage comments a blocking reason, fix the branch or label state before assigning Copilot.
```

- [ ] **Step 2: Update workflows doc**

Add a `cloud-dev` lane to `docs/workflows.md` after `verify` or before `finish`:

```md
### `cloud-dev`

Use `cloud-dev` when work is delegated to Copilot cloud agent and must stay remote until reviewed.

- Treat `cloud-dev` as remote-only staging based on `origin/dev`.
- Use per-task branches for agent work.
- Merge cloud output into `dev` only through PR.
- Do not auto-sync `cloud-dev` into local checkouts.

Typical commands:

```bash
node scripts/ci/check-cloud-dev-branch.mjs --mode=check
npm run verify
./scripts/harness doctor --check-only
```
```

- [ ] **Step 3: Update Copilot install doc**

In `docs/install/copilot.md`, add a subsection `Cloud Dev Harness Pilot`:

```md
For the cloud-dev lane, keep the install workspace-only and cloud-safe:

```bash
./scripts/harness install --targets=copilot --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
```

Do not use `adopt-global`, `--scope=user-global`, or `--scope=both` for the cloud-dev lane.
```

- [ ] **Step 4: Update maintenance doc**

Add a maintenance section documenting:

- `CLOUD_DEV_SYNC_ENABLED`
- `CLOUD_DEV_ISSUE_TRIAGE_ENABLED`
- check-only default behavior
- no auto-merge
- local checkout remains unchanged unless explicitly synced

- [ ] **Step 5: Run docs grep checks**

Run:

```bash
rg "cloud-dev|Cloud Dev Harness|CLOUD_DEV" docs .github scripts tests
```

Expected: new references are present in docs, workflows, scripts, and tests.

---

## Task 7: Verification And Rollout Gate

**Files:**
- Modify: `planning/active/cloud-dev-harness-feasibility/progress.md`
- Optional Modify: `planning/active/cloud-dev-harness-feasibility/task_plan.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test tests/automation/cloud-dev-branch.test.mjs tests/automation/cloud-dev-issue.test.mjs tests/automation/cloud-dev-workflow.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full automation tests**

Run:

```bash
node --test tests/automation/*.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
./scripts/harness verify --output=.harness/verification
./scripts/harness doctor --check-only
git diff --check
```

Expected: all pass.

- [ ] **Step 4: Run dry-run behavior manually**

Run locally only for check mode:

```bash
node scripts/ci/check-cloud-dev-branch.mjs --mode=check
```

Expected:

- command exits successfully if remote refs exist
- `.harness/cloud-dev-sync-result.json` is created
- no local branch checkout occurs
- no local `dev` changes occur

- [ ] **Step 5: Record implementation evidence**

Append to `planning/active/cloud-dev-harness-feasibility/progress.md`:

```md
## Implementation Evidence

- Focused tests: <pass/fail and command>
- Full automation tests: <pass/fail and command>
- Full verification: <pass/fail and command>
- Manual check mode: <pass/fail and command>
- Changed files: <summary>
```

- [ ] **Step 6: Human rollout checklist**

Before enabling GitHub-side behavior, complete these manual steps:

1. Create `cloud-dev` from `origin/dev`.
2. Configure branch protection on `cloud-dev`.
3. Set repository variable `CLOUD_DEV_ISSUE_TRIAGE_ENABLED=false` initially.
4. Set repository variable `CLOUD_DEV_SYNC_ENABLED=false` initially.
5. Merge workflow and cloud harness baseline to `main` so hooks are available to cloud agent.
6. Run `cloud-dev-sync` manually with `mode=check`.
7. Enable `CLOUD_DEV_ISSUE_TRIAGE_ENABLED=true` for a docs-only pilot.
8. Keep `CLOUD_DEV_SYNC_ENABLED=false` until check-only runs are trusted.

---

## Self-Review Checklist

- Spec coverage: This plan covers branch topology, base sync, issue triage, cloud harness surface, docs, tests, verification, and rollout.
- Placeholder scan: No unresolved placeholder markers or vague test-only sections should remain.
- Type consistency: `sourceOnly` / `stagingOnly`, `cloud-dev`, `origin/dev`, and result paths are used consistently across snippets.
- Safety: No auto-merge is introduced. No direct write to `dev` or `main` is introduced. Local sync remains explicit and separate.
