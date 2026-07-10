import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { getLifecycleSweepReport } from '../../harness/runtime/lifecycle-sweep-service.mjs';

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

async function harnessCommand(root, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root,
    env: { ...process.env, HARNESS_PROJECT_ROOT: root }
  });
}

async function writeTask(root, taskId, status = 'active') {
  const taskDir = path.join(root, 'planning/active', taskId);
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, 'task_plan.md'),
    [
      '# Task',
      '',
      '## Current State',
      `Status: ${status}`,
      'Archive Eligible: no',
      'Close Reason:',
      '',
      '### Phase 1: Work',
      '- **Status:** complete'
    ].join('\n')
  );
  await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
  await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n');
}

async function writeAnchor(root, taskId, anchor) {
  const anchorDir = path.join(root, '.harness/lifecycle/anchors', taskId);
  await mkdir(anchorDir, { recursive: true });
  await writeFile(
    path.join(anchorDir, `${anchor.anchorId}.json`),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        taskId,
        observedAt: '2026-07-08T05:21:33.000Z',
        actor: 'codex',
        evidenceRefs: [`planning/active/${taskId}/progress.md#anchor`],
        syncBackRef: `planning/active/${taskId}/progress.md#anchor`,
        blockingConditions: [],
        ...anchor
      },
      null,
      2
    )}\n`
  );
}

test('harness --help lists lifecycle-sweep', async () => {
  const root = await createFixture('lifecycle-sweep-help');
  try {
    const { stdout } = await harnessCommand(root, '--help');
    assert.match(stdout, /lifecycle-sweep\s+Recommend conservative lifecycle status changes/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lifecycle sweep reports branch push but never applies it automatically', async () => {
  const root = await createFixture('lifecycle-sweep-weak-push');
  try {
    await writeTask(root, 'task-demo', 'active');
    await writeAnchor(root, 'task-demo', {
      anchorId: 'push-feature-demo',
      anchorType: 'branch_pushed',
      anchorStrength: 'weak',
      recommendedStatus: 'waiting_integration'
    });

    const report = await getLifecycleSweepReport({ root });
    const recommendation = report.recommendations.find((entry) => entry.taskId === 'task-demo');
    assert.equal(recommendation.action, 'mark_waiting_integration');
    assert.equal(recommendation.recommendedStatus, 'waiting_integration');
    assert.equal(recommendation.applyEligible, false);
    assert.equal(recommendation.archiveAction, 'never_auto_archive');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lifecycle sweep uses the selected anchor for apply eligibility', async () => {
  const root = await createFixture('lifecycle-sweep-selected-anchor-guard');
  try {
    await writeTask(root, 'task-demo', 'active');
    await writeAnchor(root, 'task-demo', {
      anchorId: 'a-pr-created',
      anchorType: 'pr_created',
      anchorStrength: 'moderate',
      observedAt: '2026-07-08T05:21:33.000Z',
      recommendedStatus: 'waiting_review'
    });
    await writeAnchor(root, 'task-demo', {
      anchorId: 'z-branch-pushed',
      anchorType: 'branch_pushed',
      anchorStrength: 'moderate',
      observedAt: '2026-07-09T05:21:33.000Z',
      recommendedStatus: 'waiting_integration'
    });

    const report = await getLifecycleSweepReport({ root, now: Date.parse('2026-07-10T05:21:33.000Z') });
    const recommendation = report.recommendations.find((entry) => entry.taskId === 'task-demo');
    assert.equal(recommendation.action, 'mark_waiting_integration');
    assert.equal(recommendation.recommendedStatus, 'waiting_integration');
    assert.equal(recommendation.applyEligible, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lifecycle sweep recommends close for strong merged PR but never applies close', async () => {
  const root = await createFixture('lifecycle-sweep-pr-merged');
  try {
    await writeTask(root, 'task-demo', 'waiting_review');
    await writeAnchor(root, 'task-demo', {
      anchorId: 'pr-10-merged',
      anchorType: 'pr_merged',
      anchorStrength: 'strong',
      recommendedStatus: 'closed'
    });

    const report = await getLifecycleSweepReport({ root });
    const recommendation = report.recommendations.find((entry) => entry.taskId === 'task-demo');
    assert.equal(recommendation.action, 'recommend_close');
    assert.equal(recommendation.recommendedStatus, 'closed');
    assert.equal(recommendation.applyEligible, false);
    assert.equal(recommendation.archiveAction, 'never_auto_archive');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lifecycle sweep sends stale anchors to manual review', async () => {
  const root = await createFixture('lifecycle-sweep-stale-anchor');
  try {
    await writeTask(root, 'task-demo', 'waiting_review');
    await writeAnchor(root, 'task-demo', {
      anchorId: 'old-pr-10-merged',
      anchorType: 'pr_merged',
      anchorStrength: 'strong',
      observedAt: '2026-06-01T05:21:33.000Z',
      recommendedStatus: 'closed'
    });

    const report = await getLifecycleSweepReport({ root, now: Date.parse('2026-07-09T05:21:33.000Z') });
    const recommendation = report.recommendations.find((entry) => entry.taskId === 'task-demo');
    assert.equal(recommendation.action, 'manual_review');
    assert.equal(recommendation.applyEligible, false);
    assert(recommendation.blockers.some((blocker) => /stale anchor/i.test(blocker)));
    assert.equal(report.health.staleAnchorGuards, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lifecycle sweep sends conflicting terminal anchors to manual review', async () => {
  const root = await createFixture('lifecycle-sweep-conflicting-anchors');
  try {
    await writeTask(root, 'task-demo', 'waiting_review');
    await writeAnchor(root, 'task-demo', {
      anchorId: 'pr-10-merged',
      anchorType: 'pr_merged',
      anchorStrength: 'strong',
      recommendedStatus: 'closed'
    });
    await writeAnchor(root, 'task-demo', {
      anchorId: 'closure-blocked',
      anchorType: 'autonomous_closure_terminal',
      anchorStrength: 'terminal',
      recommendedStatus: 'blocked'
    });

    const report = await getLifecycleSweepReport({ root, now: Date.parse('2026-07-09T05:21:33.000Z') });
    const recommendation = report.recommendations.find((entry) => entry.taskId === 'task-demo');
    assert.equal(recommendation.action, 'manual_review');
    assert.equal(recommendation.applyEligible, false);
    assert(recommendation.blockers.some((blocker) => /conflicting terminal anchors/i.test(blocker)));
    assert.equal(report.health.conflictGuards, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lifecycle sweep sends worker identity mismatch to manual review', async () => {
  const root = await createFixture('lifecycle-sweep-worker-mismatch');
  try {
    await writeTask(root, 'task-demo', 'waiting_review');
    await writeAnchor(root, 'task-demo', {
      anchorId: 'worker-wrong-task',
      anchorType: 'pr_merged',
      anchorStrength: 'strong',
      recommendedStatus: 'closed',
      subject: {
        authorityTaskId: 'different-task',
        workerId: 'worker-01',
        threadId: 'thread-01',
        unitId: 'unit-01'
      }
    });

    const report = await getLifecycleSweepReport({ root, now: Date.parse('2026-07-09T05:21:33.000Z') });
    const recommendation = report.recommendations.find((entry) => entry.taskId === 'task-demo');
    assert.equal(recommendation.action, 'manual_review');
    assert.equal(recommendation.applyEligible, false);
    assert(recommendation.blockers.some((blocker) => /authorityTaskId/i.test(blocker)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lifecycle sweep blocks close when execution followups remain open', async () => {
  const root = await createFixture('lifecycle-sweep-open-followups');
  try {
    await writeTask(root, 'task-demo', 'waiting_review');
    await writeAnchor(root, 'task-demo', {
      anchorId: 'pr-10-merged',
      anchorType: 'pr_merged',
      anchorStrength: 'strong',
      recommendedStatus: 'closed'
    });
    const receiptDir = path.join(root, '.harness/execution/receipts/task-demo');
    await mkdir(receiptDir, { recursive: true });
    await writeFile(
      path.join(receiptDir, 'receipt.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          taskId: 'task-demo',
          unitId: 'unit-01',
          actor: 'codex',
          mode: 'worker',
          resultStatus: 'done_with_evidence',
          followups: [{ type: 'integration', status: 'open', target: 'progress.md' }],
          syncBackRef: 'planning/active/task-demo/progress.md#unit-01'
        },
        null,
        2
      )}\n`
    );

    const report = await getLifecycleSweepReport({ root, now: Date.parse('2026-07-09T05:21:33.000Z') });
    const recommendation = report.recommendations.find((entry) => entry.taskId === 'task-demo');
    assert.equal(recommendation.action, 'manual_review');
    assert.equal(recommendation.applyEligible, false);
    assert(recommendation.blockers.some((blocker) => /open execution followups/i.test(blocker)));
    assert.equal(report.health.blockedByOpenFollowups, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lifecycle-sweep --apply-safe applies only allowed non-terminal changes', async () => {
  const root = await createFixture('lifecycle-sweep-apply-safe');
  try {
    await writeTask(root, 'task-demo', 'active');
    await writeAnchor(root, 'task-demo', {
      anchorId: 'pr-10-created',
      anchorType: 'pr_created',
      anchorStrength: 'moderate',
      recommendedStatus: 'waiting_review'
    });

    const { stdout } = await harnessCommand(root, 'lifecycle-sweep', '--task', 'task-demo', '--json', '--apply-safe');
    const report = JSON.parse(stdout);
    assert.equal(report.applied.length, 1);
    assert.equal(report.applied[0].beforeStatus, 'active');
    assert.equal(report.applied[0].afterStatus, 'waiting_review');

    const taskPlan = await readFile(path.join(root, 'planning/active/task-demo/task_plan.md'), 'utf8');
    assert.match(taskPlan, /## Current State\nStatus: waiting_review\nArchive Eligible: no/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lifecycle-sweep --apply-safe refuses close and archive mutation', async () => {
  const root = await createFixture('lifecycle-sweep-apply-safe-close-refusal');
  try {
    await writeTask(root, 'task-demo', 'waiting_review');
    await writeAnchor(root, 'task-demo', {
      anchorId: 'pr-10-merged',
      anchorType: 'pr_merged',
      anchorStrength: 'strong',
      recommendedStatus: 'closed'
    });

    const { stdout } = await harnessCommand(root, 'lifecycle-sweep', '--task', 'task-demo', '--json', '--apply-safe');
    const report = JSON.parse(stdout);
    assert.equal(report.applied.length, 0);
    const taskPlan = await readFile(path.join(root, 'planning/active/task-demo/task_plan.md'), 'utf8');
    assert.match(taskPlan, /Status: waiting_review/);
    assert.match(taskPlan, /Archive Eligible: no/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
