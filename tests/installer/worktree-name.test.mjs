import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function git(cwd, ...args) {
  return execFileAsync('git', args, { cwd });
}

function harness(root, ...args) {
  const maybeOptions = args.at(-1);
  const options =
    maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions) ? args.pop() : {};

  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root,
    env: {
      ...process.env,
      ...(options.env ?? {})
    }
  });
}

async function initRepo(root, initialBranch = 'dev') {
  await git(root, 'init', `--initial-branch=${initialBranch}`);
  await git(root, 'config', 'user.name', 'Harness Test');
  await git(root, 'config', 'user.email', 'harness@example.com');
  await writeFile(path.join(root, 'README.md'), '# fixture\n');
  await git(root, 'add', '.');
  await git(root, 'commit', '-m', 'init');
}

async function writeActiveTask(root, taskId, progressLines = ['# Progress']) {
  const taskDir = path.join(root, 'planning/active', taskId);
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, 'task_plan.md'),
    [
      '# Task',
      '',
      '## Current State',
      'Status: active',
      'Archive Eligible: no',
      'Close Reason:',
      ''
    ].join('\n')
  );
  await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
  await writeFile(path.join(taskDir, 'progress.md'), `${progressLines.join('\n')}\n`);
}

async function loadModule() {
  return import('../../harness/installer/lib/worktree-name.mjs');
}

test('resolveWorktreeNaming uses the explicit task as the task slug', async () => {
  const root = await createHarnessFixture();
  try {
    await initRepo(root);
    const { resolveWorktreeNaming } = await loadModule();

    const result = await resolveWorktreeNaming(root, {
      taskId: 'Codex App Compatibility Design',
      namespace: 'copilot',
      now: '202604281159'
    });

    assert.equal(result.taskSlug, 'codex-app-compatibility-design');
    assert.equal(result.timestamp, '202604281159');
    assert.equal(result.sequence, '001');
    assert.equal(result.canonicalLabel, '202604281159-codex-app-compatibility-design-001');
    assert.equal(result.branchName, 'copilot/202604281159-codex-app-compatibility-design-001');
    assert.equal(result.worktreeBasename, '202604281159-codex-app-compatibility-design-001');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('resolveWorktreeNaming detects a single active planning task automatically', async () => {
  const root = await createHarnessFixture();
  try {
    await initRepo(root);
    await writeActiveTask(root, 'worktree-naming-governance');
    const { resolveWorktreeNaming } = await loadModule();

    const result = await resolveWorktreeNaming(root, { now: '202604281159' });

    assert.equal(result.taskId, 'worktree-naming-governance');
    assert.equal(result.taskSlug, 'worktree-naming-governance');
    assert.equal(result.canonicalLabel, '202604281159-worktree-naming-governance-001');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('resolveWorktreeNaming falls back to the current branch only when planning is unavailable', async () => {
  const root = await createHarnessFixture();
  try {
    await initRepo(root, 'feature/worktree-labeling');
    const { resolveWorktreeNaming } = await loadModule();

    const result = await resolveWorktreeNaming(root, { now: '202604281159' });

    assert.equal(result.taskId, 'feature-worktree-labeling');
    assert.equal(result.taskSlug, 'feature-worktree-labeling');
    assert.equal(result.canonicalLabel, '202604281159-feature-worktree-labeling-001');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('resolveWorktreeNaming starts sequence allocation at 001 when no prior labels exist', async () => {
  const root = await createHarnessFixture();
  try {
    await initRepo(root);
    await writeActiveTask(root, 'codex-app-compatibility-design');
    const { resolveWorktreeNaming } = await loadModule();

    const result = await resolveWorktreeNaming(root, { now: '202604281159' });

    assert.equal(result.sequence, '001');
    assert.equal(result.canonicalLabel, '202604281159-codex-app-compatibility-design-001');
    assert.equal(result.branchName, '202604281159-codex-app-compatibility-design-001');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('resolveWorktreeNaming increments sequence when progress already records prior labels', async () => {
  const root = await createHarnessFixture();
  try {
    await initRepo(root);
    await writeActiveTask(root, 'codex-app-compatibility-design', [
      '# Progress',
      '',
      '- canonicalLabel: 202604201100-codex-app-compatibility-design-001',
      '- canonicalLabel: 202604201230-codex-app-compatibility-design-004',
      '- canonicalLabel: 202604201245-some-other-task-003'
    ]);
    const { resolveWorktreeNaming } = await loadModule();

    const result = await resolveWorktreeNaming(root, { now: '202604281159' });

    assert.equal(result.sequence, '005');
    assert.equal(result.canonicalLabel, '202604281159-codex-app-compatibility-design-005');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('resolveWorktreeNaming applies namespace only to the branch name', async () => {
  const root = await createHarnessFixture();
  try {
    await initRepo(root);
    const { resolveWorktreeNaming } = await loadModule();

    const result = await resolveWorktreeNaming(root, {
      taskId: 'codex-app-compatibility-design',
      namespace: 'copilot',
      now: '202604281159'
    });

    assert.equal(result.worktreeBasename, '202604281159-codex-app-compatibility-design-001');
    assert.equal(result.canonicalLabel, '202604281159-codex-app-compatibility-design-001');
    assert.equal(result.branchName, 'copilot/202604281159-codex-app-compatibility-design-001');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('worktree-name command prints the naming contract as JSON', async () => {
  const root = await createHarnessFixture();
  try {
    await initRepo(root);
    const { stdout } = await harness(
      root,
      'worktree-name',
      '--task',
      'codex-app-compatibility-design',
      '--namespace',
      'copilot',
      '--json',
      { env: { HARNESS_WORKTREE_NAME_NOW: '202604281159' } }
    );

    assert.deepEqual(JSON.parse(stdout), {
      taskId: 'codex-app-compatibility-design',
      taskSlug: 'codex-app-compatibility-design',
      timestamp: '202604281159',
      sequence: '001',
      canonicalLabel: '202604281159-codex-app-compatibility-design-001',
      branchName: 'copilot/202604281159-codex-app-compatibility-design-001',
      worktreeBasename: '202604281159-codex-app-compatibility-design-001'
    });
  } finally {
    await removeHarnessFixture(root);
  }
});
