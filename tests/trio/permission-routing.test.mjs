import assert from 'node:assert/strict';
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

  for (const status of ['planned', 'observed', 'idle', 'executing', 'candidate_done', 'stopped', 'blocked']) {
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
