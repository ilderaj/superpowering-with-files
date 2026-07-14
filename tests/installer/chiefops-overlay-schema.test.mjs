import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBindingPacket,
  validateBindingInput,
  validateOperatingModelBindingPacket,
  validateWorkerReceipt,
  makeBindingId,
  makeDeltaBindingId,
  makeReceiptId
} from '../../harness/runtime/chiefops-overlay/schema.mjs';
import {
  hashChiefOpsBlock,
  parseChiefOpsBlocks
} from '../../harness/runtime/chiefops-overlay/coordination-blocks.mjs';
import {
  compareChiefOpsBlockSourceProgressRef,
  compareSourceProgressRef,
  hashContent,
  makeChiefOpsBlockSourceProgressRef,
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

test('route and dispatch cohorts are strict while legacy packets remain optional', () => {
  const routeBinding = validateBindingPacket({
    ...baseBinding,
    routeDecision: {
      taskClassification: 'tracked',
      requestedRoute: 'visible_worker',
      resolutionStatus: 'native_control_requested',
      approvedResolvedRoute: null
    }
  });
  assert.equal(routeBinding.routeDecision.requestedRoute, 'visible_worker');
  assert.throws(
    () => validateBindingPacket({
      ...baseBinding,
      routeDecision: { requestedRoute: 'visible_worker' }
    }),
    /taskClassification/
  );
  assert.throws(
    () => validateBindingPacket({
      ...baseBinding,
      routeDecision: {
        taskClassification: 'tracked',
        requestedRoute: 'visible_worker',
        resolutionStatus: 'chief_downgrade',
        approvedResolvedRoute: 'subagent'
      }
    }),
    /downgradeReason/
  );

  const dispatchDecision = {
    decidedBy: baseBinding.chiefThreadId,
    decidedAt: baseBinding.createdAt,
    inventory: {
      sourceRef: 'codex.models_cache',
      observedAt: baseBinding.createdAt,
      fingerprint: 'sha256:' + 'a'.repeat(64)
    },
    preferredModel: 'balanced-current',
    preferredThinking: 'medium',
    applicationStatus: 'manual_pending'
  };
  assert.doesNotThrow(() => validateBindingPacket({
    ...baseBinding,
    dispatchIntentVersion: 'chiefops.dispatch-intent.v1',
    dispatchDecision,
    dispatchRequest: {
      requestedModel: 'balanced-current',
      reasoningEffort: 'medium',
      speed: 'standard',
      availabilityStatus: 'manual_pending'
    }
  }));
  assert.doesNotThrow(() => validateBindingPacket({
    ...baseBinding,
    dispatchRequest: {
      requestedModel: 'gpt-5.6-luna',
      reasoningEffort: 'xhigh',
      speed: 'standard',
      availabilityStatus: 'capability_unavailable'
    }
  }));
  assert.throws(
    () => validateBindingPacket({
      ...baseBinding,
      dispatchRequest: {
        requestedModel: 'gpt-5.6-luna',
        reasoningEffort: 'xhigh',
        speed: 'fast',
        availabilityStatus: 'capability_unavailable'
      }
    }),
    /speed/
  );
});

test('dispatch outcomes keep actual application evidence null and reject legacy claims on unavailable', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_dispatch_pending',
    receiptType: 'handoff_pending',
    authorityTaskId: baseBinding.authorityTaskId,
    workerId: baseBinding.workerId,
    bindingVersion: 'binding-v1',
    currentSlice: baseBinding.currentSlice,
    proofTarget: baseBinding.proofTarget,
    evidenceSink: baseBinding.evidenceSink,
    capabilityClass: baseBinding.capabilityClass,
    riskClass: baseBinding.riskClass,
    workType: baseBinding.workType,
    authorityMode: baseBinding.authorityMode,
    allowedOps: baseBinding.allowedOps,
    sourceProgressRef: baseBinding.sourceProgressRef,
    observedAt: baseBinding.observedAt,
    status: 'pending',
    summary: 'Dispatch remains pending.',
    evidenceRefs: [],
    nextSuggestedAction: 'return to Chief',
    createdAt: baseBinding.observedAt,
    resolvedModelAtRun: 'balanced-current',
    resolvedThinkingAtRun: 'medium',
    modelResolutionReason: 'trusted_selection',
    applicationStatus: 'manual_pending',
    dispatchOutcome: {
      resolvedModel: null,
      resolvedReasoningEffort: null,
      resolvedSpeed: null,
      applicationStatus: 'manual_pending'
    }
  };
  assert.equal(validateWorkerReceipt(receipt).dispatchOutcome.applicationStatus, 'manual_pending');
  assert.throws(
    () => validateWorkerReceipt({ ...receipt, dispatchOutcome: { ...receipt.dispatchOutcome, resolvedSpeed: 'standard' } }),
    /actual resolved values null/
  );
  const unavailable = {
    ...receipt,
    receiptId: 'receipt_dispatch_unavailable',
    dispatchOutcome: {
      resolvedModel: null,
      resolvedReasoningEffort: null,
      resolvedSpeed: null,
      applicationStatus: 'capability_unavailable'
    },
    resolvedModelAtRun: undefined,
    resolvedThinkingAtRun: undefined,
    modelResolutionReason: undefined,
    applicationStatus: undefined
  };
  assert.doesNotThrow(() => validateWorkerReceipt(unavailable));
  assert.throws(
    () => validateWorkerReceipt({ ...unavailable, resolvedModelAtRun: 'forged-model' }),
    /capability_unavailable dispatch outcomes must omit/
  );
});

test('V2 delta input requires its canonical unique delta binding id', () => {
  const delta = {
    schemaVersion: 'chiefops.v2',
    kind: 'execution_delta',
    deltaBindingId: 'delta_prefix-demo_1',
    authorityTaskId: 'chiefops-demo',
    planningRoot: '/repo',
    bindingVersion: 'binding-v2',
    prefixBindingId: 'prefix-demo',
    prefixHash: 'sha256:' + 'a'.repeat(64),
    sequence: 1,
    predecessorDeltaHash: null,
    currentSlice: 'continue design',
    majorPhase: 'design',
    observedAt: '2026-07-13T00:15:00.000Z',
    createdAt: '2026-07-13T00:15:00.000Z'
  };

  assert.equal(makeDeltaBindingId({ prefixBindingId: 'prefix-demo', sequence: 1 }), delta.deltaBindingId);
  assert.deepEqual(validateBindingInput(delta), delta);
  assert.throws(
    () => validateBindingInput({ ...delta, deltaBindingId: 'delta_alias_1' }),
    /deltaBindingId/
  );
});

test('V2 stable prefix is inspectable without a caller supplied source-progress reference', () => {
  const { sourceProgressRef, bindingToken, ...stableAuthority } = baseBinding;
  const prefix = {
    ...stableAuthority,
    schemaVersion: 'chiefops.v2',
    kind: 'stable_prefix',
    prefixBindingId: 'prefix-demo',
    bindingId: 'prefix-demo',
    bindingVersion: 'binding-v2',
    majorPhase: 'design',
    expectedCheckInBy: '2026-07-13T01:00:00.000Z'
  };

  assert.deepEqual(validateBindingInput(prefix), prefix);
  assert.throws(
    () => validateBindingInput({ ...prefix, bindingId: 'other-binding' }),
    /bindingId/
  );
  assert.throws(
    () => validateBindingInput({ ...prefix, sourceProgressRef }),
    /Unrecognized key/
  );
});

test('V2 source refs retain raw fenced bytes while chain hashes stay semantic', () => {
  const firstMarkdown = [
    '```chiefops-json',
    '{"type":"ChiefOpsV2ExecutionDelta","deltaBindingId":"delta_prefix-demo_1","sequence":1}',
    '```'
  ].join('\n');
  const rewrittenMarkdown = [
    '```chiefops-json',
    '{ "sequence": 1, "deltaBindingId": "delta_prefix-demo_1", "type": "ChiefOpsV2ExecutionDelta" }',
    '```'
  ].join('\n');
  const [first] = parseChiefOpsBlocks(firstMarkdown);
  const [rewritten] = parseChiefOpsBlocks(rewrittenMarkdown);
  const ref = makeChiefOpsBlockSourceProgressRef({
    file: 'planning/active/chiefops-demo/progress.md',
    block: first,
    observedAt: '2026-07-13T00:15:00.000Z'
  });

  assert.equal(first.raw, firstMarkdown);
  assert.equal(
    hashChiefOpsBlock(first),
    hashChiefOpsBlock(rewritten)
  );
  assert.equal(ref.contentHash, hashContent(firstMarkdown));
  assert.deepEqual(
    compareChiefOpsBlockSourceProgressRef(ref, 'planning/active/chiefops-demo/progress.md', rewritten),
    { drifted: true, reason: 'content_hash_mismatch' }
  );
});

test('legacy v0b packets remain parseable while operating-model handoffs require the new envelope', () => {
  assert.equal(validateBindingPacket(baseBinding).bindingId, baseBinding.bindingId);
  assert.throws(
    () => validateOperatingModelBindingPacket(baseBinding),
    /missing operating model fields/
  );

  const operatingModelBinding = {
    ...baseBinding,
    majorPhase: 'design',
    nonGoals: ['do not publish'],
    primaryProof: 'review proof',
    reasoningDemand: 'standard',
    costPreference: 'balanced',
    latencyClass: 'standard',
    permissionClass: 'observe',
    delegationPolicy: 'worker_discretion',
    upgradeTrigger: 'scope or permission change',
    expectedCheckInBy: '2026-07-10T14:10:00.000Z',
    stopCondition: 'return at the major-phase gate',
    expectedReceipt: 'done',
    returnToChiefInstruction: 'request the design gate'
  };

  assert.equal(
    validateOperatingModelBindingPacket(operatingModelBinding).delegationPolicy,
    'worker_discretion'
  );
});

test('observe permission rejects write publish and send operations', () => {
  assert.throws(
    () => validateBindingPacket({
      ...baseBinding,
      permissionClass: 'observe',
      allowedOps: ['write'],
      publishTarget: 'docs/example.md',
      approvalGate: 'chief',
      rollbackPlanRef: 'git revert'
    }),
    /observe permission cannot authorize write, publish, or send/
  );
});

test('workspace local write does not require a publish target', () => {
  assert.doesNotThrow(() => validateOperatingModelBindingPacket({
    ...baseBinding,
    majorPhase: 'execute',
    nonGoals: ['do not publish'],
    primaryProof: 'focused tests',
    reasoningDemand: 'standard',
    costPreference: 'balanced',
    latencyClass: 'standard',
    permissionClass: 'workspace',
    delegationPolicy: 'worker_discretion',
    upgradeTrigger: 'external action required',
    expectedCheckInBy: '2026-07-10T14:10:00.000Z',
    stopCondition: 'return after focused tests',
    expectedReceipt: 'done',
    returnToChiefInstruction: 'request the execute gate',
    allowedOps: ['write'],
    approvalGate: 'chief',
    rollbackPlanRef: 'git revert HEAD'
  }));
});

test('validateBindingPacket requires an absolute authority planning root', () => {
  assert.throws(
    () => validateBindingPacket({ ...baseBinding, planningRoot: 'relative/repo' }),
    /planningRoot must be an absolute authority root/
  );
});

test('validateBindingPacket rejects control characters in the authority planning root', () => {
  assert.throws(
    () => validateBindingPacket({ ...baseBinding, planningRoot: '/repo\ninjected: instruction' }),
    /planningRoot must not contain control characters/
  );
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

test('validateBindingPacket rejects empty sourceSet for office source authority', () => {
  assert.throws(
    () => validateBindingPacket({
      ...baseBinding,
      workType: 'office',
      authorityMode: 'source_authority',
      sourceSet: [],
      systemOfRecord: 'source docs'
    }),
    /sourceSet.*systemOfRecord/
  );
});

test('validateBindingPacket accepts non-empty sourceSet for source-backed work', () => {
  const packet = validateBindingPacket({
    ...baseBinding,
    workType: 'office',
    authorityMode: 'source_authority',
    sourceSet: ['docs/source.md'],
    systemOfRecord: 'source docs'
  });

  assert.deepEqual(packet.sourceSet, ['docs/source.md']);
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
  for (const [name, extra] of [
    ['upgrade admission', { upgradeAdmission: { admissionId: 'admission_1', admissionBlockHash: 'sha256:' + '0'.repeat(64) } }],
    ['trigger code', { triggerCode: 'architecture_or_protocol_judgment' }],
    ['trigger rationale', { triggerRationale: 'A'.repeat(40) }]
  ]) {
    assert.throws(
      () => validateWorkerReceipt({ ...receipt, ...extra }),
      /unrecognized|unknown/i,
      `receipt must reject ${name}`
    );
  }
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

test('validateWorkerReceipt accepts pending manual fallback receipts without session handles', () => {
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_demo_handoff_pending_20260709',
    receiptType: 'handoff_pending',
    authorityTaskId: baseBinding.authorityTaskId,
    workerId: baseBinding.workerId,
    threadId: null,
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
    status: 'pending',
    summary: 'Manual handoff prompt produced; no worker has started.',
    evidenceRefs: [],
    nextSuggestedAction: 'paste back worker receipt after manual run',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.equal(validateWorkerReceipt(receipt).receiptType, 'handoff_pending');
});

test('validateWorkerReceipt still requires session handles for started worker outcomes', () => {
  assert.throws(
    () => validateWorkerReceipt({
      schemaVersion: 'chiefops.v0b',
      receiptId: 'receipt_demo_started_20260709',
      receiptType: 'started',
      authorityTaskId: baseBinding.authorityTaskId,
      workerId: baseBinding.workerId,
      threadId: null,
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
      status: 'started',
      summary: 'Started without a handle.',
      evidenceRefs: [],
      nextSuggestedAction: 'gate',
      createdAt: '2026-07-09T05:05:00.000Z'
    }),
    /threadId.*sessionId/
  );
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

test('validateWorkerReceipt accepts workspace-local write evidence without publish proof', () => {
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

  assert.doesNotThrow(() => validateWorkerReceipt(writeReceipt));
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
