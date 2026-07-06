import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeExecutionReceipt } from '../../harness/runtime/execution-receipt.mjs';
import { getChiefOpsBoard } from '../../harness/runtime/chiefops-service.mjs';

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
