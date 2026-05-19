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
  if (files.reconciliation !== undefined) {
    await writeFile(path.join(taskDir, 'reconciliation.md'), files.reconciliation);
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

test('harness active-summary keeps blank reconciliation artifacts and placeholder progress sections open', async () => {
  const root = await createFixture('active-summary-reconciliation-open-placeholders');
  try {
    await writeTask(root, 'blank-artifact', {
      ...taskFiles('Blank Artifact', 'closed', 'yes'),
      reconciliation: ''
    });
    await writeTask(root, 'template-artifact', {
      ...taskFiles('Template Artifact', 'closed', 'yes'),
      reconciliation: [
        '# Reconciliation: template-artifact',
        '',
        '## Archive Readiness',
        '- [Ready / Not ready, with reason.]'
      ].join('\n')
    });
    await writeTask(root, 'placeholder-progress', {
      ...taskFiles('Placeholder Progress', 'closed', 'yes'),
      progress: '# Progress\n\n## Reconciliation\n- Ready / Not ready, with reason.\n'
    });

    const { stdout } = await harnessCommand(root, 'active-summary', '--json');
    const report = JSON.parse(stdout);

    assert.equal(report.counts.byReconciliationStatus.open, 3);
    for (const taskId of ['blank-artifact', 'template-artifact', 'placeholder-progress']) {
      const task = report.tasks.find((entry) => entry.task_id === taskId);
      assert.equal(task.reconciliationStatus, 'open');
      assert.equal(task.reconciliationReady, false);
      assert(
        report.anomalies.some((anomaly) => anomaly.taskId === taskId && anomaly.kind === 'reconciliation_open')
      );
    }
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
    await writeTask(root, 'task-ready', {
      ...taskFiles('Task Ready', 'closed', 'yes'),
      reconciliation: [
        '# Reconciliation: task-ready',
        '',
        '## Archive Readiness',
        'Ready, reason: fixture is reconciled.'
      ].join('\n')
    });
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
    await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });
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


test('harness active-summary exposes reconciliation lifecycle status and anomalies', async () => {
  const root = await createFixture('active-summary-reconciliation');
  try {
    await writeTask(root, 'task-complete', {
      ...taskFiles('Task Complete', 'closed', 'yes'),
      taskPlan: [
        '# Task Complete',
        '',
        '## Current State',
        'Status: closed',
        'Archive Eligible: yes',
        'Close Reason: done',
        'Reconcile: complete',
        '',
        '### Phase 1: Audit',
        '- **Status:** complete'
      ].join('\n')
    });
    await writeTask(root, 'task-not-required', {
      ...taskFiles('Task Not Required', 'closed', 'yes'),
      taskPlan: [
        '# Task Not Required',
        '',
        '## Current State',
        'Status: closed',
        'Archive Eligible: yes',
        'Close Reason: typo fix',
        'Reconcile: not_required — typo-only docs change',
        '',
        '### Phase 1: Audit',
        '- **Status:** complete'
      ].join('\n')
    });
    await writeTask(root, 'task-waived', {
      ...taskFiles('Task Waived', 'closed', 'yes'),
      progress: '# Progress\n\nReconcile: waived — owner accepted drift\n'
    });
    await writeTask(root, 'task-open', taskFiles('Task Open', 'closed', 'yes'));
    await writeTask(root, 'task-ready-artifact', {
      ...taskFiles('Task Ready Artifact', 'closed', 'yes'),
      reconciliation: [
        '# Reconciliation: task-ready-artifact',
        '',
        '## Archive Readiness',
        '- Ready — docs, roadmap, and backlog are synchronized.'
      ].join('\n')
    });

    const { stdout } = await harnessCommand(root, 'active-summary', '--json');
    const report = JSON.parse(stdout);

    assert.equal(report.counts.byReconciliationStatus.complete, 2);
    assert.equal(report.counts.byReconciliationStatus.not_required, 1);
    assert.equal(report.counts.byReconciliationStatus.waived, 1);
    assert.equal(report.counts.byReconciliationStatus.open, 1);

    const completeTask = report.tasks.find((task) => task.task_id === 'task-complete');
    const notRequiredTask = report.tasks.find((task) => task.task_id === 'task-not-required');
    const waivedTask = report.tasks.find((task) => task.task_id === 'task-waived');
    const openTask = report.tasks.find((task) => task.task_id === 'task-open');
    const readyArtifactTask = report.tasks.find((task) => task.task_id === 'task-ready-artifact');

    assert.equal(completeTask.reconciliationStatus, 'complete');
    assert.equal(completeTask.reconciliation_status, 'complete');
    assert.equal(completeTask.reconciliationReady, true);
    assert.equal(notRequiredTask.reconciliationStatus, 'not_required');
    assert.equal(notRequiredTask.reconciliationReady, true);
    assert.equal(waivedTask.reconciliationStatus, 'waived');
    assert.equal(waivedTask.reconciliationReady, true);
    assert.equal(openTask.reconciliationStatus, 'open');
    assert.equal(openTask.reconciliationReady, false);
    assert.equal(readyArtifactTask.reconciliationStatus, 'complete');
    assert.equal(readyArtifactTask.reconciliationReady, true);
    assert(report.anomalies.some((anomaly) => anomaly.taskId === 'task-open' && anomaly.kind === 'reconciliation_open'));
  } finally {
    await removeFixture(root);
  }
});
