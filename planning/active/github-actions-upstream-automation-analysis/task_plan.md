# Task Plan: GitHub Actions Upstream Automation Analysis

## Goal
分析是否可以用 GitHub Actions 定期监测 Superpowers 和 Planning with Files 主源变更，并在本项目内自动更新、审查、验证、合并与处理 PR。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase
Phase 6

## Phases

### Phase 1: 仓库上下文与约束确认
- [x] 读取用户问题与仓库工作流约束
- [x] 确认已有 upstream update 能力与 planning 任务状态
- [x] 确认本次只做分析、不改源码
- **Status:** complete

### Phase 2: 外部能力与风险调研
- [x] 查阅 GitHub Actions、PR、auto-merge、权限和相关官方文档
- [x] 结合本项目 upstream source 设计判断可行方案
- [x] 记录关键发现
- **Status:** complete

### Phase 3: 分析结论交付
- [x] 给出推荐架构
- [x] 列出可自动化部分、需人工审批部分、风险与落地条件
- [x] 更新 planning 文件并向用户汇报
- **Status:** complete

### Phase 4: README 精简同步
- [x] 根据已确认的 Git source 状态，精简 README 的 upstream 更新说明
- [x] 确认 README 不再出现旧的本地 `--from` 指令
- **Status:** complete

### Phase 5: GitHub Actions 落地计划评审
- [x] 结合当前仓库与 GitHub 远端状态复核自动化前提
- [x] 审核“每周五拉取 upstream 更新并最终落到 origin dev”的计划路径
- [x] 输出计划风险、缺口和建议执行顺序
- **Status:** complete

### Phase 6: 可执行实现计划编写
- [x] 按 `writing-plans` 规则产出可落地执行的分步实现计划
- [x] 将实现计划写入当前 task 的 durable planning 文件
- [x] 将任务状态切换为 `waiting_review`
- **Status:** complete

## Key Questions
1. GitHub Actions 是否能定期检测两个 upstream 主源的变更？
2. Actions 是否能安全触发本项目已有 `fetch` / `update` 流程？
3. 更新后自动代码审查、验证、自动合并和 PR 处理分别能做到什么程度？
4. 哪些环节必须设置权限、分支保护或人工审批，避免供应链和权限风险？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本次只做分析，不改源码 | 用户明确要求“不要动代码，先分析” |
| 新建独立 planning 任务目录 | 相关旧任务已关闭，不应把新任务写入已关闭任务 |
| 不自动归档旧任务 | 仓库规则要求不要自动移动历史 active 目录，除非明确要求 |
| 推荐使用 PR + required checks + auto-merge，而不是直接推默认分支 | upstream 更新属于供应链变更，必须保留审查面和分支保护 |
| 推荐用 GitHub App token 处理推分支/开 PR | `GITHUB_TOKEN` 触发的 push/pull_request 事件不会创建新的 workflow run，容易让 PR 检查链断掉 |
| `planning-with-files` 已具备自动监测前提 | 已确认并配置 Git source：`https://github.com/OthmanAdi/planning-with-files` |
| 复用现有 `github-actions-upstream-automation-analysis` 任务继续记录本轮评审 | 当前用户请求与既有 task goal 同域，重复新建 task 会制造平行 planning 状态 |
| 计划必须以默认分支 `main` 上的 schedule workflow 为入口，再通过 PR 落到 `dev` | GitHub `schedule` 仅在默认分支运行；远端默认分支已核实为 `main` |
| 计划中的“拉 upstream 更新”应映射为 Harness `fetch/update/sync/verify/doctor` 链路，而不是仓库 remote `upstream` pull | 当前仓库只配置了 `origin` remote；真正的 upstream 来源定义在 `harness/upstream/sources.json` |
| 在 Actions 中必须先显式安装 workspace state，再跑 `sync/verify/doctor` | 当前仓库 `.harness/state.json` 为 `user-global` scope，不适合作为 CI 的隐式前提 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` 不存在 | 1 | 按降级策略改用 `rg --files` |

## Notes
- 需要用中文输出分析；代码相关名称、命令、workflow 字段保持英文。
- 不运行 frontend dev/build/start/serve；本次也不进行实现。
- 本轮新增计划评审只给出方案修正，不创建 workflow、不推分支、不改 GitHub 设置。

## Implementation Plan

# GitHub Upstream Refresh Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub Actions workflow that runs weekly from `main`, rebases work onto `origin/dev`, refreshes Harness upstream baselines, validates the result, and opens or updates a PR targeting `dev` when repo-owned files changed.

**Architecture:** Keep v1 in a single scheduled workflow so validation happens before any PR is created, avoiding `GITHUB_TOKEN` recursion issues. Use repo-local Node scripts for branch preparation, refresh orchestration, diff allowlisting, and PR creation so the behavior is testable with the existing `node --test` suite. Land changes through a deterministic automation branch targeting `dev`; do not auto-merge in v1.

**Tech Stack:** GitHub Actions, Node.js built-ins (`node:child_process`, `node:fs/promises`, `node:test`), Git CLI, GitHub CLI, existing Harness CLI commands

---

## File Map

- Create: `.github/workflows/upstream-refresh.yml` — scheduled/manual workflow entrypoint that runs on `main` but prepares a working branch from `origin/dev`.
- Create: `scripts/ci/lib/upstream-refresh.mjs` — pure planning helpers for branch prep, command chain, and diff allowlist checks.
- Create: `scripts/ci/run-upstream-refresh.mjs` — CLI entrypoint that executes the refresh chain and emits machine-readable status.
- Create: `scripts/ci/lib/upstream-pr.mjs` — PR title/body/branch helpers for a deterministic automation PR.
- Create: `scripts/ci/open-upstream-pr.mjs` — CLI entrypoint that commits changed files, force-pushes the automation branch, and creates or updates the PR to `dev`.
- Create: `tests/automation/upstream-refresh-lib.test.mjs` — unit tests for command sequencing, base-branch prep, and diff allowlist logic.
- Create: `tests/automation/upstream-pr-lib.test.mjs` — unit tests for PR metadata and changed-file filtering.
- Create: `tests/automation/upstream-refresh-workflow.test.mjs` — repo contract test for workflow triggers, permissions, and script wiring.
- Modify: `package.json` — extend `verify` coverage to include `tests/automation/*.test.mjs`.
- Modify: `docs/maintenance.md` — document the scheduled refresh flow, manual recovery path, and v1 non-goals.

## Rollout Gates

- Gate 1: v1 does **not** auto-merge to `dev`.
- Gate 2: v1 uses `GITHUB_TOKEN` because validation and PR creation happen in the same workflow run.
- Gate 3: the workflow must branch from `origin/dev`, not from the checked-out `main` commit.
- Gate 4: the PR may include only repo-owned upstream/projection/doc files; `.harness/projections.json` must be treated as runtime state and excluded from commits.
- Gate 5: if refresh, sync, allowlist, commit, or PR operations fail, the workflow fails and leaves no direct branch update on `dev`.

### Task 1: Add Automation Contract Tests

**Files:**
- Create: `tests/automation/upstream-refresh-workflow.test.mjs`
- Create: `tests/automation/upstream-refresh-lib.test.mjs`
- Create: `tests/automation/upstream-pr-lib.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing workflow contract test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('upstream refresh workflow exists with schedule and manual trigger', async () => {
  const workflow = await readFile('.github/workflows/upstream-refresh.yml', 'utf8');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron:\s*['"]0 21 \* \* 5['"]/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*write/);
  assert.match(workflow, /pull-requests:\s*write/);
  assert.match(workflow, /node scripts\/ci\/run-upstream-refresh\.mjs/);
  assert.match(workflow, /node scripts\/ci\/open-upstream-pr\.mjs/);
});

test('package verify includes automation tests', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(pkg.scripts.verify, /tests\/automation\/\*\.test\.mjs/);
});
```

- [ ] **Step 2: Write the failing refresh helper test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedCommitPaths,
  buildRefreshCommands,
  normalizeChangedFiles
} from '../../scripts/ci/lib/upstream-refresh.mjs';

test('buildRefreshCommands prepares branch from origin/dev before running Harness commands', () => {
  const commands = buildRefreshCommands({ baseRef: 'origin/dev', branchName: 'automation/upstream-refresh' });
  assert.deepEqual(commands[0], ['git', ['fetch', 'origin', 'main', 'dev']]);
  assert.deepEqual(commands[1], ['git', ['checkout', '-B', 'automation/upstream-refresh', 'origin/dev']]);
  assert.deepEqual(commands[2], ['./scripts/harness', ['install', '--scope=workspace', '--targets=all', '--projection=link']]);
  assert.deepEqual(commands[3], ['./scripts/harness', ['fetch']]);
  assert.deepEqual(commands.at(-1), ['./scripts/harness', ['doctor']]);
});

test('normalizeChangedFiles removes empty lines and runtime-only state files', () => {
  assert.deepEqual(
    normalizeChangedFiles('harness/upstream/superpowers/SKILL.md\n.harness/projections.json\n\nAGENTS.md\n'),
    ['harness/upstream/superpowers/SKILL.md', 'AGENTS.md']
  );
});

test('allowedCommitPaths matches repo-owned upstream and projection paths only', () => {
  assert.equal(allowedCommitPaths('harness/upstream/superpowers/SKILL.md'), true);
  assert.equal(allowedCommitPaths('.github/skills/planning-with-files/SKILL.md'), true);
  assert.equal(allowedCommitPaths('.harness/projections.json'), false);
  assert.equal(allowedCommitPaths('src/random.js'), false);
});
```

- [ ] **Step 3: Write the failing PR helper test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrBody, buildPrTitle, hasCommitEligibleChanges } from '../../scripts/ci/lib/upstream-pr.mjs';

test('buildPrTitle is stable and targets dev refreshes', () => {
  assert.equal(buildPrTitle(), 'chore: refresh upstream baselines');
});

test('buildPrBody lists changed files and executed commands', () => {
  const body = buildPrBody({
    changedFiles: ['harness/upstream/superpowers/SKILL.md', 'AGENTS.md'],
    commands: ['./scripts/harness fetch', './scripts/harness update', 'npm run verify']
  });
  assert.match(body, /Base branch: `dev`/);
  assert.match(body, /harness\/upstream\/superpowers\/SKILL\.md/);
  assert.match(body, /npm run verify/);
});

test('hasCommitEligibleChanges returns false for an empty diff', () => {
  assert.equal(hasCommitEligibleChanges([]), false);
  assert.equal(hasCommitEligibleChanges(['AGENTS.md']), true);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `node --test tests/automation/upstream-refresh-workflow.test.mjs tests/automation/upstream-refresh-lib.test.mjs tests/automation/upstream-pr-lib.test.mjs -v`

Expected: FAIL with `ENOENT` for workflow/scripts or module resolution errors because the files do not exist yet.

- [ ] **Step 5: Implement the minimal test scaffolding**

```yaml
# .github/workflows/upstream-refresh.yml
name: Upstream Refresh

on:
  schedule:
    - cron: '0 21 * * 5'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: node scripts/ci/run-upstream-refresh.mjs
      - run: node scripts/ci/open-upstream-pr.mjs
```

```js
// scripts/ci/lib/upstream-refresh.mjs
export function buildRefreshCommands({ baseRef, branchName }) {
  return [
    ['git', ['fetch', 'origin', 'main', 'dev']],
    ['git', ['checkout', '-B', branchName, baseRef]],
    ['./scripts/harness', ['install', '--scope=workspace', '--targets=all', '--projection=link']],
    ['./scripts/harness', ['fetch']],
    ['./scripts/harness', ['update']],
    ['npm', ['run', 'verify']],
    ['./scripts/harness', ['worktree-preflight']],
    ['./scripts/harness', ['sync', '--dry-run']],
    ['./scripts/harness', ['sync']],
    ['./scripts/harness', ['doctor']]
  ];
}

export function normalizeChangedFiles(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== '.harness/projections.json');
}

export function allowedCommitPaths(file) {
  return [
    /^harness\/upstream\//,
    /^AGENTS\.md$/,
    /^CLAUDE\.md$/,
    /^\.github\/copilot-instructions\.md$/,
    /^\.github\/skills\//,
    /^\.agents\/skills\//,
    /^\.cursor\/rules\//,
    /^\.cursor\/skills\//,
    /^\.claude\/skills\//,
    /^docs\/maintenance\.md$/
  ].some((pattern) => pattern.test(file));
}
```

```js
// scripts/ci/lib/upstream-pr.mjs
export function buildPrTitle() {
  return 'chore: refresh upstream baselines';
}

export function hasCommitEligibleChanges(files) {
  return files.length > 0;
}

export function buildPrBody({ changedFiles, commands }) {
  return [
    '## Summary',
    '',
    'Automated upstream refresh targeting `dev`.',
    '',
    'Base branch: `dev`',
    '',
    '### Changed files',
    ...changedFiles.map((file) => `- \`${file}\``),
    '',
    '### Validation',
    ...commands.map((command) => `- \`${command}\``)
  ].join('\n');
}
```

```js
// scripts/ci/run-upstream-refresh.mjs
console.log('stub');
```

```js
// scripts/ci/open-upstream-pr.mjs
console.log('stub');
```

```json
// package.json
{
  "scripts": {
    "test": "node --test",
    "test:core": "node --test tests/core/*.test.mjs",
    "verify": "node --test tests/core/*.test.mjs tests/installer/*.test.mjs tests/adapters/*.test.mjs tests/automation/*.test.mjs"
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test tests/automation/upstream-refresh-workflow.test.mjs tests/automation/upstream-refresh-lib.test.mjs tests/automation/upstream-pr-lib.test.mjs -v`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json .github/workflows/upstream-refresh.yml scripts/ci/lib/upstream-refresh.mjs scripts/ci/lib/upstream-pr.mjs scripts/ci/run-upstream-refresh.mjs scripts/ci/open-upstream-pr.mjs tests/automation/upstream-refresh-workflow.test.mjs tests/automation/upstream-refresh-lib.test.mjs tests/automation/upstream-pr-lib.test.mjs
git commit -m "test: add upstream refresh automation contracts"
```

### Task 2: Implement the Refresh Runner

**Files:**
- Modify: `scripts/ci/lib/upstream-refresh.mjs`
- Modify: `scripts/ci/run-upstream-refresh.mjs`
- Modify: `tests/automation/upstream-refresh-lib.test.mjs`

- [ ] **Step 1: Extend the failing refresh test to cover execution ordering and diff output**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRefresh } from '../../scripts/ci/lib/upstream-refresh.mjs';

test('runRefresh executes commands in order and returns changed files', async () => {
  const calls = [];
  const result = await runRefresh({
    baseRef: 'origin/dev',
    branchName: 'automation/upstream-refresh',
    exec: async (command, args) => {
      calls.push([command, args]);
      if (command === 'git' && args[0] === 'status') {
        return { stdout: 'harness/upstream/superpowers/SKILL.md\n.harness/projections.json\nAGENTS.md\n' };
      }
      return { stdout: '' };
    }
  });

  assert.equal(calls[0][0], 'git');
  assert.deepEqual(calls[0][1], ['fetch', 'origin', 'main', 'dev']);
  assert.deepEqual(result.changedFiles, ['harness/upstream/superpowers/SKILL.md', 'AGENTS.md']);
  assert.deepEqual(result.commands.at(-1), './scripts/harness doctor');
});

test('runRefresh throws when a changed file is outside the allowlist', async () => {
  await assert.rejects(
    runRefresh({
      baseRef: 'origin/dev',
      branchName: 'automation/upstream-refresh',
      exec: async (command, args) => {
        if (command === 'git' && args[0] === 'status') {
          return { stdout: 'src/unexpected.js\n' };
        }
        return { stdout: '' };
      }
    }),
    /Unexpected changed file: src\/unexpected\.js/
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/automation/upstream-refresh-lib.test.mjs -v`

Expected: FAIL because `runRefresh` does not exist yet.

- [ ] **Step 3: Implement the refresh library and CLI**

```js
// scripts/ci/lib/upstream-refresh.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function buildRefreshCommands({ baseRef, branchName }) {
  return [
    ['git', ['fetch', 'origin', 'main', 'dev']],
    ['git', ['checkout', '-B', branchName, baseRef]],
    ['./scripts/harness', ['install', '--scope=workspace', '--targets=all', '--projection=link']],
    ['./scripts/harness', ['fetch']],
    ['./scripts/harness', ['update']],
    ['npm', ['run', 'verify']],
    ['./scripts/harness', ['worktree-preflight']],
    ['./scripts/harness', ['sync', '--dry-run']],
    ['./scripts/harness', ['sync']],
    ['./scripts/harness', ['doctor']]
  ];
}

export function normalizeChangedFiles(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== '.harness/projections.json');
}

export function allowedCommitPaths(file) {
  return [
    /^harness\/upstream\//,
    /^AGENTS\.md$/,
    /^CLAUDE\.md$/,
    /^\.github\/copilot-instructions\.md$/,
    /^\.github\/skills\//,
    /^\.agents\/skills\//,
    /^\.cursor\/rules\//,
    /^\.cursor\/skills\//,
    /^\.claude\/skills\//,
    /^docs\/maintenance\.md$/
  ].some((pattern) => pattern.test(file));
}

export async function runRefresh({
  baseRef = 'origin/dev',
  branchName = 'automation/upstream-refresh',
  exec = (command, args) => execFileAsync(command, args, { cwd: process.cwd() })
} = {}) {
  const commands = [];

  for (const [command, args] of buildRefreshCommands({ baseRef, branchName })) {
    commands.push([command, ...args].join(' '));
    await exec(command, args);
  }

  const { stdout } = await exec('git', ['status', '--porcelain', '--untracked-files=no', '--', 'harness/upstream', 'AGENTS.md', 'CLAUDE.md', '.github', '.agents', '.cursor', '.claude', 'docs/maintenance.md']);
  const changedFiles = normalizeChangedFiles(
    stdout
      .split('\n')
      .map((line) => line.slice(3))
      .join('\n')
  );

  for (const file of changedFiles) {
    if (!allowedCommitPaths(file)) {
      throw new Error(`Unexpected changed file: ${file}`);
    }
  }

  return { changedFiles, commands };
}
```

```js
// scripts/ci/run-upstream-refresh.mjs
import { writeFile } from 'node:fs/promises';
import { runRefresh } from './lib/upstream-refresh.mjs';

const result = await runRefresh();
await writeFile('.harness/upstream-refresh-result.json', `${JSON.stringify(result, null, 2)}\n`);

if (result.changedFiles.length === 0) {
  console.log('No repo-owned changes detected.');
  process.exit(0);
}

console.log(`Detected ${result.changedFiles.length} repo-owned changed file(s).`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/automation/upstream-refresh-lib.test.mjs -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/lib/upstream-refresh.mjs scripts/ci/run-upstream-refresh.mjs tests/automation/upstream-refresh-lib.test.mjs
git commit -m "feat: add upstream refresh runner"
```

### Task 3: Implement Deterministic PR Creation

**Files:**
- Modify: `scripts/ci/lib/upstream-pr.mjs`
- Modify: `scripts/ci/open-upstream-pr.mjs`
- Modify: `tests/automation/upstream-pr-lib.test.mjs`

- [ ] **Step 1: Extend the failing PR helper test to cover branch and body generation**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { automationBranchName, buildPrBody, buildPrTitle, createCommitMessage } from '../../scripts/ci/lib/upstream-pr.mjs';

test('automationBranchName is stable', () => {
  assert.equal(automationBranchName(), 'automation/upstream-refresh');
});

test('createCommitMessage is stable', () => {
  assert.equal(createCommitMessage(), 'chore: refresh upstream baselines');
});

test('buildPrBody includes changed files and validation commands', () => {
  const body = buildPrBody({
    changedFiles: ['AGENTS.md'],
    commands: ['./scripts/harness fetch', './scripts/harness update']
  });
  assert.match(body, /AGENTS\.md/);
  assert.match(body, /Base branch: `dev`/);
  assert.match(body, /\.\/scripts\/harness fetch/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/automation/upstream-pr-lib.test.mjs -v`

Expected: FAIL because the new helpers do not exist yet.

- [ ] **Step 3: Implement the PR helper library and CLI**

```js
// scripts/ci/lib/upstream-pr.mjs
export function automationBranchName() {
  return 'automation/upstream-refresh';
}

export function buildPrTitle() {
  return 'chore: refresh upstream baselines';
}

export function createCommitMessage() {
  return 'chore: refresh upstream baselines';
}

export function hasCommitEligibleChanges(files) {
  return files.length > 0;
}

export function buildPrBody({ changedFiles, commands }) {
  return [
    '## Summary',
    '',
    'Automated upstream refresh targeting `dev`.',
    '',
    'Base branch: `dev`',
    '',
    '### Changed files',
    ...changedFiles.map((file) => `- \`${file}\``),
    '',
    '### Validation',
    ...commands.map((command) => `- \`${command}\``)
  ].join('\n');
}
```

```js
// scripts/ci/open-upstream-pr.mjs
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  automationBranchName,
  buildPrBody,
  buildPrTitle,
  createCommitMessage,
  hasCommitEligibleChanges
} from './lib/upstream-pr.mjs';

const execFileAsync = promisify(execFile);
const result = JSON.parse(await readFile('.harness/upstream-refresh-result.json', 'utf8'));

if (!hasCommitEligibleChanges(result.changedFiles)) {
  console.log('No PR needed.');
  process.exit(0);
}

const branch = automationBranchName();
await execFileAsync('git', ['add', ...result.changedFiles]);
await execFileAsync('git', ['commit', '-m', createCommitMessage()]);
await execFileAsync('git', ['push', '--force-with-lease', 'origin', `${branch}:${branch}`]);

const title = buildPrTitle();
const body = buildPrBody(result);

try {
  await execFileAsync('gh', ['pr', 'create', '--base', 'dev', '--head', branch, '--title', title, '--body', body]);
} catch {
  await execFileAsync('gh', ['pr', 'edit', branch, '--title', title, '--body', body]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/automation/upstream-pr-lib.test.mjs -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/lib/upstream-pr.mjs scripts/ci/open-upstream-pr.mjs tests/automation/upstream-pr-lib.test.mjs
git commit -m "feat: add upstream refresh PR automation"
```

### Task 4: Finish Workflow Wiring and Operator Docs

**Files:**
- Modify: `.github/workflows/upstream-refresh.yml`
- Modify: `docs/maintenance.md`
- Modify: `tests/automation/upstream-refresh-workflow.test.mjs`

- [ ] **Step 1: Extend the workflow contract test to cover conditional PR creation and result artifact**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('workflow persists refresh result and only opens PR after refresh step', async () => {
  const workflow = await readFile('.github/workflows/upstream-refresh.yml', 'utf8');
  assert.match(workflow, /id:\s*refresh/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /\.harness\/upstream-refresh-result\.json/);
  assert.match(workflow, /if:\s*steps\.refresh\.outcome == 'success'/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/automation/upstream-refresh-workflow.test.mjs -v`

Expected: FAIL because the workflow is still the stub version.

- [ ] **Step 3: Implement the final workflow and maintenance docs**

```yaml
# .github/workflows/upstream-refresh.yml
name: Upstream Refresh

on:
  schedule:
    - cron: '0 21 * * 5'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: upstream-refresh
  cancel-in-progress: false

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run upstream refresh
        id: refresh
        run: node scripts/ci/run-upstream-refresh.mjs

      - name: Upload refresh result
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: upstream-refresh-result
          path: .harness/upstream-refresh-result.json

      - name: Open or update PR
        if: steps.refresh.outcome == 'success'
        env:
          GH_TOKEN: ${{ github.token }}
        run: node scripts/ci/open-upstream-pr.mjs
```

```md
## GitHub Actions Upstream Refresh

The repository can run a scheduled refresh from the workflow stored on `main`.
The workflow checks out the repo, rebases work onto `origin/dev`, runs:

    ./scripts/harness install --scope=workspace --targets=all --projection=link
    ./scripts/harness fetch
    ./scripts/harness update
    npm run verify
    ./scripts/harness worktree-preflight
    ./scripts/harness sync --dry-run
    ./scripts/harness sync
    ./scripts/harness doctor

If repo-owned files changed, the workflow force-updates `automation/upstream-refresh` and opens or updates a PR targeting `dev`.
The workflow does not auto-merge in v1. Merge remains a reviewer action.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/automation/upstream-refresh-workflow.test.mjs -v`

Expected: PASS

- [ ] **Step 5: Run repository verification**

Run: `npm run verify`

Expected: PASS, including the new `tests/automation/*.test.mjs` suite.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/upstream-refresh.yml docs/maintenance.md tests/automation/upstream-refresh-workflow.test.mjs
git commit -m "docs: wire upstream refresh workflow"
```

### Task 5: Manual Repository Settings Checklist

**Files:**
- Modify: `docs/maintenance.md`

- [ ] **Step 1: Document the repo settings that must be applied manually after merge**

```md
### Post-merge repository settings

1. Keep `main` as the default branch so `schedule` remains active.
2. Verify Actions workflow permissions allow `contents: write` and `pull-requests: write`.
3. Optionally protect `dev` and add required checks before enabling any future auto-merge phase.
4. Do not enable direct bot pushes to `dev`; keep the automation branch + PR path.
```

- [ ] **Step 2: Run a focused docs check**

Run: `rg -n "auto-merge|automation/upstream-refresh|schedule" docs/maintenance.md`

Expected: Matches show the new scheduled refresh section and the explicit v1 no-auto-merge note.

- [ ] **Step 3: Commit**

```bash
git add docs/maintenance.md
git commit -m "docs: add upstream refresh rollout checklist"
```

## Self-Review

- Spec coverage: 覆盖了默认分支 `main` 上的定时触发、以 `origin/dev` 为工作基线、Harness 命令链刷新、repo-owned diff allowlist、PR 创建/更新、v1 不自动合并、以及手工仓库设置收尾。
- Placeholder scan: 计划中没有 `TBD`、`TODO`、`implement later`、`similar to task N` 这类占位语；每个代码步骤都给出了完整片段和明确命令。
- Type consistency: `automation/upstream-refresh`、`origin/dev`、`chore: refresh upstream baselines`、`.harness/upstream-refresh-result.json`、`runRefresh()` 等关键名字在各任务中保持一致。
