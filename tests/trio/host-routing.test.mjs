import assert from 'node:assert/strict';
import test from 'node:test';

import * as routing from '../../harness/trio/core/routing.mjs';
import {
  SWF_EXECUTOR_PROFILES,
  SWF_EXECUTOR_ROLE,
  adapterStatus,
  renderCodexHandoffRequest,
  renderSwfExecutorAgentEntry,
  renderSwfExecutorRoleFile,
  resolveSwfExecutorProfile,
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

test('swf_executor role pins DeepSeek Flash with xhigh effort and no fallback model', () => {
  assert.equal(SWF_EXECUTOR_ROLE.name, 'swf_executor');
  assert.equal(SWF_EXECUTOR_ROLE.model, 'opencode-go/deepseek-v4-flash');
  assert.equal(SWF_EXECUTOR_ROLE.modelReasoningEffort, 'xhigh');
  assert.equal(SWF_EXECUTOR_ROLE.fallbackModel, null);

  const entry = renderSwfExecutorAgentEntry('/tmp/host/agents/swf_executor.toml');
  assert.match(entry, /\[agents\.swf_executor\]/);
  assert.match(entry, /description\s*=\s*"/);
  assert.match(entry, /config_file\s*=\s*"\/tmp\/host\/agents\/swf_executor\.toml"/);

  const roleFile = renderSwfExecutorRoleFile();
  assert.match(roleFile, /name\s*=\s*"swf_executor"/);
  assert.match(roleFile, /model\s*=\s*"opencode-go\/deepseek-v4-flash"/);
  assert.match(roleFile, /model_reasoning_effort\s*=\s*"xhigh"/);
  assert.match(roleFile, /developer_instructions\s*=\s*"/);
  assert.doesNotMatch(`${entry}\n${roleFile}`, /fallback/i);

  assert.throws(
    () => renderSwfExecutorAgentEntry(''),
    /requires a role config file path/i
  );
});

test('swf_executor instructions forbid redesign, require blocked on missing decisions, and reuse the role for nesting', () => {
  const instructions = SWF_EXECUTOR_ROLE.instructions;
  assert.match(instructions, /execute an already accepted SWF plan/i);
  assert.match(instructions, /do not redesign/i);
  assert.match(instructions, /blocked/i);
  assert.match(instructions, /material decision/i);
  assert.match(instructions, /swf_executor/i);
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
  assert.equal(Object.hasOwn(SWF_EXECUTOR_ROLE, 'childDelegation'), false);

  const entry = renderSwfExecutorAgentEntry('/tmp/host/agents/swf_executor.toml');
  const roleFile = renderSwfExecutorRoleFile();
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
      workerId: 'swf-executor-1',
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
    assignmentPacket: childPacket({ workRole: 'coding', complexity: 'xhigh' }),
    observation: visibleObservation,
    ...envelopes
  });
  assert.equal(admissible.routeEvidence.routeKind, 'visible_worker');
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

test('swf_executor exposes three calibrated Flash profiles with no fallback model', () => {
  assert.deepEqual(Object.keys(SWF_EXECUTOR_PROFILES), ['high', 'xhigh', 'max']);
  for (const effort of ['high', 'xhigh', 'max']) {
    const profile = resolveSwfExecutorProfile(effort);
    assert.equal(profile.name, 'swf_executor');
    assert.equal(profile.model, 'opencode-go/deepseek-v4-flash');
    assert.equal(profile.modelReasoningEffort, effort);
    assert.equal(profile.fallbackModel, null);

    const roleFile = renderSwfExecutorRoleFile(effort);
    assert.match(roleFile, new RegExp(`model_reasoning_effort\\s*=\\s*"${effort}"`));
    assert.doesNotMatch(roleFile, /fallback/i);

    const entry = renderSwfExecutorAgentEntry('/tmp/host/agents/swf_executor.toml', effort);
    assert.match(entry, /\[agents\.swf_executor\]/);
    assert.doesNotMatch(entry, /fallback/i);
  }

  assert.equal(SWF_EXECUTOR_PROFILES.high.modelReasoningEffort, 'high');
  assert.equal(SWF_EXECUTOR_PROFILES.xhigh.modelReasoningEffort, 'xhigh');
  assert.equal(SWF_EXECUTOR_PROFILES.max.modelReasoningEffort, 'max');
  assert.equal(SWF_EXECUTOR_ROLE.modelReasoningEffort, 'xhigh');

  assert.throws(() => resolveSwfExecutorProfile('ultra'), /profile/i);
  assert.throws(() => renderSwfExecutorRoleFile('ultra'), /profile/i);
  assert.throws(() => renderSwfExecutorAgentEntry('/tmp/x.toml', 'luna'), /profile/i);
});

test('adapter vocabulary reserves claude_code and pi as unimplemented while codex renders a provider-neutral handoff', () => {
  const packet = createAssignmentPacket();
  const handoff = renderCodexHandoffRequest({
    operation: 'spawn',
    packet,
    packetDigest: 'a'.repeat(64),
    effort: 'xhigh'
  });

  assert.equal(handoff.provider, 'codex');
  assert.equal(handoff.role, 'swf_executor');
  assert.equal(handoff.profile.modelReasoningEffort, 'xhigh');
  assert.equal(handoff.profile.model, 'opencode-go/deepseek-v4-flash');
  assert.equal(handoff.operation, 'spawn');
  assert.deepEqual(handoff.packet, packet);
  assert.equal(handoff.packetDigest, 'a'.repeat(64));
  assert.equal(handoff.executed, false);
  assert.equal(adapterStatus('codex'), 'implemented');
  assert.equal(adapterStatus('claude_code'), 'unimplemented');
  assert.equal(adapterStatus('pi'), 'unimplemented');
  assert.throws(() => adapterStatus('unknown-adapter'), /adapter/i);
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
    approval: { kind: 'user', granted: true }
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
    hostObservation: {
      authenticated: true,
      evidenceRef: 'bound-permission-1',
      packetDigest: adapterPacketDigest(packet),
      actualSandbox: 'bounded',
      actualWritableRoots: ['harness/trio/hosts/generic.mjs'],
      actualReviewer: 'human'
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
