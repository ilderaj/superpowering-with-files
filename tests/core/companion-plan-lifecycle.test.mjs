import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  createPlanningLifecycleFixture,
  runPythonScript,
  runShellScript,
  writeActiveTask,
  writeCompanion
} from '../helpers/planning-lifecycle-fixture.mjs';

async function assertExists(targetPath) {
  await stat(targetPath);
}

test('close-task succeeds for tasks without a companion plan', async () => {
  const fixture = await createPlanningLifecycleFixture();
  try {
    await writeActiveTask(fixture.root, 'task-a', {
      taskPlan: '# Task\n\n## Current State\nStatus: active\nArchive Eligible: no\nClose Reason:\n'
    });

    const { stdout } = await runPythonScript(
      fixture.root,
      'harness/upstream/planning-with-files/scripts/close-task.py',
      ['task-a', '--reason', 'done']
    );

    assert.match(stdout, /Closed task and marked archive eligible/);
  } finally {
    await fixture.cleanup();
  }
});

test('close-task blocks when declared companion metadata is incomplete', async () => {
  const fixture = await createPlanningLifecycleFixture();
  try {
    await writeActiveTask(fixture.root, 'task-a', {
      taskPlan:
        '# Task\n\n## Current State\nStatus: active\nArchive Eligible: no\nClose Reason:\n\n## Companion Plan\n- Companion plan: `docs/superpowers/plans/task-a.md`\n- Sync-back status: drafted\n'
    });
    await writeCompanion(
      fixture.root,
      'docs/superpowers/plans/task-a.md',
      '# Companion\n\n- Lifecycle state: active\n- Sync-back status: drafted\n'
    );

    await assert.rejects(
      () =>
        runPythonScript(
          fixture.root,
          'harness/upstream/planning-with-files/scripts/close-task.py',
          ['task-a']
        ),
      /Companion sync error|Active task is missing Companion summary|Companion plan is missing Active task path/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('close-task synchronizes companion lifecycle metadata on success', async () => {
  const fixture = await createPlanningLifecycleFixture();
  try {
    await writeActiveTask(fixture.root, 'task-a', {
      taskPlan:
        '# Task\n\n## Current State\nStatus: active\nArchive Eligible: no\nClose Reason:\n\n## Companion Plan\n- Companion plan: `docs/superpowers/plans/task-a.md`\n- Companion summary: lifecycle notes\n- Sync-back status: active draft\n'
    });
    const companionPath = await writeCompanion(
      fixture.root,
      'docs/superpowers/plans/task-a.md',
      '# Companion\n\n- Active task path: `planning/active/task-a/`\n- Lifecycle state: active\n- Sync-back status: active draft\n'
    );

    await runPythonScript(
      fixture.root,
      'harness/upstream/planning-with-files/scripts/close-task.py',
      ['task-a', '--reason', 'done']
    );

    const companion = await readFile(companionPath, 'utf8');
    const taskPlan = await readFile(
      `${fixture.root}/planning/active/task-a/task_plan.md`,
      'utf8'
    );

    assert.match(companion, /Lifecycle state: closed/);
    assert.match(companion, /Sync-back status: closed at .*: done/);
    assert.match(taskPlan, /Sync-back status: closed at .*: done/);
  } finally {
    await fixture.cleanup();
  }
});

test('task-status exposes unsynced companion state and archive-task blocks archive', async () => {
  const fixture = await createPlanningLifecycleFixture();
  try {
    await writeActiveTask(fixture.root, 'task-a', {
      taskPlan:
        '# Task\n\n## Current State\nStatus: closed\nArchive Eligible: yes\nClose Reason: done\n\n## Companion Plan\n- Companion plan: `docs/superpowers/plans/task-a.md`\n- Companion summary: lifecycle notes\n- Sync-back status: closed at 2025-02-03T04:05:06: done\n'
    });
    await writeCompanion(
      fixture.root,
      'docs/superpowers/plans/task-a.md',
      '# Companion\n\n- Active task path: `planning/active/task-a/`\n- Lifecycle state: active\n- Sync-back status: active draft\n'
    );

    const { stdout } = await runPythonScript(
      fixture.root,
      'harness/upstream/planning-with-files/scripts/task-status.py',
      ['task-a', '--json']
    );
    const status = JSON.parse(stdout);

    assert.equal(status.safe_to_archive, true);
    assert.equal(status.companion.has_companion, true);
    assert.equal(status.companion.ok, false);
    assert.match(status.companion.reasons.join('\n'), /Lifecycle state/);
    assert.match(status.companion.reasons.join('\n'), /Sync-back status/);

    await assert.rejects(
      () => runShellScript(fixture.root, 'harness/upstream/planning-with-files/scripts/archive-task.sh', ['task-a']),
      /Companion sync error|companion/i
    );

    await assertExists(path.join(fixture.root, 'planning', 'active', 'task-a', 'task_plan.md'));
  } finally {
    await fixture.cleanup();
  }
});

test('archive-task migrates companion into archive and rewrites lifecycle metadata', async () => {
  const fixture = await createPlanningLifecycleFixture();
  try {
    await writeActiveTask(fixture.root, 'task-a', {
      taskPlan:
        '# Task\n\n## Current State\nStatus: closed\nArchive Eligible: yes\nClose Reason: done\n\n## Companion Plan\n- Companion plan: `docs/superpowers/plans/task-a.md`\n- Companion summary: lifecycle notes\n- Sync-back status: closed at 2025-02-03T04:05:06: done\n'
    });
    const sourceCompanionPath = await writeCompanion(
      fixture.root,
      'docs/superpowers/plans/task-a.md',
      '# Companion\n\n- Active task path: `planning/active/task-a/`\n- Lifecycle state: closed\n- Sync-back status: closed at 2025-02-03T04:05:06: done\n'
    );

    const { stdout } = await runShellScript(
      fixture.root,
      'harness/upstream/planning-with-files/scripts/archive-task.sh',
      ['task-a']
    );
    const archiveDir = stdout.trim().split(': ').at(-1);
    const archivedTaskPlanPath = path.join(archiveDir, 'task_plan.md');
    const archivedCompanionPath = path.join(archiveDir, 'companion_plan.md');

    await assertExists(archivedTaskPlanPath);
    await assertExists(archivedCompanionPath);
    await assert.rejects(() => stat(sourceCompanionPath));

    const archivedTaskPlan = await readFile(archivedTaskPlanPath, 'utf8');
    const archivedCompanion = await readFile(archivedCompanionPath, 'utf8');

    assert.match(archivedTaskPlan, /Companion plan: `planning\/archive\/.+?\/companion_plan\.md`/);
    assert.match(archivedCompanion, /Lifecycle state: archived/);
    assert.match(archivedCompanion, /Active task path: `planning\/archive\/.+?\/`/);
    assert.match(archivedCompanion, /Sync-back status: archived at .*: moved companion plan into archive/);
  } finally {
    await fixture.cleanup();
  }
});
