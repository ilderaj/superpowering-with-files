import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import {
  executionReceiptDirectory,
  summarizeExecutionReceipts,
  validateExecutionReceipt,
  writeExecutionReceipt,
  readExecutionReceipts
} from '../../harness/runtime/execution-receipt.mjs';

test('validateExecutionReceipt rejects receipts without syncBackRef', () => {
  const result = validateExecutionReceipt({
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
    followups: []
  });

  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /syncBackRef/);
});

test('writeExecutionReceipt stores receipts under the task-scoped execution directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-execution-receipt-'));
  try {
    const receiptPath = await writeExecutionReceipt(root, {
      schemaVersion: 1,
      taskId: 'task-demo',
      unitId: 'unit-01',
      actor: 'codex',
      mode: 'inline',
      resultStatus: 'done_with_evidence',
      startedAt: '2026-06-04T04:00:00.000Z',
      finishedAt: '2026-06-04T04:05:00.000Z',
      changedFiles: ['harness/runtime/example.mjs'],
      verificationCommands: [
        {
          command: 'node --test tests/example.test.mjs',
          status: 'passed',
          evidenceRef: 'progress.md#unit-01'
        }
      ],
      artifactsProduced: [{ type: 'patch', ref: 'git-diff' }],
      followups: [{ type: 'integration', status: 'open', target: 'progress.md' }],
      syncBackRef: 'progress.md#unit-01'
    });

    assert.equal(path.dirname(receiptPath), executionReceiptDirectory(root, 'task-demo'));

    const roundTrip = await readExecutionReceipts(root, 'task-demo');
    assert.equal(roundTrip.length, 1);
    assert.equal(roundTrip[0].unitId, 'unit-01');
    assert.equal(roundTrip[0].syncBackRef, 'progress.md#unit-01');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('summarizeExecutionReceipts counts blocked, failed, and open follow-up units', () => {
  const summary = summarizeExecutionReceipts([
    {
      taskId: 'task-demo',
      unitId: 'unit-01',
      resultStatus: 'blocked',
      followups: [{ type: 'integration', status: 'open', target: 'progress.md' }]
    },
    {
      taskId: 'task-demo',
      unitId: 'unit-02',
      resultStatus: 'failed',
      followups: []
    }
  ]);

  assert.equal(summary.receiptCount, 2);
  assert.equal(summary.blockedUnits, 1);
  assert.equal(summary.failedUnits, 1);
  assert.equal(summary.openFollowups, 1);
});
