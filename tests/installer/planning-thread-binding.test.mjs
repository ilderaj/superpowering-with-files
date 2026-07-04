import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createHarnessFixture, removeHarnessFixture } from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function activeTaskPlan(status = 'active') {
  return ['# Demo', '', '## Current State', `Status: ${status}`, 'Archive Eligible: no', 'Close Reason:'].join('\n');
}

test('planning_paths.py binds and resolves a Codex thread to one active task', async () => {
  const root = await createHarnessFixture();
  try {
    const taskDir = path.join(root, 'planning/active/demo-task');
    await mkdir(taskDir, { recursive: true });
    await writeFile(path.join(taskDir, 'task_plan.md'), activeTaskPlan());
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n');

    const script = path.join(
      process.cwd(),
      'harness/core/upstream-overlays/planning-with-files/scripts/planning_paths.py'
    );
    await execFileAsync('python3', [script, 'bind-thread', root, 'demo-task', 'thread-123']);
    const { stdout } = await execFileAsync('python3', [script, 'bound-task', root, 'thread-123']);
    const { stdout: statusStdout } = await execFileAsync('python3', [script, 'binding-status', root, 'thread-123']);

    assert.equal(await realpath(stdout.trim()), await realpath(taskDir));
    assert.equal(statusStdout.trim(), 'thread-binding');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('planning_paths.py reports stale bindings and clears them safely', async () => {
  const root = await createHarnessFixture();
  try {
    const taskDir = path.join(root, 'planning/active/demo-task');
    await mkdir(taskDir, { recursive: true });
    await writeFile(path.join(taskDir, 'task_plan.md'), activeTaskPlan());
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n');

    const script = path.join(
      process.cwd(),
      'harness/core/upstream-overlays/planning-with-files/scripts/planning_paths.py'
    );
    await execFileAsync('python3', [script, 'bind-thread', root, 'demo-task', 'thread-123']);
    await rm(taskDir, { recursive: true, force: true });

    const { stdout: staleStatus } = await execFileAsync('python3', [script, 'binding-status', root, 'thread-123']);
    const { stdout: staleBoundTask } = await execFileAsync('python3', [script, 'bound-task', root, 'thread-123']);
    await execFileAsync('python3', [script, 'clear-thread-binding', root, 'thread-123']);
    const { stdout: clearedStatus } = await execFileAsync('python3', [script, 'binding-status', root, 'thread-123']);

    assert.equal(staleStatus.trim(), 'stale-binding');
    assert.equal(staleBoundTask.trim(), '');
    assert.equal(clearedStatus.trim(), '');
  } finally {
    await removeHarnessFixture(root);
  }
});
