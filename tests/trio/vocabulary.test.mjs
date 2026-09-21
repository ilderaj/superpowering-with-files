import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHIEF_REQUESTED_EFFORTS,
  CHIEF_REQUESTED_MODELS,
  CHIEF_WORK_ROLES,
  COMPLEXITY_KINDS,
  EXECUTION_REQUIREMENT_FIELDS,
  EXECUTION_WORK_ROLES,
  FLASH_EXECUTION_MODEL,
  INTENSITY_LEVELS,
  MODE_KINDS,
  TOPOLOGY_CLASSES,
  WORK_ROLE_KINDS,
  ExecutionRequirement,
  intensitySubsetOf,
  modeOf,
  normalizeIntensity,
  resolveExecutionImplementation,
  topologyClassOf
} from '../../harness/trio/core/routing.mjs';

const EXECUTION_CAPABILITIES = Object.freeze(['coding', 'filesystem', 'test']);

const REGISTRY = Object.freeze({
  implementations: Object.freeze([
    Object.freeze({ id: 'flash-execution', modes: ['execute'], intensities: ['high', 'xhigh', 'max'], capabilities: ['coding', 'filesystem', 'test'] }),
    Object.freeze({ id: 'chief-think', modes: ['think'], intensities: ['low', 'medium', 'high', 'xhigh', 'max'], capabilities: ['analysis', 'planning'] }),
    Object.freeze({ id: 'secondary-execution', modes: ['execute'], intensities: ['high', 'xhigh', 'max'], capabilities: ['coding', 'filesystem', 'test'] }),
    Object.freeze({ id: 'offline-execution', modes: ['execute'], intensities: ['high'], capabilities: ['coding', 'filesystem', 'test'], available: false })
  ])
});

test('mode vocabulary is frozen and total over the existing work-role enums', () => {
  assert.deepEqual([...MODE_KINDS], ['think', 'execute']);
  assert.deepEqual([...INTENSITY_LEVELS], ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual([...TOPOLOGY_CLASSES], ['solo', 'delegated', 'parallel']);
  assert.ok(Object.isFrozen(MODE_KINDS));
  assert.ok(Object.isFrozen(INTENSITY_LEVELS));
  assert.ok(Object.isFrozen(TOPOLOGY_CLASSES));
  assert.deepEqual([...WORK_ROLE_KINDS], [...CHIEF_WORK_ROLES, ...EXECUTION_WORK_ROLES]);
  for (const role of CHIEF_WORK_ROLES) assert.equal(modeOf(role), 'think', role);
  for (const role of EXECUTION_WORK_ROLES) assert.equal(modeOf(role), 'execute', role);
  assert.throws(() => modeOf('nonexistent'), /Unknown work role/i);
  assert.throws(() => modeOf(undefined), /Unknown work role/i);
  assert.throws(() => modeOf(3), /Unknown work role/i);
});

test('intensity subsets preserve each mode and reject an out-of-subset value', () => {
  assert.deepEqual([...intensitySubsetOf('think')], [...CHIEF_REQUESTED_EFFORTS]);
  assert.deepEqual([...intensitySubsetOf('execute')], [...COMPLEXITY_KINDS]);
  assert.throws(() => intensitySubsetOf('reason'), /Unknown mode/i);
  assert.equal(normalizeIntensity('low', 'think'), 'low');
  assert.equal(normalizeIntensity('max', 'think'), 'max');
  assert.equal(normalizeIntensity('high', 'execute'), 'high');
  assert.throws(() => normalizeIntensity('low', 'execute'), /not supported in execute mode/i);
  assert.throws(() => normalizeIntensity('medium', 'execute'), /not supported in execute mode/i);
  assert.throws(() => normalizeIntensity('ultra', 'think'), /Unknown intensity/i);
  assert.throws(() => normalizeIntensity(3, 'think'), /Unknown intensity/i);
});

test('topologyClassOf derives a class from fields that already exist', () => {
  assert.equal(topologyClassOf({}), 'solo');
  assert.equal(topologyClassOf({ childDelegation: 'prohibited' }), 'solo');
  assert.equal(topologyClassOf({ childDelegation: 'worker_discretion' }), 'solo');
  assert.equal(topologyClassOf({ childDelegation: 'encouraged' }), 'parallel');
  assert.equal(topologyClassOf({ executionMode: 'worker_self_goal' }), 'delegated');
  assert.equal(topologyClassOf({ routeKind: 'native_subagent' }), 'delegated');
  assert.equal(topologyClassOf({ primaryExecution: 'visible_worker_required' }), 'delegated');
  assert.equal(topologyClassOf({ capability: { childDelegation: 'encouraged' } }), 'parallel');
  assert.equal(topologyClassOf({ executionMode: 'worker_self_goal', childDelegation: 'encouraged' }), 'parallel');
  assert.equal(topologyClassOf({ routeKind: 'manual_pending', executionMode: 'bounded_slice' }), 'solo');
  assert.throws(() => topologyClassOf(null), /object record/i);
  assert.throws(() => topologyClassOf([]), /object record/i);
});

test('ExecutionRequirement normalizes a requirement and rejects a malformed one', () => {
  assert.deepEqual([...EXECUTION_REQUIREMENT_FIELDS], ['mode', 'intensity', 'capabilities']);
  const requirement = ExecutionRequirement({ mode: 'execute', intensity: 'high', capabilities: ['coding', 'test'] });
  assert.ok(Object.isFrozen(requirement));
  assert.ok(Object.isFrozen(requirement.capabilities));
  assert.deepEqual(
    { mode: requirement.mode, intensity: requirement.intensity, capabilities: [...requirement.capabilities] },
    { mode: 'execute', intensity: 'high', capabilities: ['coding', 'test'] }
  );
  assert.throws(() => ExecutionRequirement({ mode: 'execute', intensity: 'high' }), /missing capabilities/i);
  assert.throws(() => ExecutionRequirement({ mode: 'execute', intensity: 'high', capabilities: ['coding'], extra: true }), /unexpected fields/i);
  assert.throws(() => ExecutionRequirement({ mode: 'execute', intensity: 'high', capabilities: [] }), /non-empty array/i);
  assert.throws(() => ExecutionRequirement({ mode: 'execute', intensity: 'low', capabilities: ['coding'] }), /not supported in execute mode/i);
  assert.throws(() => ExecutionRequirement('execute'), /must be an object/i);
});

test('resolveExecutionImplementation selects by declared registry order and never downgrades a capability', () => {
  const selected = resolveExecutionImplementation(
    { mode: 'execute', intensity: 'high', capabilities: EXECUTION_CAPABILITIES },
    REGISTRY
  );
  assert.equal(selected.implementation.id, 'flash-execution');
  assert.equal(selected.reason, 'selected');
  assert.equal(selected.fallbackReason, null);
  assert.deepEqual(selected.considered, ['flash-execution', 'secondary-execution']);

  const think = resolveExecutionImplementation({ mode: 'think', intensity: 'low', capabilities: ['analysis'] }, REGISTRY);
  assert.equal(think.implementation.id, 'chief-think');

  const unsatisfiedCapability = resolveExecutionImplementation(
    { mode: 'think', intensity: 'low', capabilities: ['coding'] },
    REGISTRY
  );
  assert.deepEqual(unsatisfiedCapability, {
    implementation: null,
    reason: 'unsatisfiable_capability',
    fallbackReason: 'unsatisfiable_capability',
    considered: []
  });

  const unsatisfiedMode = resolveExecutionImplementation(
    { mode: 'think', intensity: 'low', capabilities: ['analysis'] },
    { implementations: [{ id: 'only-execute', modes: ['execute'], intensities: ['high'], capabilities: ['analysis'] }] }
  );
  assert.equal(unsatisfiedMode.reason, 'unsatisfiable_mode');
  assert.equal(unsatisfiedMode.implementation, null);

  const unsatisfiedIntensity = resolveExecutionImplementation(
    { mode: 'execute', intensity: 'max', capabilities: ['coding'] },
    { implementations: [{ id: 'capped', modes: ['execute'], intensities: ['high'], capabilities: ['coding'] }] }
  );
  assert.equal(unsatisfiedIntensity.reason, 'unsatisfiable_intensity');

  const unavailable = resolveExecutionImplementation(
    { mode: 'execute', intensity: 'high', capabilities: EXECUTION_CAPABILITIES },
    { implementations: [{ id: 'offline-execution', modes: ['execute'], intensities: ['high'], capabilities: EXECUTION_CAPABILITIES, available: false }] }
  );
  assert.equal(unavailable.reason, 'no_available_implementation');
  assert.equal(unavailable.implementation, null);

  assert.throws(
    () => resolveExecutionImplementation({ mode: 'execute', intensity: 'high', capabilities: ['coding'] }, {}),
    /implementations array/i
  );
  assert.throws(
    () => resolveExecutionImplementation({ mode: 'execute', intensity: 'high', capabilities: ['coding'] }, { implementations: [{ modes: ['execute'] }] }),
    /non-empty id/i
  );
});

test('lifecycle semantics carry no model name', () => {
  const semantics = [...MODE_KINDS, ...INTENSITY_LEVELS, ...TOPOLOGY_CLASSES, ...EXECUTION_REQUIREMENT_FIELDS].join(' ');
  for (const model of [...CHIEF_REQUESTED_MODELS, FLASH_EXECUTION_MODEL]) {
    assert.ok(!semantics.includes(model), model + ' must not appear in lifecycle semantics');
  }
  const selected = resolveExecutionImplementation(
    ExecutionRequirement({ mode: 'execute', intensity: 'high', capabilities: EXECUTION_CAPABILITIES }),
    REGISTRY
  );
  assert.ok(selected.implementation.id.includes('flash'));
  assert.deepEqual(Object.keys(selected).sort(), ['considered', 'fallbackReason', 'implementation', 'reason']);
});
