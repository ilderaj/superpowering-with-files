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
  const maybeOptions = args.at(-1);
  const options =
    maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions) ? args.pop() : {};

  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      HARNESS_PROJECT_ROOT: root
    }
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

async function writeExecutionReceiptArtifact(root, taskId, unitId, overrides = {}) {
  const receiptDir = path.join(root, '.harness', 'execution', 'receipts', taskId);
  await mkdir(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `2026-06-04T04-00-00.000Z-${unitId}.json`);
  await writeFile(
    receiptPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        taskId,
        unitId,
        actor: 'codex',
        mode: 'inline',
        resultStatus: 'blocked',
        startedAt: '2026-06-04T04:00:00.000Z',
        finishedAt: '2026-06-04T04:05:00.000Z',
        changedFiles: [],
        verificationCommands: [],
        artifactsProduced: [],
        followups: [{ type: 'integration', status: 'open', target: 'progress.md' }],
        syncBackRef: 'progress.md#unit-01',
        ...overrides
      },
      null,
      2
    )}\n`
  );
}

async function writeFollowupClosureArtifact(root, taskId, unitId, overrides = {}) {
  const closureDir = path.join(root, '.harness', 'execution', 'followup-closures', taskId);
  await mkdir(closureDir, { recursive: true });
  const closurePath = path.join(closureDir, `2026-06-04T10-00-00.000Z-${unitId}.json`);
  await writeFile(
    closurePath,
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

test('harness --help does not list the hidden active-summary command', async () => {
  const root = await createFixture('active-summary-help');
  try {
    const { stdout } = await harnessCommand(root, '--help');
    assert.doesNotMatch(stdout, /^\s*active-summary\b/m);
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

test('harness active-summary resolves authority root when run from a nested leaf directory', async () => {
  const root = await createFixture('active-summary-nested-cwd');
  try {
    const leafDir = path.join(root, 'packages/demo');
    await mkdir(leafDir, { recursive: true });
    await writeTask(root, 'task-active', taskFiles('Task Active', 'active'));

    const { stdout, stderr } = await harnessCommand(root, 'active-summary', { cwd: leafDir });

    assert.equal(stderr, '');
    assert.match(stdout, /task-active: status=active/);
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

test('harness active-summary surfaces companion drift for active tasks before archive readiness', async () => {
  const root = await createFixture('active-summary-companion-drift-active');
  try {
    await writeTask(root, 'task-active-drift', {
      ...taskFiles('Task Active Drift', 'active'),
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
      ].join('\n')
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

    const { stdout } = await harnessCommand(root, 'active-summary', '--json');
    const report = JSON.parse(stdout);
    const driftTask = report.tasks.find((task) => task.task_id === 'task-active-drift');

    assert.equal(driftTask.archive_ready, false);
    assert.equal(driftTask.companion.has_companion, true);
    assert.equal(driftTask.companion.ok, false);
    assert.match(
      driftTask.companion.reasons.join('\n'),
      /Companion plan is missing Active task path/
    );
    assert(
      report.anomalies.some(
        (anomaly) => anomaly.taskId === 'task-active-drift' && anomaly.kind === 'companion_sync_warning'
      )
    );
  } finally {
    await removeFixture(root);
  }
});

test('active-summary surfaces route metadata without changing reconciliation semantics', async () => {
  const root = await createFixture('active-summary-routing-decision');
  try {
    await writeTask(root, 'task-a', {
      taskPlan: [
        '# Task A',
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

    const { stdout, stderr } = await harnessCommand(root, 'active-summary', '--json');
    const report = JSON.parse(stdout);

    assert.equal(stderr, '');
    assert.equal(report.tasks[0].routingDecision.selectedRoute, 'tracked-lean');
    assert.equal(Object.hasOwn(report.tasks[0].routingDecision, 'installBaseline'), false);
    assert.equal(report.tasks[0].reconciliationStatus, 'open');
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

test('harness active-summary keeps reconciliation authority semantics stable when Execution Contract is present', async () => {
  const root = await createFixture('active-summary-reconciliation-execution-contract');
  try {
    await writeTask(root, 'task-contract-open', {
      ...taskFiles('Task Contract Open', 'closed', 'yes'),
      taskPlan: [
        '# Task Contract Open',
        '',
        '## Current State',
        'Status: closed',
        'Archive Eligible: yes',
        'Close Reason: implementation landed',
        '',
        '## Execution Contract',
        '',
        '### Unit: unit-01',
        '- Kind: implementation',
        '- Status: integrated',
        '- Scope:',
        '  - Do: Keep the archive-ready task wired into the contract surface.',
        '  - Not do: Declare reconciliation complete on behalf of the task.',
        '- Owner Mode: inline',
        '- Allowed Ops:',
        '  - Files: planning/active/task-contract-open/*',
        '  - Commands: node --test',
        '- Dependencies:',
        '  - None.',
        '- Verification Plan:',
        '  - node --test tests/installer/active-summary-command.test.mjs',
        '- Return Artifacts:',
        '  - regression test',
        '- Integration Target:',
        '  - progress.md',
        '- Exit Criteria:',
        '  - The contract unit is integrated without changing task-level reconciliation truth.',
        '',
        '### Phase 1: Audit',
        '- **Status:** complete'
      ].join('\n')
    });
    await writeTask(root, 'task-contract-complete', {
      ...taskFiles('Task Contract Complete', 'closed', 'yes'),
      taskPlan: [
        '# Task Contract Complete',
        '',
        '## Current State',
        'Status: closed',
        'Archive Eligible: yes',
        'Close Reason: audit documented',
        'Reconcile: complete',
        '',
        '## Execution Contract',
        '',
        '### Unit: unit-01',
        '- Kind: implementation',
        '- Status: planned',
        '- Scope:',
        '  - Do: Leave task-level reconciliation authority unchanged.',
        '  - Not do: Override task readiness from unit state alone.',
        '- Owner Mode: inline',
        '- Allowed Ops:',
        '  - Files: planning/active/task-contract-complete/*',
        '  - Commands: node --test',
        '- Dependencies:',
        '  - None.',
        '- Verification Plan:',
        '  - node --test tests/installer/active-summary-command.test.mjs',
        '- Return Artifacts:',
        '  - regression test',
        '- Integration Target:',
        '  - progress.md',
        '- Exit Criteria:',
        '  - Reconciliation remains complete even when the unit itself is still planned.',
        '',
        '### Phase 1: Audit',
        '- **Status:** complete'
      ].join('\n')
    });

    const { stdout } = await harnessCommand(root, 'active-summary', '--json');
    const report = JSON.parse(stdout);

    const contractOpenTask = report.tasks.find((task) => task.task_id === 'task-contract-open');
    const contractCompleteTask = report.tasks.find((task) => task.task_id === 'task-contract-complete');

    assert.equal(contractOpenTask.reconciliationStatus, 'open');
    assert.equal(contractOpenTask.reconciliationReady, false);
    assert.equal(contractOpenTask.archive_ready, false);
    assert(
      report.anomalies.some(
        (anomaly) => anomaly.taskId === 'task-contract-open' && anomaly.kind === 'reconciliation_open'
      )
    );

    assert.equal(contractCompleteTask.reconciliationStatus, 'complete');
    assert.equal(contractCompleteTask.reconciliationReady, true);
    assert.equal(contractCompleteTask.archive_ready, true);
  } finally {
    await removeFixture(root);
  }
});

test('harness active-summary surfaces execution receipt signals', async () => {
  const root = await createFixture('active-summary-execution-signals');
  try {
    await writeTask(root, 'task-execution-signals', {
      ...taskFiles('Task Execution Signals', 'active'),
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
        '  - Do: keep execution receipts visible in active-summary.',
        '  - Not do: let receipt status replace reconciliation authority.',
        '- Owner Mode: inline',
        '- Allowed Ops:',
        '  - Files: harness/**',
        '  - Commands: node --test',
        '- Dependencies:',
        '  - None.',
        '- Verification Plan:',
        '  - node --test tests/installer/active-summary-command.test.mjs',
        '- Return Artifacts:',
        '  - receipt',
        '- Integration Target:',
        '  - progress.md',
        '- Exit Criteria:',
        '  - Active summary reflects execution receipt state.'
      ].join('\n')
    });
    await writeExecutionReceiptArtifact(root, 'task-execution-signals', 'unit-01');

    const { stdout } = await harnessCommand(root, 'active-summary', '--json');
    const report = JSON.parse(stdout);
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

test('harness active-summary suppresses open-followup anomalies when closure evidence resolves them', async () => {
  const root = await createFixture('active-summary-followup-closure');
  try {
    await writeTask(root, 'task-followup-closure', {
      ...taskFiles('Task Follow-Up Closure', 'active'),
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
        '  - Do: surface closure-aware execution signals.',
        '  - Not do: redefine reconciliation authority.',
        '- Owner Mode: inline',
        '- Allowed Ops:',
        '  - Files: planning/**',
        '  - Commands: node --test',
        '- Dependencies:',
        '  - goal-3-receipts',
        '- Verification Plan:',
        '  - node --test tests/installer/active-summary-command.test.mjs',
        '- Return Artifacts:',
        '  - receipt',
        '- Integration Target:',
        '  - reconciliation.md',
        '- Exit Criteria:',
        '  - active-summary no longer reports open followups for resolved closures.'
      ].join('\n')
    });
    await writeExecutionReceiptArtifact(root, 'task-followup-closure', 'unit-01', {
      resultStatus: 'done_with_evidence'
    });
    await writeFollowupClosureArtifact(root, 'task-followup-closure', 'unit-01');

    const { stdout } = await harnessCommand(root, 'active-summary', '--json');
    const report = JSON.parse(stdout);
    const task = report.tasks.find((entry) => entry.task_id === 'task-followup-closure');

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

test('harness active-summary --json exposes route metadata and execution counts together', async () => {
  const root = await createFixture('active-summary-route-and-execution');
  try {
    await writeTask(root, 'task-route-and-execution', {
      ...taskFiles('Task Route And Execution', 'active'),
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
        '  - Do: expose route metadata and execution counts together.',
        '  - Not do: hide one signal behind the other.',
        '- Owner Mode: inline',
        '- Allowed Ops:',
        '  - Files: harness/**',
        '  - Commands: node --test',
        '- Dependencies:',
        '  - None.',
        '- Verification Plan:',
        '  - node --test tests/installer/active-summary-command.test.mjs',
        '- Return Artifacts:',
        '  - receipt',
        '- Integration Target:',
        '  - progress.md',
        '- Exit Criteria:',
        '  - active-summary JSON keeps both route and execution state visible.'
      ].join('\n')
    });

    await writeExecutionReceiptArtifact(root, 'task-route-and-execution', 'unit-01');

    const { stdout } = await harnessCommand(root, 'active-summary', '--json');
    const report = JSON.parse(stdout);
    const task = report.tasks.find((entry) => entry.task_id === 'task-route-and-execution');

    assert.equal(task.routingDecision.selectedRoute, 'tracked-lean');
    assert.equal(task.executionSignals.receiptCount, 1);
    assert.equal(task.executionSignals.blockedUnits, 1);
    assert.equal(task.executionSignals.openFollowups, 1);
  } finally {
    await removeFixture(root);
  }
});
