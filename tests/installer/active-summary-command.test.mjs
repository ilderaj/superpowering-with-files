import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function createFixture(name) {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts', name);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await Promise.all([
    cp(path.join(process.cwd(), 'harness'), path.join(root, 'harness'), { recursive: true }),
    cp(path.join(process.cwd(), 'docs'), path.join(root, 'docs'), { recursive: true }),
    cp(path.join(process.cwd(), 'scripts'), path.join(root, 'scripts'), { recursive: true }),
    cp(path.join(process.cwd(), 'package.json'), path.join(root, 'package.json'))
  ]);
  return root;
}

async function removeFixture(root) {
  await rm(root, { recursive: true, force: true });
}

async function harnessCommand(root, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root
  });
}

async function writeTask(root, taskId, files = {}) {
  const taskDir = path.join(root, 'planning/active', taskId);
  await mkdir(taskDir, { recursive: true });

  if (files.taskPlan !== undefined) {
    await writeFile(path.join(taskDir, 'task_plan.md'), files.taskPlan);
  }
  if (files.findings !== undefined) {
    await writeFile(path.join(taskDir, 'findings.md'), files.findings);
  }
  if (files.progress !== undefined) {
    await writeFile(path.join(taskDir, 'progress.md'), files.progress);
  }
}

function taskFiles(title, status, archiveEligible = 'no') {
  return {
    taskPlan: [
      `# ${title}`,
      '',
      '## Current State',
      `Status: ${status}`,
      `Archive Eligible: ${archiveEligible}`,
      'Close Reason:',
      '',
      '### Phase 1: Audit',
      '- **Status:** complete'
    ].join('\n'),
    findings: '# Findings\n',
    progress: '# Progress\n'
  };
}

test('harness --help lists the active-summary command', async () => {
  const root = await createFixture('active-summary-help');
  try {
    const { stdout } = await harnessCommand(root, '--help');
    assert.match(stdout, /active-summary\s+Print lifecycle summary for all tasks under planning\/active/);
  } finally {
    await removeFixture(root);
  }
});

test('harness active-summary prints text for multiple tasks and surfaces anomalies', async () => {
  const root = await createFixture('active-summary-text');
  try {
    await writeTask(root, 'task-active', taskFiles('Task Active', 'active'));
    await writeTask(root, 'task-review', taskFiles('Task Review', 'waiting_review'));
    await mkdir(path.join(root, 'planning/active/task-empty'), { recursive: true });

    const { stdout, stderr } = await harnessCommand(root, 'active-summary');

    assert.equal(stderr, '');
    assert.match(stdout, /\[planning-with-files\] ACTIVE SUMMARY/);
    assert.match(stdout, /task-active: status=active/);
    assert.match(stdout, /task-review: status=waiting_review/);
    assert.match(stdout, /task-empty: status=unknown/);
    assert.match(stdout, /warning: missing task_plan\.md/);
  } finally {
    await removeFixture(root);
  }
});

test('harness active-summary --json and --output marks unsynced companions as not archive-ready', async () => {
  const root = await createFixture('active-summary-json');
  try {
    await writeTask(root, 'task-ready', taskFiles('Task Ready', 'closed', 'yes'));
    await writeTask(root, 'task-blocked', {
      ...taskFiles('Task Blocked', 'closed', 'yes'),
      taskPlan: [
        '# Task Blocked',
        '',
        '## Current State',
        'Status: closed',
        'Archive Eligible: yes',
        'Close Reason: done',
        '',
        '## Companion Plan',
        '- Companion plan: `docs/superpowers/plans/task-blocked.md`',
        '- Companion summary: audit results',
        '- Sync-back status: closed at 2026-05-06T09:00:00: done',
        '',
        '### Phase 1: Audit',
        '- **Status:** complete'
      ].join('\n')
    });
    await writeFile(
      path.join(root, 'docs/superpowers/plans/task-blocked.md'),
      [
        '# Task Blocked Companion',
        '',
        'Active task path: `planning/active/task-blocked/`',
        'Lifecycle state: active',
        'Sync-back status: closed at 2026-05-06T09:00:00: done'
      ].join('\n')
    );

    const { stdout } = await harnessCommand(
      root,
      'active-summary',
      '--json',
      '--output',
      '.harness/planning-active-summary.json'
    );

    const report = JSON.parse(stdout);
    const written = JSON.parse(
      await readFile(path.join(root, '.harness/planning-active-summary.json'), 'utf8')
    );

    assert.equal(report.counts.total, 2);
    assert.equal(report.counts.archiveReady, 1);
    assert.equal(written.counts.archiveReady, 1);

    const readyTask = report.tasks.find((task) => task.task_id === 'task-ready');
    const blockedTask = report.tasks.find((task) => task.task_id === 'task-blocked');
    assert.equal(readyTask.archive_ready, true);
    assert.equal(blockedTask.archive_ready, false);
    assert.equal(blockedTask.companion.ok, false);
    assert.match(
      blockedTask.companion.reasons.join('\n'),
      /Lifecycle state 'active' does not match expected 'closed'/
    );
  } finally {
    await removeFixture(root);
  }
});
