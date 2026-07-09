import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import {
  lifecycleAnchorDirectory,
  readLifecycleAnchorReceipts,
  summarizeLifecycleAnchorReceipts,
  validateLifecycleAnchorReceipt,
  writeLifecycleAnchorReceipt
} from '../../harness/runtime/lifecycle-anchor-receipt.mjs';

test('validateLifecycleAnchorReceipt rejects receipts without syncBackRef', () => {
  const result = validateLifecycleAnchorReceipt({
    schemaVersion: 1,
    taskId: 'task-demo',
    anchorId: 'pr-1',
    anchorType: 'pr_created',
    anchorStrength: 'moderate',
    observedAt: '2026-07-08T05:21:33.000Z',
    actor: 'codex',
    evidenceRefs: []
  });

  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /syncBackRef/);
});

test('writeLifecycleAnchorReceipt stores task-scoped anchors', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-lifecycle-anchor-'));
  try {
    const receiptPath = await writeLifecycleAnchorReceipt(root, {
      schemaVersion: 1,
      taskId: 'task-demo',
      anchorId: 'pr-1',
      anchorType: 'pr_created',
      anchorStrength: 'moderate',
      observedAt: '2026-07-08T05:21:33.000Z',
      actor: 'codex',
      subject: { branch: 'feature/demo', base: 'main', pr: 1 },
      evidenceRefs: ['https://github.com/example/repo/pull/1'],
      recommendedStatus: 'waiting_review',
      blockingConditions: [],
      syncBackRef: 'planning/active/task-demo/progress.md#session'
    });

    assert.equal(path.dirname(receiptPath), lifecycleAnchorDirectory(root, 'task-demo'));
    const roundTrip = await readLifecycleAnchorReceipts(root, 'task-demo');
    assert.equal(roundTrip.length, 1);
    assert.equal(roundTrip[0].anchorType, 'pr_created');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('summarizeLifecycleAnchorReceipts keeps weak push separate from strong merge', () => {
  const summary = summarizeLifecycleAnchorReceipts([
    { anchorType: 'branch_pushed', anchorStrength: 'weak', recommendedStatus: 'waiting_integration' },
    { anchorType: 'pr_merged', anchorStrength: 'strong', recommendedStatus: 'closed' }
  ]);

  assert.equal(summary.receiptCount, 2);
  assert.equal(summary.byType.branch_pushed, 1);
  assert.equal(summary.byType.pr_merged, 1);
  assert.equal(summary.strongAnchors, 1);
  assert.equal(summary.weakAnchors, 1);
});
