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

test('buildPlanningHotContext ignores non-phase subheadings when scanning the current phase checklist', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hot-context-current-phase-'));

  try {
    const taskDir = path.join(root, 'planning/active/demo-task');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      [
        '# Demo Task',
        '',
        '## Goal',
        '- Keep next-step recovery aligned with the active phase.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '### Phase 1: Old Work',
        'Status: complete',
        '- [ ] Old stale checklist item.',
        '',
        '### Phase 2: Current Work',
        'Status: in_progress',
        '',
        '### Phase Notes',
        '- Gather implementation details before coding.',
        '',
        '- [ ] Current phase checklist item.'
      ].join('\n')
    );
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n');

    const result = await buildPlanningHotContext({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md')
    });

    assert.match(result, /Phase: Phase 2: Current Work/);
    assert.match(result, /Next: Current phase checklist item\./);
    assert.doesNotMatch(result, /Next: Old stale checklist item\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildPlanningHotContext falls back to the first global checklist item when the current phase has none', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hot-context-phase-fallback-'));

  try {
    const taskDir = path.join(root, 'planning/active/demo-task');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      [
        '# Demo Task',
        '',
        '## Goal',
        '- Keep fallback behavior intact when the active phase is empty.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '### Phase 1: Old Work',
        'Status: complete',
        '- [ ] Old stale checklist item.',
        '',
        '### Phase 2: Current Work',
        'Status: in_progress',
        '### Phase Notes',
        '- No checklist item is recorded in the active phase yet.'
      ].join('\n')
    );
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n');

    const result = await buildPlanningHotContext({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md')
    });

    assert.match(result, /Phase: Phase 2: Current Work/);
    assert.match(result, /Next: Old stale checklist item\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildPlanningHotContext does not treat Phase Notes subheadings as standalone phases', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hot-context-phase-notes-heading-'));

  try {
    const taskDir = path.join(root, 'planning/active/demo-task');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      [
        '# Demo Task',
        '',
        '## Goal',
        '- Keep phase selection stable when phase-only subheadings appear.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '### Phase 1: Finished Work',
        'Status: complete',
        '',
        '### Phase 2: Wrap Up',
        'Status: complete',
        '',
        '### Phase Notes',
        '- Capture supporting notes without creating a new phase.'
      ].join('\n')
    );
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n');

    const result = await buildPlanningHotContext({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md')
    });

    assert.match(result, /Phase: Phase 2: Wrap Up/);
    assert.doesNotMatch(result, /Phase: Phase Notes/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildPlanningHotContext ignores Phase Notes status lines when selecting the active phase', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hot-context-phase-notes-status-'));

  try {
    const taskDir = path.join(root, 'planning/active/demo-task');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      [
        '# Demo Task',
        '',
        '## Goal',
        '- Keep phase status tied to the numbered phase heading block only.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '### Phase 1: Finished Work',
        'Status: complete',
        '',
        '### Phase 2 [complete]: Review Notes',
        '',
        '### Phase Notes',
        'Status: in_progress',
        '- [ ] Subheading-local note that must not reactivate Phase 2.',
        '',
        '### Phase 3: Active Work',
        'Status: pending',
        '',
        '### Phase Notes',
        'Status: in_progress',
        '- [ ] Real active phase checklist item.'
      ].join('\n')
    );
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n');

    const result = await buildPlanningHotContext({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md')
    });

    assert.match(result, /Phase: Phase 3: Active Work/);
    assert.match(result, /Next: Real active phase checklist item\./);
    assert.doesNotMatch(result, /Phase: Phase 2: Review Notes/);
    assert.doesNotMatch(result, /Next: Subheading-local note that must not reactivate Phase 2\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
