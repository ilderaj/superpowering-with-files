import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlanningHotContext } from '../../harness/installer/lib/planning-hot-context.mjs';

test('buildPlanningHotContext returns compact summary-first hot context', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hot-context-'));

  try {
    const taskDir = path.join(root, 'planning/active/demo-task');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      [
        '# Demo Task',
        '',
        '## 任务目标',
        '- Reduce prompt overhead without dumping full plans.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:'
      ].join('\n')
    );
    await writeFile(
      path.join(taskDir, 'findings.md'),
      ['## Notes', '- Use compact summaries.', '- Avoid raw file dumps.'].join('\n')
    );
    await writeFile(
      path.join(taskDir, 'progress.md'),
      ['- Added parser helper.', '- Switched hook calls.', '- Added regression tests.'].join('\n')
    );

    const result = await buildPlanningHotContext({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md')
    });

    assert.match(result, /\[planning-with-files\] HOT CONTEXT/);
    assert.match(result, /Goal: Reduce prompt overhead without dumping full plans\./);
    assert.match(result, /Status: active/);
    assert.match(result, /Recent progress:/);
    assert.doesNotMatch(result, /Archive Eligible/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildPlanningHotContext falls back to the task title when no goal section exists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hot-context-goal-fallback-'));

  try {
    const taskDir = path.join(root, 'planning/active/demo-task');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      [
        '# Demo',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:'
      ].join('\n')
    );

    const result = await buildPlanningHotContext({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md')
    });

    assert.match(result, /Task: Demo/);
    assert.match(result, /Goal: Demo/);
    assert.doesNotMatch(result, /Goal: Status: active/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
