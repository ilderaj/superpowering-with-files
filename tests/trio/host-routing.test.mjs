import assert from 'node:assert/strict';
import test from 'node:test';

import * as routing from '../../harness/trio/core/routing.mjs';
import {
  allocateCorleoneCallsign,
  CORLEONE_AGENT_TYPES,
  renderCorleoneAgentEntry,
  renderCorleoneRosterConfig,
  renderCorleoneRoleFile,
  resolveCorleoneProfile,
  selectCorleoneRole,
  adapterStatus,
  renderCodexHandoffRequest,
  resolveCodexHostOperation
} from '../../harness/trio/hosts/codex.mjs';
import * as codexAdapter from '../../harness/trio/hosts/codex.mjs';
import { resolveGenericHostOperation } from '../../harness/trio/hosts/generic.mjs';

const ROUTE_EVIDENCE_FIELDS = [
  'routeKind',
  'requestedModel',
  'requestedEffort',
  'actualModel',
  'actualEffort',
  'workerId',
  'capabilityEvidence',
  'permissionEnvelope',
  'pathEnvelope',
  'fallbackReason',
  'status'
];

function createAssignmentPacket() {
  const authorityRoot = '/tmp/trio-wave4-authority';
  const taskId = 'wave4-task';
  const taskDir = `${authorityRoot}/planning/active/${taskId}`;
  const sha256 = 'a'.repeat(64);
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
    currentSlice: { name: 'wave-4-host-routing' },
    nonGoals: ['no Host calls'],
    proof: { primary: ['focused tests'] },
    capability: { workRole: 'chief', requestedModel: 'gpt-5.6-sol', requestedEffort: 'max' },
    allowedOperations: { files: ['harness/trio/hosts/generic.mjs'] },
    deadline: { stopConditions: ['binding mismatch'] },
    expectedReturn: { status: ['candidate_done', 'blocked'] }
  };
}

test('Corleone role selection maps ordinary coding to a button man and strict visibility to Don Michael', () => {
  assert.deepEqual(
    selectCorleoneRole({ workRole: 'coding', complexity: 'high' }),
    {
      agentType: 'buttonman_neri',
      displayName: 'Button Man Al Neri',
      tier: 'buttonman',
      ordinal: 1
    }
  );
  assert.deepEqual(
    selectCorleoneRole({
      workRole: 'coding',
      complexity: 'xhigh',
      primaryExecution: 'visible_worker_required'
    }),
    {
      agentType: 'don_michael',
      displayName: 'Don Michael Corleone',
      tier: 'don',
      ordinal: 1
    }
  );
  assert.throws(
    () => selectCorleoneRole({
      workRole: 'chief',
      primaryExecution: 'visible_worker_required'
    }),
    /supported execution workRole/i
  );
});

test('Corleone callsigns exhaust named capos before using a stable ordinal role name', () => {
  assert.deepEqual(
    allocateCorleoneCallsign({ tier: 'capo', ordinal: 2 }),
    {
      agentType: 'capo_lampone',
      displayName: 'Capo Rocco Lampone',
      tier: 'capo',
      ordinal: 2
    }
  );
  const thirdCapo = allocateCorleoneCallsign({ tier: 'capo', ordinal: 3 });
  assert.deepEqual(thirdCapo, {
    agentType: 'capo',
    displayName: 'Capo 3rd',
    tier: 'capo',
    ordinal: 3
  });
  assert.equal(allocateCorleoneCallsign({ tier: 'capo', ordinal: 4 }).displayName, 'Capo 4th');
  assert.throws(
    () => allocateCorleoneCallsign({ tier: 'capo', ordinal: Number.MAX_SAFE_INTEGER + 1 }),
    /positive safe integer/i
  );
  assert.deepEqual(
    selectCorleoneRole({
      workRole: 'coding',
      complexity: 'xhigh',
      workerIdentity: thirdCapo
    }),
    thirdCapo
  );
});

test('Corleone role profiles render a named Flash agent with no fallback or delegated authority', () => {
  const profile = resolveCorleoneProfile('capo_clemenza', 'xhigh');
  assert.equal(profile.name, 'capo_clemenza');
  assert.equal(profile.model, 'opencode-go/deepseek-v4-flash');
  assert.equal(profile.modelReasoningEffort, 'xhigh');
  assert.equal(profile.fallbackModel, null);

  const entry = renderCorleoneAgentEntry('capo_clemenza', '/tmp/agents/capo_clemenza.toml', 'xhigh');
  const roleFile = renderCorleoneRoleFile('capo_clemenza', 'xhigh');
  assert.match(entry, /\[agents\.capo_clemenza\]/);
  assert.match(entry, /config_file\s*=\s*"\/tmp\/agents\/capo_clemenza\.toml"/);
  assert.match(roleFile, /name\s*=\s*"capo_clemenza"/);
  assert.match(roleFile, /Capo Peter Clemenza/);
  assert.doesNotMatch(`${entry}\n${roleFile}`, /fallback|childDelegation|delegation\s*=\s*"allowed"/i);
});

test('resolveHostOperation selects a visible worker with exact route evidence', () => {
  assert.equal(typeof routing.resolveHostOperation, 'function');

  const result = routing.resolveHostOperation({
    operation: 'spawn',
    workRole: 'chief',
    requestedModel: 'gpt-5.6-sol',
    requestedEffort: 'max',
    observation: {
      authenticated: true,
      evidenceRef: 'host-observation-visible-1',
      workerId: 'previous-visible-worker',
      status: 'idle',
      actualModel: 'gpt-5.6-luna',
      actualEffort: 'max',
      visibleWorker: {
        visible: true,
        operations: { spawn: true },
        requestedModelEffortControls: true,
        permissionBinding: true,
        pathBinding: true
      }
    },
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/app'] }
  });

  assert.deepEqual(Object.keys(result.routeEvidence), ROUTE_EVIDENCE_FIELDS);
  assert.equal(result.routeEvidence.routeKind, 'visible_worker');
  assert.equal(result.routeEvidence.requestedModel, 'gpt-5.6-sol');
  assert.equal(result.routeEvidence.requestedEffort, 'max');
  assert.equal(result.routeEvidence.actualModel, 'unknown');
  assert.equal(result.routeEvidence.actualEffort, 'unknown');
  assert.equal(result.routeEvidence.workerId, null);
  assert.equal(result.routeEvidence.fallbackReason, null);
  assert.equal(result.routeEvidence.status, 'planned');
});

test('non-spawn visible operations require an exact authenticated requested worker identity', () => {
  const operations = ['continue', 'status', 'interrupt', 'collect'];
  const cases = [
    { name: 'missing requested worker', requestedWorkerId: undefined, observedWorkerId: 'observed-worker' },
    { name: 'missing observed worker', requestedWorkerId: 'requested-worker', observedWorkerId: undefined },
    { name: 'mismatched worker', requestedWorkerId: 'requested-worker', observedWorkerId: 'observed-worker' }
  ];

  for (const operation of operations) {
    for (const testCase of cases) {
      const result = resolveGenericHostOperation({
        operation,
        ...(testCase.requestedWorkerId === undefined ? {} : { requestedWorkerId: testCase.requestedWorkerId }),
        assignmentPacket: createAssignmentPacket(),
        observation: {
          authenticated: true,
          evidenceRef: `non-spawn-${operation}-${testCase.name}`,
          ...(testCase.observedWorkerId === undefined ? {} : { workerId: testCase.observedWorkerId }),
          status: 'idle',
          actualModel: 'gpt-5.6-luna',
          actualEffort: 'max',
          visibleWorker: {
            visible: true,
            operations: { [operation]: true },
            requestedModelEffortControls: true,
            permissionBinding: true,
            pathBinding: true
          }
        },
        permissionEnvelope: { permissions: ['workspace'], operations: [operation], externalEffects: [] },
        pathEnvelope: { mutablePaths: [] }
      });

      assert.equal(result.routeEvidence.routeKind, 'manual_pending', `${operation} ${testCase.name}`);
      assert.equal(result.routeEvidence.workerId, null, `${operation} ${testCase.name}`);
      assert.equal(result.routeEvidence.status, 'manual_pending', `${operation} ${testCase.name}`);
      assert.equal(result.routeEvidence.actualModel, 'unknown', `${operation} ${testCase.name}`);
      assert.equal(result.routeEvidence.actualEffort, 'unknown', `${operation} ${testCase.name}`);
    }
  }
});

test('default execution keeps an identity-matched visible worker for lifecycle operations', () => {
  const packet = {
    ...createAssignmentPacket(),
    capability: { workRole: 'coding', complexity: 'high' }
  };
  for (const operation of ['continue', 'status', 'interrupt', 'collect']) {
    const result = resolveGenericHostOperation({
      operation,
      requestedWorkerId: 'visible-execution-worker',
      assignmentPacket: packet,
      observation: {
        authenticated: true,
        evidenceRef: `visible-default-${operation}`,
        workerId: 'visible-execution-worker',
        status: 'idle',
        actualModel: 'opencode-go/deepseek-v4-flash',
        actualEffort: 'high',
        visibleWorker: {
          visible: true,
          operations: { [operation]: true },
          requestedModelEffortControls: true,
          permissionBinding: true,
          pathBinding: true
        }
      },
      permissionEnvelope: { permissions: ['workspace'], operations: [operation], externalEffects: [] },
      pathEnvelope: { mutablePaths: [] }
    });
    assert.equal(result.routeEvidence.routeKind, 'visible_worker', operation);
    assert.equal(result.routeEvidence.workerId, 'visible-execution-worker', operation);
    assert.equal(result.routeEvidence.status, 'idle', operation);
  }
});

test('generic host adapter fails closed to a bounded manual pending descriptor', () => {
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: createAssignmentPacket(),
    observation: { authenticated: true, evidenceRef: 'generic-observation-without-controls' }
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.routeEvidence.workerId, null);
  assert.equal(result.routeEvidence.status, 'manual_pending');
  assert.equal(result.routeEvidence.actualModel, 'unknown');
  assert.equal(result.routeEvidence.actualEffort, 'unknown');
  assert.deepEqual(Object.keys(result.descriptor.assignmentPacket), routing.ASSIGNMENT_PACKET_FIELDS);
  assert.equal(result.descriptor.executed, false);
  assert.deepEqual(result.descriptor.writes, []);
  assert.equal(Object.hasOwn(result.descriptor, 'threadId'), false);
  assert.equal(Object.hasOwn(result.descriptor, 'spawned'), false);
  assert.equal(Object.hasOwn(result.descriptor, 'accepted'), false);
  assert.match(result.descriptor.blocker, /visible|native|manual/i);
  assert.match(result.descriptor.resumeCondition, /authenticated Host support/i);
});

test('Host routing falls back from visible worker to native subagent and then manual pending', () => {
  const baseInput = {
    operation: 'spawn',
    workRole: 'chief',
    requestedModel: 'gpt-5.6-sol',
    requestedEffort: 'max',
    assignmentPacket: createAssignmentPacket(),
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn', 'status'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src'] },
    childEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: [],
      mutablePaths: ['src/app']
    },
    observation: {
      authenticated: true,
      evidenceRef: 'host-observation-fallback-1',
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

  const native = resolveGenericHostOperation(baseInput);
  assert.deepEqual(Object.keys(native.routeEvidence), ROUTE_EVIDENCE_FIELDS);
  assert.equal(native.routeEvidence.routeKind, 'native_subagent');
  assert.equal(native.routeEvidence.workerId, null);
  assert.equal(native.routeEvidence.capabilityEvidence.visible, false);
  assert.equal(native.descriptor.executed, false);
  assert.equal(Object.hasOwn(native.descriptor, 'threadId'), false);
  assert.equal(Object.hasOwn(native.descriptor, 'spawned'), false);
  assert.equal(Object.hasOwn(native.descriptor, 'accepted'), false);
  assert.match(native.routeEvidence.fallbackReason, /visible_model_controls_unbound/);

  const manual = resolveGenericHostOperation({
    ...baseInput,
    observation: {
      ...baseInput.observation,
      nativeSubagent: { supported: false, visible: false, operations: { spawn: false } }
    }
  });
  assert.deepEqual(Object.keys(manual.routeEvidence), ROUTE_EVIDENCE_FIELDS);
  assert.equal(manual.routeEvidence.routeKind, 'manual_pending');
  assert.equal(manual.routeEvidence.workerId, null);
  assert.match(manual.routeEvidence.fallbackReason, /native_unsupported/);
  assert.equal(manual.descriptor.executed, false);
});

test('default execution selects a safe native subagent even when a visible worker is available', () => {
  const assignmentPacket = {
    ...createAssignmentPacket(),
    capability: {
      workRole: 'coding',
      complexity: 'high',
      primaryExecution: 'default',
      childDelegation: 'worker_discretion'
    }
  };
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket,
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/feature'],
      operations: ['spawn'],
      externalEffects: []
    },
    observation: {
      authenticated: true,
      evidenceRef: 'native-first-default-1',
      visibleWorker: {
        visible: true,
        operations: { spawn: true },
        requestedModelEffortControls: true,
        permissionBinding: true,
        pathBinding: true
      },
      nativeSubagent: {
        supported: true,
        visible: false,
        operations: { spawn: true }
      }
    }
  });

  assert.equal(result.routeEvidence.routeKind, 'native_subagent');
  assert.equal(result.routeEvidence.fallbackReason, null);
  assert.deepEqual(result.descriptor.assignmentPacket, assignmentPacket);
  assert.equal(result.descriptor.packetDigest, routing.packetDigestOf(assignmentPacket));
});

test('native descriptors snapshot the validated packet before binding its digest', () => {
  const assignmentPacket = {
    ...createAssignmentPacket(),
    capability: {
      workRole: 'coding',
      complexity: 'high',
      primaryExecution: 'default',
      childDelegation: 'worker_discretion'
    }
  };
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket,
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/feature'],
      operations: ['spawn'],
      externalEffects: []
    },
    observation: {
      authenticated: true,
      evidenceRef: 'native-packet-snapshot-1',
      nativeSubagent: {
        supported: true,
        visible: false,
        operations: { spawn: true }
      }
    }
  });
  const descriptorPacket = result.descriptor.assignmentPacket;
  const descriptorDigest = result.descriptor.packetDigest;

  assignmentPacket.currentSlice.name = 'mutated-after-routing';
  assignmentPacket.capability.complexity = 'max';
  assignmentPacket.allowedOperations.files.push('harness/trio/core/routing.mjs');

  assert.notEqual(descriptorPacket, assignmentPacket);
  assert.equal(descriptorPacket.currentSlice.name, 'wave-4-host-routing');
  assert.equal(descriptorPacket.capability.complexity, 'high');
  assert.deepEqual(descriptorPacket.allowedOperations.files, ['harness/trio/hosts/generic.mjs']);
  assert.equal(Object.isFrozen(descriptorPacket), true);
  assert.equal(Object.isFrozen(descriptorPacket.currentSlice), true);
  assert.equal(Object.isFrozen(descriptorPacket.allowedOperations.files), true);
  assert.equal(descriptorDigest, routing.packetDigestOf(descriptorPacket));
});

test('packet aliases retain their native delegation policy', () => {
  const packet = {
    ...createAssignmentPacket(),
    capability: {
      workRole: 'coding',
      complexity: 'high',
      primaryExecution: 'default',
      childDelegation: 'prohibited'
    }
  };
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    packet,
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/feature'],
      operations: ['spawn'],
      externalEffects: []
    },
    observation: {
      authenticated: true,
      evidenceRef: 'native-packet-alias-1',
      nativeSubagent: {
        supported: true,
        visible: false,
        operations: { spawn: true }
      }
    }
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.routeEvidence.fallbackReason, 'child_delegation_prohibited');
});

test('packet aliases retain their strict visible-only topology', () => {
  const packet = {
    ...createAssignmentPacket(),
    capability: {
      workRole: 'coding',
      complexity: 'high',
      primaryExecution: 'visible_worker_required',
      childDelegation: 'worker_discretion'
    }
  };
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    packet,
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/feature'],
      operations: ['spawn'],
      externalEffects: []
    },
    observation: {
      authenticated: true,
      evidenceRef: 'strict-packet-alias-1',
      nativeSubagent: {
        supported: true,
        visible: false,
        operations: { spawn: true }
      }
    }
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.routeEvidence.fallbackReason, 'visible_worker_required_unavailable:visible_unknown');
});

test('spawn routes do not inherit an old visible worker identity, status, or actual model evidence', () => {
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
  const observation = {
    authenticated: true,
    evidenceRef: 'old-visible-worker-observation',
    workerId: 'old-visible-worker',
    status: 'idle',
    actualModel: 'gpt-5.6-luna',
    actualEffort: 'max',
    visibleWorker: {
      visible: true,
      operations: { spawn: true },
      requestedModelEffortControls: true,
      permissionBinding: true,
      pathBinding: true
    },
    nativeSubagent: {
      supported: true,
      visible: false,
      operations: { spawn: true }
    }
  };

  const visible = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: createAssignmentPacket(),
    parentEnvelope,
    childEnvelope,
    observation
  });
  assert.equal(visible.routeEvidence.routeKind, 'visible_worker');
  assert.equal(visible.routeEvidence.workerId, null);
  assert.equal(visible.routeEvidence.status, 'planned');
  assert.equal(visible.routeEvidence.actualModel, 'unknown');
  assert.equal(visible.routeEvidence.actualEffort, 'unknown');

  const native = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: createAssignmentPacket(),
    parentEnvelope,
    childEnvelope,
    observation: {
      ...observation,
      visibleWorker: { ...observation.visibleWorker, requestedModelEffortControls: false }
    }
  });
  assert.equal(native.routeEvidence.routeKind, 'native_subagent');
  assert.equal(native.routeEvidence.workerId, null);
  assert.equal(native.routeEvidence.status, 'planned');
  assert.equal(native.routeEvidence.actualModel, 'unknown');
  assert.equal(native.routeEvidence.actualEffort, 'unknown');

  const manual = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: createAssignmentPacket(),
    parentEnvelope,
    childEnvelope,
    observation: {
      ...observation,
      visibleWorker: { ...observation.visibleWorker, requestedModelEffortControls: false },
      nativeSubagent: { supported: false, visible: false, operations: { spawn: false } }
    }
  });
  assert.equal(manual.routeEvidence.routeKind, 'manual_pending');
  assert.equal(manual.routeEvidence.workerId, null);
  assert.equal(manual.routeEvidence.status, 'manual_pending');
  assert.equal(manual.routeEvidence.actualModel, 'unknown');
  assert.equal(manual.routeEvidence.actualEffort, 'unknown');
});

test('native subagents cannot be selected for non-spawn operations without a native child identity', () => {
  for (const operation of ['continue', 'status', 'interrupt', 'collect']) {
    const result = resolveGenericHostOperation({
      operation,
      requestedWorkerId: 'visible-worker',
      assignmentPacket: createAssignmentPacket(),
      parentEnvelope: {
        permissions: ['workspace'],
        mutablePaths: ['src'],
        operations: [operation],
        externalEffects: []
      },
      childEnvelope: {
        permissions: ['workspace'],
        mutablePaths: ['src/app'],
        operations: [operation],
        externalEffects: []
      },
      observation: {
        authenticated: true,
        evidenceRef: `native-non-spawn-${operation}`,
        workerId: 'visible-worker',
        status: 'idle',
        visibleWorker: {
          visible: true,
          operations: { [operation]: true },
          requestedModelEffortControls: false,
          permissionBinding: true,
          pathBinding: true
        },
        nativeSubagent: {
          supported: true,
          visible: false,
          operations: { [operation]: true }
        }
      }
    });

    assert.equal(result.routeEvidence.routeKind, 'manual_pending', operation);
    assert.equal(result.routeEvidence.workerId, null, operation);
    assert.equal(result.routeEvidence.status, 'manual_pending', operation);
  }
});

test('manual capability evidence preserves observed native support when safety is unbound', () => {
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: createAssignmentPacket(),
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src'] },
    observation: {
      authenticated: true,
      evidenceRef: 'manual-native-evidence',
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
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.routeEvidence.capabilityEvidence.visible, true);
  assert.equal(result.routeEvidence.capabilityEvidence.visibleOperationSupport, 'supported');
  assert.equal(result.routeEvidence.capabilityEvidence.nativeCollaboration, true);
  assert.equal(result.routeEvidence.capabilityEvidence.nativeOperationSupport, 'supported');
  assert.match(result.routeEvidence.fallbackReason, /child_operation_unbound/);
});

test('Codex host adapter normalizes explicit observations without executing an operation', () => {
  const result = resolveCodexHostOperation({
    operation: 'status',
    workRole: 'chief',
    requestedWorkerId: 'observed-worker-1',
    observation: {
      authenticated: true,
      evidenceRef: 'codex-observation-1',
      actualModel: 'gpt-5.6-luna',
      actualEffort: 'max',
      workerId: 'observed-worker-1',
      status: 'idle',
      capabilities: {
        visible_worker: {
          visible: true,
          operations: { status: true },
          requestedModelEffortControls: true,
          permissionBinding: true,
          pathBinding: true
        }
      }
    },
    permissionEnvelope: {
      permissions: ['observe'],
      operations: ['status'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: [] }
  });

  assert.equal(result.routeEvidence.routeKind, 'visible_worker');
  assert.equal(result.routeEvidence.workerId, 'observed-worker-1');
  assert.equal(result.routeEvidence.actualModel, 'gpt-5.6-luna');
  assert.equal(result.routeEvidence.actualEffort, 'max');
  assert.equal(result.descriptor.executed, false);
  assert.deepEqual(result.descriptor.writes, []);
});

test('Host capability support is operation-scoped across supported, unsupported, and unknown states', () => {
  const base = {
    assignmentPacket: createAssignmentPacket(),
    observation: {
      authenticated: true,
      evidenceRef: 'operation-scoped-observation-1',
      workerId: 'operation-scoped-worker',
      status: 'idle',
      visibleWorker: {
        visible: true,
        operations: { status: true, collect: false },
        requestedModelEffortControls: true,
        permissionBinding: true,
        pathBinding: true
      }
    },
    permissionEnvelope: { permissions: ['observe'], externalEffects: [] },
    pathEnvelope: { mutablePaths: [] }
  };

  const supported = resolveGenericHostOperation({
    ...base,
    operation: 'status',
    requestedWorkerId: 'operation-scoped-worker',
    permissionEnvelope: { ...base.permissionEnvelope, operations: ['status'] }
  });
  assert.equal(supported.routeEvidence.routeKind, 'visible_worker');

  const unsupported = resolveGenericHostOperation({
    ...base,
    operation: 'collect',
    requestedWorkerId: 'operation-scoped-worker',
    permissionEnvelope: { ...base.permissionEnvelope, operations: ['collect'] }
  });
  assert.equal(unsupported.routeEvidence.routeKind, 'manual_pending');
  assert.match(unsupported.routeEvidence.fallbackReason, /visible_operation_unsupported/);

  const unknown = resolveGenericHostOperation({
    ...base,
    operation: 'interrupt',
    requestedWorkerId: 'operation-scoped-worker',
    permissionEnvelope: { ...base.permissionEnvelope, operations: ['interrupt'] }
  });
  assert.equal(unknown.routeEvidence.routeKind, 'manual_pending');
  assert.match(unknown.routeEvidence.fallbackReason, /visible_operation_unknown/);
  assert.equal(supported.routeEvidence.routeKind, 'visible_worker');
});

test('Host routing ignores unauthenticated and request-side actual model claims', () => {
  const result = resolveGenericHostOperation({
    operation: 'status',
    actualModel: 'gpt-5.6-sol',
    actualEffort: 'ultra',
    assignmentPacket: createAssignmentPacket(),
    observation: {
      authenticated: false,
      actualModel: 'gpt-5.6-terra',
      actualEffort: 'max',
      visibleWorker: { visible: true }
    }
  });

  assert.equal(result.routeEvidence.actualModel, 'unknown');
  assert.equal(result.routeEvidence.actualEffort, 'unknown');
  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
});

test('Host worker candidate status never becomes Chief acceptance', () => {
  const input = {
    operation: 'status',
    workRole: 'chief',
    requestedWorkerId: 'observed-candidate-1',
    observation: {
      authenticated: true,
      evidenceRef: 'candidate-observation-1',
      workerId: 'observed-candidate-1',
      status: 'candidate_done',
      visibleWorker: {
        visible: true,
        operations: { status: true },
        requestedModelEffortControls: true,
        permissionBinding: true,
        pathBinding: true
      }
    },
    permissionEnvelope: { permissions: ['observe'], operations: ['status'], externalEffects: [] },
    pathEnvelope: { mutablePaths: [] }
  };
  const result = resolveGenericHostOperation(input);

  assert.equal(result.routeEvidence.status, 'candidate_done');
  assert.notEqual(result.routeEvidence.status, 'accepted');
  assert.equal(Object.hasOwn(result.descriptor, 'accepted'), false);
  assert.throws(
    () => resolveGenericHostOperation({
      ...input,
      observation: { ...input.observation, status: 'accepted' }
    }),
    /Chief acceptance/i
  );
});

test('Host operation descriptors support spawn, continue, status, interrupt, and collect', () => {
  const operations = ['spawn', 'continue', 'status', 'interrupt', 'collect'];
  for (const operation of operations) {
    const result = resolveGenericHostOperation({
      operation,
      workRole: 'chief',
      ...(operation === 'spawn' ? {} : { requestedWorkerId: 'observed-worker-ops' }),
      observation: {
        authenticated: true,
        evidenceRef: `operation-${operation}-observation`,
        workerId: operation === 'spawn' ? null : 'observed-worker-ops',
        status: 'idle',
        visibleWorker: {
          visible: true,
          operations: Object.fromEntries(operations.map((name) => [name, true])),
          requestedModelEffortControls: true,
          permissionBinding: true,
          pathBinding: true
        }
      },
      permissionEnvelope: { permissions: ['workspace'], operations, externalEffects: [] },
      pathEnvelope: { mutablePaths: [] }
    });

    assert.equal(result.routeEvidence.routeKind, 'visible_worker');
    assert.equal(result.descriptor.operation, operation);
    assert.equal(result.descriptor.executed, false);
    assert.deepEqual(result.descriptor.writes, []);
  }
});

test('strict primary execution selects a visible worker when one is available', () => {
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: {
      ...createAssignmentPacket(),
      capability: {
        workRole: 'chief',
        requestedModel: 'gpt-5.6-sol',
        requestedEffort: 'max',
        primaryExecution: 'visible_worker_required',
        childDelegation: 'prohibited'
      }
    },
    observation: {
      authenticated: true,
      evidenceRef: 'strict-visible-available-1',
      visibleWorker: {
        visible: true,
        operations: { spawn: true },
        requestedModelEffortControls: true,
        permissionBinding: true,
        pathBinding: true
      }
    },
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/app'] }
  });

  assert.equal(result.routeEvidence.routeKind, 'visible_worker');
  assert.equal(result.routeEvidence.status, 'planned');
  assert.equal(result.routeEvidence.fallbackReason, null);
  assert.equal(result.descriptor.executed, false);
});

test('strict primary execution never falls back to a native subagent', () => {
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: {
      ...createAssignmentPacket(),
      capability: {
        workRole: 'chief',
        requestedModel: 'gpt-5.6-sol',
        requestedEffort: 'max',
        primaryExecution: 'visible_worker_required',
        childDelegation: 'prohibited'
      }
    },
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/app'],
      operations: ['spawn'],
      externalEffects: []
    },
    observation: {
      authenticated: true,
      evidenceRef: 'strict-no-native-fallback-1',
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
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.routeEvidence.status, 'manual_pending');
  assert.equal(result.routeEvidence.actualModel, 'unknown');
  assert.equal(result.routeEvidence.actualEffort, 'unknown');
  assert.match(result.routeEvidence.fallbackReason, /visible_worker_required/);
  assert.doesNotMatch(result.routeEvidence.fallbackReason, /native_subagent/);
  assert.equal(result.descriptor.executed, false);
  assert.deepEqual(result.descriptor.writes, []);
  assert.equal(
    result.descriptor.assignmentPacket.capability.primaryExecution,
    'visible_worker_required'
  );
});

test('strict primary execution fails closed when no visible worker capability is observed', () => {
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: {
      ...createAssignmentPacket(),
      capability: {
        workRole: 'chief',
        requestedModel: 'gpt-5.6-sol',
        requestedEffort: 'max',
        primaryExecution: 'visible_worker_required',
        childDelegation: 'prohibited'
      }
    },
    observation: {
      authenticated: true,
      evidenceRef: 'strict-missing-visible-1',
      nativeSubagent: {
        supported: true,
        visible: false,
        operations: { spawn: true }
      }
    },
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src'] }
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.routeEvidence.status, 'manual_pending');
  assert.match(result.routeEvidence.fallbackReason, /visible_worker_required/);
  assert.match(result.routeEvidence.fallbackReason, /visible_unknown|visible_unsupported/);
});

test('non-strict primary execution keeps the visible to native to manual chain unchanged', () => {
  const base = {
    operation: 'spawn',
    assignmentPacket: createAssignmentPacket(),
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/app'],
      operations: ['spawn'],
      externalEffects: []
    }
  };
  const observation = {
    authenticated: true,
    evidenceRef: 'legacy-chain-unchanged-1',
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
  };

  const native = resolveGenericHostOperation({ ...base, observation });
  assert.equal(native.routeEvidence.routeKind, 'native_subagent');
  assert.match(native.routeEvidence.fallbackReason, /visible_model_controls_unbound/);

  const manual = resolveGenericHostOperation({
    ...base,
    observation: {
      ...observation,
      nativeSubagent: { supported: false, visible: false, operations: { spawn: false } }
    }
  });
  assert.equal(manual.routeEvidence.routeKind, 'manual_pending');
});

test('assignment packets carry topology intent inside capability without a new top-level field', () => {
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
  const packet = routing.buildAssignmentPacket({
    ...createAssignmentPacket(),
    capability: {
      workRole: 'chief',
      requestedModel: 'gpt-5.6-sol',
      requestedEffort: 'max',
      primaryExecution: 'visible_worker_required'
    }
  });
  assert.deepEqual(Object.keys(packet), routing.ASSIGNMENT_PACKET_FIELDS);
  assert.equal(packet.capability.primaryExecution, 'visible_worker_required');
});

test('Corleone config renders a named agent with xhigh effort and no fallback model', () => {
  const profile = resolveCorleoneProfile('capo_clemenza');
  assert.equal(profile.name, 'capo_clemenza');
  assert.equal(profile.model, 'opencode-go/deepseek-v4-flash');
  assert.equal(profile.modelReasoningEffort, 'xhigh');
  assert.equal(profile.fallbackModel, null);

  const entry = renderCorleoneAgentEntry('capo_clemenza', '/tmp/host/agents/capo_clemenza.toml');
  assert.match(entry, /\[agents\.capo_clemenza\]/);
  assert.match(entry, /description\s*=\s*"/);
  assert.match(entry, /config_file\s*=\s*"\/tmp\/host\/agents\/capo_clemenza\.toml"/);

  const roleFile = renderCorleoneRoleFile('capo_clemenza');
  assert.match(roleFile, /name\s*=\s*"capo_clemenza"/);
  assert.match(roleFile, /model\s*=\s*"opencode-go\/deepseek-v4-flash"/);
  assert.match(roleFile, /model_reasoning_effort\s*=\s*"xhigh"/);
  assert.match(roleFile, /developer_instructions\s*=\s*"/);
  assert.doesNotMatch(`${entry}\n${roleFile}`, /fallback/i);

  assert.throws(
    () => renderCorleoneAgentEntry('capo_clemenza', ''),
    /requires a role config file path/i
  );
});

test('Corleone instructions forbid redesign, require blocked on missing decisions, and limit delegation to the packet', () => {
  const instructions = resolveCorleoneProfile('underboss_sonny').instructions;
  assert.match(instructions, /execute an already accepted plan/i);
  assert.match(instructions, /do not redesign/i);
  assert.match(instructions, /blocked/i);
  assert.match(instructions, /material decision/i);
  assert.match(instructions, /exact assignment packet/i);
  assert.match(instructions, /grants no permissions/i);
  assert.match(instructions, /unavailable/i);
});

test('capability.childDelegation = prohibited denies any native child route even with a valid child envelope', () => {
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: {
      ...createAssignmentPacket(),
      capability: {
        workRole: 'chief',
        requestedModel: 'gpt-5.6-sol',
        requestedEffort: 'max',
        childDelegation: 'prohibited'
      }
    },
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/app'],
      operations: ['spawn'],
      externalEffects: []
    },
    observation: {
      authenticated: true,
      evidenceRef: 'prohibited-child-denial-1',
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
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.notEqual(result.routeEvidence.routeKind, 'native_subagent');
  assert.match(result.routeEvidence.fallbackReason, /child_delegation|prohibited/i);
  assert.equal(result.descriptor.executed, false);
  assert.deepEqual(result.descriptor.writes, []);
});

test('strict visible-worker-required packet without an explicit childDelegation fails closed', () => {
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: {
      ...createAssignmentPacket(),
      capability: {
        workRole: 'chief',
        requestedModel: 'gpt-5.6-sol',
        requestedEffort: 'max',
        primaryExecution: 'visible_worker_required'
      }
    },
    observation: {
      authenticated: true,
      evidenceRef: 'strict-missing-child-delegation-1',
      visibleWorker: {
        visible: true,
        operations: { spawn: true },
        requestedModelEffortControls: true,
        permissionBinding: true,
        pathBinding: true
      }
    },
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/app'] }
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.match(result.routeEvidence.fallbackReason, /child_delegation|delegation policy/i);
  assert.equal(result.descriptor.executed, false);
  assert.deepEqual(result.descriptor.writes, []);
});

test('explicit worker_discretion and encouraged delegation are admitted on strict packets', () => {
  for (const childDelegation of ['worker_discretion', 'encouraged']) {
    const result = resolveGenericHostOperation({
      operation: 'spawn',
      assignmentPacket: {
        ...createAssignmentPacket(),
        capability: {
          workRole: 'chief',
          requestedModel: 'gpt-5.6-sol',
          requestedEffort: 'max',
          primaryExecution: 'visible_worker_required',
          childDelegation
        }
      },
      observation: {
        authenticated: true,
        evidenceRef: `admitted-${childDelegation}-1`,
        visibleWorker: {
          visible: true,
          operations: { spawn: true },
          requestedModelEffortControls: true,
          permissionBinding: true,
          pathBinding: true
        }
      },
      permissionEnvelope: {
        permissions: ['workspace'],
        operations: ['spawn'],
        externalEffects: []
      },
      pathEnvelope: { mutablePaths: ['src/app'] }
    });

    assert.equal(result.routeEvidence.routeKind, 'visible_worker', childDelegation);
    assert.equal(result.descriptor.executed, false, childDelegation);
  }
});

test('legacy non-strict packets without childDelegation preserve native subagent compatibility', () => {
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: createAssignmentPacket(),
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/app'],
      operations: ['spawn'],
      externalEffects: []
    },
    observation: {
      authenticated: true,
      evidenceRef: 'legacy-non-strict-compat-1',
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
  });

  assert.equal(result.routeEvidence.routeKind, 'native_subagent');
  assert.equal(result.descriptor.executed, false);
});

test('unknown childDelegation values fail closed before native child acceptance', () => {
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: {
      ...createAssignmentPacket(),
      capability: {
        workRole: 'chief',
        requestedModel: 'gpt-5.6-sol',
        requestedEffort: 'max',
        childDelegation: 'unknown-mode'
      }
    },
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/app'],
      operations: ['spawn'],
      externalEffects: []
    },
    observation: {
      authenticated: true,
      evidenceRef: 'unknown-child-delegation-1',
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
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.notEqual(result.routeEvidence.routeKind, 'native_subagent');
  assert.equal(result.descriptor.executed, false);
});

test('unknown capability.executionMode values fail closed before native child acceptance', () => {
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: {
      ...createAssignmentPacket(),
      capability: {
        workRole: 'chief',
        requestedModel: 'gpt-5.6-sol',
        requestedEffort: 'max',
        executionMode: 'unknown-mode'
      }
    },
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/app'],
      operations: ['spawn'],
      externalEffects: []
    },
    observation: {
      authenticated: true,
      evidenceRef: 'unknown-execution-mode-child-1',
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
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.notEqual(result.routeEvidence.routeKind, 'native_subagent');
  assert.equal(result.descriptor.executed, false);
  assert.deepEqual(result.descriptor.writes, []);
});

test('unknown primary execution mode values fail closed', () => {
  assert.throws(
    () => resolveGenericHostOperation({
      operation: 'spawn',
      assignmentPacket: {
        ...createAssignmentPacket(),
        capability: {
          workRole: 'chief',
          requestedModel: 'gpt-5.6-sol',
          requestedEffort: 'max',
          primaryExecution: 'unknown-mode'
        }
      },
      observation: { authenticated: true, evidenceRef: 'unknown-execution-mode-1' },
      permissionEnvelope: {
        permissions: ['workspace'],
        operations: ['spawn'],
        externalEffects: []
      },
      pathEnvelope: { mutablePaths: [] }
    }),
    /Unknown primaryExecution kind/i
  );
});

test('static role configuration alone grants no dynamic child permission', () => {
  assert.equal(Object.hasOwn(resolveCorleoneProfile('buttonman_neri'), 'childDelegation'), false);

  const entry = renderCorleoneAgentEntry('buttonman_neri', '/tmp/host/agents/buttonman_neri.toml');
  const roleFile = renderCorleoneRoleFile('buttonman_neri');
  assert.doesNotMatch(`${entry}\n${roleFile}`, /childDelegation|child_delegation|delegation\s*=\s*"allowed"/i);

  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: {
      ...createAssignmentPacket(),
      capability: {
        workRole: 'chief',
        requestedModel: 'gpt-5.6-sol',
        requestedEffort: 'max',
        childDelegation: 'prohibited'
      }
    },
    parentEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src'],
      operations: ['spawn'],
      externalEffects: []
    },
    childEnvelope: {
      permissions: ['workspace'],
      mutablePaths: ['src/app'],
      operations: ['spawn'],
      externalEffects: []
    },
    observation: {
      authenticated: true,
      evidenceRef: 'static-role-no-dynamic-permission-1',
      workerId: 'buttonman-neri-1',
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
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.descriptor.executed, false);
});

test('Host routing consumes the validated packet policy and rejects conflicting outer model input', () => {
  const packet = {
    ...createAssignmentPacket(),
    capability: {
      workRole: 'coding',
      complexity: 'xhigh',
      primaryExecution: 'visible_worker_required',
      childDelegation: 'prohibited'
    }
  };
  const base = {
    operation: 'spawn',
    assignmentPacket: packet,
    observation: {
      authenticated: true,
      evidenceRef: 'economic-visible-1',
      visibleWorker: {
        visible: true,
        operations: { spawn: true },
        requestedModelEffortControls: true,
        permissionBinding: true,
        pathBinding: true
      }
    },
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/app'] }
  };

  const result = resolveGenericHostOperation(base);
  assert.equal(result.routeEvidence.routeKind, 'visible_worker');
  assert.equal(result.routeEvidence.requestedModel, 'opencode-go/deepseek-v4-flash');
  assert.equal(result.routeEvidence.requestedEffort, 'xhigh');
  assert.equal(result.routeEvidence.actualModel, 'unknown');
  assert.equal(result.routeEvidence.actualEffort, 'unknown');
  assert.deepEqual(result.descriptor.assignmentPacket, packet);
  assert.match(result.descriptor.packetDigest, /^[0-9a-f]{64}$/);
  assert.equal(result.descriptor.executed, false);
  assert.equal(Object.hasOwn(result.descriptor, 'threadId'), false);

  assert.throws(
    () => resolveGenericHostOperation({ ...base, requestedModel: 'gpt-5.6-sol' }),
    /conflicts with the validated packet policy/i
  );
  assert.throws(
    () => resolveGenericHostOperation({ ...base, requestedEffort: 'max' }),
    /conflicts with the validated packet policy/i
  );
});

test('packet capability validation runs before every Host route decision', () => {
  const visibleObservation = {
    authenticated: true,
    evidenceRef: 'packet-validation-visible-1',
    visibleWorker: {
      visible: true,
      operations: { spawn: true },
      requestedModelEffortControls: true,
      permissionBinding: true,
      pathBinding: true
    }
  };
  const envelopes = {
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/app'] }
  };

  assert.throws(
    () => resolveGenericHostOperation({
      operation: 'spawn',
      assignmentPacket: {
        ...createAssignmentPacket(),
        capability: { workRole: 'deep-reasoning' }
      },
      observation: visibleObservation,
      ...envelopes
    }),
    /unknown work role/i
  );
  assert.throws(
    () => resolveGenericHostOperation({
      operation: 'spawn',
      assignmentPacket: {
        ...createAssignmentPacket(),
        capability: { workRole: 'coding', complexity: 'xhigh', executionMode: 'worker_self_goal' }
      },
      observation: visibleObservation,
      ...envelopes
    }),
    /goal contract/i
  );
  assert.throws(
    () => resolveGenericHostOperation({
      operation: 'spawn',
      assignmentPacket: {
        ...createAssignmentPacket(),
        capability: { workRole: 'coding', complexity: 'ultra' }
      },
      observation: visibleObservation,
      ...envelopes
    }),
    /complexity/i
  );
});

test('host operations fail closed without a declared work role or execution complexity', () => {
  const observation = {
    authenticated: true,
    evidenceRef: 'host-negative-1',
    visibleWorker: {
      visible: true,
      operations: { spawn: true },
      requestedModelEffortControls: true,
      permissionBinding: true,
      pathBinding: true
    }
  };
  const envelopes = {
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/app'] }
  };

  assert.throws(
    () => resolveGenericHostOperation({
      operation: 'spawn',
      assignmentPacket: {
        ...createAssignmentPacket(),
        capability: {}
      },
      observation,
      ...envelopes
    }),
    /declared workRole/i
  );
  assert.throws(
    () => resolveGenericHostOperation({
      operation: 'spawn',
      assignmentPacket: {
        ...createAssignmentPacket(),
        capability: { workRole: 'coding' }
      },
      observation,
      ...envelopes
    }),
    /exactly one valid complexity/i
  );
  assert.throws(
    () => resolveGenericHostOperation({
      operation: 'spawn',
      assignmentPacket: {
        ...createAssignmentPacket(),
        capability: { workRole: 'planning', complexity: 'max' }
      },
      observation,
      ...envelopes
    }),
    /execution-scoped/i
  );
  assert.throws(
    () => resolveGenericHostOperation({
      operation: 'spawn',
      requestedModel: 'gpt-5.6-luna',
      requestedEffort: 'max',
      observation,
      ...envelopes
    }),
    /declared workRole/i
  );
});

test('packet digest authentication gates actual worker facts while identity binding stays exact', () => {
  const packet = createAssignmentPacket();
  const observationBase = {
    authenticated: true,
    evidenceRef: 'digest-observation-1',
    workerId: 'observed-digest-worker',
    status: 'idle',
    actualModel: 'gpt-5.6-luna',
    actualEffort: 'max',
    visibleWorker: {
      visible: true,
      operations: { status: true },
      requestedModelEffortControls: true,
      permissionBinding: true,
      pathBinding: true
    }
  };
  const base = {
    operation: 'status',
    requestedWorkerId: 'observed-digest-worker',
    assignmentPacket: packet,
    permissionEnvelope: {
      permissions: ['observe'],
      operations: ['status'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: [] }
  };

  const spawn = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: packet,
    observation: observationBase,
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/app'] }
  });
  const digest = spawn.descriptor.packetDigest;
  assert.match(digest, /^[0-9a-f]{64}$/);

  const unbound = resolveGenericHostOperation({
    ...base,
    observation: { ...observationBase, evidenceRef: 'digest-unbound-1' }
  });
  assert.equal(unbound.routeEvidence.routeKind, 'visible_worker');
  assert.equal(unbound.routeEvidence.workerId, 'observed-digest-worker');
  assert.equal(unbound.routeEvidence.actualModel, 'unknown');
  assert.equal(unbound.routeEvidence.actualEffort, 'unknown');

  const mismatch = resolveGenericHostOperation({
    ...base,
    observation: {
      ...observationBase,
      evidenceRef: 'digest-mismatch-1',
      packetDigest: '0'.repeat(64)
    }
  });
  assert.equal(mismatch.routeEvidence.actualModel, 'unknown');
  assert.equal(mismatch.routeEvidence.actualEffort, 'unknown');

  const bound = resolveGenericHostOperation({
    ...base,
    observation: {
      ...observationBase,
      evidenceRef: 'digest-bound-1',
      packetDigest: digest
    }
  });
  assert.equal(bound.routeEvidence.workerId, 'observed-digest-worker');
  assert.equal(bound.routeEvidence.actualModel, 'gpt-5.6-luna');
  assert.equal(bound.routeEvidence.actualEffort, 'max');
});

test('child requests must carry a bound Flash profile no wider than the parent', () => {
  const visibleObservation = {
    authenticated: true,
    evidenceRef: 'child-visible-1',
    nativeSubagent: {
      supported: true,
      visible: false,
      operations: { spawn: true }
    },
    visibleWorker: {
      visible: true,
      operations: { spawn: true },
      requestedModelEffortControls: true,
      permissionBinding: true,
      pathBinding: true
    }
  };
  const envelopes = {
    parentEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: [],
      mutablePaths: ['src']
    },
    childEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: [],
      mutablePaths: ['src/app']
    }
  };
  const childPacket = (capability) => ({ ...createAssignmentPacket(), capability });

  const nonFlash = resolveGenericHostOperation({
    operation: 'spawn',
    isChild: true,
    parentEffort: 'xhigh',
    assignmentPacket: childPacket({
      workRole: 'chief',
      requestedModel: 'gpt-5.6-sol',
      requestedEffort: 'max'
    }),
    observation: visibleObservation,
    ...envelopes
  });
  assert.equal(nonFlash.routeEvidence.routeKind, 'manual_pending');
  assert.match(nonFlash.routeEvidence.fallbackReason, /child_profile_unbound:model/);
  assert.equal(nonFlash.routeEvidence.actualModel, 'unknown');
  assert.equal(nonFlash.descriptor.executed, false);
  assert.deepEqual(nonFlash.descriptor.assignmentPacket, nonFlash.descriptor.assignmentPacket);

  const widened = resolveGenericHostOperation({
    operation: 'spawn',
    isChild: true,
    parentEffort: 'xhigh',
    assignmentPacket: childPacket({ workRole: 'coding', complexity: 'max' }),
    observation: visibleObservation,
    ...envelopes
  });
  assert.equal(widened.routeEvidence.routeKind, 'manual_pending');
  assert.match(widened.routeEvidence.fallbackReason, /child_profile_widened:max_over_xhigh/);

  const unbound = resolveGenericHostOperation({
    operation: 'spawn',
    isChild: true,
    assignmentPacket: childPacket({ workRole: 'coding', complexity: 'xhigh' }),
    observation: visibleObservation,
    ...envelopes
  });
  assert.equal(unbound.routeEvidence.routeKind, 'manual_pending');
  assert.match(unbound.routeEvidence.fallbackReason, /child_profile_unbound:parent_effort/);

  const admissible = resolveGenericHostOperation({
    operation: 'spawn',
    isChild: true,
    parentEffort: 'xhigh',
    assignmentPacket: childPacket({
      workRole: 'coding',
      complexity: 'xhigh',
      childDelegation: 'worker_discretion'
    }),
    observation: visibleObservation,
    ...envelopes
  });
  assert.equal(
    admissible.routeEvidence.routeKind,
    'native_subagent',
    admissible.routeEvidence.fallbackReason
  );
  assert.equal(admissible.routeEvidence.requestedModel, 'opencode-go/deepseek-v4-flash');
  assert.equal(admissible.routeEvidence.requestedEffort, 'xhigh');
  assert.equal(admissible.descriptor.executed, false);
});

test('a strict unavailable Host returns manual_pending with the intact packet and digest', () => {
  const packet = {
    ...createAssignmentPacket(),
    capability: {
      workRole: 'coding',
      complexity: 'xhigh',
      primaryExecution: 'visible_worker_required',
      childDelegation: 'prohibited'
    }
  };
  const result = resolveGenericHostOperation({
    operation: 'spawn',
    assignmentPacket: packet,
    observation: {
      authenticated: true,
      evidenceRef: 'strict-unavailable-1',
      nativeSubagent: { supported: true, visible: false, operations: { spawn: true } }
    },
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src'] }
  });

  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.routeEvidence.status, 'manual_pending');
  assert.equal(result.routeEvidence.requestedModel, 'opencode-go/deepseek-v4-flash');
  assert.equal(result.routeEvidence.requestedEffort, 'xhigh');
  assert.equal(result.routeEvidence.actualModel, 'unknown');
  assert.match(result.routeEvidence.fallbackReason, /visible_worker_required/);
  assert.deepEqual(result.descriptor.assignmentPacket, packet);
  assert.match(result.descriptor.packetDigest, /^[0-9a-f]{64}$/);
  assert.equal(result.descriptor.executed, false);
  assert.deepEqual(result.descriptor.writes, []);
});

test('Corleone roster generates every named and ordinal role config with calibrated Flash profiles', () => {
  assert.deepEqual(CORLEONE_AGENT_TYPES, [
    'don_michael',
    'underboss_sonny',
    'consigliere_tom',
    'capo_clemenza',
    'capo_lampone',
    'buttonman_neri',
    'buttonman_brasi',
    'soldato_cicci',
    'don',
    'underboss',
    'consigliere',
    'capo',
    'buttonman',
    'soldato'
  ]);
  for (const effort of ['high', 'xhigh', 'max']) {
    for (const agentType of CORLEONE_AGENT_TYPES) {
      const profile = resolveCorleoneProfile(agentType, effort);
      assert.equal(profile.name, agentType);
      assert.equal(profile.model, 'opencode-go/deepseek-v4-flash');
      assert.equal(profile.modelReasoningEffort, effort);
      assert.equal(profile.fallbackModel, null);
    }
  }
  const rendered = renderCorleoneRosterConfig('/tmp/host/agents');
  assert.equal(rendered.length, CORLEONE_AGENT_TYPES.length);
  assert.match(rendered.at(-1).agentEntry, /\[agents\.soldato\]/);
  assert.match(rendered.at(-1).roleFile, /name\s*=\s*"soldato"/);
  assert.deepEqual(
    Object.fromEntries(rendered.map(({ agentType, roleFile }) => [
      agentType,
      roleFile.match(/model_reasoning_effort\s*=\s*"(high|xhigh|max)"/)[1]
    ])),
    {
      don_michael: 'xhigh',
      underboss_sonny: 'max',
      consigliere_tom: 'xhigh',
      capo_clemenza: 'xhigh',
      capo_lampone: 'xhigh',
      buttonman_neri: 'high',
      buttonman_brasi: 'high',
      soldato_cicci: 'high',
      don: 'xhigh',
      underboss: 'max',
      consigliere: 'xhigh',
      capo: 'xhigh',
      buttonman: 'high',
      soldato: 'high'
    }
  );
  assert.doesNotMatch(JSON.stringify(rendered), /fallback/i);

  assert.throws(() => resolveCorleoneProfile('capo_clemenza', 'ultra'), /profile/i);
  assert.throws(() => renderCorleoneRoleFile('capo_clemenza', 'ultra'), /profile/i);
  assert.throws(() => renderCorleoneRosterConfig('', 'xhigh'), /config directory/i);
});

test('adapter vocabulary reserves claude_code and pi as unimplemented while Codex renders a Corleone handoff', () => {
  const packet = {
    ...createAssignmentPacket(),
    capability: {
      workRole: 'coding',
      complexity: 'xhigh',
      requestedModel: 'opencode-go/deepseek-v4-flash',
      requestedEffort: 'xhigh'
    }
  };
  const handoff = renderCodexHandoffRequest({
    operation: 'spawn',
    packet,
    packetDigest: routing.packetDigestOf(packet)
  });

  assert.equal(handoff.provider, 'codex');
  assert.equal(handoff.role, 'capo_clemenza');
  assert.deepEqual(handoff.workerIdentity, {
    agentType: 'capo_clemenza',
    displayName: 'Capo Peter Clemenza',
    tier: 'capo',
    ordinal: 1
  });
  assert.equal(handoff.profile.modelReasoningEffort, 'xhigh');
  assert.equal(handoff.profile.model, 'opencode-go/deepseek-v4-flash');
  assert.equal(handoff.operation, 'spawn');
  assert.deepEqual(handoff.packet, packet);
  assert.equal(handoff.packetDigest, routing.packetDigestOf(packet));
  assert.equal(handoff.executed, false);

  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'spawn',
      packet,
      packetDigest: routing.packetDigestOf(packet),
      workerIdentity: allocateCorleoneCallsign({ tier: 'don', ordinal: 1 })
    }),
    /spawn.*workerIdentity|workerIdentity.*spawn/i
  );

  const frozenCapo = allocateCorleoneCallsign({ tier: 'capo', ordinal: 3 });
  const resumed = renderCodexHandoffRequest({
    operation: 'continue',
    packet,
    packetDigest: routing.packetDigestOf(packet),
    workerIdentity: frozenCapo
  });
  assert.equal(resumed.role, 'capo');
  assert.deepEqual(resumed.workerIdentity, frozenCapo);
  assert.equal(resumed.profile.modelReasoningEffort, 'xhigh');

  const strictPacket = {
    ...packet,
    capability: {
      ...packet.capability,
      complexity: 'high',
      requestedEffort: 'high',
      primaryExecution: 'visible_worker_required'
    }
  };
  const strict = renderCodexHandoffRequest({
    operation: 'spawn',
    packet: strictPacket,
    packetDigest: routing.packetDigestOf(strictPacket)
  });
  assert.equal(strict.role, 'don_michael');
  assert.equal(strict.workerIdentity.displayName, 'Don Michael Corleone');
  assert.equal(strict.profile.modelReasoningEffort, 'high');
  assert.equal(Object.isFrozen(strict.packet), true);
  assert.equal(Object.isFrozen(strict.packet.capability), true);
  assert.equal(strict.packetDigest, routing.packetDigestOf(strict.packet));
  const resumedStrict = renderCodexHandoffRequest({
    operation: 'continue',
    packet: strictPacket,
    packetDigest: routing.packetDigestOf(strictPacket),
    workerIdentity: strict.workerIdentity
  });
  assert.deepEqual(resumedStrict.workerIdentity, strict.workerIdentity);
  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'continue',
      packet: strictPacket,
      packetDigest: routing.packetDigestOf(strictPacket),
      workerIdentity: frozenCapo
    }),
    /frozen.*tier|tier.*frozen/i
  );
  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'continue',
      packet: strictPacket,
      packetDigest: routing.packetDigestOf(strictPacket),
      workerIdentity: allocateCorleoneCallsign({ tier: 'don', ordinal: 2 })
    }),
    /strict.*Don Michael|Don Michael.*ordinal/i
  );
  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'spawn',
      packet: strictPacket,
      packetDigest: routing.packetDigestOf(strictPacket),
      ordinal: 2
    }),
    /strict.*Don Michael|Don Michael.*ordinal/i
  );
  assert.equal(adapterStatus('codex'), 'implemented');
  assert.equal(adapterStatus('claude_code'), 'unimplemented');
  assert.equal(adapterStatus('pi'), 'unimplemented');
  assert.throws(() => adapterStatus('unknown-adapter'), /adapter/i);
});

test('Codex handoffs bind the canonical packet digest and reject unknown lifecycle operations', () => {
  const packet = {
    ...createAssignmentPacket(),
    capability: { workRole: 'coding', complexity: 'high' }
  };
  const frozenIdentity = allocateCorleoneCallsign({ tier: 'capo', ordinal: 1 });

  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'spawn',
      packet,
      packetDigest: 'a'.repeat(64)
    }),
    /packet digest.*match/i
  );
  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'spawn ',
      packet,
      packetDigest: routing.packetDigestOf(packet),
      workerIdentity: frozenIdentity
    }),
    /supported.*lifecycle operation/i
  );
  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'unknown',
      packet,
      packetDigest: routing.packetDigestOf(packet),
      workerIdentity: frozenIdentity
    }),
    /supported.*lifecycle operation/i
  );
  // Non-spawn lifecycle operations derive the frozen Corleone identity from
  // the Assignment Packet when the caller omits workerIdentity (packet-first
  // protocol). coding/high selects Button Man Al Neri at ordinal 1.
  const packetDerived = renderCodexHandoffRequest({
    operation: 'continue',
    packet,
    packetDigest: routing.packetDigestOf(packet)
  });
  assert.equal(packetDerived.role, 'buttonman_neri');
  assert.deepEqual(packetDerived.workerIdentity, {
    agentType: 'buttonman_neri',
    displayName: 'Button Man Al Neri',
    tier: 'buttonman',
    ordinal: 1
  });
  assert.equal(packetDerived.profile.modelReasoningEffort, 'high');
  assert.equal(packetDerived.operation, 'continue');
  for (const operation of ['status', 'interrupt', 'collect']) {
    const derived = renderCodexHandoffRequest({
      operation,
      packet,
      packetDigest: routing.packetDigestOf(packet)
    });
    assert.equal(derived.role, 'buttonman_neri', operation);
  }
  // An explicitly frozen identity remains authoritative for non-spawn calls.
  const frozenButtonman = allocateCorleoneCallsign({ tier: 'buttonman', ordinal: 1 });
  const explicit = renderCodexHandoffRequest({
    operation: 'continue',
    packet,
    packetDigest: routing.packetDigestOf(packet),
    workerIdentity: frozenButtonman
  });
  assert.deepEqual(explicit.workerIdentity, frozenButtonman);
});

test('Corleone handoffs bind Flash effort to the execution packet economic policy', () => {
  const packet = (capability) => ({
    ...createAssignmentPacket(),
    capability
  });
  const researchPacket = packet({ workRole: 'searching', complexity: 'high' });
  const repetitivePacket = packet({ workRole: 'repetitive_execution', complexity: 'max' });
  const highCodingPacket = packet({ workRole: 'coding', complexity: 'high' });
  const mismatchedEffortPacket = packet({
    workRole: 'coding',
    complexity: 'high',
    requestedEffort: 'xhigh'
  });

  const research = renderCodexHandoffRequest({
    operation: 'spawn',
    packet: researchPacket,
    packetDigest: routing.packetDigestOf(researchPacket)
  });
  assert.equal(research.role, 'consigliere_tom');
  assert.equal(research.profile.modelReasoningEffort, 'high');

  const repetitive = renderCodexHandoffRequest({
    operation: 'spawn',
    packet: repetitivePacket,
    packetDigest: routing.packetDigestOf(repetitivePacket)
  });
  assert.equal(repetitive.role, 'soldato_cicci');
  assert.equal(repetitive.profile.modelReasoningEffort, 'max');

  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'spawn',
      packet: highCodingPacket,
      packetDigest: routing.packetDigestOf(highCodingPacket),
      effort: 'xhigh'
    }),
    /conflicts with the validated packet policy/i
  );
  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'spawn',
      packet: highCodingPacket,
      packetDigest: routing.packetDigestOf(highCodingPacket),
      effort: 123
    }),
    /effort.*high.*xhigh.*max/i
  );
  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'spawn',
      packet: mismatchedEffortPacket,
      packetDigest: routing.packetDigestOf(mismatchedEffortPacket)
    }),
    /with complexity high requests effort high/i
  );
});

test('Corleone lifecycle handoffs reject a Chief packet even with a frozen roster identity', () => {
  const chiefPacket = createAssignmentPacket();
  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'continue',
      packet: chiefPacket,
      packetDigest: routing.packetDigestOf(chiefPacket),
      workerIdentity: allocateCorleoneCallsign({ tier: 'capo', ordinal: 1 })
    }),
    /supported execution workRole|supported execution workRole and complexity/i
  );
  // A non-spawn call without a frozen identity must fail closed when the
  // packet capability cannot select a Corleone execution role.
  assert.throws(
    () => renderCodexHandoffRequest({
      operation: 'continue',
      packet: chiefPacket,
      packetDigest: routing.packetDigestOf(chiefPacket)
    }),
    /supported execution workRole|supported execution workRole and complexity/i
  );
});

// ---------------------------------------------------------------------------
// Provider-neutral permission intent -> Codex adapter mapping (Slice B).
// ---------------------------------------------------------------------------

function adapterPacketDigest(packet) {
  const probe = resolveCodexHostOperation({
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

test('Codex adapter maps provider-neutral permission intent without claiming Host application', () => {
  assert.equal(typeof codexAdapter.resolveCodexPermissionIntent, 'function');
  const packet = createAssignmentPacket();
  const result = codexAdapter.resolveCodexPermissionIntent({
    assignmentPacket: packet,
    targetPaths: ['harness/trio/hosts/generic.mjs'],
    permissionIntent: { sandboxMode: 'bounded', writableRoots: ['harness/trio/hosts'] },
    approval: { kind: 'user', granted: true }
  });

  assert.equal(result.provider, 'codex');
  assert.deepEqual(result.requested, {
    sandboxMode: 'bounded',
    writableRoots: ['harness/trio/hosts'],
    approval: { kind: 'user', granted: true },
    approvalPolicy: null
  });

  assert.equal(result.actual.authenticated, false);
  assert.equal(result.actual.sandbox, 'unknown');
  assert.equal(result.actual.writableRoots, 'unknown');
  assert.equal(result.actual.reviewer, 'unknown');

  assert.equal(result.outcome.kind, 'manual_pending');
  assert.equal(result.outcome.executed, false);
  assert.deepEqual(result.outcome.writes, []);
  assert.match(result.outcome.blocker, /unbound|unknown/);
  assert.match(result.outcome.resumeCondition, /authenticated Host/i);

  assert.deepEqual(result.expression.writableRoots, ['harness/trio/hosts']);
  assert.equal(result.expression.applied, false);
  assert.equal(Object.hasOwn(result.expression, 'actualSandbox'), false);
  assert.equal(Object.hasOwn(result, 'workerId'), false);
  assert.equal(Object.hasOwn(result, 'retroactive'), false);
});

test('Codex adapter keeps an out-of-scope request blocked before any manual gate', () => {
  const packet = createAssignmentPacket();
  const result = codexAdapter.resolveCodexPermissionIntent({
    assignmentPacket: packet,
    targetPaths: ['outside/the/allowlist'],
    permissionIntent: { sandboxMode: 'full_access', writableRoots: [] },
    approval: { kind: 'user', granted: true }
  });
  assert.equal(result.outcome.kind, 'blocked');
  assert.equal(result.outcome.stage, 'scope');
  assert.match(result.outcome.reason, /outside_assignment_scope/);
  assert.equal(result.outcome.executed, false);
  assert.equal(result.actual.sandbox, 'unknown');
  assert.equal(Object.hasOwn(result, 'workerId'), false);
});

test('Codex adapter surfaces bound actual permission only with authenticated digest evidence and never applies it', () => {
  const packet = createAssignmentPacket();
  const result = codexAdapter.resolveCodexPermissionIntent({
    assignmentPacket: packet,
    targetPaths: ['harness/trio/hosts/generic.mjs'],
    permissionIntent: { sandboxMode: 'bounded', writableRoots: ['harness/trio/hosts'] },
    approval: null,
    approvalPolicy: 'never',
    hostObservation: {
      authenticated: true,
      evidenceRef: 'bound-permission-1',
      packetDigest: adapterPacketDigest(packet),
      actualSandbox: 'bounded',
      actualWritableRoots: ['harness/trio/hosts/generic.mjs'],
      actualReviewer: 'human',
      actualApprovalPolicy: 'never'
    }
  });
  assert.deepEqual(result.requested.writableRoots, ['harness/trio/hosts']);
  assert.equal(result.actual.authenticated, true);
  assert.equal(result.actual.sandbox, 'bounded');
  assert.deepEqual(result.actual.writableRoots, ['harness/trio/hosts/generic.mjs']);
  assert.equal(result.actual.reviewer, 'human');
  assert.equal(result.outcome.kind, 'codex_permission_expression');
  assert.equal(result.outcome.decision, 'allowed');
  assert.equal(result.expression.applied, false);
  assert.equal(Object.hasOwn(result, 'workerId'), false);
  assert.equal(Object.hasOwn(result, 'retroactive'), false);
});

test('Codex adapter treats a missing requested approval policy as unbound even with fully authenticated actual evidence', () => {
  const packet = createAssignmentPacket();
  const result = codexAdapter.resolveCodexPermissionIntent({
    assignmentPacket: packet,
    targetPaths: ['harness/trio/hosts/generic.mjs'],
    permissionIntent: { sandboxMode: 'full_access', writableRoots: [] },
    hostObservation: {
      authenticated: true,
      evidenceRef: 'full-auth-no-policy-1',
      packetDigest: adapterPacketDigest(packet),
      actualSandbox: 'full_access',
      actualWritableRoots: [],
      actualReviewer: 'human',
      actualApprovalPolicy: 'on-request'
    }
  });
  assert.equal(result.outcome.kind, 'manual_pending');
  assert.equal(result.outcome.blocker, 'worker_approval_policy_unbound');
  assert.equal(result.outcome.executed, false);
  assert.deepEqual(result.outcome.writes, []);
  assert.equal(result.requested.approvalPolicy, null);
  assert.equal(result.requested.sandboxMode, 'full_access');
  assert.equal(result.actual.approvalPolicy, 'on-request');
  assert.equal(result.expression.applied, false);
  assert.equal(result.expression.requestedApprovalPolicy, null);
  assert.match(result.outcome.resumeCondition, /approval policy/i);
});

test('Codex adapter keeps partial authenticated evidence manual_pending when writable roots are absent', () => {
  const packet = createAssignmentPacket();
  const result = codexAdapter.resolveCodexPermissionIntent({
    assignmentPacket: packet,
    targetPaths: ['harness/trio/hosts/generic.mjs'],
    permissionIntent: { sandboxMode: 'bounded', writableRoots: ['harness/trio/hosts'] },
    approval: null,
    hostObservation: {
      authenticated: true,
      evidenceRef: 'partial-evidence-a',
      packetDigest: adapterPacketDigest(packet),
      actualSandbox: 'bounded'
      // actualWritableRoots deliberately absent
    }
  });
  assert.deepEqual(result.requested.writableRoots, ['harness/trio/hosts']);
  assert.equal(result.actual.authenticated, true);
  assert.equal(result.actual.sandbox, 'bounded');
  assert.equal(result.actual.writableRoots, 'unknown');
  assert.equal(result.actual.reviewer, 'unknown');
  assert.equal(result.expression.applied, false);
  assert.equal(result.outcome.kind, 'manual_pending');
  assert.equal(result.outcome.executed, false);
  assert.deepEqual(result.outcome.writes, []);
  assert.match(result.outcome.blocker, /unbound|unknown/);
  assert.equal(Object.hasOwn(result, 'workerId'), false);
  assert.equal(Object.hasOwn(result, 'retroactive'), false);
});

test('Codex adapter keeps partial authenticated evidence manual_pending when reviewer state is absent', () => {
  const packet = createAssignmentPacket();
  const result = codexAdapter.resolveCodexPermissionIntent({
    assignmentPacket: packet,
    targetPaths: ['harness/trio/hosts/generic.mjs'],
    permissionIntent: { sandboxMode: 'bounded', writableRoots: ['harness/trio/hosts'] },
    approval: null,
    hostObservation: {
      authenticated: true,
      evidenceRef: 'partial-evidence-b',
      packetDigest: adapterPacketDigest(packet),
      actualSandbox: 'bounded',
      actualWritableRoots: ['harness/trio/hosts/generic.mjs']
      // actualReviewer deliberately absent
    }
  });
  assert.deepEqual(result.requested.writableRoots, ['harness/trio/hosts']);
  assert.equal(result.actual.authenticated, true);
  assert.equal(result.actual.sandbox, 'bounded');
  assert.deepEqual(result.actual.writableRoots, ['harness/trio/hosts/generic.mjs']);
  assert.equal(result.actual.reviewer, 'unknown');
  assert.equal(result.expression.applied, false);
  assert.equal(result.outcome.kind, 'manual_pending');
  assert.equal(result.outcome.executed, false);
  assert.deepEqual(result.outcome.writes, []);
  assert.match(result.outcome.blocker, /unbound|unknown/);
  assert.equal(Object.hasOwn(result, 'workerId'), false);
  assert.equal(Object.hasOwn(result, 'retroactive'), false);
});

test('Codex adapter keeps generated .agents targets blocked when generatedTargets is an empty list', () => {
  const target = '.agents/skills/trio/dev/SKILL.md';
  const packet = {
    ...createAssignmentPacket(),
    allowedOperations: { files: ['harness/trio/hosts/generic.mjs', target] }
  };
  const result = codexAdapter.resolveCodexPermissionIntent({
    assignmentPacket: packet,
    targetPaths: [target],
    permissionIntent: { sandboxMode: 'full_access', writableRoots: [] },
    approval: { kind: 'user', granted: true },
    generatedTargets: [],
    hostObservation: {
      authenticated: true,
      evidenceRef: 'generated-union-evidence-1',
      packetDigest: adapterPacketDigest(packet),
      actualSandbox: 'full_access',
      actualWritableRoots: [],
      actualReviewer: 'human'
    }
  });
  assert.equal(result.outcome.kind, 'blocked');
  assert.equal(result.outcome.stage, 'scope');
  assert.match(result.outcome.reason, /generated_target/);
  assert.equal(result.outcome.executed, false);
  assert.deepEqual(result.outcome.writes, []);
  assert.equal(result.expression.applied, false);
});

test('Codex adapter keeps the user-global .codex/AGENTS.md projection generated and blocked', () => {
  const target = '.codex/AGENTS.md';
  const packet = {
    ...createAssignmentPacket(),
    allowedOperations: { files: ['harness/trio/hosts/generic.mjs', target] }
  };
  const result = codexAdapter.resolveCodexPermissionIntent({
    assignmentPacket: packet,
    targetPaths: [target],
    permissionIntent: { sandboxMode: 'full_access', writableRoots: [] },
    approval: { kind: 'user', granted: true },
    hostObservation: {
      authenticated: true,
      evidenceRef: 'user-global-generated-1',
      packetDigest: adapterPacketDigest(packet),
      actualSandbox: 'full_access',
      actualWritableRoots: [],
      actualReviewer: 'human'
    }
  });
  assert.equal(result.outcome.kind, 'blocked');
  assert.equal(result.outcome.stage, 'scope');
  assert.match(result.outcome.reason, /generated_target/);
  assert.equal(result.outcome.executed, false);
  assert.deepEqual(result.outcome.writes, []);
  assert.equal(result.expression.applied, false);
});

// ---------------------------------------------------------------------------
// Worker approval policy, semantic lanes, and dispatch fail-closed contract.
// ---------------------------------------------------------------------------

function createSemanticPacket(overrides = {}) {
  return {
    ...createAssignmentPacket(),
    currentSlice: { name: 'deck-repair-slice' },
    allowedOperations: { files: ['harness/trio/hosts/generic.mjs'] },
    ...overrides
  };
}

function visibleObservation(overrides = {}) {
  return {
    authenticated: true,
    evidenceRef: 'approval-lane-observation',
    workerId: 'deck-worker-1',
    status: 'awaiting_approval',
    visibleWorker: {
      visible: true,
      operations: { spawn: true, continue: true, status: true },
      requestedModelEffortControls: true,
      permissionBinding: true,
      pathBinding: true
    },
    ...overrides
  };
}

function dispatchBase(overrides = {}) {
  return {
    operation: 'spawn',
    assignmentPacket: createSemanticPacket(),
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn', 'continue', 'status'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/deck/alternate-output'] },
    observation: visibleObservation(),
    ...overrides
  };
}

test('Host awaiting_approval is a recognized non-terminal reserved worker status', () => {
  const lane = {
    routeKind: 'visible_worker',
    status: 'awaiting_approval',
    workerId: 'deck-worker-1',
    mutablePaths: ['src/deck']
  };
  const pathConflict = resolveGenericHostOperation({
    ...dispatchBase(),
    pathEnvelope: { mutablePaths: ['src/deck/rework'] },
    lanes: [lane]
  });
  assert.equal(pathConflict.routeEvidence.routeKind, 'manual_pending');
  assert.match(pathConflict.routeEvidence.fallbackReason, /mutable_path_conflict/);

  const resume = resolveGenericHostOperation({
    operation: 'continue',
    requestedWorkerId: 'deck-worker-1',
    assignmentPacket: createSemanticPacket(),
    permissionEnvelope: {
      permissions: ['workspace'],
      operations: ['spawn', 'continue', 'status'],
      externalEffects: []
    },
    pathEnvelope: { mutablePaths: ['src/deck'] },
    observation: visibleObservation()
  });
  assert.equal(resume.routeEvidence.routeKind, 'visible_worker');
  assert.equal(resume.routeEvidence.workerId, 'deck-worker-1');
  assert.equal(resume.routeEvidence.status, 'awaiting_approval');
});

test('same semantic lane in awaiting_approval blocks a new spawn even with a different output root', () => {
  const packet = createSemanticPacket();
  const lane = {
    routeKind: 'visible_worker',
    status: 'awaiting_approval',
    workerId: 'deck-worker-1',
    taskId: 'wave4-task',
    currentSlice: 'deck-repair-slice',
    packetDigest: adapterPacketDigest(packet),
    mutablePaths: ['src/deck/original-output']
  };
  const result = resolveGenericHostOperation({
    ...dispatchBase({ assignmentPacket: packet }),
    lanes: [lane]
  });
  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.routeEvidence.workerId, 'deck-worker-1');
  assert.equal(result.routeEvidence.status, 'manual_pending');
  assert.match(result.routeEvidence.fallbackReason, /semantic_lane_reserved:awaiting_approval/);
  assert.deepEqual(result.descriptor.reservedLane, { workerId: 'deck-worker-1', status: 'awaiting_approval' });
  assert.match(result.descriptor.blocker, /semantic_lane_reserved:awaiting_approval/);
  assert.match(result.descriptor.resumeCondition, /deck-worker-1/);
  assert.match(result.descriptor.resumeCondition, /continue|release/);
});

test('blocked and unaccepted candidate_done lanes keep the semantic lane reserved until an authenticated Chief release', () => {
  const packet = createSemanticPacket();
  for (const status of ['blocked', 'candidate_done']) {
    const lane = {
      routeKind: 'visible_worker',
      status,
      workerId: 'deck-worker-1',
      taskId: 'wave4-task',
      currentSlice: 'deck-repair-slice',
      packetDigest: adapterPacketDigest(packet),
      mutablePaths: ['src/deck/original-output']
    };
    const blocked = resolveGenericHostOperation({
      ...dispatchBase({ assignmentPacket: packet }),
      lanes: [lane]
    });
    assert.equal(blocked.routeEvidence.routeKind, 'manual_pending', status);
    assert.match(blocked.routeEvidence.fallbackReason, new RegExp(`semantic_lane_reserved:${status}`), status);

    const fakeRelease = resolveGenericHostOperation({
      ...dispatchBase({ assignmentPacket: packet }),
      lanes: [{
        ...lane,
        chiefRelease: {
          authenticated: true,
          workerId: 'other-worker',
          mutablePaths: ['src/deck/original-output'],
          disposition: 'release',
          evidenceRef: 'chief-release'
        }
      }]
    });
    assert.equal(fakeRelease.routeEvidence.routeKind, 'manual_pending', status);
    assert.match(fakeRelease.routeEvidence.fallbackReason, /semantic_lane_reserved/, status);

    const released = resolveGenericHostOperation({
      ...dispatchBase({ assignmentPacket: packet }),
      lanes: [{
        ...lane,
        chiefRelease: {
          authenticated: true,
          workerId: 'deck-worker-1',
          mutablePaths: ['src/deck/original-output'],
          disposition: 'release',
          evidenceRef: 'chief-release-evidence'
        }
      }]
    });
    assert.equal(released.routeEvidence.routeKind, 'visible_worker', status);
  }
});

test('only an explicitly distinct frozen slice identity admits an independent dispatch lane', () => {
  const packet = createSemanticPacket();
  const sameLane = {
    routeKind: 'visible_worker',
    status: 'awaiting_approval',
    workerId: 'deck-worker-1',
    taskId: 'wave4-task',
    currentSlice: 'deck-repair-slice',
    packetDigest: adapterPacketDigest(packet),
    mutablePaths: ['src/deck/one']
  };

  const otherSlice = resolveGenericHostOperation({
    ...dispatchBase(),
    pathEnvelope: { mutablePaths: ['src/cards/two'] },
    lanes: [{
      ...sameLane,
      currentSlice: 'cards-only-slice',
      workerId: 'cards-worker-1'
    }]
  });
  assert.equal(otherSlice.routeEvidence.routeKind, 'visible_worker');

  const otherTask = resolveGenericHostOperation({
    ...dispatchBase(),
    pathEnvelope: { mutablePaths: ['src/cards/three'] },
    lanes: [{
      ...sameLane,
      taskId: 'other-task',
      workerId: 'cards-worker-2'
    }]
  });
  assert.equal(otherTask.routeEvidence.routeKind, 'visible_worker');
});

test('a revised packet digest for the same task and frozen slice cannot open a reserved semantic lane', () => {
  const original = createSemanticPacket();
  const revised = createSemanticPacket({
    allowedOperations: { files: ['harness/trio/hosts/generic.mjs', 'src/deck/extra'] }
  });
  assert.notEqual(adapterPacketDigest(original), adapterPacketDigest(revised));
  const lane = {
    routeKind: 'visible_worker',
    status: 'awaiting_approval',
    workerId: 'deck-worker-1',
    taskId: 'wave4-task',
    currentSlice: 'deck-repair-slice',
    packetDigest: adapterPacketDigest(original),
    mutablePaths: ['src/deck/original-output']
  };
  const result = resolveGenericHostOperation({
    ...dispatchBase({ assignmentPacket: revised }),
    lanes: [lane]
  });
  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.routeEvidence.workerId, 'deck-worker-1');
  assert.match(result.routeEvidence.fallbackReason, /semantic_lane_reserved:awaiting_approval/);
  assert.deepEqual(result.descriptor.reservedLane, { workerId: 'deck-worker-1', status: 'awaiting_approval' });
});

test('reserved lanes without task or current-slice identity fail closed on non-overlapping spawns', () => {
  const identityLessLanes = [
    { routeKind: 'visible_worker', status: 'awaiting_approval', workerId: 'legacy-worker-1', mutablePaths: ['src/legacy/one'] },
    { routeKind: 'visible_worker', status: 'blocked', workerId: 'legacy-worker-2', taskId: 'wave4-task', mutablePaths: ['src/legacy/two'] },
    { routeKind: 'visible_worker', status: 'candidate_done', workerId: 'legacy-worker-3', currentSlice: 'deck-repair-slice', mutablePaths: ['src/legacy/three'] }
  ];
  for (const lane of identityLessLanes) {
    const result = resolveGenericHostOperation({
      ...dispatchBase(),
      lanes: [lane]
    });
    assert.equal(result.routeEvidence.routeKind, 'manual_pending', `${lane.status}/${lane.workerId}`);
    assert.equal(result.routeEvidence.workerId, lane.workerId, `${lane.status}/${lane.workerId}`);
    assert.match(
      result.routeEvidence.fallbackReason,
      new RegExp(`semantic_identity_unbound:${lane.status}`),
      `${lane.status}/${lane.workerId}`
    );
    assert.match(result.descriptor.blocker, /semantic_identity_unbound/, `${lane.status}/${lane.workerId}`);
    assert.match(result.descriptor.resumeCondition, /task|current-slice|identity/i, `${lane.status}/${lane.workerId}`);
    assert.deepEqual(
      result.descriptor.reservedLane,
      { workerId: lane.workerId, status: lane.status },
      `${lane.status}/${lane.workerId}`
    );
  }

  const released = resolveGenericHostOperation({
    ...dispatchBase(),
    lanes: [{
      routeKind: 'visible_worker',
      status: 'candidate_done',
      workerId: 'legacy-worker-1',
      mutablePaths: ['src/legacy/one'],
      chiefRelease: {
        authenticated: true,
        workerId: 'legacy-worker-1',
        mutablePaths: ['src/legacy/one'],
        disposition: 'release',
        evidenceRef: 'chief-release-evidence'
      }
    }]
  });
  assert.equal(released.routeEvidence.routeKind, 'visible_worker');

  const overlappingPathConflict = resolveGenericHostOperation({
    ...dispatchBase(),
    pathEnvelope: { mutablePaths: ['src/legacy/one/file'] },
    lanes: [{
      routeKind: 'visible_worker',
      status: 'awaiting_approval',
      workerId: 'legacy-worker-1',
      mutablePaths: ['src/legacy/one']
    }]
  });
  assert.equal(overlappingPathConflict.routeEvidence.routeKind, 'manual_pending');
  assert.match(overlappingPathConflict.routeEvidence.fallbackReason, /mutable_path_conflict/);
});

test('task and frozen slice identity alone reserve a lane even without a packet digest', () => {
  const packet = createSemanticPacket();
  const lane = {
    routeKind: 'visible_worker',
    status: 'awaiting_approval',
    workerId: 'deck-worker-1',
    taskId: 'wave4-task',
    currentSlice: 'deck-repair-slice',
    mutablePaths: ['src/deck/original-output']
  };
  const result = resolveGenericHostOperation({
    ...dispatchBase({ assignmentPacket: packet }),
    lanes: [lane]
  });
  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.equal(result.routeEvidence.workerId, 'deck-worker-1');
  assert.match(result.routeEvidence.fallbackReason, /semantic_lane_reserved:awaiting_approval/);
  assert.doesNotMatch(result.routeEvidence.fallbackReason, /semantic_identity_unbound/);
  assert.deepEqual(result.descriptor.reservedLane, { workerId: 'deck-worker-1', status: 'awaiting_approval' });
});

test('every unreleased active status reserves the same task and frozen slice semantic lane', () => {
  const packet = createSemanticPacket();
  const activeStatuses = [
    'planned',
    'observed',
    'idle',
    'executing',
    'awaiting_approval',
    'blocked',
    'candidate_done'
  ];
  for (const status of activeStatuses) {
    const lane = {
      routeKind: 'visible_worker',
      status,
      workerId: `worker-${status}`,
      taskId: 'wave4-task',
      currentSlice: 'deck-repair-slice',
      mutablePaths: ['src/deck/one']
    };
    const result = resolveGenericHostOperation({
      ...dispatchBase({ assignmentPacket: packet }),
      pathEnvelope: { mutablePaths: ['src/deck/other'] },
      lanes: [lane]
    });
    assert.equal(result.routeEvidence.routeKind, 'manual_pending', status);
    assert.equal(result.routeEvidence.workerId, `worker-${status}`, status);
    assert.match(result.routeEvidence.fallbackReason, new RegExp(`semantic_lane_reserved:${status}`), status);
    assert.deepEqual(result.descriptor.reservedLane, { workerId: `worker-${status}`, status }, status);
  }

  const stopped = resolveGenericHostOperation({
    ...dispatchBase({ assignmentPacket: packet }),
    pathEnvelope: { mutablePaths: ['src/deck/other'] },
    lanes: [{
      routeKind: 'visible_worker',
      status: 'stopped',
      workerId: 'worker-stopped',
      taskId: 'wave4-task',
      currentSlice: 'deck-repair-slice',
      mutablePaths: ['src/deck/one']
    }]
  });
  assert.equal(stopped.routeEvidence.routeKind, 'visible_worker');
});

test('a packet-less legacy spawn facing a fully identified active lane is pending, not independent', () => {
  const activeStatuses = [
    'planned',
    'observed',
    'idle',
    'executing',
    'awaiting_approval',
    'blocked',
    'candidate_done'
  ];
  for (const status of activeStatuses) {
    const lane = {
      routeKind: 'visible_worker',
      status,
      workerId: `reserved-${status}`,
      taskId: 'wave4-task',
      currentSlice: 'deck-repair-slice',
      mutablePaths: ['src/deck/one']
    };
    const result = resolveGenericHostOperation({
      operation: 'spawn',
      workRole: 'chief',
      requestedModel: 'gpt-5.6-sol',
      requestedEffort: 'max',
      permissionEnvelope: {
        permissions: ['workspace'],
        operations: ['spawn'],
        externalEffects: []
      },
      pathEnvelope: { mutablePaths: ['src/deck/other'] },
      observation: visibleObservation(),
      lanes: [lane]
    });
    assert.equal(result.routeEvidence.routeKind, 'manual_pending', status);
    assert.equal(result.routeEvidence.workerId, `reserved-${status}`, status);
    assert.match(
      result.routeEvidence.fallbackReason,
      new RegExp(`semantic_identity_unbound:${status}`),
      status
    );
    assert.deepEqual(
      result.descriptor.reservedLane,
      { workerId: `reserved-${status}`, status },
      status
    );
    assert.match(result.descriptor.resumeCondition, /assignment packet/i, status);
  }
});

test('an unresolved worktree clientThreadId blocks a fallback spawn until that exact setup resolves', () => {
  const pending = resolveGenericHostOperation({
    ...dispatchBase(),
    observation: visibleObservation({ worktreeSetup: { clientThreadId: 'wt-pending-1', resolved: false } })
  });
  assert.equal(pending.routeEvidence.routeKind, 'manual_pending');
  assert.equal(pending.routeEvidence.workerId, null);
  assert.match(pending.routeEvidence.fallbackReason, /worktree_setup_pending:wt-pending-1/);
  assert.match(pending.descriptor.blocker, /worktree_setup_pending:wt-pending-1/);
  assert.match(pending.descriptor.resumeCondition, /wt-pending-1/);
  assert.match(pending.descriptor.resumeCondition, /fallback|fallback spawn/i);

  const resolved = resolveGenericHostOperation({
    ...dispatchBase(),
    observation: visibleObservation({ worktreeSetup: { clientThreadId: 'wt-ready-1', resolved: true } })
  });
  assert.equal(resolved.routeEvidence.routeKind, 'visible_worker');
});

test('Host create-attempt accounting allows one bounded correction then manual_pending', () => {
  const firstCorrection = resolveGenericHostOperation({
    ...dispatchBase(),
    observation: visibleObservation({ createAttempts: 1 })
  });
  assert.equal(firstCorrection.routeEvidence.routeKind, 'visible_worker');

  const exhausted = resolveGenericHostOperation({
    ...dispatchBase(),
    observation: visibleObservation({ createAttempts: 2 })
  });
  assert.equal(exhausted.routeEvidence.routeKind, 'manual_pending');
  assert.match(exhausted.routeEvidence.fallbackReason, /worker_create_attempts_exhausted/);
  assert.match(exhausted.descriptor.blocker, /worker_create_attempts_exhausted/);
  assert.match(exhausted.descriptor.resumeCondition, /manual_pending/);
});

test('Codex adapter keeps the requested approval policy separate from authenticated actual Host evidence', () => {
  const packet = createAssignmentPacket();
  const base = {
    assignmentPacket: packet,
    targetPaths: ['harness/trio/hosts/generic.mjs'],
    permissionIntent: { sandboxMode: 'full_access', writableRoots: [] }
  };

  const unbound = codexAdapter.resolveCodexPermissionIntent({
    ...base,
    approvalPolicy: 'never'
  });
  assert.equal(unbound.outcome.kind, 'manual_pending');
  assert.equal(unbound.outcome.blocker, 'worker_approval_policy_unbound');
  assert.equal(unbound.outcome.executed, false);
  assert.deepEqual(unbound.outcome.writes, []);
  assert.equal(unbound.requested.approvalPolicy, 'never');
  assert.equal(unbound.requested.sandboxMode, 'full_access');
  assert.equal(unbound.actual.approvalPolicy, 'unknown');
  assert.equal(unbound.expression.applied, false);
  assert.equal(unbound.expression.requestedApprovalPolicy, 'never');
  assert.match(unbound.outcome.resumeCondition, /approval_policy=never/);

  const mismatch = codexAdapter.resolveCodexPermissionIntent({
    ...base,
    approvalPolicy: 'never',
    hostObservation: {
      authenticated: true,
      evidenceRef: 'approval-policy-evidence-1',
      packetDigest: adapterPacketDigest(packet),
      actualSandbox: 'full_access',
      actualWritableRoots: [],
      actualReviewer: 'human',
      actualApprovalPolicy: 'on-request'
    }
  });
  assert.equal(mismatch.outcome.kind, 'manual_pending');
  assert.equal(mismatch.outcome.blocker, 'worker_approval_policy_unbound');
  assert.equal(mismatch.actual.approvalPolicy, 'on-request');

  const bound = codexAdapter.resolveCodexPermissionIntent({
    ...base,
    approvalPolicy: 'never',
    hostObservation: {
      authenticated: true,
      evidenceRef: 'approval-policy-evidence-2',
      packetDigest: adapterPacketDigest(packet),
      actualSandbox: 'full_access',
      actualWritableRoots: [],
      actualReviewer: 'human',
      actualApprovalPolicy: 'never'
    }
  });
  assert.equal(bound.outcome.kind, 'codex_permission_expression');
  assert.equal(bound.actual.authenticated, true);
  assert.equal(bound.actual.approvalPolicy, 'never');
  assert.equal(bound.expression.applied, false);
  assert.equal(bound.expression.requestedApprovalPolicy, 'never');
});
