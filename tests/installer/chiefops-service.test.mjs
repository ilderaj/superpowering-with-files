import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeExecutionReceipt } from '../../harness/runtime/execution-receipt.mjs';
import { serializeChiefOpsBlock } from '../../harness/runtime/chiefops-overlay/coordination-blocks.mjs';
import { buildChiefOpsControlBrief, getChiefOpsBoard, getChiefOpsInbox } from '../../harness/runtime/chiefops-service.mjs';

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

function v0bBinding(root, taskId, overrides = {}) {
  return {
    schemaVersion: 'chiefops.v0b',
    bindingId: `bind_${taskId}`,
    bindingVersion: `public_${taskId}`,
    action: 'spawn_worker',
    authorityTaskId: taskId,
    planningRoot: root,
    chiefThreadId: 'chief-thread',
    workerId: `worker_${taskId}`,
    threadId: `thread_${taskId}`,
    bindingToken: `token_${taskId}`,
    currentSlice: 'derived inbox proof',
    proofTarget: 'keep Inbox derived',
    evidenceSink: `planning/active/${taskId}/progress.md`,
    capabilityClass: 'balanced_execution',
    riskClass: 'medium',
    workType: 'coding',
    authorityMode: 'task_authority',
    allowedOps: ['inspect'],
    requiresHumanApproval: false,
    status: 'bound',
    sourceProgressRef: {
      file: `planning/active/${taskId}/progress.md`,
      blockId: `bind_${taskId}`,
      startLine: null,
      contentHash: 'sha256:abc123',
      observedAt: '2026-07-09T05:00:00.000Z'
    },
    observedAt: '2026-07-09T05:00:00.000Z',
    createdAt: '2026-07-09T05:00:00.000Z',
    ...overrides
  };
}

function activeTaskPlan(title) {
  return [
    `# ${title}`,
    '',
    '## Current State',
    'Status: active',
    'Archive Eligible: no',
    'Close Reason:',
    'Reconcile: complete',
    '',
    '## Routing Decision',
    '- Selected Route: tracked',
    '- Route Reason: bounded execution',
    '- Route Evidence Surface: planning + receipts'
  ].join('\n');
}

test('getChiefOpsBoard derives governance state from summary and receipt truth', async () => {
  const root = await createFixture('chiefops-service-board');
  try {
    await writeTask(root, 'chiefops-demo', {
      taskPlan: [
        '# ChiefOps Demo',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        'Reconcile: open',
        '',
        '## Routing Decision',
        '- Selected Route: tracked-lean',
        '- Route Reason: bounded tracked execution',
        '- Promotion Trigger: none',
        '- Route Evidence Surface: planning + receipts',
        '',
        '## Verification Contract',
        '',
        '### Mode: execution',
        '- **Proof Target:** Keep the derived board aligned with planning and receipts.',
        '- **Primary Proof:** node --test tests/installer/chiefops-service.test.mjs',
        '- **Backstop Proof:** read-only MCP registration tests.',
        '- **Escalation Trigger:** duplicate task scanning appears.',
        '- **Evidence Sink:** tests/installer/chiefops-service.test.mjs',
        '- **Reconcile Rule:** sync results into progress.md.',
        '- **Unacceptable Substitute:** manual eyeballing only.'
      ].join('\n'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    await writeExecutionReceipt(root, {
      schemaVersion: 1,
      taskId: 'chiefops-demo',
      unitId: 'unit-02',
      actor: 'codex',
      mode: 'inline',
      resultStatus: 'blocked',
      startedAt: '2026-06-04T04:00:00.000Z',
      finishedAt: '2026-06-04T04:05:00.000Z',
      changedFiles: ['harness/runtime/chiefops-service.mjs'],
      verificationCommands: [],
      artifactsProduced: [{ type: 'note', ref: 'progress.md#unit-02' }],
      followups: [{ type: 'integration', status: 'open', target: 'progress.md' }],
      syncBackRef: 'progress.md#unit-02'
    });

    const board = await getChiefOpsBoard({ root, taskId: 'chiefops-demo' });

    assert.equal(board.taskId, 'chiefops-demo');
    assert.equal(board.status, 'active');
    assert.equal(board.chiefOpsDeclared, true);
    assert.equal(board.lane, 'tracked-lean');
    assert.equal(board.proofTarget, 'Keep the derived board aligned with planning and receipts.');
    assert.equal(board.latestReceipt.unitId, 'unit-02');
    assert.equal(board.executionSignals.blockedUnits, 1);
    assert.equal(board.executionSignals.openFollowups, 1);
    assert.deepEqual(board.blockedSignals, ['execution_receipt_blocked', 'execution_followup_open', 'reconciliation_open']);
    assert.equal(board.reconciliationStatus, 'open');
    assert.equal(board.derivedRisk, 'high');
    assert.match(board.recommendedNextAction, /Resolve the blocked or failed execution unit/);
  } finally {
    await removeFixture(root);
  }
});

test('getChiefOpsBoard rejects missing active tasks', async () => {
  const root = await createFixture('chiefops-service-missing-task');
  try {
    await assert.rejects(
      getChiefOpsBoard({ root, taskId: 'missing-task' }),
      /Active task not found: missing-task/
    );
  } finally {
    await removeFixture(root);
  }
});

test('getChiefOpsBoard keeps no-receipt tasks bounded and non-alarming', async () => {
  const root = await createFixture('chiefops-service-no-receipts');
  try {
    await writeTask(root, 'chiefops-demo', {
      taskPlan: [
        '# ChiefOps Demo',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        'Reconcile: complete',
        '',
        '## Routing Decision',
        '- Selected Route: tracked',
        '- Route Reason: bounded tracked execution',
        '- Promotion Trigger: none',
        '- Route Evidence Surface: planning only'
      ].join('\n'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    const board = await getChiefOpsBoard({ root, taskId: 'chiefops-demo' });

    assert.equal(board.latestReceipt, null);
    assert.deepEqual(board.blockedSignals, []);
    assert.equal(board.derivedRisk, 'low');
    assert.match(board.recommendedNextAction, /Continue with the next bounded slice/);
  } finally {
    await removeFixture(root);
  }
});

test('getChiefOpsBoard treats failed receipts as high-risk execution issues', async () => {
  const root = await createFixture('chiefops-service-failed-receipt');
  try {
    await writeTask(root, 'chiefops-demo', {
      taskPlan: [
        '# ChiefOps Demo',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        'Reconcile: complete',
        '',
        '## Routing Decision',
        '- Selected Route: tracked',
        '- Route Reason: bounded tracked execution',
        '- Promotion Trigger: none',
        '- Route Evidence Surface: planning + receipts'
      ].join('\n'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    await writeExecutionReceipt(root, {
      schemaVersion: 1,
      taskId: 'chiefops-demo',
      unitId: 'unit-04',
      actor: 'codex',
      mode: 'inline',
      resultStatus: 'failed',
      startedAt: '2026-06-04T05:00:00.000Z',
      finishedAt: '2026-06-04T05:03:00.000Z',
      changedFiles: ['harness/installer/commands/chiefops.mjs'],
      verificationCommands: [],
      artifactsProduced: [],
      followups: [],
      syncBackRef: 'progress.md#unit-04'
    });

    const board = await getChiefOpsBoard({ root, taskId: 'chiefops-demo' });

    assert.equal(board.executionSignals.failedUnits, 1);
    assert.deepEqual(board.blockedSignals, ['execution_receipt_failed']);
    assert.equal(board.derivedRisk, 'high');
    assert.match(board.recommendedNextAction, /Resolve the blocked or failed execution unit/);
  } finally {
    await removeFixture(root);
  }
});

test('getChiefOpsInbox is an in-memory rebuildable projection and its Control Brief restores trios without raw worker handles', async () => {
  const root = await createFixture('chiefops-service-inbox-rebuild');
  try {
    const running = 'chiefops-running';
    const unknown = 'chiefops-unknown';
    await writeTask(root, running, {
      taskPlan: activeTaskPlan('ChiefOps Running'),
      findings: '# Findings\n',
      progress: `# Progress\n\n${serializeChiefOpsBlock('ChiefOpsWorkerBinding', v0bBinding(root, running))}`
    });
    await writeTask(root, unknown, {
      taskPlan: activeTaskPlan('ChiefOps Unknown'),
      findings: '# Findings\n',
      progress: '# Progress\n'
    });

    const beforeReceiptDir = await stat(path.join(root, '.harness', 'execution', 'receipts')).then(() => true).catch(() => false);
    const input = { root, now: () => '2026-07-13T00:00:00.000Z' };
    const first = await getChiefOpsInbox(input);
    const second = await getChiefOpsInbox(input);
    const afterReceiptDir = await stat(path.join(root, '.harness', 'execution', 'receipts')).then(() => true).catch(() => false);

    assert.equal(beforeReceiptDir, false);
    assert.equal(afterReceiptDir, false);
    assert.deepEqual(second, first);
    assert.equal(first.schemaVersion, 'chiefops.v1.inbox');
    assert.deepEqual(first.tasks.map((task) => [task.taskId, task.lane]), [
      [running, 'running'],
      [unknown, 'unknown']
    ]);

    const brief = buildChiefOpsControlBrief(first);
    assert.match(brief, /Restore task_plan\.md, findings\.md, and progress\.md before acting\./);
    assert.match(brief, /chiefops-running/);
    assert.doesNotMatch(brief, /thread_chiefops-running/);
  } finally {
    await removeFixture(root);
  }
});

test('getChiefOpsInbox blocks both sides of index conflicts and does not report terminal or approval-required workers as running', async () => {
  const root = await createFixture('chiefops-service-inbox-conflicts');
  try {
    const first = 'chiefops-first';
    const second = 'chiefops-second';
    const done = 'chiefops-done';
    const approval = 'chiefops-approval';
    const firstBinding = v0bBinding(root, first, {
      workerId: 'shared-worker',
      bindingVersion: 'public-first',
      bindingToken: 'token-first'
    });
    const secondBinding = v0bBinding(root, second, {
      workerId: 'shared-worker',
      bindingVersion: 'public-second',
      bindingToken: 'token-second'
    });
    const doneBinding = v0bBinding(root, done);
    const doneReceipt = {
      schemaVersion: 'chiefops.v0b',
      receiptId: 'receipt_done',
      receiptType: 'done',
      authorityTaskId: done,
      workerId: doneBinding.workerId,
      threadId: doneBinding.threadId,
      sessionId: null,
      bindingVersion: doneBinding.bindingVersion,
      bindingToken: doneBinding.bindingToken,
      currentSlice: doneBinding.currentSlice,
      proofTarget: doneBinding.proofTarget,
      evidenceSink: doneBinding.evidenceSink,
      capabilityClass: doneBinding.capabilityClass,
      riskClass: doneBinding.riskClass,
      workType: doneBinding.workType,
      authorityMode: doneBinding.authorityMode,
      allowedOps: doneBinding.allowedOps,
      sourceProgressRef: doneBinding.sourceProgressRef,
      observedAt: '2026-07-09T05:05:00.000Z',
      status: 'done',
      summary: 'Completed.',
      evidenceRefs: ['planning/active/chiefops-done/progress.md#receipt_done'],
      nextSuggestedAction: 'return to Chief',
      createdAt: '2026-07-09T05:05:00.000Z'
    };

    await Promise.all([
      writeTask(root, first, { taskPlan: activeTaskPlan('First'), findings: '# Findings\n', progress: serializeChiefOpsBlock('ChiefOpsWorkerBinding', firstBinding) }),
      writeTask(root, second, { taskPlan: activeTaskPlan('Second'), findings: '# Findings\n', progress: serializeChiefOpsBlock('ChiefOpsWorkerBinding', secondBinding) }),
      writeTask(root, done, {
        taskPlan: activeTaskPlan('Done'),
        findings: '# Findings\n',
        progress: [serializeChiefOpsBlock('ChiefOpsWorkerBinding', doneBinding), serializeChiefOpsBlock('ChiefOpsWorkerReceipt', doneReceipt)].join('\n\n')
      }),
      writeTask(root, approval, {
        taskPlan: activeTaskPlan('Approval'),
        findings: '# Findings\n',
        progress: serializeChiefOpsBlock('ChiefOpsWorkerBinding', v0bBinding(root, approval, { requiresHumanApproval: true }))
      })
    ]);

    const inbox = await getChiefOpsInbox({ root, now: () => '2026-07-13T00:00:00.000Z' });
    assert.deepEqual(inbox.observationErrors, []);
    assert.deepEqual(Object.fromEntries(inbox.tasks.map((task) => [task.taskId, task.lane])), {
      [approval]: 'unknown',
      [done]: 'unknown',
      [first]: 'blocked',
      [second]: 'blocked'
    });
    assert.equal(inbox.conflicts.length, 1);
  } finally {
    await removeFixture(root);
  }
});
