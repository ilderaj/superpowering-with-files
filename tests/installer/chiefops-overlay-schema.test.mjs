import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBindingPacket,
  validateWorkerReceipt,
  makeBindingId,
  makeReceiptId
} from '../../harness/runtime/chiefops-overlay/schema.mjs';
import {
  compareSourceProgressRef,
  hashContent,
  makeSourceProgressRef
} from '../../harness/runtime/chiefops-overlay/source-progress-ref.mjs';

const baseBinding = {
  schemaVersion: 'chiefops.v0b',
  bindingId: 'bind_demo_worker_slice_20260709',
  action: 'spawn_worker',
  authorityTaskId: 'chiefops-demo',
  planningRoot: '/repo',
  chiefThreadId: 'chief-thread',
  workerId: 'worker-1',
  threadId: null,
  sessionId: null,
  currentSlice: 'schema fixtures',
  proofTarget: 'binding identity is validated',
  evidenceSink: 'planning/active/chiefops-demo/progress.md',
  capabilityClass: 'balanced_execution',
  riskClass: 'medium',
  workType: 'coding',
  authorityMode: 'task_authority',
  allowedOps: ['inspect', 'draft'],
  requiresHumanApproval: false,
  createdAt: '2026-07-09T05:00:00.000Z',
  bindingToken: 'btok_demo',
  sourceProgressRef: {
    file: 'planning/active/chiefops-demo/progress.md',
    blockId: 'chiefops-worker-binding-demo',
    startLine: null,
    contentHash: 'sha256:abc123',
    observedAt: '2026-07-09T05:00:00.000Z'
  },
  observedAt: '2026-07-09T05:00:00.000Z'
};

test('validateBindingPacket accepts the canonical minimum packet', () => {
  assert.equal(validateBindingPacket(baseBinding).bindingId, 'bind_demo_worker_slice_20260709');
});

test('validateBindingPacket requires office source authority before final truth', () => {
  assert.throws(
    () => validateBindingPacket({
      ...baseBinding,
      workType: 'office',
      authorityMode: 'source_authority',
      sourceSet: undefined,
      systemOfRecord: undefined
    }),
    /sourceSet.*systemOfRecord/
  );
});

test('validateBindingPacket requires approval and rollback for write operations', () => {
  assert.throws(
    () => validateBindingPacket({
      ...baseBinding,
      allowedOps: ['write'],
      publishTarget: 'docs/example.md',
      approvalGate: undefined,
      rollbackPlanRef: undefined
    }),
    /approvalGate.*rollbackPlanRef/
  );
});

test('validateWorkerReceipt requires binding identity echo', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_demo_done_20260709',
    receiptType: 'done',
    authorityTaskId: baseBinding.authorityTaskId,
    workerId: baseBinding.workerId,
    threadId: 'thread-1',
    sessionId: null,
    bindingToken: baseBinding.bindingToken,
    currentSlice: baseBinding.currentSlice,
    proofTarget: baseBinding.proofTarget,
    evidenceSink: baseBinding.evidenceSink,
    capabilityClass: baseBinding.capabilityClass,
    riskClass: baseBinding.riskClass,
    workType: baseBinding.workType,
    authorityMode: baseBinding.authorityMode,
    allowedOps: baseBinding.allowedOps,
    sourceProgressRef: baseBinding.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Completed fixture work.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.equal(validateWorkerReceipt(receipt).receiptType, 'done');
  assert.throws(() => validateWorkerReceipt({ ...receipt, bindingToken: undefined }), /bindingToken/);
});

test('validateWorkerReceipt accepts sessionId when threadId is unavailable', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_demo_session_20260709',
    receiptType: 'started',
    authorityTaskId: baseBinding.authorityTaskId,
    workerId: baseBinding.workerId,
    threadId: null,
    sessionId: 'session-1',
    bindingToken: baseBinding.bindingToken,
    currentSlice: baseBinding.currentSlice,
    proofTarget: baseBinding.proofTarget,
    evidenceSink: baseBinding.evidenceSink,
    capabilityClass: baseBinding.capabilityClass,
    riskClass: baseBinding.riskClass,
    workType: baseBinding.workType,
    authorityMode: baseBinding.authorityMode,
    allowedOps: baseBinding.allowedOps,
    sourceProgressRef: baseBinding.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'started',
    summary: 'Worker binding verified.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.equal(validateWorkerReceipt(receipt).sessionId, 'session-1');
});

test('validateWorkerReceipt requires evidence and office source refs for final truth', () => {
  const officeReceipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_demo_office_done_20260709',
    receiptType: 'done',
    authorityTaskId: baseBinding.authorityTaskId,
    workerId: baseBinding.workerId,
    threadId: 'thread-1',
    sessionId: null,
    bindingToken: baseBinding.bindingToken,
    currentSlice: 'office synthesis',
    proofTarget: 'source-backed memo',
    evidenceSink: baseBinding.evidenceSink,
    capabilityClass: baseBinding.capabilityClass,
    riskClass: baseBinding.riskClass,
    workType: 'office',
    authorityMode: 'source_authority',
    allowedOps: ['draft'],
    sourceProgressRef: baseBinding.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Drafted source-backed memo.',
    evidenceRefs: [],
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.throws(() => validateWorkerReceipt(officeReceipt), /evidenceRefs.*sourceRefs/);
});

test('validateWorkerReceipt requires publish evidence or blocker for write outcomes', () => {
  const writeReceipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_demo_write_done_20260709',
    receiptType: 'done',
    authorityTaskId: baseBinding.authorityTaskId,
    workerId: baseBinding.workerId,
    threadId: 'thread-1',
    sessionId: null,
    bindingToken: baseBinding.bindingToken,
    currentSlice: 'publish draft',
    proofTarget: 'write evidence is present',
    evidenceSink: baseBinding.evidenceSink,
    capabilityClass: baseBinding.capabilityClass,
    riskClass: baseBinding.riskClass,
    workType: 'office',
    authorityMode: 'source_authority',
    allowedOps: ['write'],
    sourceProgressRef: baseBinding.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Wrote draft.',
    evidenceRefs: ['docs/example.md'],
    sourceRefs: ['docs/source.md'],
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.throws(() => validateWorkerReceipt(writeReceipt), /publishRef.*blockerReason/);
});

test('id helpers are deterministic and redacted enough for durable records', () => {
  assert.equal(
    makeBindingId({ authorityTaskId: 'chiefops-demo', workerId: 'worker-1', currentSlice: 'schema fixtures', createdAt: '2026-07-09T05:00:00.000Z' }),
    'bind_chiefops-demo_worker-1_schema-fixtures_2026-07-09T05-00-00-000Z'
  );
  assert.equal(
    makeReceiptId({ authorityTaskId: 'chiefops-demo', workerId: 'worker-1', receiptType: 'done', createdAt: '2026-07-09T05:05:00.000Z' }),
    'receipt_chiefops-demo_worker-1_done_2026-07-09T05-05-00-000Z'
  );
});

test('sourceProgressRef uses content hash rather than line number as truth', () => {
  const observed = makeSourceProgressRef({
    file: 'planning/active/chiefops-demo/progress.md',
    blockId: 'binding-1',
    content: 'status: bound\nworkerId: worker-1\n',
    startLine: 20,
    observedAt: '2026-07-09T05:00:00.000Z'
  });

  assert.equal(observed.contentHash, hashContent('status: bound\nworkerId: worker-1\n'));
  assert.deepEqual(
    compareSourceProgressRef(observed, {
      file: observed.file,
      blockId: observed.blockId,
      content: 'status: bound\nworkerId: worker-1\n',
      startLine: 44
    }),
    { drifted: false, reason: null }
  );
  assert.deepEqual(
    compareSourceProgressRef(observed, {
      file: observed.file,
      blockId: observed.blockId,
      content: 'status: abandoned\nworkerId: worker-1\n',
      startLine: 44
    }),
    { drifted: true, reason: 'content_hash_mismatch' }
  );
});

test('sourceProgressRef reports missing or different blocks as material drift', () => {
  const observed = makeSourceProgressRef({
    file: 'planning/active/chiefops-demo/progress.md',
    blockId: 'binding-1',
    content: 'status: bound\n',
    startLine: null,
    observedAt: '2026-07-09T05:00:00.000Z'
  });

  assert.equal(compareSourceProgressRef(observed, null).reason, 'missing_current_block');
  assert.equal(
    compareSourceProgressRef(observed, {
      file: observed.file,
      blockId: 'binding-2',
      content: 'status: bound\n',
      startLine: null
    }).reason,
    'block_id_mismatch'
  );
});
