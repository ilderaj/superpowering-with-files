import assert from 'node:assert/strict';
import { test } from 'vitest';
import { resolveModelEffort, resolveHostOperation, packetDigestOf, routeTask, buildAssignmentPacket, freezeAssignmentPacket } from '../src/core/routing.js';

function packet(capability: Record<string, unknown> = {}) {
  const taskDir = '/tmp/modern-routing/planning/active/task';
  const files = Object.fromEntries([['taskPlan', 'task_plan.md'], ['findings', 'findings.md'], ['progress', 'progress.md']].map(([key, name]) => [key, { path: `${taskDir}/${name}`, sha256: 'a'.repeat(64) }]));
  const binding = { authorityRoot: '/tmp/modern-routing', taskId: 'task', files };
  return { authority: { binding, bindingObservation: binding }, currentSlice: { name: 'routing' }, nonGoals: [], proof: ['tests'], capability: { workRole: 'coding', complexity: 'high', requestedModel: 'gpt-6-astra', requestedEffort: 'medium', ...capability }, allowedOperations: { files: ['src'] }, deadline: 'bounded', expectedReturn: 'candidate_done' };
}
const parentEnvelope = { permissions: ['workspace'], operations: ['spawn', 'status'], mutablePaths: ['src'], externalEffects: [] };
const childEnvelope = { ...parentEnvelope, mutablePaths: ['src/app'], operations: ['spawn'] };
const observation = { authenticated: true, evidenceRef: 'host:modern', nativeSubagent: { supported: true, visible: false, operations: { spawn: true }, requestedModelEffortControls: true }, visibleWorker: { visible: true, operations: { spawn: true, status: true }, requestedModelEffortControls: true, permissionBinding: true, pathBinding: true } };
const spawn = (extra: Record<string, unknown> = {}) => resolveHostOperation({ operation: 'spawn', assignmentPacket: packet(), parentEnvelope, childEnvelope, observation, ...extra });

for (const model of ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
  for (const prefix of ['', 'main/', 'p646e20/']) {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      test(`explicit ${prefix}${model}/${effort} survives Chief and execution routing`, () => {
        for (const workRole of ['chief', 'coding']) {
          const input = { workRole, ...(workRole === 'coding' ? { complexity: 'high' } : {}), requestedModel: prefix + model, requestedEffort: effort, persona: 'don_michael' };
          const result = resolveModelEffort(input);
          assert.equal(result.requestedProvider, 'openai');
          assert.equal(result.requestedModel, prefix + model);
          assert.equal(result.requestedEffort, effort);
          assert.equal(result.actualModel, 'unknown');
        }
        const result = spawn({ assignmentPacket: packet({ requestedModel: prefix + model, requestedEffort: effort }) });
        assert.equal(result.routeEvidence.routeKind, 'native_subagent');
        assert.equal(result.routeEvidence.requestedModel, prefix + model);
        assert.equal(result.routeEvidence.requestedEffort, effort);
      });
    }
  }
}

test('bounded research and comparison stay quick; durability and multiple phases track', () => {
  assert.equal(routeTask({ bounded: true, comparison: true, research: true, requiresSubagents: true }).route, 'quick');
  for (const signal of [{ durableResearch: true }, { crossSession: true }, { durableDecisions: true }, { phases: 2 }]) {
    assert.equal(routeTask({ bounded: true, comparison: true, ...signal }).route, 'tracked');
  }
});

test('legacy resolution leaves packet contents and digest unchanged', () => {
  const original = packet({ requestedModel: undefined, requestedEffort: undefined });
  const digest = packetDigestOf(original);
  const result = spawn({ assignmentPacket: original });
  assert.equal(result.routeEvidence.requestedModel, 'opencode-go/deepseek-v4-flash');
  assert.equal(result.routeEvidence.requestedEffort, 'high');
  assert.equal(packetDigestOf(original), digest);
  assert.deepEqual(buildAssignmentPacket(original), original);
});

test('Astra rejects API ultra, none and minimal even with claimed evidence', () => {
  for (const effort of ['ultra', 'none', 'minimal']) {
    assert.throws(() => resolveModelEffort({ workRole: 'chief', requestedModel: 'gpt-6-astra', requestedEffort: effort, hostEvidence: { authenticated: true, evidenceRef: 'host', supportedModelEfforts: { 'gpt-6-astra': [effort] } } }), /effort|Effort/);
  }
});

test('Chief ultra requires exact authenticated Host support and never supplies actual evidence', () => {
  const input = { workRole: 'chief', requestedModel: 'main/gpt-6-astra', requestedEffort: 'ultra' };
  const support = { authenticated: true, evidenceRef: 'host:capability', supportedModelEfforts: { 'main/gpt-6-astra': ['ultra'] } };
  assert.throws(() => resolveModelEffort(input), /authenticated Host/);
  assert.throws(() => resolveModelEffort({ ...input, hostEvidence: { ...support, authenticated: false } }), /authenticated Host/);
  const result = resolveModelEffort({ ...input, hostEvidence: support });
  assert.equal(result.requestedEffort, 'ultra');
  assert.equal(result.actualEffort, 'unknown');
  assert.throws(() => resolveModelEffort({ ...input, isChild: true, hostEvidence: support }), /Child/);
  const bound = packet({ ...input, complexity: undefined });
  assert.throws(() => spawn({ assignmentPacket: bound, observation: { ...observation, ...support } }), /authenticated Host/);
  const routed = spawn({ assignmentPacket: bound, observation: { ...observation, ...support, packetDigest: packetDigestOf(bound) } });
  assert.equal(routed.routeEvidence.routeKind, 'visible_worker');
  assert.equal(routed.routeEvidence.actualEffort, 'unknown');
});

test('same model child effort uses all five ordered levels, including Host aliases', () => {
  const child = { isChild: true, parentModel: 'main/gpt-6-astra', parentEffort: 'medium' };
  assert.equal(spawn(child).routeEvidence.routeKind, 'native_subagent');
  assert.match(spawn({ ...child, parentEffort: 'low' }).routeEvidence.fallbackReason, /medium_over_low/);
  assert.match(spawn({ ...child, parentModel: undefined }).routeEvidence.fallbackReason, /parent_model/);
});

test('cross-model child ranks require a bounded explicit allowance', () => {
  const input = { isChild: true, parentModel: 'gpt-5.6-luna', parentEffort: 'max' };
  assert.match(spawn(input).routeEvidence.fallbackReason, /cross_model_allowance_required/);
  const childModelAllowance = { model: 'gpt-6-astra', maxEffort: 'medium', reason: 'bounded difficult slice', provenance: 'chief:assignment' };
  assert.equal(spawn({ ...input, childModelAllowance }).routeEvidence.routeKind, 'native_subagent');
  assert.match(spawn({ ...input, childModelAllowance: { ...childModelAllowance, maxEffort: 'low' } }).routeEvidence.fallbackReason, /medium_over_low/);
  assert.match(spawn({ ...input, childModelAllowance: { ...childModelAllowance, provenance: '' } }).routeEvidence.fallbackReason, /cross_model/);
});

test('visible and native child paths both reject scope and permission widening', () => {
  for (const primaryExecution of ['default', 'visible_worker_required']) {
    const input = { isChild: true, parentModel: 'gpt-6-astra', parentEffort: 'medium', assignmentPacket: packet({ primaryExecution, childDelegation: 'worker_discretion' }) };
    for (const widened of [{ ...childEnvelope, mutablePaths: ['other'] }, { ...childEnvelope, permissions: ['admin'] }, parentEnvelope]) {
      assert.match(spawn({ ...input, childEnvelope: widened }).routeEvidence.fallbackReason, /child_envelope/);
    }
    const result = spawn(input);
    assert.deepEqual(result.routeEvidence.pathEnvelope.mutablePaths, ['src/app']);
  }
});

test('strict visible requests never silently route native, and missing native model controls block', () => {
  const absentVisible = { ...observation, visibleWorker: { visible: false } };
  const result = spawn({ assignmentPacket: packet({ primaryExecution: 'visible_worker_required', childDelegation: 'worker_discretion' }), observation: absentVisible });
  assert.equal(result.routeEvidence.routeKind, 'manual_pending');
  assert.match(result.routeEvidence.fallbackReason, /visible_worker_required/);
  assert.match(spawn({ observation: { ...observation, nativeSubagent: { ...observation.nativeSubagent, requestedModelEffortControls: false } } }).routeEvidence.fallbackReason, /native_model_controls_unbound/);
});

test('packet effort cannot be overridden by an outer ultra probe', () => {
  assert.throws(() => spawn({ requestedEffort: 'ultra' }), /conflicts with the validated packet/);
});

test('explicit aliases agree or reject, and persona never supplies model selection', () => {
  const result = resolveModelEffort({ workRole: 'coding', complexity: 'high', model: 'gpt-5.6-luna', effort: 'low' });
  assert.equal(result.requestedModel, 'gpt-5.6-luna');
  assert.equal(result.requestedEffort, 'low');
  assert.throws(() => resolveModelEffort({ workRole: 'coding', complexity: 'high', model: 'gpt-5.6-luna', requestedModel: 'gpt-6-astra' }), /Conflicting/);
  assert.throws(() => resolveModelEffort({ workRole: 'coding', complexity: 'high', requestedEffort: '' }), /non-empty/);
  assert.equal(resolveModelEffort({ workRole: 'coding', complexity: 'high', persona: 'gpt-6-astra' }).requestedModel, 'opencode-go/deepseek-v4-flash');
});


test('explicit execution models get recommended effort while omitted Chief effort always retains max', () => {
  for (const [model, effort] of [['gpt-6-astra', 'high'], ['gpt-5.6-sol', 'high'], ['gpt-5.6-terra', 'medium'], ['gpt-5.6-luna', 'medium']]) {
    for (const workRole of ['chief', 'coding']) {
      const result = resolveModelEffort({ workRole, ...(workRole === 'coding' ? { complexity: 'max' } : {}), requestedModel: 'main/' + model });
      assert.equal(result.requestedEffort, workRole === 'chief' ? 'max' : effort);
    }
  }
  assert.equal(resolveModelEffort({ workRole: 'chief' }).requestedEffort, 'max');
  assert.equal(resolveModelEffort({ workRole: 'coding', complexity: 'max' }).requestedEffort, 'max');
});

test('actual evidence requires authenticated packet-bound Host observation and remains separate from selection', () => {
  const bound = packet({ primaryExecution: 'visible_worker_required', childDelegation: 'prohibited' });
  const input = { operation: 'status', assignmentPacket: bound, parentEnvelope, requestedWorkerId: 'worker-1' };
  const actual = { ...observation, workerId: 'worker-1', status: 'executing', actualModel: 'gpt-5.6-luna', actualEffort: 'low', packetDigest: packetDigestOf(bound) };
  const read = resolveHostOperation({ ...input, observation: actual });
  assert.equal(read.routeEvidence.requestedModel, 'gpt-6-astra');
  assert.equal(read.routeEvidence.actualModel, 'gpt-5.6-luna');
  assert.equal(read.routeEvidence.actualEffort, 'low');
  for (const bad of [{ ...actual, authenticated: false }, { ...actual, evidenceRef: '' }, { ...actual, packetDigest: 'b'.repeat(64) }]) {
    assert.equal(resolveHostOperation({ ...input, observation: bad }).routeEvidence.actualModel, 'unknown');
  }
});


test('Host wrapper preserves outer aliases on packetless routing and rejects conflicting alias pairs', () => {
  const input = { operation: 'spawn', workRole: 'coding', complexity: 'high', model: 'gpt-5.6-luna', effort: 'low', parentEnvelope, childEnvelope, observation };
  const routed = resolveHostOperation(input);
  const direct = resolveModelEffort(input);
  assert.equal(routed.routeEvidence.requestedModel, direct.requestedModel);
  assert.equal(routed.routeEvidence.requestedEffort, direct.requestedEffort);
  assert.equal(routed.routeEvidence.routeKind, 'native_subagent');
  assert.throws(() => resolveHostOperation({ ...input, requestedModel: 'gpt-6-astra' }), /Conflicting requestedModel and model/);
  assert.throws(() => resolveHostOperation({ ...input, requestedEffort: 'max' }), /Conflicting requestedEffort and effort/);
  assert.throws(() => resolveHostOperation({ ...input, effort: '' }), /non-empty/);
});

test('Host wrapper checks outer aliases against the frozen packet without mutating it', () => {
  const bound = freezeAssignmentPacket(packet());
  const before = JSON.stringify(bound);
  const digest = packetDigestOf(bound);
  const matching = spawn({ assignmentPacket: bound, model: 'gpt-6-astra', effort: 'medium' });
  assert.equal(matching.routeEvidence.requestedModel, 'gpt-6-astra');
  assert.equal(matching.routeEvidence.requestedEffort, 'medium');
  for (const aliases of [{ model: 'gpt-5.6-luna' }, { effort: 'low' }, { effort: 'ultra' }]) {
    assert.throws(() => spawn({ assignmentPacket: bound, ...aliases }), /conflicts with the validated packet policy/);
  }
  assert.throws(() => spawn({ assignmentPacket: bound, requestedModel: 'gpt-6-astra', model: 'gpt-5.6-luna' }), /Conflicting/);
  assert.throws(() => spawn({ assignmentPacket: bound, requestedEffort: 'medium', effort: 'low' }), /Conflicting/);
  assert.equal(JSON.stringify(bound), before);
  assert.equal(packetDigestOf(bound), digest);
});

for (const model of ['gpt-5.6-sol', 'gpt-5.6-terra']) {
  test(`frozen legacy Chief ${model} retains max when effort is absent`, () => {
    const original = packet();
    Object.assign(original, { capability: { workRole: 'chief', requestedModel: model } });
    const bound = freezeAssignmentPacket(original);
    const before = JSON.stringify(bound);
    const digest = packetDigestOf(bound);
    const routed = spawn({ assignmentPacket: bound });
    assert.equal(routed.routeEvidence.requestedModel, model);
    assert.equal(routed.routeEvidence.requestedEffort, 'max');
    assert.equal(routed.descriptor.packetDigest, digest);
    assert.equal(resolveModelEffort({ workRole: 'chief', model }).requestedEffort, 'max');
    assert.equal(spawn({ assignmentPacket: bound, model, effort: 'max' }).routeEvidence.requestedEffort, 'max');
    assert.throws(() => spawn({ assignmentPacket: bound, effort: 'medium' }), /conflicts with the validated packet policy/);
    assert.equal(JSON.stringify(bound), before);
    assert.equal(packetDigestOf(bound), digest);
    // New recommendations require an explicit effort before the new packet freezes.
    const explicit = freezeAssignmentPacket(packet({ workRole: 'chief', complexity: undefined, requestedModel: model, requestedEffort: 'medium' }));
    assert.equal(spawn({ assignmentPacket: explicit }).routeEvidence.requestedEffort, 'medium');
  });
}
