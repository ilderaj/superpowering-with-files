import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveAuthorityBinding } from '../../harness/runtime/chiefops-overlay/authority-binding.mjs';
import { hashChiefOpsBlock, serializeChiefOpsBlock } from '../../harness/runtime/chiefops-overlay/coordination-blocks.mjs';
import { buildHandoffFromFile, readDetailedPlanEligibility, readVerifiedUpgradeAdmission, resolveAuthorityAwareModel, verifyTrustedDispatchContext } from '../../harness/runtime/chiefops-overlay/overlay-service.mjs';
import { readLiveCodexModelInventory } from '../../harness/runtime/chiefops-overlay/model-inventory.mjs';
import { gateWorkerReceipt, gateWorkerReceiptWithAuthority } from '../../harness/runtime/chiefops-overlay/chief-gate.mjs';

async function task(root, taskId, title = taskId, extraProgress = '') {
  const dir = path.join(root, 'planning/active', taskId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'task_plan.md'), `# ${title}\n\n## Current State\nStatus: active\n`);
  await writeFile(path.join(dir, 'findings.md'), '# Findings\n');
  await writeFile(path.join(dir, 'progress.md'), `# Progress\n${extraProgress}`);
}

function detailedPlanEligibilityFixture(overrides = {}) {
  return {
    eligibilityId: 'eligibility_1',
    authorityTaskId: 'chiefops-demo',
    bindingId: 'bind_1',
    approvedPlanPath: 'docs/superpowers/plans/approved-plan.md',
    approvedPlanHash: 'sha256:pending',
    checkedAt: '2026-07-11T00:00:00.000Z',
    expiresAt: '2026-07-11T01:00:00.000Z',
    status: 'eligible',
    actor: 'chief-thread',
    checklist: {
      codeSteps: true,
      interfacesAndScope: true,
      validationCommands: true,
      rollback: true,
      stopConditions: true
    },
    upgradeSignals: [],
    ...overrides
  };
}

function detailedPlanEligibilityBinding(eligibility, overrides = {}) {
  return {
    authorityTaskId: 'chiefops-demo',
    bindingId: 'bind_1',
    chiefThreadId: 'chief-thread',
    capabilityClass: 'economy_mechanical',
    detailedPlanEligibility: {
      eligibilityId: eligibility.eligibilityId,
      eligibilityBlockHash: hashChiefOpsBlock({
        type: 'ChiefOpsDetailedPlanEligibility',
        value: eligibility
      })
    },
    ...overrides
  };
}

test('detailed plan eligibility accepts only a bound Chief attestation over held approved-plan bytes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chiefops-plan-eligibility-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await task(root, 'chiefops-demo');
  const planPath = path.join(root, 'docs/superpowers/plans/approved-plan.md');
  await mkdir(path.dirname(planPath), { recursive: true });
  await writeFile(planPath, '# Approved plan\n\n- bounded\n');
  const { createHash } = await import('node:crypto');
  const eligibility = detailedPlanEligibilityFixture({
    approvedPlanHash: 'sha256:' + createHash('sha256').update('# Approved plan\n\n- bounded\n').digest('hex')
  });
  await writeFile(
    path.join(root, 'planning/active/chiefops-demo/findings.md'),
    '# Findings\n\n' + serializeChiefOpsBlock('ChiefOpsDetailedPlanEligibility', eligibility) + '\n'
  );

  const verified = await readDetailedPlanEligibility({
    root,
    bindingPacket: detailedPlanEligibilityBinding(eligibility),
    now: '2026-07-11T00:30:00.000Z'
  });
  assert.equal(verified.eligibilityId, eligibility.eligibilityId);
  assert.equal(verified.approvedPlanHash, eligibility.approvedPlanHash);
});

test('authority-aware economy selection rereads held eligibility before Luna and otherwise falls back to Terra', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chiefops-authority-economy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const codexHome = path.join(root, '.codex');
  await mkdir(codexHome, { recursive: true });
  await writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({
    models: [
      { slug: 'economy-current', supported_reasoning_levels: [{ effort: 'high' }] },
      { slug: 'balanced-current', supported_reasoning_levels: [{ effort: 'high' }] }
    ]
  }));
  const now = new Date().toISOString();
  const inventory = await readLiveCodexModelInventory({ codexHome, now });
  await task(root, 'chiefops-demo');
  const planText = '# Approved plan\n\n- bounded\n';
  const planPath = path.join(root, 'docs/superpowers/plans/approved-plan.md');
  await mkdir(path.dirname(planPath), { recursive: true });
  await writeFile(planPath, planText);
  const { createHash } = await import('node:crypto');
  const eligibility = detailedPlanEligibilityFixture({
    checkedAt: now,
    expiresAt: new Date(Date.parse(now) + 3600000).toISOString(),
    approvedPlanHash: 'sha256:' + createHash('sha256').update(planText).digest('hex')
  });
  const binding = {
    schemaVersion: 'chiefops.v0b', bindingId: 'bind_1', action: 'spawn_worker', authorityTaskId: 'chiefops-demo',
    planningRoot: root, chiefThreadId: 'chief-thread', workerId: 'worker-1', threadId: null, currentSlice: 'bounded economy slice',
    proofTarget: 'authority-aware model proof', evidenceSink: 'planning/active/chiefops-demo/progress.md', capabilityClass: 'economy_mechanical',
    riskClass: 'low', majorPhase: 'execute', primaryProof: 'focused tests', reasoningDemand: 'deep', costPreference: 'economy',
    latencyClass: 'standard', permissionClass: 'observe', delegationPolicy: 'prohibited', dispatchIntentVersion: 'chiefops.dispatch-intent.v1',
    dispatchDecision: { decidedBy: 'chief-thread', decidedAt: now, inventory, preferredModel: 'economy-current', preferredThinking: 'high', applicationStatus: 'manual_pending' },
    detailedPlanEligibility: detailedPlanEligibilityBinding(eligibility).detailedPlanEligibility,
    workType: 'coding', authorityMode: 'task_authority', allowedOps: ['inspect'], requiresHumanApproval: false, createdAt: now, bindingVersion: 'binding-v1',
    sourceProgressRef: { file: 'planning/active/chiefops-demo/progress.md', blockId: 'bind_1', startLine: null, contentHash: 'sha256:abc123', observedAt: now },
    observedAt: now, nonGoals: ['no native application claim'], expectedCheckInBy: new Date(Date.parse(now) + 600000).toISOString(),
    stopCondition: 'return to Chief', expectedReceipt: 'done', returnToChiefInstruction: 'return only to Chief'
  };
  await writeFile(path.join(root, 'planning/active/chiefops-demo/progress.md'), '# Progress\n\n' + serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding) + '\n');
  await writeFile(path.join(root, 'planning/active/chiefops-demo/findings.md'), '# Findings\n\n' + serializeChiefOpsBlock('ChiefOpsDetailedPlanEligibility', eligibility) + '\n');
  const modelRequest = {
    availableModels: [
      { model: 'economy-current', capabilityClass: 'economy_mechanical', reasoningByDemand: { deep: 'high' }, costPreferences: ['economy'], latencyClasses: ['standard'] },
      { model: 'balanced-current', capabilityClass: 'balanced_execution', reasoningByDemand: { deep: 'high' }, costPreferences: ['balanced'], latencyClasses: ['standard'] }
    ],
    mapping: { economy_mechanical: 'economy-current', balanced_execution: 'balanced-current' }
  };
  const verified = await resolveAuthorityAwareModel({ root, bindingPacket: binding, modelRequest, codexHome, now });
  assert.equal(verified.resolvedModelAtRun, 'economy-current');
  assert.equal(verified.resolvedThinkingAtRun, 'high');
  assert.equal(verified.applicationStatus, 'manual_pending');
  const strippedDispatchBinding = { ...binding };
  delete strippedDispatchBinding.dispatchIntentVersion;
  delete strippedDispatchBinding.dispatchDecision;
  delete strippedDispatchBinding.detailedPlanEligibility;
  const strippedDispatchReceipt = {
    ...strippedDispatchBinding,
    receiptId: 'receipt_1', receiptType: 'done', threadId: 'thread-1', status: 'done', summary: 'done',
    evidenceRefs: ['focused-tests'], nextSuggestedAction: 'gate', createdAt: now, scopeCheck: { nonGoalsChecked: true, violations: [] },
    resolvedModelAtRun: verified.resolvedModelAtRun, resolvedThinkingAtRun: verified.resolvedThinkingAtRun,
    modelResolutionReason: verified.modelResolutionReason, applicationStatus: 'manual_pending'
  };
  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket: strippedDispatchBinding, receipt: strippedDispatchReceipt, approvalSatisfied: true, modelResolution: verified }),
    { outcome: 'block', reason: 'trusted_authority_context_required' },
    'synchronous gate cannot accept a caller-downgraded explicit economy binding'
  );
  assert.deepEqual(
    await gateWorkerReceiptWithAuthority({ root, codexHome, now, bindingPacket: strippedDispatchBinding, receipt: strippedDispatchReceipt, approvalSatisfied: true, modelResolution: verified }),
    { outcome: 'block', reason: 'trusted_dispatch_context_mismatch' },
    'authority gate rereads and rejects a caller-downgraded explicit economy binding'
  );

  await writeFile(path.join(root, 'planning/active/chiefops-demo/findings.md'), '# Findings\n');
  const omittedEligibility = { ...binding };
  delete omittedEligibility.detailedPlanEligibility;
  await assert.rejects(
    () => verifyTrustedDispatchContext({ root, bindingPacket: omittedEligibility, modelResolution: verified, codexHome, now }),
    /detailed_plan_eligibility_invalid/,
    'an untrusted packet cannot omit the authoritative economy eligibility reread'
  );
  const fallback = await resolveAuthorityAwareModel({ root, bindingPacket: binding, modelRequest, codexHome, now });
  assert.equal(fallback.resolvedModelAtRun, 'balanced-current');
  assert.equal(fallback.resolvedThinkingAtRun, 'high');
  assert.equal(fallback.applicationStatus, 'unverified');
});

test('resolveAuthorityBinding fails closed when multiple active tasks exist without explicit authority', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-authority-multi');
  await rm(root, { recursive: true, force: true });
  await task(root, 'one');
  await task(root, 'two');

  await assert.rejects(
    resolveAuthorityBinding({ root, activeTaskIds: ['one', 'two'] }),
    /multiple active tasks.*explicit authority/i
  );
});

test('resolveAuthorityBinding verifies trio files before returning authority', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-authority-ok');
  await rm(root, { recursive: true, force: true });
  await task(
    root,
    'chiefops-demo',
    'ChiefOps Demo',
    [
      'currentSlice: ChiefOps V0b overlay',
      'proofTarget: thread control overlay proof',
      'evidenceSink: planning/active/chiefops-demo/progress.md'
    ].join('\n')
  );

  const result = await resolveAuthorityBinding({
    root,
    authorityTaskId: 'chiefops-demo',
    planningRoot: root,
    activeTaskIds: ['chiefops-demo'],
    bindingPacket: {
      authorityTaskId: 'chiefops-demo',
      currentSlice: 'ChiefOps V0b overlay',
      proofTarget: 'thread control overlay proof',
      evidenceSink: 'planning/active/chiefops-demo/progress.md'
    }
  });

  assert.equal(result.authorityTaskId, 'chiefops-demo');
  assert.equal(result.status, 'verified_bound');
});

test('resolveAuthorityBinding rejects missing trio files', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-authority-missing');
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'planning/active/chiefops-demo'), { recursive: true });
  await writeFile(path.join(root, 'planning/active/chiefops-demo/task_plan.md'), '# Demo\n');

  await assert.rejects(
    resolveAuthorityBinding({
      root,
      authorityTaskId: 'chiefops-demo',
      planningRoot: root,
      activeTaskIds: ['chiefops-demo']
    }),
    /missing authoritative trio files/
  );
});

test('resolveAuthorityBinding rejects path traversal task ids before leaving planning/active', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-authority-traversal');
  await rm(root, { recursive: true, force: true });
  await task(
    root,
    'escape',
    'Escape',
    [
      'currentSlice: ChiefOps V0b overlay',
      'proofTarget: thread control overlay proof',
      'evidenceSink: planning/active/escape/progress.md'
    ].join('\n')
  );

  await assert.rejects(
    resolveAuthorityBinding({
      root,
      authorityTaskId: '../escape',
      planningRoot: root
    }),
    /invalid authorityTaskId .*safe task slug/i
  );
});

test('resolveAuthorityBinding rejects explicit but wrong trio binding', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-authority-wrong-trio');
  await rm(root, { recursive: true, force: true });
  await task(
    root,
    'billing-release',
    'Billing Release',
    [
      'currentSlice: billing release slice',
      'proofTarget: billing release proof',
      'evidenceSink: planning/active/billing-release/progress.md'
    ].join('\n')
  );

  await assert.rejects(
    resolveAuthorityBinding({
      root,
      authorityTaskId: 'billing-release',
      planningRoot: root,
      activeTaskIds: ['billing-release'],
      bindingPacket: {
        authorityTaskId: 'billing-release',
        currentSlice: 'ChiefOps V0b overlay',
        proofTarget: 'thread control overlay proof',
        evidenceSink: 'planning/active/chiefops-v0b/progress.md'
      }
    }),
    /binding does not match authoritative trio surface/
  );
});

test('readVerifiedUpgradeAdmission accepts one fresh findings admission matching binding identity', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-admission');
  const taskId = 'chiefops-demo';
  await rm(root, { recursive: true, force: true });
  await task(root, taskId);
  const binding = {
    authorityTaskId: taskId,
    bindingId: 'bind_1',
    chiefThreadId: 'chief-thread',
    capabilityClass: 'frontier_reasoning',
    reasoningDemand: 'deep',
    riskClass: 'high',
    costPreference: 'quality_first',
    upgradeAdmission: { admissionId: 'admission_1', admissionBlockHash: 'sha256:pending' }
  };
  const admission = {
    admissionId: 'admission_1',
    authorityTaskId: taskId,
    bindingId: 'bind_1',
    triggerCode: 'architecture_or_protocol_judgment',
    triggerObservedAt: '2026-07-11T00:00:00.000Z',
    triggerRationale: 'The packet has an unresolved protocol ambiguity that needs deep frontier judgment.',
    status: 'satisfied',
    actor: 'chief-thread',
    approvedAt: '2026-07-11T00:00:00.000Z',
    expiresAt: '2026-07-11T01:00:00.000Z',
    profile: {
      capabilityClass: 'frontier_reasoning',
      reasoningDemand: 'deep',
      riskClass: 'high',
      costPreference: 'quality_first'
    }
  };
  const { hashChiefOpsBlock } = await import('../../harness/runtime/chiefops-overlay/coordination-blocks.mjs');
  binding.upgradeAdmission.admissionBlockHash = hashChiefOpsBlock({
    type: 'ChiefOpsModelUpgradeAdmission',
    value: admission
  });
  await writeFile(
    path.join(root, 'planning/active', taskId, 'findings.md'),
    '# Findings\n\n' + serializeChiefOpsBlock('ChiefOpsModelUpgradeAdmission', admission) + '\n'
  );

  const verified = await readVerifiedUpgradeAdmission({
    root,
    bindingPacket: binding,
    now: '2026-07-11T00:30:00.000Z'
  });
  assert.equal(verified.admissionId, 'admission_1');
});

function admissionFixture(overrides = {}) {
  return {
    admissionId: 'admission_1',
    authorityTaskId: 'chiefops-demo',
    bindingId: 'bind_1',
    triggerCode: 'architecture_or_protocol_judgment',
    triggerObservedAt: '2026-07-11T00:00:00.000Z',
    triggerRationale: 'A'.repeat(40),
    status: 'satisfied',
    actor: 'chief-thread',
    approvedAt: '2026-07-11T00:00:00.000Z',
    expiresAt: '2026-07-12T00:00:00.000Z',
    profile: {
      capabilityClass: 'frontier_reasoning',
      reasoningDemand: 'deep',
      riskClass: 'high',
      costPreference: 'quality_first'
    },
    ...overrides
  };
}

function admissionBinding(admission, overrides = {}) {
  return {
    authorityTaskId: 'chiefops-demo',
    bindingId: 'bind_1',
    chiefThreadId: 'chief-thread',
    capabilityClass: 'frontier_reasoning',
    reasoningDemand: 'deep',
    riskClass: 'high',
    costPreference: 'quality_first',
    upgradeAdmission: {
      admissionId: admission.admissionId,
      admissionBlockHash: hashChiefOpsBlock({ type: 'ChiefOpsModelUpgradeAdmission', value: admission })
    },
    ...overrides
  };
}

async function writeAdmissionFixture(root, blocks) {
  await rm(root, { recursive: true, force: true });
  await task(root, 'chiefops-demo');
  await writeFile(
    path.join(root, 'planning/active/chiefops-demo/findings.md'),
    '# Findings\n\n' + blocks.map((block) => serializeChiefOpsBlock('ChiefOpsModelUpgradeAdmission', block)).join('\n\n') + '\n'
  );
}

test('frontier admission accepts every declared trigger and exact temporal boundary', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-admission-matrix-valid');
  const triggerCodes = [
    'architecture_or_protocol_judgment',
    'security_data_loss_or_rollback_judgment',
    'conflicting_interpretations_or_missing_context',
    'balanced_model_blocked_after_bounded_attempt',
    'high_risk_release_or_compliance_review'
  ];
  const cases = [
    ...triggerCodes.map((triggerCode) => ({ name: `trigger ${triggerCode}`, triggerCode })),
    { name: 'rationale 500', triggerRationale: 'A'.repeat(500) },
    { name: 'observed equals approved', triggerObservedAt: '2026-07-11T00:00:00.000Z' },
    { name: 'observation age exactly 24h', triggerObservedAt: '2026-07-10T00:00:00.000Z' },
    { name: 'approval exactly 60s future', approvedAt: '2026-07-11T00:01:00.000Z', expiresAt: '2026-07-12T00:01:00.000Z' },
    { name: 'ttl exactly 24h', expiresAt: '2026-07-12T00:00:00.000Z' }
  ];

  for (const { name, ...overrides } of cases) {
    const admission = admissionFixture(overrides);
    await writeAdmissionFixture(root, [admission]);
    const verified = await readVerifiedUpgradeAdmission({
      root,
      bindingPacket: admissionBinding(admission),
      now: '2026-07-11T00:00:00.000Z'
    });
    assert.equal(verified.admissionId, admission.admissionId, name);
  }
});

test('frontier admission rejects the complete closed-schema and provenance matrix', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-admission-matrix-invalid');
  const invalidCases = [
    ['unknown trigger', { triggerCode: 'unknown_trigger' }],
    ['free-form trigger', { triggerCode: 'because this seems important' }],
    ['legacy trigger', { trigger: 'architecture ambiguity' }],
    ['legacy evidenceRefs', { evidenceRefs: ['proof.md'] }],
    ['undeclared field', { externalRelevance: true }],
    ['rationale 39', { triggerRationale: 'A'.repeat(39) }],
    ['rationale 501', { triggerRationale: 'A'.repeat(501) }],
    ['rationale whitespace', { triggerRationale: ` ${'A'.repeat(40)}` }],
    ['rationale non-NFKC', { triggerRationale: '\u212b'.repeat(40) }],
    ['malformed RFC3339 date', { triggerObservedAt: '2026-07-11T00:00:60.000Z' }],
    ['non-UTC timestamp', { triggerObservedAt: '2026-07-11T00:00:00+00:00' }],
    ['observed after approved', { triggerObservedAt: '2026-07-11T00:00:00.001Z' }],
    ['observation older than 24h', { triggerObservedAt: '2026-07-09T23:59:59.999Z' }],
    ['approval more than 60s future', { approvedAt: '2026-07-11T00:01:00.001Z', expiresAt: '2026-07-12T00:00:00.000Z' }],
    ['expiry not after now', { expiresAt: '2026-07-11T00:00:00.000Z' }],
    ['ttl more than 24h', { expiresAt: '2026-07-12T00:00:00.001Z' }],
    ['actor mismatch', { actor: 'other-chief' }],
    ['status mismatch', { status: 'pending' }],
    ['profile mismatch', { profile: { ...admissionFixture().profile, reasoningDemand: 'standard' } }],
    ['binding mismatch', { bindingId: 'bind_other' }],
    ['authority task mismatch', { authorityTaskId: 'other-task' }],
    ['block self hash', { admissionBlockHash: 'sha256:' + '0'.repeat(64) }]
  ];

  for (const [name, overrides] of invalidCases) {
    const admission = admissionFixture(overrides);
    await writeAdmissionFixture(root, [admission]);
    await assert.rejects(
      readVerifiedUpgradeAdmission({
        root,
        bindingPacket: admissionBinding(admission),
        now: '2026-07-11T00:00:00.000Z'
      }),
      /dispatch_admission_invalid/,
      name
    );
  }

  const valid = admissionFixture();
  const unrelated = admissionFixture({ admissionId: 'admission_other' });
  const structuralCases = [
    ['missing block', []],
    ['duplicate block', [valid, valid]],
    ['unrelated block', [valid, unrelated]]
  ];
  for (const [name, blocks] of structuralCases) {
    await writeAdmissionFixture(root, blocks);
    await assert.rejects(
      readVerifiedUpgradeAdmission({ root, bindingPacket: admissionBinding(valid), now: '2026-07-11T00:00:00.000Z' }),
      /dispatch_admission_invalid/,
      name
    );
  }

  await writeAdmissionFixture(root, [valid]);
  for (const [name, wrapper] of [
    ['admission id mismatch', { admissionId: 'admission_other', admissionBlockHash: admissionBinding(valid).upgradeAdmission.admissionBlockHash }],
    ['hash mismatch', { admissionId: valid.admissionId, admissionBlockHash: 'sha256:' + '0'.repeat(64) }],
    ['whole-file hash', { admissionId: valid.admissionId, admissionBlockHash: 'sha256:' + '1'.repeat(64) }]
  ]) {
    await assert.rejects(
      readVerifiedUpgradeAdmission({ root, bindingPacket: { ...admissionBinding(valid), upgradeAdmission: wrapper }, now: '2026-07-11T00:00:00.000Z' }),
      /dispatch_admission_invalid/,
      name
    );
  }
});

test('trusted dispatch context rereads the catalog and rejects caller-fabricated evidence', async () => {
  const root = path.join(process.cwd(), 'tests/installer/.artifacts/chiefops-trusted-dispatch');
  const codexHome = path.join(root, '.codex');
  await rm(root, { recursive: true, force: true });
  await mkdir(codexHome, { recursive: true });
  await writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({
    models: [
      { slug: 'balanced-current', supported_reasoning_levels: [{ effort: 'medium' }, { effort: 'high' }] },
      { slug: 'balanced-substitute', supported_reasoning_levels: [{ effort: 'medium' }] }
    ]
  }));
  const now = new Date().toISOString();
  const inventory = await readLiveCodexModelInventory({ codexHome, now });
  const bindingPacket = {
    authorityTaskId: 'chiefops-demo', bindingId: 'bind_1', chiefThreadId: 'chief-thread',
    capabilityClass: 'balanced_execution', reasoningDemand: 'standard', riskClass: 'medium', costPreference: 'balanced',
    dispatchIntentVersion: 'chiefops.dispatch-intent.v1',
    dispatchDecision: { inventory, preferredModel: 'balanced-current', preferredThinking: 'medium', applicationStatus: 'manual_pending' }
  };
  const resolution = {
    resolvedModelAtRun: 'balanced-current', resolvedThinkingAtRun: 'medium',
    inventorySourceRef: inventory.sourceRef, inventoryObservedAt: inventory.observedAt, inventoryFingerprint: inventory.fingerprint
  };
  await verifyTrustedDispatchContext({ root, bindingPacket, modelResolution: resolution, codexHome, now });
  await assert.rejects(
    () => verifyTrustedDispatchContext({ root, bindingPacket: { ...bindingPacket, dispatchDecision: { ...bindingPacket.dispatchDecision, inventory: { ...inventory, fingerprint: 'sha256:' + '0'.repeat(64) } } }, modelResolution: resolution, codexHome, now }),
    /trusted_dispatch_context_mismatch/
  );
  await assert.rejects(
    () => verifyTrustedDispatchContext({ root, bindingPacket, modelResolution: { ...resolution, resolvedModelAtRun: 'balanced-substitute' }, codexHome, now }),
    /trusted_dispatch_context_mismatch/
  );
  await assert.rejects(
    () => verifyTrustedDispatchContext({ root, bindingPacket, modelResolution: { ...resolution, resolvedThinkingAtRun: 'high' }, codexHome, now }),
    /trusted_dispatch_context_mismatch/
  );
  await writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({
    models: [{ slug: 'balanced-current', supported_reasoning_levels: [{ effort: 'medium' }] }]
  }));
  await assert.rejects(
    () => verifyTrustedDispatchContext({ root, bindingPacket, modelResolution: resolution, codexHome, now }),
    /trusted_dispatch_context_mismatch/
  );
});

test('Chief receipt gate rereads findings after handoff and rejects mutated replaced or removed admission', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chiefops-admission-reread-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const codexHome = path.join(root, '.codex');
  await rm(root, { recursive: true, force: true });
  await mkdir(codexHome, { recursive: true });
  await writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({
    models: [
      { slug: 'frontier-current', supported_reasoning_levels: [{ effort: 'high' }, { effort: 'max' }] },
      { slug: 'frontier-substitute', supported_reasoning_levels: [{ effort: 'high' }] }
    ]
  }));
  const now = new Date().toISOString();
  const inventory = await readLiveCodexModelInventory({ codexHome, now });
  const admission = admissionFixture({
    triggerObservedAt: now,
    approvedAt: now,
    expiresAt: new Date(Date.parse(now) + 3600000).toISOString()
  });
  const binding = {
    schemaVersion: 'chiefops.v0b', bindingId: 'bind_1', action: 'spawn_worker', authorityTaskId: 'chiefops-demo',
    planningRoot: root, chiefThreadId: 'chief-thread', workerId: 'worker-1', threadId: null, currentSlice: 'frontier slice',
    proofTarget: 'frontier proof', evidenceSink: 'planning/active/chiefops-demo/progress.md', capabilityClass: 'frontier_reasoning',
    riskClass: 'high', majorPhase: 'execute', primaryProof: 'focused tests', reasoningDemand: 'deep', costPreference: 'quality_first',
    latencyClass: 'long_running', permissionClass: 'observe', delegationPolicy: 'prohibited', dispatchIntentVersion: 'chiefops.dispatch-intent.v1',
    dispatchDecision: { decidedBy: 'chief-thread', decidedAt: now, inventory, preferredModel: 'frontier-current', preferredThinking: 'high', applicationStatus: 'manual_pending' },
    upgradeAdmission: admissionBinding(admission).upgradeAdmission, workType: 'coding', authorityMode: 'task_authority', allowedOps: ['inspect'],
    requiresHumanApproval: false, createdAt: now, bindingVersion: 'binding-v1',
    sourceProgressRef: { file: 'planning/active/chiefops-demo/progress.md', blockId: 'bind_1', startLine: null, contentHash: 'sha256:abc123', observedAt: now },
    observedAt: now, nonGoals: ['no native application claim'], upgradeTrigger: 'admission_1', expectedCheckInBy: new Date(Date.parse(now) + 600000).toISOString(),
    stopCondition: 'return to Chief', expectedReceipt: 'done', returnToChiefInstruction: 'return only to Chief'
  };
  const modelResolution = {
    requestedCapabilityClass: 'frontier_reasoning', requestedReasoningDemand: 'deep', requestedCostPreference: 'quality_first', requestedLatencyClass: 'long_running',
    upgradeTrigger: 'admission_1', resolvedModelAtRun: 'frontier-current', resolvedThinkingAtRun: 'high', modelResolutionReason: 'preferred_profile_match',
    nativeThreadControl: false, inventorySourceRef: inventory.sourceRef, inventoryObservedAt: inventory.observedAt, inventoryFingerprint: inventory.fingerprint,
    applicationStatus: 'manual_pending'
  };
  await task(root, 'chiefops-demo');
  const taskDir = path.join(root, 'planning/active/chiefops-demo');
  const bindingFile = path.join(root, 'binding.json');
  const resolutionFile = path.join(root, 'resolution.json');
  await writeFile(bindingFile, JSON.stringify(binding));
  await writeFile(resolutionFile, JSON.stringify(modelResolution));
  await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n\n' + serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding) + '\n');
  await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n\n' + serializeChiefOpsBlock('ChiefOpsModelUpgradeAdmission', admission) + '\n');
  await buildHandoffFromFile({
    root, file: bindingFile, modelResolutionFile: resolutionFile, codexHome, now,
    permissionEnforcementObservation: { status: 'verified', effectiveClass: 'observe', effectiveOps: ['inspect'], evidenceRef: 'host:permission' }
  });

  const receipt = {
    ...binding, receiptId: 'receipt_1', receiptType: 'done', threadId: 'thread-1', status: 'done', summary: 'done',
    evidenceRefs: ['focused-tests'], nextSuggestedAction: 'gate', createdAt: now, scopeCheck: { nonGoalsChecked: true, violations: [] },
    resolvedModelAtRun: 'frontier-current', resolvedThinkingAtRun: 'high', modelResolutionReason: 'preferred_profile_match', applicationStatus: 'manual_pending'
  };
  assert.deepEqual(
    await gateWorkerReceiptWithAuthority({
      root,
      codexHome,
      now,
      bindingPacket: binding,
      receipt,
      approvalSatisfied: true,
      modelResolution
    }),
    { outcome: 'accept', reason: null },
    'authority-aware gate accepts only after fresh trusted reread'
  );
  const childDispatch = {
    parentBindingId: binding.bindingId,
    childId: 'child_1',
    model: 'frontier-current',
    thinking: 'high',
    capabilityClass: 'fast_check',
    currentSlice: 'inspect the bounded result',
    proofTarget: 'child inspection proof',
    evidenceSink: 'parent receipt',
    permissionClass: 'observe',
    allowedOps: ['inspect'],
    nonGoals: ['no native application claim', 'no writes'],
    delegationPolicy: 'prohibited'
  };
  binding.delegationPolicy = 'worker_discretion';
  binding.subagentDispatches = [childDispatch];
  receipt.delegationPolicy = 'worker_discretion';
  await writeFile(bindingFile, JSON.stringify(binding));
  await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n\n' + serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding) + '\n');
  await assert.deepEqual(
    await gateWorkerReceiptWithAuthority({ root, codexHome, now, bindingPacket: binding, receipt: { ...receipt, delegationPolicy: 'worker_discretion' }, approvalSatisfied: true, modelResolution }),
    { outcome: 'block', reason: 'subagent_return_missing' },
    'declared child dispatch requires one return before parent done can accept'
  );
  const childContractHash = hashChiefOpsBlock({ type: 'ChiefOpsSubagentDispatch', value: childDispatch });
  const childReturn = {
    childId: childDispatch.childId,
    contractHash: childContractHash,
    model: childDispatch.model,
    thinking: childDispatch.thinking,
    status: 'done',
    evidenceRefs: ['child-proof'],
    contract: childDispatch
  };
  assert.deepEqual(
    await gateWorkerReceiptWithAuthority({ root, codexHome, now, bindingPacket: binding, receipt: { ...receipt, subagentReturns: [childReturn] }, approvalSatisfied: true, modelResolution }),
    { outcome: 'accept', reason: null },
    'one matching revalidated child return permits parent done'
  );
  assert.deepEqual(
    await gateWorkerReceiptWithAuthority({ root, codexHome, now, bindingPacket: binding, receipt: { ...receipt, subagentReturns: [{ ...childReturn, contractHash: 'sha256:' + '0'.repeat(64) }] }, approvalSatisfied: true, modelResolution }),
    { outcome: 'block', reason: 'subagent_return_mismatch' },
    'wrong child contract hash blocks parent done'
  );
  assert.deepEqual(
    await gateWorkerReceiptWithAuthority({ root, codexHome, now, bindingPacket: binding, receipt: { ...receipt, subagentReturns: [childReturn, childReturn] }, approvalSatisfied: true, modelResolution }),
    { outcome: 'block', reason: 'subagent_return_duplicate' },
    'duplicate child return blocks parent done'
  );
  const childBindingWithoutDispatch = { ...binding };
  delete childBindingWithoutDispatch.dispatchIntentVersion;
  delete childBindingWithoutDispatch.dispatchDecision;
  const childReceiptWithoutDispatch = { ...receipt };
  delete childReceiptWithoutDispatch.dispatchIntentVersion;
  delete childReceiptWithoutDispatch.dispatchDecision;
  await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n\n' + serializeChiefOpsBlock('ChiefOpsWorkerBinding', childBindingWithoutDispatch) + '\n');
  assert.deepEqual(
    gateWorkerReceipt({ bindingPacket: childBindingWithoutDispatch, receipt: childReceiptWithoutDispatch, approvalSatisfied: true, modelResolution }),
    { outcome: 'block', reason: 'trusted_authority_context_required' },
    'synchronous gate cannot bypass declared child return validation'
  );
  assert.deepEqual(
    await gateWorkerReceiptWithAuthority({ root, codexHome, now, bindingPacket: childBindingWithoutDispatch, receipt: childReceiptWithoutDispatch, approvalSatisfied: true, modelResolution }),
    { outcome: 'block', reason: 'subagent_return_missing' },
    'authority wrapper validates missing return without an explicit dispatch intent'
  );
  assert.deepEqual(
    await gateWorkerReceiptWithAuthority({ root, codexHome, now, bindingPacket: childBindingWithoutDispatch, receipt: { ...childReceiptWithoutDispatch, subagentReturns: [childReturn] }, approvalSatisfied: true, modelResolution }),
    { outcome: 'accept', reason: null },
    'authority wrapper accepts one valid child return without an explicit dispatch intent'
  );
  await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n\n' + serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding) + '\n');
  for (const applicationStatus of ['applied', 'unverified']) {
    assert.deepEqual(
      await gateWorkerReceiptWithAuthority({
        root,
        codexHome,
        now,
        bindingPacket: binding,
        receipt: { ...receipt, applicationStatus },
        approvalSatisfied: true,
        modelResolution
      }),
      { outcome: 'block', reason: 'model_application_unverified' },
      `authority gate application status ${applicationStatus}`
    );
  }
  for (const [name, overrides] of [
    ['substituted model', { resolvedModelAtRun: 'frontier-substitute' }],
    ['substituted supported thinking', { resolvedThinkingAtRun: 'max' }]
  ]) {
    const substitutedResolution = { ...modelResolution, ...overrides };
    await writeFile(resolutionFile, JSON.stringify(substitutedResolution));
    await assert.rejects(
      buildHandoffFromFile({
        root, file: bindingFile, modelResolutionFile: resolutionFile, codexHome, now,
        permissionEnforcementObservation: { status: 'verified', effectiveClass: 'observe', effectiveOps: ['inspect'], evidenceRef: 'host:permission' }
      }),
      /trusted_dispatch_context_mismatch/,
      `${name} handoff`
    );
    assert.deepEqual(
      await gateWorkerReceiptWithAuthority({
        root, codexHome, now, bindingPacket: binding, receipt: { ...receipt, ...overrides }, approvalSatisfied: true,
        modelResolution: substitutedResolution
      }),
      { outcome: 'block', reason: 'trusted_dispatch_context_mismatch' },
      `${name} receipt gate`
    );
  }
  await writeFile(resolutionFile, JSON.stringify(modelResolution));

  const cachePath = path.join(codexHome, 'models_cache.json');
  await writeFile(cachePath, JSON.stringify({
    models: [{ slug: 'frontier-current', supported_reasoning_levels: [{ effort: 'high' }] }]
  }));
  await assert.rejects(
    buildHandoffFromFile({
      root, file: bindingFile, modelResolutionFile: resolutionFile, codexHome, now,
      permissionEnforcementObservation: { status: 'verified', effectiveClass: 'observe', effectiveOps: ['inspect'], evidenceRef: 'host:permission' }
    }),
    /trusted_dispatch_context_mismatch/,
    'catalog drift handoff'
  );
  assert.deepEqual(
    await gateWorkerReceiptWithAuthority({ root, codexHome, now, bindingPacket: binding, receipt, approvalSatisfied: true, modelResolution }),
    { outcome: 'block', reason: 'trusted_dispatch_context_mismatch' },
    'catalog drift receipt gate'
  );
  await writeFile(cachePath, JSON.stringify({
    models: [
      { slug: 'frontier-current', supported_reasoning_levels: [{ effort: 'high' }, { effort: 'max' }] },
      { slug: 'frontier-substitute', supported_reasoning_levels: [{ effort: 'high' }] }
    ]
  }));
  await utimes(cachePath, new Date(inventory.observedAt), new Date(inventory.observedAt));

  for (const [name, blocks] of [
    ['mutated', [admissionFixture({ ...admission, triggerRationale: 'B'.repeat(40) })]],
    ['replaced', [admissionFixture({ ...admission, admissionId: 'admission_other' })]],
    ['removed', []]
  ]) {
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n\n' + blocks.map((block) => serializeChiefOpsBlock('ChiefOpsModelUpgradeAdmission', block)).join('\n') + '\n');
    assert.deepEqual(
      await gateWorkerReceiptWithAuthority({ root, codexHome, now, bindingPacket: binding, receipt, approvalSatisfied: true, modelResolution }),
      { outcome: 'block', reason: 'trusted_dispatch_context_mismatch' },
      name
    );
  }
});
