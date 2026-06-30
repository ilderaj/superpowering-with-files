import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildActiveSummaryTextReport, getActiveTaskSummary } from '../../harness/runtime/summary-service.mjs';
import { writeExecutionReceipt } from '../../harness/runtime/execution-receipt.mjs';

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

async function writeFollowupClosure(root, taskId, unitId, overrides = {}) {
  const closureDir = path.join(root, '.harness', 'execution', 'followup-closures', taskId);
  await mkdir(closureDir, { recursive: true });
  await writeFile(
    path.join(closureDir, `2026-06-04T10-00-00.000Z-${unitId}.json`),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        taskId,
        unitId,
        followupId: `${unitId}:integration:progress.md`,
        closureStatus: 'resolved',
        actor: 'codex',
        mode: 'inline',
        closedAt: '2026-06-04T10:00:00.000Z',
        reason: 'reconciliation.md now records the accepted closure path',
        evidenceRef: 'reconciliation.md#followup-closure',
        syncBackRef: 'progress.md#followup-closure',
        ...overrides
      },
      null,
      2
    )}\n`
  );
}

test('getActiveTaskSummary surfaces companion drift for active tasks that declare a companion plan', async () => {
  const root = await createFixture('summary-service-companion-drift-active');
  try {
    await writeTask(root, 'task-active-drift', {
      taskPlan: [
        '# Task Active Drift',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '## Companion Plan',
        '- Companion plan: `docs/superpowers/plans/task-active-drift.md`',
        '- Companion summary: strategic notes are in flight',
        '- Sync-back status: active at 2026-06-04T10:00:00: initial draft',
        '',
        '### Phase 1: Audit',
        '- **Status:** complete'
      ].join('\n'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });
    await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });
    await writeFile(
      path.join(root, 'docs/superpowers/plans/task-active-drift.md'),
      [
        '# Task Active Drift Companion',
        '',
        'Lifecycle state: active',
        'Sync-back status: active at 2026-06-04T10:00:00: initial draft'
      ].join('\n')
    );

    const { report } = await getActiveTaskSummary({ root });
    const driftTask = report.tasks.find((task) => task.task_id === 'task-active-drift');

    assert.equal(driftTask.companion.has_companion, true);
    assert.equal(driftTask.companion.ok, false);
    assert.match(driftTask.companion.reasons.join('\n'), /Companion plan is missing Active task path/);
    assert(
      report.anomalies.some(
        (anomaly) => anomaly.taskId === 'task-active-drift' && anomaly.kind === 'companion_sync_warning'
      )
    );
  } finally {
    await removeFixture(root);
  }
});

test('getActiveTaskSummary surfaces blocked execution receipts and open followups', async () => {
  const root = await createFixture('summary-service-execution-signals');
  try {
    await writeTask(root, 'task-execution-signals', {
      taskPlan: [
        '# Task Execution Signals',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '## Execution Contract',
        '',
        '### Unit: unit-01',
        '- Kind: implementation',
        '- Status: blocked',
        '- Scope:',
        '  - Do: keep the receipt linked to planning',
        '  - Not do: declare reconciliation complete',
        '- Owner Mode: inline',
        '- Allowed Ops:',
        '  - Files: harness/**',
        '  - Commands: node --test',
        '- Dependencies:',
        '  - None.',
        '- Verification Plan:',
        '  - node --test tests/installer/summary-service.test.mjs',
        '- Return Artifacts:',
        '  - receipt',
        '- Integration Target:',
        '  - progress.md',
        '- Exit Criteria:',
        '  - Receipt exists and progress links back to it.'
      ].join('\n'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    await writeExecutionReceipt(root, {
      schemaVersion: 1,
      taskId: 'task-execution-signals',
      unitId: 'unit-01',
      actor: 'codex',
      mode: 'inline',
      resultStatus: 'blocked',
      startedAt: '2026-06-04T04:00:00.000Z',
      finishedAt: '2026-06-04T04:05:00.000Z',
      changedFiles: ['harness/runtime/example.mjs'],
      verificationCommands: [],
      artifactsProduced: [{ type: 'note', ref: 'findings.md#unit-01' }],
      followups: [{ type: 'integration', status: 'open', target: 'progress.md' }],
      syncBackRef: 'progress.md#unit-01'
    });

    const { report } = await getActiveTaskSummary({ root });
    const task = report.tasks.find((entry) => entry.task_id === 'task-execution-signals');

    assert.equal(task.executionSignals.receiptCount, 1);
    assert.equal(task.executionSignals.blockedUnits, 1);
    assert.equal(task.executionSignals.openFollowups, 1);
    assert(
      report.anomalies.some(
        (anomaly) => anomaly.taskId === 'task-execution-signals' && anomaly.kind === 'execution_receipt_blocked'
      )
    );
  } finally {
    await removeFixture(root);
  }
});

test('route metadata stays route-centered and does not expose install baseline as task route truth', async () => {
  const root = await createFixture('summary-service-routing-decision');
  try {
    await writeTask(root, 'task-routing', {
      taskPlan: [
        '# Task Routing',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        'Reconcile: open',
        '',
        '## Routing Decision',
        '- Selected Route: tracked-lean',
        '- Route Reason: durable task without deep reasoning',
        '- Promotion Trigger: none',
        '- Route Evidence Surface: planning + active-summary',
        '',
        '### Phase 1: Audit',
        '- **Status:** complete'
      ].join('\n'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    const { report } = await getActiveTaskSummary({ root });
    const task = report.tasks.find((entry) => entry.task_id === 'task-routing');

    assert.equal(task.routingDecision.selectedRoute, 'tracked-lean');
    assert.equal(task.routingDecision.routeEvidenceSurface, 'planning + active-summary');
    assert.equal(Object.hasOwn(task.routingDecision, 'installBaseline'), false);
    assert.equal(task.reconciliationStatus, 'open');
  } finally {
    await removeFixture(root);
  }
});

test('getActiveTaskSummary suppresses execution_followup_open when closure evidence resolves every followup', async () => {
  const root = await createFixture('summary-service-followup-closure');
  try {
    await writeTask(root, 'task-followup-closure', {
      taskPlan: [
        '# Task Follow-Up Closure',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '## Execution Contract',
        '',
        '### Unit: unit-01',
        '- Kind: integration',
        '- Status: done',
        '- Scope:',
        '  - Do: record follow-up closure evidence.',
        '  - Not do: redefine task-level reconciliation.',
        '- Owner Mode: inline',
        '- Allowed Ops:',
        '  - Files: planning/**',
        '  - Commands: node --test',
        '- Dependencies:',
        '  - goal-3-receipts',
        '- Verification Plan:',
        '  - node --test tests/installer/summary-service.test.mjs',
        '- Return Artifacts:',
        '  - receipt',
        '- Integration Target:',
        '  - reconciliation.md',
        '- Exit Criteria:',
        '  - closure evidence is readable from active-summary.'
      ].join('\n'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    await writeExecutionReceipt(root, {
      schemaVersion: 1,
      taskId: 'task-followup-closure',
      unitId: 'unit-01',
      actor: 'codex',
      mode: 'inline',
      resultStatus: 'done_with_evidence',
      startedAt: '2026-06-04T04:00:00.000Z',
      finishedAt: '2026-06-04T04:05:00.000Z',
      changedFiles: ['planning/active/task-followup-closure/reconciliation.md'],
      verificationCommands: [],
      artifactsProduced: [{ type: 'note', ref: 'progress.md#followup-closure' }],
      followups: [{ type: 'integration', status: 'open', target: 'progress.md' }],
      syncBackRef: 'progress.md#followup-closure'
    });
    await writeFollowupClosure(root, 'task-followup-closure', 'unit-01');

    const { report } = await getActiveTaskSummary({ root });
    const task = report.tasks.find((entry) => entry.task_id === 'task-followup-closure');

    assert.equal(task.executionSignals.receiptCount, 1);
    assert.equal(task.executionSignals.openFollowups, 0);
    assert.equal(task.executionSignals.resolvedFollowups, 1);
    assert.equal(task.executionSignals.waivedFollowups, 0);
    assert.equal(
      report.anomalies.some(
        (anomaly) => anomaly.taskId === 'task-followup-closure' && anomaly.kind === 'execution_followup_open'
      ),
      false
    );
  } finally {
    await removeFixture(root);
  }
});

test('getActiveTaskSummary keeps route truth and execution signals visible on the same tracked task', async () => {
  const root = await createFixture('summary-service-route-and-execution');
  try {
    await writeTask(root, 'task-route-and-execution', {
      taskPlan: [
        '# Task Route And Execution',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '## Routing Decision',
        '- Selected Route: tracked-lean',
        '- Route Reason: durable task without deep reasoning',
        '- Promotion Trigger: none',
        '- Route Evidence Surface: planning + active-summary',
        '',
        '## Execution Contract',
        '',
        '### Unit: unit-01',
        '- Kind: implementation',
        '- Status: blocked',
        '- Scope:',
        '  - Do: keep route and execution state visible together.',
        '  - Not do: hide execution evidence behind route metadata.',
        '- Owner Mode: inline',
        '- Allowed Ops:',
        '  - Files: harness/**',
        '  - Commands: node --test',
        '- Dependencies:',
        '  - None.',
        '- Verification Plan:',
        '  - node --test tests/installer/summary-service.test.mjs',
        '- Return Artifacts:',
        '  - receipt',
        '- Integration Target:',
        '  - progress.md',
        '- Exit Criteria:',
        '  - active-summary exposes both route and execution surfaces.'
      ].join('\n'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    await writeExecutionReceipt(root, {
      schemaVersion: 1,
      taskId: 'task-route-and-execution',
      unitId: 'unit-01',
      actor: 'codex',
      mode: 'inline',
      resultStatus: 'blocked',
      startedAt: '2026-06-04T04:00:00.000Z',
      finishedAt: '2026-06-04T04:05:00.000Z',
      changedFiles: ['harness/runtime/summary-service.mjs'],
      verificationCommands: [],
      artifactsProduced: [{ type: 'note', ref: 'progress.md#unit-01' }],
      followups: [{ type: 'integration', status: 'open', target: 'progress.md' }],
      syncBackRef: 'progress.md#unit-01'
    });

    const { report } = await getActiveTaskSummary({ root });
    const task = report.tasks.find((entry) => entry.task_id === 'task-route-and-execution');

    assert.equal(task.routingDecision.selectedRoute, 'tracked-lean');
    assert.equal(task.executionSignals.receiptCount, 1);
    assert.equal(task.executionSignals.blockedUnits, 1);
    assert.equal(task.executionSignals.openFollowups, 1);
  } finally {
    await removeFixture(root);
  }
});

test('getActiveTaskSummary reports reconciliation_open when an archive-ready task has no accepted reconciliation signal', async () => {
  const root = await createFixture('summary-service-reconciliation-open');
  try {
    await writeTask(root, 'task-reconciliation-open', {
      taskPlan: [
        '# Task Reconciliation Open',
        '',
        '## Current State',
        'Status: closed',
        'Archive Eligible: yes',
        'Close Reason: implementation complete',
        '',
        '### Phase 1: Closeout',
        '- **Status:** complete'
      ].join('\n'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    const { report } = await getActiveTaskSummary({ root });
    assert.equal(
      report.anomalies.some(
        (entry) => entry.taskId === 'task-reconciliation-open' && entry.kind === 'reconciliation_open'
      ),
      true
    );
  } finally {
    await removeFixture(root);
  }
});

test('active summary text points operators to queue proof and release proof surfaces', async () => {
  const text = buildActiveSummaryTextReport({
    counts: {
      total: 1,
      archiveReady: 0,
      needsAttention: 1,
      byStatus: { active: 1 },
      byReconciliationStatus: { open: 1 }
    },
    tasks: [
      {
        task_id: 'demo-task',
        status: 'active',
        archive_ready: false,
        reconciliationStatus: 'open',
        phase_complete: 1,
        phase_total: 3,
        reason: 'reconciliation open',
        warnings: ['archive-eligible task has no reconciliation readiness signal'],
        executionSignals: {
          receiptCount: 1,
          blockedUnits: 0,
          failedUnits: 0,
          openFollowups: 1,
          resolvedFollowups: 0,
          waivedFollowups: 0
        }
      }
    ]
  });

  assert.match(text, /needs_attention=1/);
  assert.match(text, /reconciliation=open/);
  assert.match(text, /open_followups=1/);
  assert.match(text, /release proof=\.harness\/verification/);
});
