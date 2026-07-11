import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decideCapabilityAction } from '../../harness/runtime/chiefops-overlay/capability-decision.mjs';
import { decideWatchdogAction } from '../../harness/runtime/chiefops-overlay/watchdog-decision.mjs';
import { readLiveCodexModelInventory } from '../../harness/runtime/chiefops-overlay/model-inventory.mjs';
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

const operatingModelResolution = {
  requestedCapabilityClass: operatingModelBindingPacket.capabilityClass,
  requestedReasoningDemand: operatingModelBindingPacket.reasoningDemand,
  requestedCostPreference: operatingModelBindingPacket.costPreference,
  requestedLatencyClass: operatingModelBindingPacket.latencyClass,
  upgradeTrigger: operatingModelBindingPacket.upgradeTrigger,
  resolvedModelAtRun: 'balanced-current',
  resolvedThinkingAtRun: 'medium',
  modelResolutionReason: 'first_compatible_profile_match',
  nativeThreadControl: false
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

test('material drift requests restore and rebind before respawn', () => {
  assert.deepEqual(
    decideCapabilityAction({
      action: 'continue_worker',
      capabilities: { continue: true },
      bindingValid: true,
      materialDrift: true,
      rebindAttempted: false
    }),
    {
      mode: 'restore_rebind',
      receiptType: 'binding_mismatch',
      canProceedAsStarted: false
    }
  );
});

test('persistent context integrity failure after rebind recommends respawn', () => {
  const decision = decideCapabilityAction({
    action: 'continue_worker',
    capabilities: { continue: true },
    bindingValid: true,
    materialDrift: true,
    rebindAttempted: true,
    contextIntegrityFailure: true
  });
  assert.equal(decision.receiptType, 'handoff_pending');
  assert.equal(decision.respawnReason, 'persistent_context_failure');
});

test('direct respawn causes bypass context-drift restore', () => {
  for (const input of [
    { sessionAvailable: false, respawnReason: 'session_unavailable' },
    { safeRebindPossible: false, respawnReason: 'rebind_impossible' },
    { explicitFreshContext: true, respawnReason: 'explicit_fresh_context' },
    { trustBoundaryChanged: true, respawnReason: 'trust_boundary_change' }
  ]) {
    assert.equal(decideCapabilityAction({
      action: 'respawn_worker',
      capabilities: { create: true },
      bindingValid: true,
      contextDrift: true,
      ...input
    }).mode, 'native_control_requested');
  }
});

test('legacy respawn without a reason remains accepted while invalid reasons fail closed', () => {
  assert.equal(
    decideCapabilityAction({
      action: 'respawn_worker',
      capabilities: { create: true },
      bindingValid: true
    }).mode,
    'native_control_requested'
  );

  assert.deepEqual(
    decideCapabilityAction({
      action: 'respawn_worker',
      capabilities: { create: true },
      bindingValid: true,
      respawnReason: 'operator_typo'
    }),
    { mode: 'blocked', receiptType: 'binding_mismatch', canProceedAsStarted: false }
  );
});

test('watchdog uses one probe then grace instead of busy polling', () => {
  assert.deepEqual(decideWatchdogAction({ deadlineMissed: false }), { action: 'none' });
  assert.equal(decideWatchdogAction({ deadlineMissed: true }).action, 'probe');
  assert.equal(decideWatchdogAction({
    deadlineMissed: true,
    probeSent: true,
    graceExpired: false
  }).action, 'wait_grace');
});

test('watchdog grants at most one extension and requires a credible milestone', () => {
  const base = {
    deadlineMissed: true,
    probeSent: true,
    graceExpired: true,
    workerResponsive: true,
    sessionAvailable: true,
    bindingProbe: 'passed',
    contextProbe: 'passed'
  };

  assert.equal(decideWatchdogAction({
    ...base,
    credibleMilestone: false,
    extensionAlreadyGranted: false
  }).action, 'stale');

  assert.equal(decideWatchdogAction({
    ...base,
    credibleMilestone: true,
    extensionAlreadyGranted: false
  }).action, 'extend_deadline');

  assert.equal(decideWatchdogAction({
    ...base,
    credibleMilestone: true,
    extensionAlreadyGranted: true
  }).action, 'stale');

  assert.deepEqual(decideWatchdogAction({
    ...base,
    sessionAvailable: false,
    credibleMilestone: true,
    extensionAlreadyGranted: false
  }), { action: 'respawn_recommended', reason: 'session_unavailable' });
});

test('watchdog restores binding before respawn and respawns after a second failed probe', () => {
  assert.deepEqual(decideWatchdogAction({
    deadlineMissed: true,
    probeSent: true,
    graceExpired: true,
    sessionAvailable: true,
    bindingProbe: 'failed',
    rebindAttempted: false
  }), { action: 'restore_rebind', reason: 'integrity_probe_failed' });

  assert.deepEqual(decideWatchdogAction({
    deadlineMissed: true,
    probeSent: true,
    graceExpired: true,
    sessionAvailable: true,
    bindingProbe: 'failed',
    rebindAttempted: true
  }), { action: 'respawn_recommended', reason: 'integrity_probe_failed_after_rebind' });
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

test('resolveModel selects an exact capability and execution profile without sku rules', () => {
  assert.deepEqual(
    resolveModel({
      capabilityClass: 'balanced_execution',
      reasoningDemand: 'standard',
      costPreference: 'balanced',
      latencyClass: 'standard',
      upgradeTrigger: 'architecture ambiguity',
      availableModels: [{
        model: 'balanced-current',
        capabilityClass: 'balanced_execution',
        reasoningByDemand: { light: 'low', standard: 'medium', deep: 'high' },
        costPreferences: ['balanced'],
        latencyClasses: ['standard', 'long_running']
      }]
    }),
    {
      requestedCapabilityClass: 'balanced_execution',
      requestedReasoningDemand: 'standard',
      requestedCostPreference: 'balanced',
      requestedLatencyClass: 'standard',
      upgradeTrigger: 'architecture ambiguity',
      resolvedModelAtRun: 'balanced-current',
      resolvedThinkingAtRun: 'medium',
      modelResolutionReason: 'first_compatible_profile_match',
      nativeThreadControl: false
    }
  );
});

test('resolveModel fails if only a lower or incompatible profile exists', () => {
  assert.throws(
    () => resolveModel({
      capabilityClass: 'balanced_execution',
      reasoningDemand: 'deep',
      costPreference: 'quality_first',
      latencyClass: 'long_running',
      availableModels: [{
        model: 'balanced-cheap',
        capabilityClass: 'balanced_execution',
        reasoningByDemand: { light: 'low', standard: 'medium' },
        costPreferences: ['economy'],
        latencyClasses: ['interactive']
      }]
    }),
    /resolver_failed/
  );
});

test('readLiveCodexModelInventory derives canonical evidence only from the exact cache path', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'chiefops-model-cache-'));
  try {
    await writeFile(
      path.join(codexHome, 'models_cache.json'),
      JSON.stringify({
        models: [
          {
            slug: 'preferred-balanced',
            supported_reasoning_levels: [{ effort: 'medium' }, { effort: 'high' }],
            ignored: 'must not enter evidence'
          },
          {
            slug: 'other',
            supported_reasoning_levels: [{ effort: 'low' }]
          }
        ]
      })
    );

    const result = await readLiveCodexModelInventory({
      codexHome,
      now: new Date().toISOString()
    });

    assert.equal(result.sourceRef, 'codex.models_cache');
    assert.deepEqual(result.models, [
      { model: 'other', supportedReasoningLevels: ['low'] },
      { model: 'preferred-balanced', supportedReasoningLevels: ['high', 'medium'] }
    ]);
    assert.match(result.fingerprint, /^sha256:[a-f0-9]{64}$/);
    assert.match(result.observedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('readLiveCodexModelInventory rejects a cache symlink and stale/future catalog evidence', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'chiefops-model-cache-'));
  const target = await mkdtemp(path.join(os.tmpdir(), 'chiefops-model-cache-target-'));
  try {
    await writeFile(path.join(target, 'models_cache.json'), JSON.stringify({ models: [] }));
    await symlink(path.join(target, 'models_cache.json'), path.join(codexHome, 'models_cache.json'));

    await assert.rejects(
      () => readLiveCodexModelInventory({ codexHome, now: new Date().toISOString() }),
      /model_inventory_source_symlink/
    );
  } finally {
    await rm(codexHome, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('resolveModel requires live inventory for explicit dispatch and preserves generic resolution otherwise', () => {
  const availableModels = [{
    model: 'preferred-balanced',
    capabilityClass: 'balanced_execution',
    reasoningByDemand: { standard: 'medium' },
    costPreferences: ['balanced'],
    latencyClasses: ['standard']
  }];
  const base = {
    capabilityClass: 'balanced_execution',
    reasoningDemand: 'standard',
    costPreference: 'balanced',
    latencyClass: 'standard',
    availableModels,
    mapping: { balanced_execution: 'preferred-balanced' }
  };

  assert.equal(resolveModel(base).resolvedModelAtRun, 'preferred-balanced');
  assert.throws(
    () => resolveModel({
      ...base,
      dispatchDecision: { decidedBy: 'chief', decidedAt: '2026-07-11T00:00:00.000Z' }
    }),
    /model_inventory_required/
  );
});

test('chief gate rejects an explicit dispatch receipt that claims application', () => {
  const binding = {
    ...operatingModelBindingPacket,
    dispatchIntentVersion: 'chiefops.dispatch-intent.v1',
    dispatchDecision: {
      decidedBy: 'chief-thread',
      decidedAt: '2026-07-10T14:00:00.000Z',
      inventory: {
        sourceRef: 'codex.models_cache',
        observedAt: '2026-07-10T14:00:00.000Z',
        fingerprint: 'sha256:inventory'
      },
      preferredModel: 'balanced-current',
      preferredThinking: 'medium',
      applicationStatus: 'manual_pending'
    }
  };
  const receipt = {
    ...operatingModelBindingPacket,
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_1',
    receiptType: 'done',
    threadId: 'thread-1',
    bindingVersion: 'binding-v1',
    status: 'done',
    summary: 'done',
    evidenceRefs: ['test'],
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-10T14:11:00.000Z',
    observedAt: '2026-07-10T14:11:00.000Z',
    resolvedModelAtRun: 'balanced-current',
    resolvedThinkingAtRun: 'medium',
    modelResolutionReason: 'first_compatible_profile_match',
    applicationStatus: 'applied',
    scopeCheck: { nonGoalsChecked: true, violations: [] }
  };
  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: binding,
      receipt: { ...receipt, applicationStatus: 'manual_pending' },
      approvalSatisfied: true,
      modelResolution: { ...operatingModelResolution, applicationStatus: 'manual_pending' }
    }),
    { outcome: 'block', reason: 'trusted_authority_context_required' }
  );
  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: binding,
      receipt,
      approvalSatisfied: true,
      modelResolution: {
        ...operatingModelResolution,
        applicationStatus: 'manual_pending'
      }
    }),
    { outcome: 'block', reason: 'trusted_authority_context_required' }
  );
  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: binding,
      receipt: { ...receipt, applicationStatus: 'unverified' },
      approvalSatisfied: true,
      modelResolution: {
        ...operatingModelResolution,
        applicationStatus: 'manual_pending'
      }
    }),
    { outcome: 'block', reason: 'trusted_authority_context_required' }
  );
});

test('readLiveCodexModelInventory rejects a Codex home parent swap before open', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chiefops-model-parent-swap-'));
  const trustedHome = path.join(root, 'trusted');
  const outsideHome = path.join(root, 'outside');
  const codexHome = path.join(root, 'current');
  const fs = await import('node:fs/promises');
  try {
    await mkdir(trustedHome);
    await mkdir(outsideHome);
    await writeFile(path.join(trustedHome, 'models_cache.json'), JSON.stringify({
      models: [{ slug: 'trusted-model', supported_reasoning_levels: [{ effort: 'medium' }] }]
    }));
    await writeFile(path.join(outsideHome, 'models_cache.json'), JSON.stringify({
      models: [{ slug: 'outside-model', supported_reasoning_levels: [{ effort: 'medium' }] }]
    }));
    await symlink(trustedHome, codexHome);
    let swapped = false;
    const fsOps = {
      ...fs,
      constants: (await import('node:fs')).constants,
      async open(file, ...args) {
        if (!swapped) {
          swapped = true;
          await fs.rm(codexHome);
          await fs.symlink(outsideHome, codexHome);
        }
        return fs.open(file, ...args);
      }
    };
    await assert.rejects(
      readLiveCodexModelInventory({ codexHome, now: new Date().toISOString(), fsOps }),
      /model_inventory_source_identity_changed/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test('manual handoff prompt renders the exact model-resolution evidence', () => {
  const prompt = buildManualHandoffPrompt({
    bindingPacket: operatingModelBindingPacket,
    bindingObservation,
    modelResolution: {
      requestedCapabilityClass: 'balanced_execution',
      requestedReasoningDemand: 'standard',
      requestedCostPreference: 'balanced',
      requestedLatencyClass: 'standard',
      upgradeTrigger: 'scope change',
      resolvedModelAtRun: 'balanced-current',
      resolvedThinkingAtRun: 'medium',
      modelResolutionReason: 'first_compatible_profile_match'
    }
  });

  assert.match(prompt, /resolvedModelAtRun: balanced-current/);
  assert.match(prompt, /resolvedThinkingAtRun: medium/);
  assert.match(prompt, /modelResolutionReason: first_compatible_profile_match/);
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

test('permission admission rejects effective operations outside the verified class', () => {
  const cases = [
    {
      requestedClass: 'observe',
      allowedOps: ['inspect'],
      effectiveClass: 'observe',
      effectiveOps: ['inspect', 'write'],
      allowed: false
    },
    {
      requestedClass: 'workspace',
      allowedOps: ['inspect'],
      effectiveClass: 'workspace',
      effectiveOps: ['inspect', 'publish'],
      allowed: false
    },
    {
      requestedClass: 'workspace',
      allowedOps: ['write'],
      effectiveClass: 'workspace',
      effectiveOps: ['inspect'],
      allowed: false
    },
    {
      requestedClass: 'workspace',
      allowedOps: ['write'],
      effectiveClass: 'workspace',
      effectiveOps: ['inspect', 'write'],
      allowed: true
    }
  ];

  for (const scenario of cases) {
    assert.equal(
      assessPermissionEnforcement({
        requestedClass: scenario.requestedClass,
        allowedOps: scenario.allowedOps,
        observation: {
          status: 'verified',
          effectiveClass: scenario.effectiveClass,
          effectiveOps: scenario.effectiveOps,
          evidenceRef: 'test:permission-observation'
        }
      }).allowed,
      scenario.allowed
    );
  }
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
    resolvedModelAtRun: 'balanced-current',
    resolvedThinkingAtRun: 'medium',
    modelResolutionReason: 'first_compatible_profile_match',
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
    { outcome: 'block', reason: 'model_resolution_evidence_mismatch' }
  );
  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: operatingModelBindingPacket,
      receipt,
      approvalSatisfied: true,
      modelResolution: { ...operatingModelResolution, nativeThreadControl: undefined }
    }),
    { outcome: 'block', reason: 'model_resolution_evidence_mismatch' }
  );

  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: operatingModelBindingPacket,
      receipt,
      approvalSatisfied: true,
      modelResolution: operatingModelResolution
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
        approvalSatisfied: true,
        modelResolution: operatingModelResolution
      }),
      { outcome: 'block', reason: 'binding_identity_mismatch' }
    );
  }

  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: operatingModelBindingPacket,
      receipt: { ...receipt, receiptType: 'check_in' },
      approvalSatisfied: true,
      modelResolution: operatingModelResolution
    }),
    { outcome: 'block', reason: 'unexpected_receipt_type' }
  );

  for (const [field, value] of [['threadId', 'thread-bound'], ['sessionId', 'session-bound']]) {
    const bound = {
      ...operatingModelBindingPacket,
      threadId: field === 'threadId' ? value : null,
      sessionId: field === 'sessionId' ? value : null
    };
    const echoed = {
      ...receipt,
      threadId: bound.threadId,
      sessionId: bound.sessionId
    };
    assert.deepEqual(
      gateWorkerReceipt({ bindingPacket: bound, receipt: echoed, approvalSatisfied: true, modelResolution: operatingModelResolution }),
      { outcome: 'accept', reason: null }
    );
    assert.deepEqual(
      gateWorkerReceipt({
        bindingPacket: bound,
        receipt: { ...echoed, [field]: `${value}-wrong` },
        approvalSatisfied: true,
        modelResolution: operatingModelResolution
      }),
      { outcome: 'block', reason: 'binding_identity_mismatch' }
    );
  }
});

test('chief gate rechecks resolver evidence before accepting a strict envelope receipt', () => {
  const modelResolution = operatingModelResolution;
  const receipt = {
    schemaVersion: 'chiefops.v0b',
    receiptId: 'receipt_resolution_gate',
    receiptType: 'done',
    authorityTaskId: operatingModelBindingPacket.authorityTaskId,
    workerId: operatingModelBindingPacket.workerId,
    threadId: 'thread-resolution',
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
    resolvedModelAtRun: modelResolution.resolvedModelAtRun,
    resolvedThinkingAtRun: modelResolution.resolvedThinkingAtRun,
    modelResolutionReason: modelResolution.modelResolutionReason,
    sourceProgressRef: operatingModelBindingPacket.sourceProgressRef,
    observedAt: '2026-07-09T05:05:00.000Z',
    status: 'done',
    summary: 'Completed resolver evidence proof.',
    evidenceRefs: ['tests/installer/chiefops-overlay-decisions.test.mjs'],
    scopeCheck: { nonGoalsChecked: true, violations: [] },
    nextSuggestedAction: 'gate',
    createdAt: '2026-07-09T05:05:00.000Z'
  };

  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket: operatingModelBindingPacket, receipt, approvalSatisfied: true, modelResolution }),
    { outcome: 'accept', reason: null }
  );
  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: operatingModelBindingPacket,
      receipt,
      approvalSatisfied: true,
      modelResolution: { ...modelResolution, resolvedModelAtRun: undefined }
    }),
    { outcome: 'block', reason: 'model_resolution_evidence_mismatch' }
  );
  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: operatingModelBindingPacket,
      receipt: { ...receipt, resolvedThinkingAtRun: 'low' },
      approvalSatisfied: true,
      modelResolution
    }),
    { outcome: 'block', reason: 'model_resolution_evidence_mismatch' }
  );
  assert.deepEqual(
    gateWorkerReceipt({
      bindingPacket: operatingModelBindingPacket,
      receipt: { ...receipt, resolvedModelAtRun: undefined },
      approvalSatisfied: true,
      modelResolution
    }),
    { outcome: 'block', reason: 'model_resolution_evidence_mismatch' }
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
