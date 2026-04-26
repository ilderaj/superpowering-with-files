import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
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

async function initRepo(root) {
  await git(root, 'init', '--initial-branch=dev');
  await git(root, 'config', 'user.name', 'Harness Test');
  await git(root, 'config', 'user.email', 'harness@example.com');
  await writeFile(path.join(root, 'README.md'), '# fixture\n');
  await git(root, 'add', '.');
  await git(root, 'commit', '-m', 'init');
}

async function createLinkedWorktree(root, branch) {
  const worktree = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-worktree-'));
  await git(root, 'worktree', 'add', '-b', branch, worktree, 'HEAD');
  await git(worktree, 'config', 'user.name', 'Harness Test');
  await git(worktree, 'config', 'user.email', 'harness@example.com');
  return worktree;
}

async function writeActiveTask(root, withRiskAssessment) {
  const taskDir = path.join(root, 'planning/active/preflight-task');
  await mkdir(taskDir, { recursive: true });
  const lines = [
    '# Preflight task',
    '',
    '## Current State',
    'Status: active',
    'Archive Eligible: no',
    'Close Reason:',
    ''
  ];

  if (withRiskAssessment) {
    lines.push(
      '## Risk Assessment',
      '',
      '| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |',
      '|---|---|---|---|',
      '| Reset risk | destructive command | local repo | checkpoint + rollback |',
      ''
    );
  }

  await writeFile(path.join(taskDir, 'task_plan.md'), `${lines.join('\n')}\n`);
  await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
  await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n');
}

async function writePlaceholderRiskAssessment(root) {
  const taskDir = path.join(root, 'planning/active/preflight-task');
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, 'task_plan.md'),
    [
      '# Preflight task',
      '',
      '## Current State',
      'Status: active',
      'Archive Eligible: no',
      'Close Reason:',
      '',
      '## Risk Assessment',
      '',
      '| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |',
      '|---|---|---|---|',
      '|    |          |          |                          |'
    ].join('\n')
  );
  await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
  await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n');
}

test('worktree-preflight --safety reports remote, risk assessment, and checkpoint guidance', async () => {
  const root = await createHarnessFixture();
  const remote = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-remote-'));
  let worktree;
  try {
    await initRepo(root);
    await git(remote, 'init', '--bare');
    await git(root, 'remote', 'add', 'origin', remote);
    await git(root, 'push', '-u', 'origin', 'HEAD');
    worktree = await createLinkedWorktree(root, 'feature/preflight-ok');
    await writeActiveTask(worktree, true);

    const { stdout } = await harness(worktree, 'worktree-preflight', '--safety');

    assert.match(stdout, /Safety checks:/);
    assert.match(stdout, /remoteConfigured: ok/);
    assert.match(stdout, /riskAssessmentRecorded: ok/);
    assert.match(stdout, /checkpointPushReady: ok/);
    assert.match(stdout, /checkpointCommand:/);
  } finally {
    if (worktree) {
      await rm(worktree, { recursive: true, force: true });
    }
    await removeHarnessFixture(root);
    await rm(remote, { recursive: true, force: true });
  }
});

test('worktree-preflight prints naming suggestions in text output', async () => {
  const root = await createHarnessFixture();
  let worktree;
  try {
    await initRepo(root);
    worktree = await createLinkedWorktree(root, 'copilot/preflight-name');
    await writeActiveTask(worktree, true);

    const { stdout } = await harness(worktree, 'worktree-preflight', {
      env: { HARNESS_WORKTREE_NAME_NOW: '202604281159' }
    });

    assert.match(stdout, /Suggested worktree label: 202604281159-preflight-task-001/);
    assert.match(stdout, /Suggested branch name: copilot\/202604281159-preflight-task-001/);
    assert.match(
      stdout,
      /git worktree add <path>\/202604281159-preflight-task-001 -b copilot\/202604281159-preflight-task-001 .+/
    );
  } finally {
    if (worktree) {
      await rm(worktree, { recursive: true, force: true });
    }
    await removeHarnessFixture(root);
  }
});

test('worktree-preflight --json includes naming suggestions without changing base recommendation', async () => {
  const root = await createHarnessFixture();
  let worktree;
  try {
    await initRepo(root);
    worktree = await createLinkedWorktree(root, 'copilot/preflight-json');
    await writeActiveTask(worktree, true);

    const { stdout } = await harness(worktree, 'worktree-preflight', '--json', {
      env: { HARNESS_WORKTREE_NAME_NOW: '202604281159' }
    });
    const output = JSON.parse(stdout);

    assert.equal(output.recommendation.baseRef, 'copilot/preflight-json');
    assert.deepEqual(output.naming, {
      taskId: 'preflight-task',
      taskSlug: 'preflight-task',
      timestamp: '202604281159',
      sequence: '001',
      canonicalLabel: '202604281159-preflight-task-001',
      branchName: 'copilot/202604281159-preflight-task-001',
      worktreeBasename: '202604281159-preflight-task-001'
    });
  } finally {
    if (worktree) {
      await rm(worktree, { recursive: true, force: true });
    }
    await removeHarnessFixture(root);
  }
});

test('worktree-preflight --task resolves naming when multiple active tasks exist', async () => {
  const root = await createHarnessFixture();
  try {
    await initRepo(root);
    await writeActiveTask(root, true);
    await mkdir(path.join(root, 'planning/active/second-task'), { recursive: true });
    await writeFile(
      path.join(root, 'planning/active/second-task/task_plan.md'),
      [
        '# Second task',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        ''
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/second-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/second-task/progress.md'), '# Progress\n');

    const { stdout } = await harness(root, 'worktree-preflight', '--task', 'preflight-task', '--json', {
      env: { HARNESS_WORKTREE_NAME_NOW: '202604281159' }
    });
    const output = JSON.parse(stdout);

    assert.equal(output.naming.taskId, 'preflight-task');
    assert.equal(output.naming.canonicalLabel, '202604281159-preflight-task-001');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('worktree-preflight --safety treats placeholder risk assessment rows as missing', async () => {
  const root = await createHarnessFixture();
  try {
    await initRepo(root);
    await writePlaceholderRiskAssessment(root);

    const { stdout } = await harness(root, 'worktree-preflight', '--safety');

    assert.match(stdout, /riskAssessmentRecorded: problem/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('worktree-preflight --safety reports checkpoint-push readiness problems for detached HEAD', async () => {
  const root = await createHarnessFixture();
  const remote = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-detached-remote-'));
  let worktree;
  try {
    await initRepo(root);
    await git(remote, 'init', '--bare');
    await git(root, 'remote', 'add', 'origin', remote);
    await git(root, 'push', '-u', 'origin', 'HEAD');
    worktree = await createLinkedWorktree(root, 'feature/preflight-detached');
    await writeActiveTask(worktree, true);
    await git(worktree, 'checkout', '--detach', 'HEAD');

    const { stdout } = await harness(worktree, 'worktree-preflight', '--safety');

    assert.match(stdout, /checkpointPushReady: problem \(detached HEAD\)/);
  } finally {
    if (worktree) {
      await rm(worktree, { recursive: true, force: true });
    }
    await removeHarnessFixture(root);
    await rm(remote, { recursive: true, force: true });
  }
});
