import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { buildWritePlan } from '../../harness/runtime/write-plan.mjs';
import { createApprovalToken } from '../../harness/runtime/approval-token.mjs';
import { applyWritePlan } from '../../harness/runtime/safe-apply.mjs';

test('successful apply writes a receipt JSON payload', async (t) => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-home-'));
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;
  t.mock.method(os, 'homedir', () => tempHome);
  t.after(async () => {
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  const plan = buildWritePlan({
    operation: 'sync',
    rootDir: process.cwd(),
    payload: { args: [] },
    preview: { summary: { create: 0, update: 0, stale: 0 } }
  });
  const token = await createApprovalToken(process.cwd(), plan, { actor: 'test-runner', ttlMs: 60000 });
  const result = await applyWritePlan(plan, token);
  const receipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
  assert.equal(receipt.operation, 'sync');
  assert.equal(receipt.resultStatus, 'success');
});

test('record_execution_receipt writes both execution and audit receipts', async (t) => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-home-'));
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;
  t.mock.method(os, 'homedir', () => tempHome);
  t.after(async () => {
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  const plan = buildWritePlan({
    operation: 'record_execution_receipt',
    rootDir: process.cwd(),
    payload: {
      taskId: 'task-demo',
      receipt: {
        schemaVersion: 1,
        taskId: 'task-demo',
        unitId: 'unit-01',
        actor: 'codex',
        mode: 'inline',
        resultStatus: 'blocked',
        startedAt: '2026-06-04T04:00:00.000Z',
        finishedAt: '2026-06-04T04:05:00.000Z',
        changedFiles: [],
        verificationCommands: [],
        artifactsProduced: [],
        followups: [{ type: 'integration', status: 'open', target: 'progress.md' }],
        syncBackRef: 'progress.md#unit-01'
      }
    },
    preview: {
      taskId: 'task-demo',
      unitId: 'unit-01',
      resultStatus: 'blocked'
    }
  });

  const token = await createApprovalToken(process.cwd(), plan, { actor: 'test-runner', ttlMs: 60000 });
  const result = await applyWritePlan(plan, token);
  const auditReceipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
  const executionReceipt = JSON.parse(await readFile(result.executionReceiptPath, 'utf8'));

  assert.equal(auditReceipt.operation, 'record_execution_receipt');
  assert.equal(auditReceipt.resultStatus, 'success');
  assert.equal(executionReceipt.taskId, 'task-demo');
  assert.equal(executionReceipt.unitId, 'unit-01');
  assert.equal(executionReceipt.resultStatus, 'blocked');
  assert.equal(executionReceipt.syncBackRef, 'progress.md#unit-01');
});

test('record_followup_closure writes closure evidence and an audit receipt', async (t) => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-home-'));
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;
  t.mock.method(os, 'homedir', () => tempHome);
  t.after(async () => {
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  const plan = buildWritePlan({
    operation: 'record_followup_closure',
    rootDir: process.cwd(),
    payload: {
      taskId: 'task-demo',
      closure: {
        schemaVersion: 1,
        taskId: 'task-demo',
        unitId: 'goal-3-receipts',
        followupId: 'goal-3-receipts:reconciliation:progress.md',
        closureStatus: 'resolved',
        actor: 'pending-approval-token',
        mode: 'inline',
        closedAt: '2026-06-04T10:00:00.000Z',
        reason: 'reconciliation.md now records the accepted closure path',
        evidenceRef: 'reconciliation.md#followup-closure',
        syncBackRef: 'progress.md#followup-closure'
      }
    },
    preview: {
      taskId: 'task-demo',
      followupId: 'goal-3-receipts:reconciliation:progress.md',
      closureStatus: 'resolved'
    }
  });

  const token = await createApprovalToken(process.cwd(), plan, { actor: 'test-runner', ttlMs: 60000 });
  const result = await applyWritePlan(plan, token);
  const auditReceipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
  const closureReceipt = JSON.parse(await readFile(result.followupClosurePath, 'utf8'));

  assert.equal(auditReceipt.operation, 'record_followup_closure');
  assert.equal(auditReceipt.resultStatus, 'success');
  assert.equal(closureReceipt.taskId, 'task-demo');
  assert.equal(closureReceipt.followupId, 'goal-3-receipts:reconciliation:progress.md');
  assert.equal(closureReceipt.closureStatus, 'resolved');
  assert.equal(closureReceipt.syncBackRef, 'progress.md#followup-closure');
});
