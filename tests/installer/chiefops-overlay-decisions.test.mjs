import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideCapabilityAction } from '../../harness/runtime/chiefops-overlay/capability-decision.mjs';
import { resolveModel } from '../../harness/runtime/chiefops-overlay/model-resolver.mjs';
import {
  assessPermissionEnforcement,
  buildManualHandoffPrompt
} from '../../harness/runtime/chiefops-overlay/manual-handoff.mjs';
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

const bindingObservation = {
  observedAt: '2026-07-09T05:00:00.000Z',
  taskPlanHash: 'sha256:task-plan',
  findingsHash: 'sha256:findings',
  progressHash: 'sha256:progress'
};

const operatingModelBindingPacket = {
  ...bindingPacket,
  majorPhase: 'design',
  reasoningDemand: 'standard',
  costPreference: 'balanced',
  latencyClass: 'standard',
  permissionClass: 'observe',
  delegationPolicy: 'worker_discretion',
  primaryProof: 'focused proof',
  upgradeTrigger: 'scope change',
  expectedCheckInBy: '2026-07-10T14:10:00.000Z',
  stopCondition: 'return at gate',
  expectedReceipt: 'done',
  returnToChiefInstruction: 'request design gate'
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

test('decideCapabilityAction returns capability_unavailable for handoff actions when manual handoff is not allowed', () => {
  assert.deepEqual(
    decideCapabilityAction({
      action: 'handoff_worker',
      capabilities: { message: false, handoff: false },
      bindingValid: true,
      materialDrift: false,
      manualHandoffAllowed: false
    }),
    { mode: 'unsupported', receiptType: 'capability_unavailable', canProceedAsStarted: false }
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
  const prompt = buildManualHandoffPrompt({ bindingPacket, bindingObservation });
  assert.match(prompt, /authorityTaskId: chiefops-demo/);
  assert.match(prompt, /authorityRoot: \/repo/);
  assert.match(prompt, /taskPlanPath: \/repo\/planning\/active\/chiefops-demo\/task_plan\.md/);
  assert.match(prompt, /findingsPath: \/repo\/planning\/active\/chiefops-demo\/findings\.md/);
  assert.match(prompt, /progressPath: \/repo\/planning\/active\/chiefops-demo\/progress\.md/);
  assert.match(prompt, /bindingVersion: binding-v1/);
  assert.match(prompt, /capabilityClass: balanced_execution/);
  assert.match(prompt, /riskClass: medium/);
  assert.match(prompt, /workType: coding/);
  assert.match(prompt, /authorityMode: task_authority/);
  assert.match(prompt, /allowedOps: inspect/);
  assert.match(prompt, /nonGoals: do not publish externally/);
  assert.match(prompt, /sourceProgressRef\.file: planning\/active\/chiefops-demo\/progress\.md/);
  assert.match(prompt, /sourceProgressRef\.blockId: bind_1/);
  assert.match(prompt, /sourceProgressRef\.contentHash: sha256:abc123/);
  assert.match(prompt, /sourceProgressRef\.observedAt: 2026-07-09T05:00:00\.000Z/);
  assert.match(prompt, /bindingObservation\.taskPlanHash: sha256:task-plan/);
  assert.match(prompt, /bindingObservation\.findingsHash: sha256:findings/);
  assert.match(prompt, /bindingObservation\.progressHash: sha256:progress/);
  assert.match(prompt, /HARNESS_PROJECT_ROOT/);
  assert.match(prompt, /Read taskPlanPath, findingsPath, and progressPath before tracked edits/);
  assert.match(prompt, /stop and return receiptType: binding_mismatch/);
  assert.match(prompt, /Do not copy, symlink, or unignore the planning trio/);
  assert.doesNotMatch(prompt, /btok_1/);
  assert.match(prompt, /Return a ChiefOpsWorkerReceipt/);
  assert.doesNotMatch(prompt, /started.*true/);
});

test('manual handoff prompt renders the operating-model phase and permission envelope', () => {
  const prompt = buildManualHandoffPrompt({
    bindingPacket: operatingModelBindingPacket,
    bindingObservation
  });

  assert.match(prompt, /majorPhase: design/);
  assert.match(prompt, /reasoningDemand: standard/);
  assert.match(prompt, /costPreference: balanced/);
  assert.match(prompt, /latencyClass: standard/);
  assert.match(prompt, /permissionClass: observe/);
  assert.match(prompt, /delegationPolicy: worker_discretion/);
  assert.match(prompt, /expectedCheckInBy: 2026-07-10T14:10:00.000Z/);
  assert.match(prompt, /returnToChiefInstruction: request design gate/);
});

test('permission admission fails closed without verified runtime enforcement', () => {
  assert.deepEqual(
    assessPermissionEnforcement({
      requestedClass: 'workspace',
      allowedOps: ['write'],
      observation: null
    }),
    {
      allowed: false,
      receiptType: 'manual_handoff_required',
      reason: 'permission_enforcement_unverified'
    }
  );
});

test('chief gate echoes operating-model identity and expected receipt', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_operating_model_done',
    receiptType: 'done',
    authorityTaskId: operatingModelBindingPacket.authorityTaskId,
    workerId: operatingModelBindingPacket.workerId,
    threadId: 'thread-1',
    sessionId: null,
    bindingVersion: operatingModelBindingPacket.bindingVersion,
    currentSlice: operatingModelBindingPacket.currentSlice,
    proofTarget: operatingModelBindingPacket.proofTarget,
    evidenceSink: operatingModelBindingPacket.evidenceSink,
    capabilityClass: operatingModelBindingPacket.capabilityClass,
    riskClass: operatingModelBindingPacket.riskClass,
    workType: operatingModelBindingPacket.workType,
    authorityMode: operatingModelBindingPacket.authorityMode,
    allowedOps: operatingModelBindingPacket.allowedOps,
    majorPhase: operatingModelBindingPacket.majorPhase,
    reasoningDemand: operatingModelBindingPacket.reasoningDemand,
    costPreference: operatingModelBindingPacket.costPreference,
    latencyClass: operatingModelBindingPacket.latencyClass,
    permissionClass: operatingModelBindingPacket.permissionClass,
    delegationPolicy: operatingModelBindingPacket.delegationPolicy,
    sourceProgressRef: operatingModelBindingPacket.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Completed operating-model envelope proof.',
    evidenceRefs: ['tests/installer/chiefops-overlay-decisions.test.mjs'],
    scopeCheck: { nonGoalsChecked: true, violations: [] },
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: operatingModelBindingPacket,
      receipt,
      approvalSatisfied: true
    }),
    { outcome: 'accept', reason: null }
  );

  for (const field of [
    'majorPhase',
    'reasoningDemand',
    'costPreference',
    'latencyClass',
    'permissionClass',
    'delegationPolicy'
  ]) {
    assert.deepEqual(
      gateWorkerReceipt({
        bindingPacket: operatingModelBindingPacket,
        receipt: { ...receipt, [field]: undefined },
        approvalSatisfied: true
      }),
      { outcome: 'block', reason: 'binding_identity_mismatch' }
    );
  }

  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: operatingModelBindingPacket,
      receipt: { ...receipt, receiptType: 'check_in' },
      approvalSatisfied: true
    }),
    { outcome: 'block', reason: 'unexpected_receipt_type' }
  );
});

test('manual handoff fails closed when no public bindingVersion is available', () => {
  assert.throws(
    () => buildManualHandoffPrompt({ bindingPacket: { ...bindingPacket, bindingVersion: undefined }, bindingObservation }),
    /bindingVersion is required for manual handoff/
  );
});

test('manual handoff fails closed without a current trio observation', () => {
  assert.throws(
    () => buildManualHandoffPrompt({ bindingPacket }),
    /current trio bindingObservation is required for manual handoff/
  );
});

test('manual handoff rejects control characters in the final rendered authority root', () => {
  assert.throws(
    () => buildManualHandoffPrompt({
      bindingPacket: { ...bindingPacket, planningRoot: '/repo\ncanonical-injection' },
      bindingObservation
    }),
    /canonical authority root must not contain control characters/
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

test('chief gate rejects contradictory receipt binding token even when public version matches', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_1a',
    receiptType: 'done',
    authorityTaskId: 'chiefops-demo',
    workerId: 'worker-1',
    threadId: 'thread-1',
    sessionId: null,
    bindingToken: 'wrong',
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

test('chief gate rejects done receipts with contradictory blocked status', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_1c',
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
    status: 'blocked',
    summary: 'Done.',
    evidenceRefs: ['planning/active/chiefops-demo/progress.md#receipt'],
    scopeCheck: { nonGoalsChecked: true, violations: [] },
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket, receipt, approvalSatisfied: true }),
    { outcome: 'block', reason: 'receipt_status_conflict' }
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

test('chief gate blocks done receipts when task lifecycle is already terminal', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_3e',
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
    gateWorkerReceipt({ bindingPacket, receipt, approvalSatisfied: true, taskState: { status: 'archived' } }),
    { outcome: 'block', reason: 'task_lifecycle_not_active' }
  );
});

test('chief gate blocks stale receipts superseded by newer task truth', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_3f',
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
    gateWorkerReceipt({
      bindingPacket,
      receipt,
      approvalSatisfied: true,
      taskState: { status: 'active', supersededByReceiptId: 'receipt_newer' }
    }),
    { outcome: 'block', reason: 'receipt_superseded' }
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

test('chief gate treats allowedOps as an order-insensitive identity set', () => {
  const bindingPacketWithPublish = {
    ...bindingPacket,
    allowedOps: ['publish', 'inspect']
  };
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_5',
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
    publishRef: 'planning/active/chiefops-demo/progress.md#publish',
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket: bindingPacketWithPublish, receipt, approvalSatisfied: true }),
    { outcome: 'accept', reason: null }
  );
});
