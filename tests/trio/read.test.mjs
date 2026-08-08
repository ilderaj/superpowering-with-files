import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as trioRead from '../../harness/trio/core/read.mjs';
import {
  readTrioTask,
  resolveTrioTask,
  listActiveTrioTaskIds
} from '../../harness/trio/core/read.mjs';
import { readLegacyTask } from '../../harness/trio/compatibility/legacy-reader.mjs';

async function createRoot(prefix = 'trio-read-') {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(root, 'planning', 'active'), { recursive: true });
  return root;
}

async function writeTrioTask(root, taskId, {
  status = 'active',
  taskPlan = null,
  findings = '# Findings\n\nA finding.\n',
  progress = '# Progress\n\nA progress event.\n'
} = {}) {
  const taskDir = path.join(root, 'planning', 'active', taskId);
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, 'task_plan.md'),
    taskPlan ?? `# ${taskId}\n\n## Current State\nStatus: ${status}\n`,
    'utf8'
  );
  await writeFile(path.join(taskDir, 'findings.md'), findings, 'utf8');
  await writeFile(path.join(taskDir, 'progress.md'), progress, 'utf8');
  return taskDir;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('readTrioTask reads an explicitly selected complete Trio without writing', async () => {
  const root = await createRoot();
  try {
    const taskDir = await writeTrioTask(root, 'explicit-task');
    const result = await readTrioTask(root, { taskId: 'explicit-task' });

    assert.equal(result.taskId, 'explicit-task');
    assert.equal(result.taskDir, await realpath(taskDir));
    assert.equal(result.status, 'active');
    assert.equal(result.source, 'explicit');
    assert.match(result.files.taskPlan, /Status: active/);
    assert.match(result.files.findings, /A finding/);
    assert.match(result.files.progress, /A progress event/);
    assert.equal(result.authorityRoot, await realpath(root));
    assert.deepEqual(result.binding, {
      authorityRoot: await realpath(root),
      taskId: 'explicit-task',
      files: {
        taskPlan: { path: result.paths.taskPlan, sha256: sha256(result.files.taskPlan) },
        findings: { path: result.paths.findings, sha256: sha256(result.files.findings) },
        progress: { path: result.paths.progress, sha256: sha256(result.files.progress) }
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resolveTrioTask selects the unique active Trio when no task id is supplied', async () => {
  const root = await createRoot();
  try {
    await writeTrioTask(root, 'only-active');
    assert.deepEqual(await listActiveTrioTaskIds(root), ['only-active']);

    const result = await resolveTrioTask(root);
    assert.equal(result.taskId, 'only-active');
    assert.equal(result.source, 'unique-active');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readTrioTask fails closed when multiple active tasks exist', async () => {
  const root = await createRoot();
  try {
    await writeTrioTask(root, 'active-one');
    await writeTrioTask(root, 'active-two');

    await assert.rejects(
      () => readTrioTask(root),
      /Multiple active tasks found under planning\/active/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readTrioTask rejects traversal and absolute task identifiers', async () => {
  const root = await createRoot();
  try {
    for (const taskId of ['../outside', 'nested/task', '..', path.join(root, 'outside')]) {
      await assert.rejects(
        () => readTrioTask(root, { taskId }),
        /Invalid task id|must be a direct child/
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readTrioTask rejects missing and corrupt Trio files', async () => {
  const root = await createRoot();
  try {
    const missingFindings = path.join(root, 'planning', 'active', 'missing-findings');
    await mkdir(missingFindings, { recursive: true });
    await writeFile(path.join(missingFindings, 'task_plan.md'), 'Status: active\n', 'utf8');
    await writeFile(path.join(missingFindings, 'progress.md'), '# Progress\n', 'utf8');

    await assert.rejects(
      () => readTrioTask(root, { taskId: 'missing-findings' }),
      /incomplete|missing.*findings|Trio/
    );

    await writeTrioTask(root, 'corrupt-task', {
      taskPlan: '# Corrupt task\n\nNo lifecycle status.\n',
      findings: '# Findings\n',
      progress: '# Progress\n'
    });
    await assert.rejects(
      () => readTrioTask(root, { taskId: 'corrupt-task' }),
      /invalid.*status|corrupt|Status/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('legacy reader accepts an explicit nonterminal task plan without requiring a new Trio', async () => {
  const root = await createRoot('trio-legacy-read-');
  try {
    const taskDir = path.join(root, 'planning', 'active', 'legacy-in-progress');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      '# Legacy task\n\n## Current State\nStatus: in_progress\n',
      'utf8'
    );

    const result = await readLegacyTask(root, { taskId: 'legacy-in-progress' });
    assert.equal(result.taskId, 'legacy-in-progress');
    assert.equal(result.status, 'in_progress');
    assert.equal(result.terminal, false);
    assert.equal(result.source, 'legacy');
    assert.equal(result.taskDir, await realpath(taskDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readTrioTask rejects symlinked planning directories, task directories, and Trio files', async () => {
  const planningRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-symlink-planning-'));
  const planningTarget = await createRoot('trio-symlink-planning-target-');
  try {
    await symlink(path.join(planningTarget, 'planning'), path.join(planningRoot, 'planning'));
    await assert.rejects(() => readTrioTask(planningRoot), /symlink/i);
  } finally {
    await rm(planningRoot, { recursive: true, force: true });
    await rm(planningTarget, { recursive: true, force: true });
  }

  const activeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-symlink-active-'));
  const activeTarget = await createRoot('trio-symlink-active-target-');
  try {
    await mkdir(path.join(activeRoot, 'planning'), { recursive: true });
    await symlink(path.join(activeTarget, 'planning', 'active'), path.join(activeRoot, 'planning', 'active'));
    await assert.rejects(() => readTrioTask(activeRoot), /symlink/i);
  } finally {
    await rm(activeRoot, { recursive: true, force: true });
    await rm(activeTarget, { recursive: true, force: true });
  }

  const taskRoot = await createRoot('trio-symlink-task-');
  const taskTargetRoot = await createRoot('trio-symlink-task-target-');
  try {
    const taskTarget = await writeTrioTask(taskTargetRoot, 'linked-task');
    await symlink(taskTarget, path.join(taskRoot, 'planning', 'active', 'linked-task'));
    await assert.rejects(() => readTrioTask(taskRoot, { taskId: 'linked-task' }), /symlink/i);
  } finally {
    await rm(taskRoot, { recursive: true, force: true });
    await rm(taskTargetRoot, { recursive: true, force: true });
  }

  for (const fileName of ['task_plan.md', 'findings.md', 'progress.md']) {
    const fileRoot = await createRoot('trio-symlink-file-');
    const externalFile = path.join(fileRoot, 'outside.md');
    try {
      const taskDir = await writeTrioTask(fileRoot, 'file-link');
      await writeFile(externalFile, '# Outside\n', 'utf8');
      await rm(path.join(taskDir, fileName));
      await symlink(externalFile, path.join(taskDir, fileName));
      await assert.rejects(() => readTrioTask(fileRoot, { taskId: 'file-link' }), /symlink/i);
    } finally {
      await rm(fileRoot, { recursive: true, force: true });
    }
  }
});

test('readTrioTask preserves corrupt active roots as errors instead of treating them as no active task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-corrupt-active-root-'));
  try {
    await mkdir(path.join(root, 'planning'), { recursive: true });
    await writeFile(path.join(root, 'planning', 'active'), 'not a directory\n', 'utf8');
    await assert.rejects(() => resolveTrioTask(root), /active|directory|corrupt/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('verifyTrioBinding reports bytes drift after a complete Trio changes', async () => {
  const root = await createRoot('trio-binding-drift-');
  try {
    const taskDir = await writeTrioTask(root, 'binding-task');
    const reading = await readTrioTask(root, { taskId: 'binding-task' });
    assert.equal(typeof trioRead.verifyTrioBinding, 'function');

    await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n\nChanged after binding.\n', 'utf8');
    const verification = await trioRead.verifyTrioBinding(reading.binding);

    assert.equal(verification.status, 'mismatch');
    assert.equal(verification.matches, false);
    assert.deepEqual(verification.mismatches, ['progress']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
