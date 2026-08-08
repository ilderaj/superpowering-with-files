import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readLegacyTask } from '../../harness/trio/compatibility/legacy-reader.mjs';
import { readTrioTask } from '../../harness/trio/core/read.mjs';
import { trioCommand } from '../../harness/installer/commands/trio.mjs';

async function loadStore() {
  try {
    return await import('../../harness/trio/core/store.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND'
      && /harness[\\/]trio[\\/]core[\\/]store\.mjs/u.test(error.message)) {
      return null;
    }
    throw error;
  }
}

async function requireStore() {
  const store = await loadStore();
  assert.ok(store, 'Wave 2 store public surface must exist.');
  return store;
}

async function createRoot(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function treePaths(root) {
  const result = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      result.push(relative);
      if (entry.isDirectory()) await visit(target);
    }
  }
  await visit(root);
  return result.sort();
}

const RECOVERY_FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/trio-v2/recovery/trio-only-active'
);

async function copyRecoveryFixture(root) {
  const taskDir = path.join(root, 'planning', 'active', 'recovery-task');
  await mkdir(path.dirname(taskDir), { recursive: true });
  await cp(RECOVERY_FIXTURE_ROOT, taskDir, { recursive: true });
  return taskDir;
}

test('Trio-only recovery keeps explicit, unique-active, status, and next decisions stable with exactly three authority files', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-recovery-only-');
  try {
    const fixtureTree = await treePaths(RECOVERY_FIXTURE_ROOT);
    assert.deepEqual(fixtureTree, [
      'findings.md',
      'progress.md',
      'task_plan.md'
    ]);
    const taskDir = await copyRecoveryFixture(root);

    const cacheDir = path.join(root, 'historical-cache');
    const sessionPath = path.join(taskDir, 'session.json');
    const sidecarPath = path.join(taskDir, 'sidecar.json');
    await mkdir(cacheDir);
    await writeFile(path.join(cacheDir, 'cache.json'), '{}\n', 'utf8');
    await writeFile(sessionPath, '{}\n', 'utf8');
    await writeFile(sidecarPath, '{}\n', 'utf8');

    await assert.rejects(
      () => trioCommand(['status', '--root', root], { writeOutput: false }),
      (error) => error?.code === 'ERR_TRIO_EXTRA_STATE'
    );
    await assert.rejects(
      () => trioCommand(['next', '--root', root, '--class', 'tracked', '--dry-run'], { writeOutput: false }),
      (error) => error?.code === 'ERR_TRIO_EXTRA_STATE'
    );

    await rm(cacheDir, { recursive: true, force: true });
    await rm(sessionPath, { force: true });
    await rm(sidecarPath, { force: true });

    const before = await treePaths(root);
    const authorityFiles = before.filter((entry) => entry.endsWith('.md'));
    assert.deepEqual(authorityFiles, [
      'planning/active/recovery-task/findings.md',
      'planning/active/recovery-task/progress.md',
      'planning/active/recovery-task/task_plan.md'
    ]);
    assert.equal(before.some((entry) => /cache|session|sidecar|registry|receipt|anchor/u.test(entry)), false);

    const explicit = await store.readExactTrioTask(root, { taskId: 'recovery-task' });
    const unique = await store.readExactTrioTask(root);
    const status = await trioCommand(['status', '--root', root], { writeOutput: false });
    const next = await trioCommand(['next', '--root', root, '--class', 'tracked', '--dry-run'], { writeOutput: false });
    assert.equal(explicit.taskId, 'recovery-task');
    assert.equal(unique.source, 'unique-active');
    assert.equal(status.task.taskId, 'recovery-task');
    assert.equal(next.action, 'resume-trio');

    const after = await treePaths(root);
    assert.deepEqual(after, before);
    console.log(JSON.stringify({ recoveryFixtureTreeBefore: before, recoveryFixtureTreeAfter: after }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('exact Trio reads and read-only CLI commands reject invalid UTF-8 authority bytes', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-recovery-invalid-utf8-');
  try {
    const taskDir = await copyRecoveryFixture(root);
    await writeFile(path.join(taskDir, 'findings.md'), Buffer.from([0xff]));

    await assert.rejects(
      () => store.readExactTrioTask(root, { taskId: 'recovery-task' }),
      (error) => error?.code === 'ERR_TRIO_CORRUPT'
    );
    await assert.rejects(
      () => trioCommand(['status', '--root', root], { writeOutput: false }),
      (error) => error?.code === 'ERR_TRIO_CORRUPT'
    );
    await assert.rejects(
      () => trioCommand(['next', '--root', root, '--class', 'tracked', '--dry-run'], { writeOutput: false }),
      (error) => error?.code === 'ERR_TRIO_CORRUPT'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('legacy explicit nonterminal task remains readable during Trio-only recovery', async () => {
  const root = await createRoot('trio-recovery-legacy-');
  try {
    const taskDir = path.join(root, 'planning', 'active', 'legacy-task');
    await mkdir(taskDir, { recursive: true });
    await writeFile(path.join(taskDir, 'task_plan.md'), '# Legacy\n\nStatus: in_progress\n', 'utf8');
    const result = await readLegacyTask(root, { taskId: 'legacy-task' });
    assert.equal(result.taskId, 'legacy-task');
    assert.equal(result.status, 'in_progress');
    assert.equal(result.terminal, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
