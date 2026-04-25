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
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root
  });
}

async function initRepo(root) {
  await git(root, 'init');
  await git(root, 'config', 'user.name', 'Harness Test');
  await git(root, 'config', 'user.email', 'harness@example.com');
  await writeFile(path.join(root, 'README.md'), '# fixture\n');
  await git(root, 'add', '.');
  await git(root, 'commit', '-m', 'init');
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
  try {
    await initRepo(root);
    await writeActiveTask(root, true);
    await git(remote, 'init', '--bare');
    await git(root, 'remote', 'add', 'origin', remote);
    await git(root, 'push', '-u', 'origin', 'HEAD');

    const { stdout } = await harness(root, 'worktree-preflight', '--safety');

    assert.match(stdout, /Safety checks:/);
    assert.match(stdout, /remoteConfigured: ok/);
    assert.match(stdout, /riskAssessmentRecorded: ok/);
    assert.match(stdout, /checkpointCommand:/);
  } finally {
    await removeHarnessFixture(root);
    await rm(remote, { recursive: true, force: true });
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
