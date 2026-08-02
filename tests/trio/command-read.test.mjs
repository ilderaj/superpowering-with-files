import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { trioCommand } from '../../harness/installer/commands/trio.mjs';

async function createTrioRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-command-read-'));
  const taskDir = path.join(root, 'planning', 'active', 'command-task');
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, 'task_plan.md'),
    '# Command task\n\n## Current State\nStatus: active\n',
    'utf8'
  );
  await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n', 'utf8');
  await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n', 'utf8');
  return root;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fileSnapshot(root) {
  const snapshot = {};
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) snapshot[path.relative(root, target)] = sha256(await readFile(target));
    }
  }
  await visit(root);
  return snapshot;
}

test('trioCommand status resolves a unique active task without --task and preserves file bytes', async () => {
  const root = await createTrioRoot();
  try {
    const before = await fileSnapshot(root);
    const report = await trioCommand(
      ['status', '--root', root],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(report.command, 'status');
    assert.equal(report.mode, 'read-only');
    assert.equal(report.task.taskId, 'command-task');
    assert.equal(report.task.source, 'unique-active');
    assert.equal(report.task.status, 'active');
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand calculates next --dry-run without writing or creating a Trio', async () => {
  const root = await createTrioRoot();
  try {
    const before = await fileSnapshot(root);
    const report = await trioCommand(
      ['next', '--root', root, '--dry-run'],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(report.command, 'next');
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.readOnly, true);
    assert.equal(report.action, 'resume-trio');
    assert.deepEqual(report.writes, []);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand routes quick no-Trio work inline without reading or creating Trio files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-command-quick-'));
  try {
    const before = await fileSnapshot(root);
    const report = await trioCommand(
      ['next', '--root', root, '--class', 'quick', '--dry-run'],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(report.task, null);
    assert.equal(report.action, 'execute-inline');
    assert.deepEqual(report.writes, []);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand returns create-trio only for definite tracked no-Trio cases', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-command-tracked-'));
  try {
    const before = await fileSnapshot(root);
    const noActive = await trioCommand(
      ['next', '--root', root, '--class', 'tracked', '--dry-run'],
      { writeOutput: false }
    );
    const explicitMissing = await trioCommand(
      ['next', '--root', root, '--task', 'future-task', '--class', 'tracked', '--dry-run'],
      { writeOutput: false }
    );
    const after = await fileSnapshot(root);

    assert.equal(noActive.task, null);
    assert.equal(noActive.action, 'create-trio');
    assert.equal(explicitMissing.task, null);
    assert.equal(explicitMissing.action, 'create-trio');
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trioCommand fails closed for multiple or corrupt tasks and invalid explicit task IDs', async () => {
  const multipleRoot = await createTrioRoot();
  const corruptRoot = await createTrioRoot();
  try {
    const secondTask = path.join(multipleRoot, 'planning', 'active', 'second-task');
    await mkdir(secondTask, { recursive: true });
    await writeFile(path.join(secondTask, 'task_plan.md'), '# Second\n\nStatus: active\n', 'utf8');
    await writeFile(path.join(secondTask, 'findings.md'), '# Findings\n', 'utf8');
    await writeFile(path.join(secondTask, 'progress.md'), '# Progress\n', 'utf8');

    await assert.rejects(
      () => trioCommand(['next', '--root', multipleRoot, '--class', 'tracked', '--dry-run'], { writeOutput: false }),
      /multiple/i
    );

    await writeFile(
      path.join(corruptRoot, 'planning', 'active', 'command-task', 'task_plan.md'),
      '# Corrupt task\n',
      'utf8'
    );
    await assert.rejects(
      () => trioCommand(['next', '--root', corruptRoot, '--task', 'command-task', '--class', 'tracked', '--dry-run'], { writeOutput: false }),
      /corrupt|status|incomplete/i
    );
    await assert.rejects(
      () => trioCommand(['next', '--root', corruptRoot, '--task', '../invalid', '--class', 'quick', '--dry-run'], { writeOutput: false }),
      /invalid task/i
    );
  } finally {
    await rm(multipleRoot, { recursive: true, force: true });
    await rm(corruptRoot, { recursive: true, force: true });
  }
});
