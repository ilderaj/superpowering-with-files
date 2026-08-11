import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import * as routing from '../../harness/trio/core/routing.mjs';
import {
  hasMutablePathConflict,
  isEnvelopeSubset
} from '../../harness/trio/core/routing.mjs';
import { resolveGenericHostOperation } from '../../harness/trio/hosts/generic.mjs';

function createAssignmentPacket() {
  const authorityRoot = '/tmp/trio-wave4-permission-authority';
  const taskId = 'permission-task';
  const taskDir = `${authorityRoot}/planning/active/${taskId}`;
  const sha256 = 'b'.repeat(64);
  const binding = {
    authorityRoot,
    taskId,
    files: {
      taskPlan: { path: `${taskDir}/task_plan.md`, sha256 },
      findings: { path: `${taskDir}/findings.md`, sha256 },
      progress: { path: `${taskDir}/progress.md`, sha256 }
    }
  };
  return {
    authority: { binding, bindingObservation: binding },
    currentSlice: { name: 'wave-4-permission-routing' },
    nonGoals: ['no Host calls'],
    proof: { primary: ['focused tests'] },
    capability: { workRole: 'chief', requestedModel: 'gpt-5.6-sol', requestedEffort: 'max' },
    allowedOperations: { files: ['harness/trio/core/routing.mjs'] },
    deadline: { stopConditions: ['binding mismatch'] },
    expectedReturn: { status: ['candidate_done', 'blocked'] }
  };
}

test('mutable path conflicts use segment boundaries and reject unsafe paths', () => {
  assert.equal(hasMutablePathConflict(['src/a'], ['src/abc']), false);
  assert.equal(hasMutablePathConflict(['src/a'], ['src/a/file']), true);
  assert.equal(hasMutablePathConflict(['src/a'], ['src/a']), true);

  assert.throws(() => hasMutablePathConflict(['/absolute'], ['src/a']), /relative/i);
  assert.throws(() => hasMutablePathConflict(['src/../secret'], ['src/a']), /unsafe|relative/i);
  assert.throws(() => hasMutablePathConflict([''], ['src/a']), /non-empty|invalid/i);
  assert.throws(() => hasMutablePathConflict(['src/\u0000file'], ['src/a']), /control|relative/i);
});

test('child path envelopes are subsets only through explicit authority-relative scope', () => {
  const parent = {
    permissions: ['workspace'],
    mutablePaths: ['src'],
    operations: ['spawn', 'status'],
    externalEffects: []
  };

  assert.equal(isEnvelopeSubset({
    permissions: ['workspace'],
    mutablePaths: ['src/app'],
    operations: ['spawn'],
    externalEffects: []
  }, parent), true);
  assert.equal(isEnvelopeSubset({
    permissions: ['workspace'],
    mutablePaths: ['src/abc'],
    operations: ['spawn'],
    externalEffects: []
  }, parent), true);
  assert.equal(isEnvelopeSubset({
    permissions: ['workspace', 'release'],
    mutablePaths: ['src/app'],
    operations: ['spawn'],
    externalEffects: []
  }, parent), false);
});

test('native child routing requires strict envelope narrowing and forbids Ultra', () => {
  const parentEnvelope = {
    permissions: ['workspace'],
    mutablePaths: ['src'],
    operations: ['spawn', 'status'],
    externalEffects: []
  };
  const childEnvelope = {
    permissions: ['workspace'],
    mutablePaths: ['src/app'],
    operations: ['spawn'],
    externalEffects: []
  };
  const base = {
    operation: 'spawn',
    assignmentPacket: createAssignmentPacket(),
    parentEnvelope,
    childEnvelope,
    observation: {
      authenticated: true,
      evidenceRef: 'native-envelope-observation-1',
      visibleWorker: {
        visible: true,
        operations: { spawn: true },
        requestedModelEffortControls: false,
        permissionBinding: true,
        pathBinding: true
      },
      nativeSubagent: {
        supported: true,
        visible: false,
        operations: { spawn: true }
      }
    }
  };

  const narrowed = resolveGenericHostOperation(base);
  assert.equal(narrowed.routeEvidence.routeKind, 'native_subagent');
  assert.equal(narrowed.routeEvidence.capabilityEvidence.visible, false);
  assert.equal(narrowed.routeEvidence.workerId, null);
  assert.deepEqual(narrowed.descriptor.childEnvelope, childEnvelope);

  const widened = resolveGenericHostOperation({
    ...base,
    childEnvelope: {
      ...childEnvelope,
      permissions: ['workspace', 'release']
    }
  });
  assert.equal(widened.routeEvidence.routeKind, 'manual_pending');
  assert.match(widened.routeEvidence.fallbackReason, /child_envelope_widened/);

  const equal = resolveGenericHostOperation({ ...base, childEnvelope: parentEnvelope });
  assert.equal(equal.routeEvidence.routeKind, 'manual_pending');
  assert.match(equal.routeEvidence.fallbackReason, /child_envelope_not_narrower/);

  const ultra = resolveGenericHostOperation({ ...base, requestedEffort: 'ultra' });
  assert.equal(ultra.routeEvidence.routeKind, 'manual_pending');
  assert.match(ultra.routeEvidence.fallbackReason, /native_ultra_forbidden/);
});

test('all mutable lane statuses remain reserved and invalid lane records fail closed', () => {
  const base = {
    operation: 'spawn',
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/reserved/file'] },
    assignmentPacket: createAssignmentPacket(),
    observation: {
      authenticated: true,
      evidenceRef: 'lane-reservation-observation',
      visibleWorker: {
        visible: true,
        operations: { spawn: true },
        requestedModelEffortControls: true,
        permissionBinding: true,
        pathBinding: true
      }
    }
  };

  for (const status of ['planned', 'observed', 'idle', 'executing', 'awaiting_approval', 'candidate_done', 'stopped', 'blocked']) {
    const result = resolveGenericHostOperation({
      ...base,
      lanes: [{
        routeKind: 'visible_worker',
        status,
        workerId: `reserved-${status}`,
        mutablePaths: ['src/reserved']
      }]
    });
    assert.equal(result.routeEvidence.routeKind, 'manual_pending', status);
    assert.match(result.routeEvidence.fallbackReason, /mutable_path_conflict/);
  }

  const invalidLanes = [
    { routeKind: 'visible_worker', workerId: 'missing-status', mutablePaths: ['src/reserved'] },
    { routeKind: 'visible_worker', status: 'unknown', workerId: 'unknown-status', mutablePaths: ['src/reserved'] },
    { routeKind: 'visible_worker', status: 'typo', workerId: 'typo-status', mutablePaths: ['src/reserved'] },
    { routeKind: 'visible_worker', status: 'accepted', workerId: 'chief-status', mutablePaths: ['src/reserved'] },
    { status: 'planned', workerId: 'missing-route', mutablePaths: ['src/reserved'] },
    { routeKind: 'unknown', status: 'planned', workerId: 'unknown-route', mutablePaths: ['src/reserved'] },
    { routeKind: 'typo', status: 'planned', workerId: 'typo-route', mutablePaths: ['src/reserved'] }
  ];
  for (const lane of invalidLanes) {
    assert.throws(
      () => resolveGenericHostOperation({ ...base, lanes: [lane] }),
      /Host lane (status|route kind)/i
    );
  }
});

test('lane capacity and candidate path reservations require an authenticated matching Chief release', () => {
  const base = {
    operation: 'spawn',
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/new'] },
    assignmentPacket: createAssignmentPacket(),
    observation: {
      authenticated: true,
      evidenceRef: 'lane-observation-1',
      visibleWorker: {
        visible: true,
        operations: { spawn: true },
        requestedModelEffortControls: true,
        permissionBinding: true,
        pathBinding: true
      }
    }
  };

  const thirdLane = resolveGenericHostOperation({
    ...base,
    lanes: [
      { routeKind: 'visible_worker', status: 'executing', workerId: 'w1', mutable: true, mutablePaths: ['src/one'] },
      { routeKind: 'visible_worker', status: 'executing', workerId: 'w2', mutable: true, mutablePaths: ['src/two'] }
    ]
  });
  assert.equal(thirdLane.routeEvidence.routeKind, 'manual_pending');
  assert.match(thirdLane.routeEvidence.fallbackReason, /visible_lane_capacity/);

  const reservedCandidate = resolveGenericHostOperation({
    ...base,
    pathEnvelope: { mutablePaths: ['src/reserved/file'] },
    lanes: [
      { routeKind: 'visible_worker', status: 'candidate_done', workerId: 'candidate-1', mutable: true, mutablePaths: ['src/reserved'] }
    ]
  });
  assert.equal(reservedCandidate.routeEvidence.routeKind, 'manual_pending');
  assert.match(reservedCandidate.routeEvidence.fallbackReason, /mutable_path_conflict/);

  const reservedLane = {
    routeKind: 'visible_worker',
    status: 'candidate_done',
    workerId: 'candidate-1',
    mutable: true,
    mutablePaths: ['src/reserved']
  };
  const fakeReleases = [
    { released: true },
    { chiefReleased: true },
    { chiefObserved: 'release' },
    { chiefObserved: 'accept' },
    { chiefObserved: 'accepted' },
    { chiefRelease: { authenticated: false, workerId: 'candidate-1', mutablePaths: ['src/reserved'], disposition: 'release', evidenceRef: 'chief-release' } },
    { chiefRelease: { authenticated: true, workerId: 'other-worker', mutablePaths: ['src/reserved'], disposition: 'release', evidenceRef: 'chief-release' } },
    { chiefRelease: { authenticated: true, mutablePaths: ['src/reserved'], disposition: 'release', evidenceRef: 'chief-release' } },
    { chiefRelease: { authenticated: true, workerId: 'candidate-1', mutablePaths: ['src/other'], disposition: 'release', evidenceRef: 'chief-release' } },
    { chiefRelease: { authenticated: true, workerId: 'candidate-1', disposition: 'release', evidenceRef: 'chief-release' } },
    { chiefRelease: { authenticated: true, workerId: 'candidate-1', mutablePaths: ['src/reserved'], disposition: 'accept', evidenceRef: 'chief-release' } },
    { chiefRelease: { authenticated: true, workerId: 'candidate-1', mutablePaths: ['src/reserved'], disposition: 'accepted', evidenceRef: 'chief-release' } },
    { chiefRelease: { authenticated: true, workerId: 'candidate-1', mutablePaths: ['src/reserved'], disposition: 'release' } }
  ];
  for (const fakeRelease of fakeReleases) {
    const result = resolveGenericHostOperation({
      ...base,
      pathEnvelope: { mutablePaths: ['src/reserved/file'] },
      lanes: [{ ...reservedLane, ...fakeRelease }]
    });
    assert.equal(result.routeEvidence.routeKind, 'manual_pending');
    assert.match(result.routeEvidence.fallbackReason, /mutable_path_conflict/);
  }

  const releasedCandidate = resolveGenericHostOperation({
    ...base,
    pathEnvelope: { mutablePaths: ['src/reserved/file'] },
    lanes: [{
      ...reservedLane,
      chiefRelease: {
        authenticated: true,
        workerId: 'candidate-1',
        mutablePaths: ['src/reserved'],
        disposition: 'release',
        evidenceRef: 'chief-release-evidence'
      }
    }]
  });
  assert.equal(releasedCandidate.routeEvidence.routeKind, 'visible_worker');
});

test('assignment packet rejects a ninth top-level field and keeps delegation inside capability', () => {
  assert.deepEqual(routing.ASSIGNMENT_PACKET_FIELDS, [
    'authority',
    'currentSlice',
    'nonGoals',
    'proof',
    'capability',
    'allowedOperations',
    'deadline',
    'expectedReturn'
  ]);

  assert.throws(
    () => routing.buildAssignmentPacket({
      ...createAssignmentPacket(),
      childDelegation: 'prohibited'
    }),
    /eight fields|childDelegation/i
  );

  const packet = routing.buildAssignmentPacket({
    ...createAssignmentPacket(),
    capability: {
      workRole: 'chief',
      requestedModel: 'gpt-5.6-sol',
      requestedEffort: 'max',
      childDelegation: 'prohibited'
    }
  });
  assert.deepEqual(Object.keys(packet), routing.ASSIGNMENT_PACKET_FIELDS);
  assert.equal(packet.capability.childDelegation, 'prohibited');
});

test('child delegation policy values are validated inside the capability object', () => {
  const packet = routing.buildAssignmentPacket({
    ...createAssignmentPacket(),
    capability: {
      workRole: 'chief',
      requestedModel: 'gpt-5.6-sol',
      requestedEffort: 'max',
      childDelegation: 'worker_discretion'
    }
  });
  assert.equal(packet.capability.childDelegation, 'worker_discretion');
  assert.equal(Object.hasOwn(packet, 'childDelegation'), false);
});

// ---------------------------------------------------------------------------
// Scope-first permission governance: Trio scope -> Host sandbox -> approval.
// ---------------------------------------------------------------------------

function packetDigestOf(packet) {
  const probe = routing.resolveHostOperation({
    operation: 'spawn',
    assignmentPacket: packet,
    observation: {
      authenticated: true,
      evidenceRef: 'digest-probe-observation',
      visibleWorker: {
        visible: true,
        operations: { spawn: true },
        requestedModelEffortControls: true,
        permissionBinding: true,
        pathBinding: true
      }
    },
    permissionEnvelope: { permissions: ['workspace'], operations: ['spawn'], externalEffects: [] },
    pathEnvelope: { mutablePaths: [] }
  });
  return probe.descriptor.packetDigest;
}

function createPermissionInput(overrides = {}) {
  const packet = createAssignmentPacket();
  return {
    assignmentPacket: packet,
    targetPaths: ['harness/trio/core/routing.mjs'],
    permissionIntent: { sandboxMode: 'bounded', writableRoots: ['harness/trio/core'] },
    hostObservation: {
      authenticated: true,
      evidenceRef: 'host-permission-evidence-1',
      packetDigest: packetDigestOf(packet),
      actualSandbox: 'bounded',
      actualWritableRoots: ['harness/trio/core']
    },
    approval: { kind: 'user', granted: true },
    ...overrides
  };
}

test('scope-first adjudication allows an in-scope target with authenticated sandbox and approval', () => {
  const result = routing.adjudicatePermission(createPermissionInput());
  assert.equal(result.verdict, 'allowed');
  assert.equal(result.stage, 'approval');
  assert.equal(result.reason, null);
  assert.equal(result.approvalEligible, true);
  assert.deepEqual(result.stages.scope, { decision: 'allowed', reason: null });
  assert.equal(result.stages.sandbox.decision, 'allowed');
  assert.equal(result.stages.approval.decision, 'allowed');
});

test('in-scope targets stay blocked at the sandbox stage when actual Host evidence is unknown', () => {
  const result = routing.adjudicatePermission(createPermissionInput({ hostObservation: {} }));
  assert.equal(result.verdict, 'blocked');
  assert.equal(result.stage, 'sandbox');
  assert.equal(result.approvalEligible, false);
  assert.match(result.reason, /sandbox_actual_unknown/);
  assert.equal(result.actual.authenticated, false);
  assert.equal(result.actual.sandbox, 'unknown');
  assert.equal(result.actual.writableRoots, 'unknown');
  assert.equal(result.stages.scope.decision, 'allowed');
  assert.equal(result.stages.approval.decision, 'skipped');
});

test('authorized in-scope work stays blocked when authenticated sandbox roots do not cover the target', () => {
  const packet = createAssignmentPacket();
  const result = routing.adjudicatePermission(createPermissionInput({
    hostObservation: {
      authenticated: true,
      evidenceRef: 'narrow-sandbox-1',
      packetDigest: packetDigestOf(packet),
      actualSandbox: 'bounded',
      actualWritableRoots: ['other/path']
    }
  }));
  assert.equal(result.verdict, 'blocked');
  assert.equal(result.stage, 'sandbox');
  assert.equal(result.approvalEligible, false);
  assert.match(result.reason, /sandbox_writable_roots_unbound/);
  assert.equal(result.stages.approval.decision, 'skipped');
});

test('out-of-scope targets are blocked before Full Access, user approval, auto-review, or a writable sandbox can expand scope', () => {
  const attacks = [
    { name: 'full access intent', permissionIntent: { sandboxMode: 'full_access', writableRoots: [] } },
    { name: 'user approval', approval: { kind: 'user', granted: true } },
    { name: 'auto-review', approval: { kind: 'auto_review', granted: true } },
    {
      name: 'authenticated writable sandbox',
      hostObservation: {
        authenticated: true,
        evidenceRef: 'writable-sandbox-1',
        actualSandbox: 'full_access',
        actualWritableRoots: ['harness/trio/core/routing.mjs']
      }
    }
  ];
  for (const attack of attacks) {
    const result = routing.adjudicatePermission(createPermissionInput({
      targetPaths: ['outside/the/allowlist'],
      ...attack
    }));
    assert.equal(result.verdict, 'blocked', attack.name);
    assert.equal(result.stage, 'scope', attack.name);
    assert.equal(result.approvalEligible, false, attack.name);
    assert.match(result.reason, /outside_assignment_scope/, attack.name);
    assert.equal(result.stages.scope.decision, 'blocked', attack.name);
    assert.equal(result.stages.sandbox.decision, 'skipped', attack.name);
    assert.equal(result.stages.approval.decision, 'skipped', attack.name);
  }
});

test('generated materialized targets stay blocked even when allow-listed, sandbox-writable, and approved', () => {
  for (const target of ['AGENTS.md', '.agents/skills/trio/dev/SKILL.md']) {
    const packet = {
      ...createAssignmentPacket(),
      allowedOperations: { files: ['harness/trio/core/routing.mjs', target] }
    };
    const result = routing.adjudicatePermission({
      assignmentPacket: packet,
      targetPaths: [target],
      permissionIntent: { sandboxMode: 'full_access', writableRoots: [] },
      hostObservation: {
        authenticated: true,
        evidenceRef: 'sandbox-writable-1',
        actualSandbox: 'full_access',
        actualWritableRoots: []
      },
      approval: { kind: 'user', granted: true }
    });
    assert.equal(result.verdict, 'blocked', target);
    assert.equal(result.stage, 'scope', target);
    assert.match(result.reason, /generated_target/, target);
    assert.equal(result.approvalEligible, false, target);
    assert.equal(result.stages.sandbox.decision, 'skipped', target);
    assert.equal(result.stages.approval.decision, 'skipped', target);
  }
});

test('requested permission intent and authenticated actual Host evidence stay distinct and digest-bound', () => {
  const packet = createAssignmentPacket();
  const result = routing.adjudicatePermission({
    assignmentPacket: packet,
    targetPaths: ['harness/trio/core/routing.mjs'],
    permissionIntent: { sandboxMode: 'bounded', writableRoots: ['harness/trio/core'] },
    hostObservation: {
      authenticated: true,
      evidenceRef: 'authenticated-actual-1',
      packetDigest: packetDigestOf(packet),
      actualSandbox: 'full_access',
      actualWritableRoots: ['harness/trio/core/routing.mjs']
    },
    approval: null
  });
  assert.deepEqual(result.requested, {
    sandboxMode: 'bounded',
    writableRoots: ['harness/trio/core'],
    approval: null
  });
  assert.deepEqual(result.actual, {
    authenticated: true,
    evidenceRef: 'authenticated-actual-1',
    sandbox: 'full_access',
    writableRoots: ['harness/trio/core/routing.mjs']
  });
  assert.equal(result.verdict, 'allowed');
  assert.equal(result.stage, 'approval');
});

test('actual Host permission stays unknown without authenticated evidence or with a mismatched packet digest', () => {
  const selfReported = routing.adjudicatePermission(createPermissionInput({
    hostObservation: { actualSandbox: 'full_access', actualWritableRoots: ['everything'] }
  }));
  assert.equal(selfReported.actual.authenticated, false);
  assert.equal(selfReported.actual.sandbox, 'unknown');
  assert.equal(selfReported.actual.writableRoots, 'unknown');
  assert.equal(selfReported.verdict, 'blocked');
  assert.equal(selfReported.stage, 'sandbox');

  const digestMismatch = routing.adjudicatePermission(createPermissionInput({
    hostObservation: {
      authenticated: true,
      evidenceRef: 'wrong-digest-1',
      packetDigest: '0'.repeat(64),
      actualSandbox: 'bounded',
      actualWritableRoots: ['harness/trio/core']
    }
  }));
  assert.equal(digestMismatch.actual.authenticated, false);
  assert.equal(digestMismatch.actual.sandbox, 'unknown');
  assert.equal(digestMismatch.verdict, 'blocked');
  assert.equal(digestMismatch.stage, 'sandbox');
});

test('approval is the final gate and can deny only within scope and sandbox, never expand them', () => {
  const denied = routing.adjudicatePermission(createPermissionInput({
    approval: { kind: 'user', granted: false }
  }));
  assert.equal(denied.verdict, 'blocked');
  assert.equal(denied.stage, 'approval');
  assert.equal(denied.approvalEligible, true);
  assert.match(denied.reason, /approval_denied/);
  assert.equal(denied.stages.scope.decision, 'allowed');
  assert.equal(denied.stages.sandbox.decision, 'allowed');

  const autoReviewDenied = routing.adjudicatePermission(createPermissionInput({
    approval: { kind: 'auto_review', granted: false }
  }));
  assert.equal(autoReviewDenied.verdict, 'blocked');
  assert.equal(autoReviewDenied.stage, 'approval');
  assert.match(autoReviewDenied.reason, /approval_denied/);
});

test('malformed assignment scope and incomplete adjudication inputs fail closed', () => {
  assert.throws(
    () => routing.adjudicatePermission(createPermissionInput({
      assignmentPacket: { ...createAssignmentPacket(), allowedOperations: { files: ['/absolute/path'] } }
    })),
    /authority-relative/i
  );
  assert.throws(
    () => routing.adjudicatePermission(createPermissionInput({
      assignmentPacket: { ...createAssignmentPacket(), allowedOperations: { files: ['src/../secret'] } }
    })),
    /unsafe segment/i
  );
  assert.throws(() => routing.adjudicatePermission({}), /assignment packet/i);
  assert.throws(
    () => routing.adjudicatePermission({ assignmentPacket: createAssignmentPacket(), targetPaths: [] }),
    /at least one target path/i
  );
  assert.throws(
    () => routing.adjudicatePermission({
      assignmentPacket: createAssignmentPacket(),
      targetPaths: ['harness/trio/core/routing.mjs'],
      permissionIntent: { writableRoots: [] }
    }),
    /sandboxMode/i
  );
});

test('partial assignment packets are rejected before scope or approval can allow them', () => {
  const full = createAssignmentPacket();
  // Replicate the canonical stable packet digest so a partial packet alone
  // would otherwise satisfy digest-bound Host evidence and reach approval.
  const stableStringify = (value) => {
    if (value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
      const keys = Object.keys(value).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  };
  const stableDigest = (value) => createHash('sha256').update(stableStringify(value)).digest('hex');
  assert.equal(stableDigest(full), packetDigestOf(full));

  const partial = { ...full };
  delete partial.capability;
  assert.throws(
    () => routing.adjudicatePermission({
      assignmentPacket: partial,
      targetPaths: ['harness/trio/core/routing.mjs'],
      permissionIntent: { sandboxMode: 'full_access', writableRoots: [] },
      hostObservation: {
        authenticated: true,
        evidenceRef: 'partial-packet-evidence-1',
        packetDigest: stableDigest(partial),
        actualSandbox: 'full_access',
        actualWritableRoots: []
      },
      approval: { kind: 'user', granted: true }
    }),
    /eight fields/i
  );
});
