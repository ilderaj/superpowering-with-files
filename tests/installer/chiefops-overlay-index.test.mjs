import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { serializeChiefOpsBlock, parseChiefOpsBlocks } from '../../harness/runtime/chiefops-overlay/coordination-blocks.mjs';
import { rebuildChiefOpsIndex } from '../../harness/runtime/chiefops-overlay/index-service.mjs';

function binding(overrides = {}) {
  return {
    schemaVersion: 'chiefops.v0b',
    bindingId: 'bind_1',
    action: 'spawn_worker',
    authorityTaskId: 'chiefops-demo',
    planningRoot: '/repo',
    chiefThreadId: 'chief-thread',
    workerId: 'worker-1',
    threadId: 'thread-1',
    bindingToken: 'btok_1',
    currentSlice: 'index rebuild',
    proofTarget: 'index is derived',
    evidenceSink: 'planning/active/chiefops-demo/progress.md',
    capabilityClass: 'balanced_execution',
    riskClass: 'medium',
    workType: 'coding',
    authorityMode: 'task_authority',
    allowedOps: ['inspect'],
    requiresHumanApproval: false,
    status: 'bound',
    sourceProgressRef: {
      file: 'planning/active/chiefops-demo/progress.md',
      blockId: 'bind_1',
      startLine: null,
      contentHash: 'sha256:abc123',
      observedAt: '2026-07-09T05:00:00.000Z'
    },
    observedAt: '2026-07-09T05:00:00.000Z',
    createdAt: '2026-07-09T05:00:00.000Z',
    ...overrides
  };
}

test('serializeChiefOpsBlock and parseChiefOpsBlocks round-trip canonical JSON blocks', () => {
  const block = serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding());
  assert.match(block, /```chiefops-json/);
  const parsed = parseChiefOpsBlocks(`# Progress\n\n${block}\n`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].type, 'ChiefOpsWorkerBinding');
  assert.equal(parsed[0].value.bindingId, 'bind_1');
});

test('rebuildChiefOpsIndex derives worker mapping from active trio progress only', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-overlay-index');
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'planning/active/chiefops-demo'), { recursive: true });
  await writeFile(path.join(root, 'planning/active/chiefops-demo/task_plan.md'), '# Demo\n');
  await writeFile(path.join(root, 'planning/active/chiefops-demo/findings.md'), '# Findings\n');
  await writeFile(
    path.join(root, 'planning/active/chiefops-demo/progress.md'),
    serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding({ planningRoot: root }))
  );

  const index = await rebuildChiefOpsIndex({ root, taskIds: ['chiefops-demo'] });

  assert.equal(index.generatedFrom, 'planning/active');
  assert.equal(index.workers.length, 1);
  assert.equal(index.workers[0].authorityTaskId, 'chiefops-demo');
  assert.equal(index.workers[0].workerId, 'worker-1');
  assert.equal(index.conflicts.length, 0);
});

test('rebuildChiefOpsIndex reports duplicate binding tokens instead of picking a winner', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-overlay-index-conflict');
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'planning/active/chiefops-demo'), { recursive: true });
  const first = serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding({ bindingId: 'bind_1' }));
  const second = serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding({ bindingId: 'bind_2', workerId: 'worker-2' }));
  await writeFile(path.join(root, 'planning/active/chiefops-demo/progress.md'), `${first}\n${second}`);

  const index = await rebuildChiefOpsIndex({ root, taskIds: ['chiefops-demo'] });

  assert.equal(index.conflicts.length, 1);
  assert.equal(index.conflicts[0].reason, 'duplicate_bindingToken');
});

test('rebuildChiefOpsIndex reports duplicate binding versions instead of picking a winner', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-overlay-index-binding-version');
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'planning/active/chiefops-demo'), { recursive: true });
  const first = serializeChiefOpsBlock(
    'ChiefOpsWorkerBinding',
    binding({
      bindingId: 'bind_1',
      bindingToken: 'btok_1',
      bindingVersion: 'public-1'
    })
  );
  const second = serializeChiefOpsBlock(
    'ChiefOpsWorkerBinding',
    binding({
      bindingId: 'bind_2',
      workerId: 'worker-2',
      bindingToken: 'btok_2',
      bindingVersion: 'public-1'
    })
  );
  await writeFile(path.join(root, 'planning/active/chiefops-demo/progress.md'), `${first}\n${second}`);

  const index = await rebuildChiefOpsIndex({ root, taskIds: ['chiefops-demo'] });

  assert.equal(index.conflicts.length, 1);
  assert.equal(index.conflicts[0].reason, 'duplicate_bindingVersion');
});

test('rebuildChiefOpsIndex redacts raw session handles and reports duplicate receipts across task ids', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-overlay-index-receipt');
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'planning/active/chiefops-demo-a'), { recursive: true });
  await mkdir(path.join(root, 'planning/active/chiefops-demo-b'), { recursive: true });
  const receiptA = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_1',
    receiptType: 'started',
    authorityTaskId: 'chiefops-demo-a',
    workerId: 'worker-1',
    threadId: 'thread-secret-123456',
    sessionId: null,
    bindingToken: 'btok_a',
    currentSlice: 'index rebuild',
    proofTarget: 'index is derived',
    evidenceSink: 'planning/active/chiefops-demo-a/progress.md',
    capabilityClass: 'balanced_execution',
    riskClass: 'medium',
    workType: 'coding',
    authorityMode: 'task_authority',
    allowedOps: ['inspect'],
    sourceProgressRef: {
      file: 'planning/active/chiefops-demo-a/progress.md',
      blockId: 'bind_a',
      startLine: null,
      contentHash: 'sha256:abc123',
      observedAt: '2026-07-09T05:00:00.000Z'
    },
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'started',
    summary: 'Started after binding check.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };
  const receiptB = {
    ...receiptA,
    authorityTaskId: 'chiefops-demo-b',
    workerId: 'worker-2',
    threadId: 'thread-secret-654321',
    bindingToken: 'btok_b',
    evidenceSink: 'planning/active/chiefops-demo-b/progress.md',
    sourceProgressRef: {
      file: 'planning/active/chiefops-demo-b/progress.md',
      blockId: 'bind_b',
      startLine: null,
      contentHash: 'sha256:def456',
      observedAt: '2026-07-09T05:00:00.000Z'
    }
  };
  await writeFile(
    path.join(root, 'planning/active/chiefops-demo-a/progress.md'),
    [
      serializeChiefOpsBlock(
        'ChiefOpsWorkerBinding',
        binding({
          authorityTaskId: 'chiefops-demo-a',
          bindingId: 'bind_a',
          workerId: 'worker-1',
          bindingToken: 'btok_a',
          evidenceSink: 'planning/active/chiefops-demo-a/progress.md',
          sourceProgressRef: {
            file: 'planning/active/chiefops-demo-a/progress.md',
            blockId: 'bind_a',
            startLine: null,
            contentHash: 'sha256:abc123',
            observedAt: '2026-07-09T05:00:00.000Z'
          }
        })
      ),
      serializeChiefOpsBlock('ChiefOpsWorkerReceipt', receiptA)
    ].join('\n')
  );
  await writeFile(
    path.join(root, 'planning/active/chiefops-demo-b/progress.md'),
    [
      serializeChiefOpsBlock(
        'ChiefOpsWorkerBinding',
        binding({
          authorityTaskId: 'chiefops-demo-b',
          bindingId: 'bind_b',
          workerId: 'worker-2',
          bindingToken: 'btok_b',
          evidenceSink: 'planning/active/chiefops-demo-b/progress.md',
          sourceProgressRef: {
            file: 'planning/active/chiefops-demo-b/progress.md',
            blockId: 'bind_b',
            startLine: null,
            contentHash: 'sha256:def456',
            observedAt: '2026-07-09T05:00:00.000Z'
          }
        })
      ),
      serializeChiefOpsBlock('ChiefOpsWorkerReceipt', receiptB)
    ].join('\n')
  );

  const index = await rebuildChiefOpsIndex({ root, taskIds: ['chiefops-demo-a', 'chiefops-demo-b'] });

  assert.equal(index.workers.length, 2);
  assert.equal(index.workers[0].threadRef, 'ref:123456');
  assert.equal(index.workers[0].planningRootRef, 'authority_root');
  assert.equal(JSON.stringify(index).includes('thread-secret-123456'), false);
  assert.equal(JSON.stringify(index).includes('thread-secret-654321'), false);
  assert.equal(index.conflicts.length, 1);
  assert.equal(index.conflicts[0].reason, 'duplicate_receiptId');
  assert.equal(index.conflicts[0].taskId, 'chiefops-demo-b');
});
