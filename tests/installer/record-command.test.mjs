import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApprovalToken } from '../../harness/runtime/approval-token.mjs';
import { applyWritePlan } from '../../harness/runtime/safe-apply.mjs';
import { buildWritePlan } from '../../harness/runtime/write-plan.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

async function writeTrio(root, taskId) {
  const taskDir = path.join(root, 'planning/active', taskId);
  await mkdir(taskDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(taskDir, 'task_plan.md'), '# Task Plan\n'),
    writeFile(path.join(taskDir, 'findings.md'), '# Findings\n'),
    writeFile(path.join(taskDir, 'progress.md'), '# Progress\n')
  ]);
}

test('approved record_progress appends only to the selected Trio progress file', async () => {
  const root = await createHarnessFixture();
  try {
    await writeTrio(root, 't1');
    const plan = buildWritePlan({
      operation: 'record_progress',
      rootDir: root,
      payload: {
        args: ['--task', 't1', '--file', 'progress', '--title', 'Approved Progress']
      },
      preview: {
        taskId: 't1',
        file: 'progress'
      }
    });
    const token = await createApprovalToken(root, plan, { actor: 'test-runner', ttlMs: 60000 });

    await applyWritePlan(plan, token);

    const taskDir = path.join(root, 'planning/active/t1');
    const [taskPlan, findings, progress] = await Promise.all([
      readFile(path.join(taskDir, 'task_plan.md'), 'utf8'),
      readFile(path.join(taskDir, 'findings.md'), 'utf8'),
      readFile(path.join(taskDir, 'progress.md'), 'utf8')
    ]);
    assert.equal(taskPlan, '# Task Plan\n');
    assert.equal(findings, '# Findings\n');
    assert.match(progress, /### Approved Progress/);
    assert.match(progress, /- Actions taken:\n  -/);
  } finally {
    await removeHarnessFixture(root);
  }
});
