import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('atomicWriteText preserves old bytes on interruption and cleans same-directory temporary files', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-atomic-');
  try {
    const target = path.join(root, 'state.md');
    const oldBytes = Buffer.from('old bytes\n');
    await writeFile(target, oldBytes);

    await assert.rejects(
      () => store.atomicWriteText(target, 'new bytes\n', { signal: AbortSignal.abort() }),
      /abort|interrupt/i
    );
    assert.deepEqual(await readFile(target), oldBytes);
    assert.deepEqual(await readdir(root), ['state.md']);

    await assert.rejects(
      () => store.atomicWriteText(target, 'drifted bytes\n', { expectedSha256: '0'.repeat(64) }),
      /drift|sha-?256|expected/i
    );
    assert.deepEqual(await readFile(target), oldBytes);
    assert.deepEqual(await readdir(root), ['state.md']);

    await store.atomicWriteText(target, 'new bytes\n', { expectedSha256: sha256(oldBytes) });
    assert.equal(await readFile(target, 'utf8'), 'new bytes\n');
    assert.deepEqual(await readdir(root), ['state.md']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('initializeTrioTask creates exactly the three authority files and rejects partial or unsafe state', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-init-');
  const partialRoot = await createRoot('trio-store-partial-');
  const symlinkRoot = await createRoot('trio-store-symlink-');
  const outsideRoot = await createRoot('trio-store-outside-');
  try {
    const result = await store.initializeTrioTask(root, 'wave2-task', 'Build the durable Trio write path.');
    const expectedFiles = [
      'planning/active/wave2-task/findings.md',
      'planning/active/wave2-task/progress.md',
      'planning/active/wave2-task/task_plan.md'
    ];
    const actualFiles = (await treePaths(root)).filter((entry) => entry.endsWith('.md'));
    assert.deepEqual(actualFiles, expectedFiles);
    assert.equal(await readFile(result.paths.taskPlan, 'utf8').then((value) => /Goal: Build the durable Trio write path\./u.test(value)), true);
    assert.match(await readFile(result.paths.taskPlan, 'utf8'), /^Status: active$/mu);
    assert.match(await readFile(result.paths.taskPlan, 'utf8'), /^Archive Eligible: no$/mu);
    await assert.rejects(
      () => store.initializeTrioTask(root, 'wave2-task', 'Duplicate task.'),
      /already|exist|partial/i
    );
    await assert.rejects(
      () => store.initializeTrioTask(root, '../escape', 'Traversal.'),
      /invalid|traversal|task id/i
    );

    const partialTask = path.join(partialRoot, 'planning', 'active', 'partial-task');
    await mkdir(partialTask, { recursive: true });
    await writeFile(path.join(partialTask, 'task_plan.md'), 'partial\n');
    await assert.rejects(
      () => store.initializeTrioTask(partialRoot, 'partial-task', 'Do not replace partial state.'),
      /already|exist|partial/i
    );
    assert.equal(await readFile(path.join(partialTask, 'task_plan.md'), 'utf8'), 'partial\n');

    await mkdir(path.join(outsideRoot, 'planning', 'active'), { recursive: true });
    await symlink(path.join(outsideRoot, 'planning'), path.join(symlinkRoot, 'planning'));
    await assert.rejects(
      () => store.initializeTrioTask(symlinkRoot, 'linked-task', 'Reject the planning symlink.'),
      /symlink|boundary/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(partialRoot, { recursive: true, force: true });
    await rm(symlinkRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test('initializeTrioTask persists replacement-token syntax in the goal literally', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-literal-goal-');
  try {
    const literalGoal = 'Keep $& literal.';
    const initialized = await store.initializeTrioTask(root, 'literal-goal-task', literalGoal);
    const taskPlan = await readFile(initialized.paths.taskPlan, 'utf8');

    assert.match(taskPlan, /^Goal: Keep \$& literal\.$/mu);
    assert.doesNotMatch(taskPlan, /\{\{goal\}\}/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('appendProgressEvent validates event fields, preserves other Trio bytes, and appends chronological records', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-progress-');
  try {
    const initialized = await store.initializeTrioTask(root, 'progress-task', 'Record durable progress.');
    const taskPlanBefore = await readFile(initialized.paths.taskPlan);
    const findingsBefore = await readFile(initialized.paths.findings);

    await store.appendProgressEvent(root, 'progress-task', {
      event: 'worker_done',
      actor: 'worker-1',
      detail: 'Implementation candidate is ready.',
      timestamp: '2026-08-02T15:00:00.000Z'
    });
    await store.appendProgressEvent(root, 'progress-task', {
      event: 'review_note',
      actor: 'chief',
      detail: 'Evidence is ready for the acceptance gate.',
      timestamp: '2026-08-02T15:00:01.000Z'
    });

    const progress = await readFile(initialized.paths.progress, 'utf8');
    assert.ok(progress.indexOf('Event: worker_done') < progress.indexOf('Event: review_note'));
    assert.match(progress, /Timestamp: 2026-08-02T15:00:00\.000Z/u);
    assert.match(progress, /Actor: worker-1/u);
    assert.match(progress, /Detail: Evidence is ready for the acceptance gate\./u);
    assert.deepEqual(await readFile(initialized.paths.taskPlan), taskPlanBefore);
    assert.deepEqual(await readFile(initialized.paths.findings), findingsBefore);

    for (const invalid of [
      { event: '', actor: 'worker', detail: 'detail' },
      { event: 'event', actor: '   ', detail: 'detail' },
      { event: 'event', actor: 'worker', detail: '   ' }
    ]) {
      await assert.rejects(
        () => store.appendProgressEvent(root, 'progress-task', invalid),
        /event|actor|detail|non-empty/i
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('concurrent progress updates preserve every successful event and strictly order generated timestamps', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-concurrent-progress-');
  try {
    const initialized = await store.initializeTrioTask(root, 'concurrent-task', 'Serialize concurrent progress updates.');
    const details = [
      'Concurrent detail one.',
      'Concurrent detail two.',
      'Concurrent detail three.',
      'Concurrent detail four.'
    ];
    const results = await Promise.allSettled(details.map((detail, index) => store.appendProgressEvent(root, 'concurrent-task', {
      event: 'review_note',
      actor: `worker-${index + 1}`,
      detail
    })));
    const successful = results.filter((result) => result.status === 'fulfilled');
    assert.ok(successful.length > 0, 'At least one contending progress operation must succeed.');

    const progress = await readFile(initialized.paths.progress, 'utf8');
    for (const result of successful) {
      assert.match(progress, new RegExp(`Detail: ${result.value.detail.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u'));
    }
    assert.equal((progress.match(/^Event: review_note$/gmu) ?? []).length, successful.length);

    const timestamps = [...progress.matchAll(/^Timestamp:\s*(.+)$/gmu)].map((match) => Date.parse(match[1]));
    for (let index = 1; index < timestamps.length; index += 1) {
      assert.ok(timestamps[index] > timestamps[index - 1], 'Generated progress timestamps must strictly increase.');
    }
    assert.equal((await treePaths(root)).some((entry) => /lock|staging|cache|session|sidecar/u.test(entry)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('appendProgressEvent rejects a reversed historical chronology without changing progress bytes', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-reversed-chronology-');
  try {
    const initialized = await store.initializeTrioTask(root, 'chronology-task', 'Reject reversed history.');
    const historicalProgress = [
      '# Progress',
      '',
      'Event: review_note',
      'Timestamp: 2026-08-03T02:00:00.000Z',
      'Actor: chief',
      'Detail: Later event.',
      '',
      'Event: review_note',
      'Timestamp: 2026-08-03T01:00:00.000Z',
      'Actor: chief',
      'Detail: Earlier event after later event.',
      ''
    ].join('\n');
    await writeFile(initialized.paths.progress, historicalProgress, 'utf8');
    const before = await readFile(initialized.paths.progress);

    await assert.rejects(
      () => store.appendProgressEvent(root, 'chronology-task', {
        event: 'review_note',
        actor: 'worker-1',
        detail: 'Must not append to reversed history.'
      }),
      (error) => error?.code === 'ERR_TRIO_CHRONOLOGY'
    );
    assert.deepEqual(await readFile(initialized.paths.progress), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a replaced transient task lock is retained when its original owner releases it', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-lock-ownership-');
  let replacementPath;
  let displacedPath;
  try {
    const lock = await store.acquireTrioTaskLock(root, 'lock-ownership-task');
    replacementPath = lock.path;
    displacedPath = `${lock.path}.displaced-${process.pid}`;
    assert.equal((await readdir(lock.path)).length, 1);
    await rename(lock.path, displacedPath);
    await mkdir(lock.path, { mode: 0o700 });

    await assert.rejects(
      () => lock.release(),
      (error) => error?.code === 'ERR_TRIO_LOCK_OWNERSHIP'
    );
    assert.deepEqual(await readdir(lock.path), []);
  } finally {
    if (replacementPath) await rm(replacementPath, { recursive: true, force: true });
    if (displacedPath) await rm(displacedPath, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('concurrent initialization leaves one exact Trio and no authority-root staging residue', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-concurrent-init-');
  try {
    const results = await Promise.allSettled([
      store.initializeTrioTask(root, 'init-race-task', 'First concurrent initialization.'),
      store.initializeTrioTask(root, 'init-race-task', 'Second concurrent initialization.')
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.deepEqual(await treePaths(root), [
      'planning',
      'planning/active',
      'planning/active/init-race-task',
      'planning/active/init-race-task/findings.md',
      'planning/active/init-race-task/progress.md',
      'planning/active/init-race-task/task_plan.md'
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
