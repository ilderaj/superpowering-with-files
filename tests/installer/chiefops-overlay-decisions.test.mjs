import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideCapabilityAction } from '../../harness/runtime/chiefops-overlay/capability-decision.mjs';
import { resolveModel } from '../../harness/runtime/chiefops-overlay/model-resolver.mjs';
import { buildManualHandoffPrompt } from '../../harness/runtime/chiefops-overlay/manual-handoff.mjs';
import { gateWorkerReceipt } from '../../harness/runtime/chiefops-overlay/chief-gate.mjs';

const bindingPacket = {
  schemaVersion: 'chiefops.v0b',
  bindingId: 'bind_1',
  action: 'spawn_worker',
  authorityTaskId: 'chiefops-demo',
  planningRoot: '/repo',
  chiefThreadId: 'chief-thread',
  workerId: 'worker-1',
  threadId: null,
  currentSlice: 'manual handoff',
  proofTarget: 'manual prompt is pending only',
  evidenceSink: 'planning/active/chiefops-demo/progress.md',
  capabilityClass: 'balanced_execution',
  riskClass: 'medium',
  workType: 'coding',
  authorityMode: 'task_authority',
  allowedOps: ['inspect'],
  requiresHumanApproval: false,
  nonGoals: ['do not publish externally'],
  createdAt: '2026-07-09T05:00:00.000Z',
  bindingToken: 'btok_1',
  bindingVersion: 'binding-v1',
  sourceProgressRef: {
    file: 'planning/active/chiefops-demo/progress.md',
    blockId: 'bind_1',
    startLine: null,
    contentHash: 'sha256:abc123',
    observedAt: '2026-07-09T05:00:00.000Z'
  },
  observedAt: '2026-07-09T05:00:00.000Z'
};

test('decideCapabilityAction keeps manual spawn pending until paste-back receipt', () => {
  assert.deepEqual(
    decideCapabilityAction({
      action: 'spawn_worker',
      capabilities: { create: false },
      bindingValid: true,
      materialDrift: false,
      manualHandoffAllowed: true
    }),
    { mode: 'manual_handoff', receiptType: 'handoff_pending', canProceedAsStarted: false }
  );
});

test('decideCapabilityAction does not turn native create capability into started receipt', () => {
  assert.deepEqual(
    decideCapabilityAction({
      action: 'spawn_worker',
      capabilities: { create: true },
      bindingValid: true,
      materialDrift: false
    }),
    { mode: 'native_control_requested', receiptType: 'binding_verified', canProceedAsStarted: false, requiresWorkerReceipt: true }
  );
});

test('decideCapabilityAction recommends respawn for unavailable continue when slice still matters', () => {
  assert.equal(
    decideCapabilityAction({
      action: 'continue_worker',
      capabilities: { continue: false },
      bindingValid: true,
      materialDrift: false,
      sliceStillMatters: true,
      manualHandoffAllowed: false
    }).receiptType,
    'respawn_recommended'
  );
});

test('resolveModel fails instead of silently downgrading missing capability', () => {
  assert.throws(
    () => resolveModel({
      capabilityClass: 'frontier_reasoning',
      availableModels: [{ model: 'small', capabilityClass: 'economy_mechanical' }],
      mapping: {}
    }),
    /resolver_failed/
  );
});

test('manual handoff prompt includes binding identity and expected receipt', () => {
  const prompt = buildManualHandoffPrompt({ bindingPacket });
  assert.match(prompt, /authorityTaskId: chiefops-demo/);
  assert.match(prompt, /bindingVersion: binding-v1/);
  assert.match(prompt, /allowedOps: inspect/);
  assert.match(prompt, /nonGoals: do not publish externally/);
  assert.match(prompt, /sourceProgressRef\.file: planning\/active\/chiefops-demo\/progress\.md/);
  assert.match(prompt, /sourceProgressRef\.blockId: bind_1/);
  assert.match(prompt, /sourceProgressRef\.contentHash: sha256:abc123/);
  assert.doesNotMatch(prompt, /btok_1/);
  assert.match(prompt, /Return a ChiefOpsWorkerReceipt/);
  assert.doesNotMatch(prompt, /started.*true/);
});

test('manual handoff fails closed when no public bindingVersion is available', () => {
  assert.throws(
    () => buildManualHandoffPrompt({ bindingPacket: { ...bindingPacket, bindingVersion: undefined } }),
    /bindingVersion is required for manual handoff/
  );
});

test('chief gate rejects receipt identity mismatch', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_1',
    receiptType: 'done',
    authorityTaskId: 'chiefops-demo',
    workerId: 'worker-1',
    threadId: 'thread-1',
    sessionId: null,
    bindingToken: 'wrong',
    currentSlice: bindingPacket.currentSlice,
    proofTarget: bindingPacket.proofTarget,
    evidenceSink: bindingPacket.evidenceSink,
    capabilityClass: bindingPacket.capabilityClass,
    riskClass: bindingPacket.riskClass,
    workType: bindingPacket.workType,
    authorityMode: bindingPacket.authorityMode,
    allowedOps: bindingPacket.allowedOps,
    sourceProgressRef: bindingPacket.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Done.',
    evidenceRefs: [],
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket, receipt, approvalSatisfied: true }),
    { outcome: 'block', reason: 'binding_identity_mismatch' }
  );
});

test('chief gate rejects sourceProgressRef mismatch', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_1b',
    receiptType: 'done',
    authorityTaskId: 'chiefops-demo',
    workerId: 'worker-1',
    threadId: 'thread-1',
    sessionId: null,
    bindingVersion: bindingPacket.bindingVersion,
    currentSlice: bindingPacket.currentSlice,
    proofTarget: bindingPacket.proofTarget,
    evidenceSink: bindingPacket.evidenceSink,
    capabilityClass: bindingPacket.capabilityClass,
    riskClass: bindingPacket.riskClass,
    workType: bindingPacket.workType,
    authorityMode: bindingPacket.authorityMode,
    allowedOps: bindingPacket.allowedOps,
    sourceProgressRef: {
      ...bindingPacket.sourceProgressRef,
      contentHash: 'sha256:different'
    },
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Done.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    scopeCheck: { nonGoalsChecked: true, violations: [] },
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket, receipt, approvalSatisfied: true }),
    { outcome: 'block', reason: 'binding_identity_mismatch' }
  );
});

test('chief gate rejects done receipts without evidence', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_2',
    receiptType: 'done',
    authorityTaskId: 'chiefops-demo',
    workerId: 'worker-1',
    threadId: 'thread-1',
    sessionId: null,
    bindingVersion: bindingPacket.bindingVersion,
    currentSlice: bindingPacket.currentSlice,
    proofTarget: bindingPacket.proofTarget,
    evidenceSink: bindingPacket.evidenceSink,
    capabilityClass: bindingPacket.capabilityClass,
    riskClass: bindingPacket.riskClass,
    workType: bindingPacket.workType,
    authorityMode: bindingPacket.authorityMode,
    allowedOps: bindingPacket.allowedOps,
    sourceProgressRef: bindingPacket.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Done.',
    evidenceRefs: [],
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket, receipt, approvalSatisfied: true }),
    { outcome: 'block', reason: 'evidence_missing' }
  );
});

test('chief gate requires source evidence for source-authority done receipts', () => {
  const bindingPacketWithSourceAuthority = {
    ...bindingPacket,
    authorityMode: 'source_authority'
  };
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_2b',
    receiptType: 'done',
    authorityTaskId: 'chiefops-demo',
    workerId: 'worker-1',
    threadId: 'thread-1',
    sessionId: null,
    bindingVersion: bindingPacket.bindingVersion,
    currentSlice: bindingPacket.currentSlice,
    proofTarget: bindingPacket.proofTarget,
    evidenceSink: bindingPacket.evidenceSink,
    capabilityClass: bindingPacket.capabilityClass,
    riskClass: bindingPacket.riskClass,
    workType: bindingPacket.workType,
    authorityMode: 'source_authority',
    allowedOps: bindingPacket.allowedOps,
    sourceProgressRef: bindingPacket.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Done.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    scopeCheck: { nonGoalsChecked: true, violations: [] },
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket: bindingPacketWithSourceAuthority, receipt, approvalSatisfied: true }),
    { outcome: 'block', reason: 'source_evidence_missing' }
  );
});

test('chief gate requires explicit non-goal scope check before accepting done', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_3',
    receiptType: 'done',
    authorityTaskId: 'chiefops-demo',
    workerId: 'worker-1',
    threadId: 'thread-1',
    sessionId: null,
    bindingVersion: bindingPacket.bindingVersion,
    currentSlice: bindingPacket.currentSlice,
    proofTarget: bindingPacket.proofTarget,
    evidenceSink: bindingPacket.evidenceSink,
    capabilityClass: bindingPacket.capabilityClass,
    riskClass: bindingPacket.riskClass,
    workType: bindingPacket.workType,
    authorityMode: bindingPacket.authorityMode,
    allowedOps: bindingPacket.allowedOps,
    sourceProgressRef: bindingPacket.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Done.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket, receipt, approvalSatisfied: true }),
    { outcome: 'block', reason: 'scope_check_missing' }
  );
});

test('chief gate requires publish evidence for publish-capable done receipts', () => {
  const bindingPacketWithPublish = {
    ...bindingPacket,
    allowedOps: ['inspect', 'publish']
  };
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_3b',
    receiptType: 'done',
    authorityTaskId: 'chiefops-demo',
    workerId: 'worker-1',
    threadId: 'thread-1',
    sessionId: null,
    bindingVersion: bindingPacket.bindingVersion,
    currentSlice: bindingPacket.currentSlice,
    proofTarget: bindingPacket.proofTarget,
    evidenceSink: bindingPacket.evidenceSink,
    capabilityClass: bindingPacket.capabilityClass,
    riskClass: bindingPacket.riskClass,
    workType: bindingPacket.workType,
    authorityMode: bindingPacket.authorityMode,
    allowedOps: ['inspect', 'publish'],
    sourceProgressRef: bindingPacket.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Done.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    scopeCheck: { nonGoalsChecked: true, violations: [] },
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket: bindingPacketWithPublish, receipt, approvalSatisfied: true }),
    { outcome: 'block', reason: 'publish_evidence_missing' }
  );
});

test('chief gate reports publish_blocked when publish-capable receipt carries blockerReason', () => {
  const bindingPacketWithPublish = {
    ...bindingPacket,
    allowedOps: ['inspect', 'publish']
  };
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_3c',
    receiptType: 'done',
    authorityTaskId: 'chiefops-demo',
    workerId: 'worker-1',
    threadId: 'thread-1',
    sessionId: null,
    bindingVersion: bindingPacket.bindingVersion,
    currentSlice: bindingPacket.currentSlice,
    proofTarget: bindingPacket.proofTarget,
    evidenceSink: bindingPacket.evidenceSink,
    capabilityClass: bindingPacket.capabilityClass,
    riskClass: bindingPacket.riskClass,
    workType: bindingPacket.workType,
    authorityMode: bindingPacket.authorityMode,
    allowedOps: ['inspect', 'publish'],
    sourceProgressRef: bindingPacket.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Done.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    scopeCheck: { nonGoalsChecked: true, violations: [] },
    blockerReason: 'publish awaiting approval',
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket: bindingPacketWithPublish, receipt, approvalSatisfied: true }),
    { outcome: 'block', reason: 'publish_blocked' }
  );
});

test('chief gate blocks when required human approval is missing', () => {
  const bindingPacketRequiringApproval = {
    ...bindingPacket,
    requiresHumanApproval: true
  };
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_3d',
    receiptType: 'done',
    authorityTaskId: 'chiefops-demo',
    workerId: 'worker-1',
    threadId: 'thread-1',
    sessionId: null,
    bindingVersion: bindingPacket.bindingVersion,
    currentSlice: bindingPacket.currentSlice,
    proofTarget: bindingPacket.proofTarget,
    evidenceSink: bindingPacket.evidenceSink,
    capabilityClass: bindingPacket.capabilityClass,
    riskClass: bindingPacket.riskClass,
    workType: bindingPacket.workType,
    authorityMode: bindingPacket.authorityMode,
    allowedOps: bindingPacket.allowedOps,
    sourceProgressRef: bindingPacket.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Done.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    scopeCheck: { nonGoalsChecked: true, violations: [] },
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket: bindingPacketRequiringApproval, receipt, approvalSatisfied: false }),
    { outcome: 'block', reason: 'approval_gate_missing' }
  );
});

test('chief gate accepts public bindingVersion without requiring raw bindingToken', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_4',
    receiptType: 'done',
    authorityTaskId: 'chiefops-demo',
    workerId: 'worker-1',
    threadId: 'thread-1',
    sessionId: null,
    bindingVersion: bindingPacket.bindingVersion,
    currentSlice: bindingPacket.currentSlice,
    proofTarget: bindingPacket.proofTarget,
    evidenceSink: bindingPacket.evidenceSink,
    capabilityClass: bindingPacket.capabilityClass,
    riskClass: bindingPacket.riskClass,
    workType: bindingPacket.workType,
    authorityMode: bindingPacket.authorityMode,
    allowedOps: bindingPacket.allowedOps,
    sourceProgressRef: bindingPacket.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Done.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    scopeCheck: { nonGoalsChecked: true, violations: [] },
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket, receipt, approvalSatisfied: true }),
    { outcome: 'accept', reason: null }
  );
});
