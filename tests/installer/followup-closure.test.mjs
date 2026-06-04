import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import {
  deriveFollowupId,
  followupClosureDirectory,
  summarizeFollowupClosures,
  validateFollowupClosure,
  writeFollowupClosure,
  readFollowupClosures
} from '../../harness/runtime/followup-closure.mjs';

test('deriveFollowupId uses unitId, type, and target', () => {
  assert.equal(
    deriveFollowupId({
      unitId: 'goal-3-receipts',
      followup: { type: 'reconciliation', target: 'progress.md' }
    }),
    'goal-3-receipts:reconciliation:progress.md'
  );
});

test('validateFollowupClosure rejects entries without evidenceRef or syncBackRef', () => {
  const result = validateFollowupClosure({
    schemaVersion: 1,
    taskId: 'task-demo',
    unitId: 'goal-3-receipts',
    followupId: 'goal-3-receipts:reconciliation:progress.md',
    closureStatus: 'resolved',
    actor: 'codex',
    mode: 'inline',
    closedAt: '2026-06-04T10:00:00.000Z',
    reason: 'task-level reconciliation now records accepted closure'
  });

  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /evidenceRef/);
  assert.match(result.reasons.join('\n'), /syncBackRef/);
});

test('writeFollowupClosure stores closure evidence under the task-scoped directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-followup-closure-'));
  try {
    const filePath = await writeFollowupClosure(root, {
      schemaVersion: 1,
      taskId: 'task-demo',
      unitId: 'goal-3-receipts',
      followupId: 'goal-3-receipts:reconciliation:progress.md',
      closureStatus: 'resolved',
      actor: 'codex',
      mode: 'inline',
      closedAt: '2026-06-04T10:00:00.000Z',
      reason: 'reconciliation.md now records the accepted closure path',
      evidenceRef: 'reconciliation.md#followup-closure',
      syncBackRef: 'progress.md#followup-closure'
    });

    assert.equal(path.dirname(filePath), followupClosureDirectory(root, 'task-demo'));

    const closures = await readFollowupClosures(root, 'task-demo');
    assert.equal(closures.length, 1);
    assert.equal(closures[0].closureStatus, 'resolved');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('summarizeFollowupClosures counts resolved and waived closure evidence separately', () => {
  const summary = summarizeFollowupClosures([
    { followupId: 'a', closureStatus: 'resolved' },
    { followupId: 'b', closureStatus: 'waived' },
    { followupId: 'c', closureStatus: 'resolved' }
  ]);

  assert.equal(summary.closureCount, 3);
  assert.equal(summary.resolvedClosures, 2);
  assert.equal(summary.waivedClosures, 1);
});
