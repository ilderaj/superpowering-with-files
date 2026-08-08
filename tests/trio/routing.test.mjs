import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as trioRead from '../../harness/trio/core/read.mjs';

import {
  ASSIGNMENT_PACKET_FIELDS,
  ROUTE_KINDS,
  buildAssignmentPacket,
  calculateNextAction,
  resolveModelEffort,
  routeTask
} from '../../harness/trio/core/routing.mjs';

async function createBoundTrio() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trio-routing-binding-'));
  const taskDir = path.join(root, 'planning', 'active', 'binding-task');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'task_plan.md'), '# Task\n\nStatus: active\n', 'utf8');
  await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n', 'utf8');
  await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n', 'utf8');
  return { root, taskDir };
}

test('routeTask keeps a simple one-stage task on the quick route without Trio creation', () => {
  const result = routeTask({ taskClass: 'quick', phases: 1 });

  assert.equal(result.taskClass, 'quick');
  assert.equal(result.route, 'quick');
  assert.equal(result.createTrio, false);
});

test('routeTask promotes multi-phase durable work to the tracked route', () => {
  const result = routeTask({ phases: 2, requiresResearch: true, crossSession: true });

  assert.equal(result.taskClass, 'tracked');
  assert.equal(result.route, 'tracked');
  assert.equal(result.createTrio, true);
});

test('resolveModelEffort never infers actual model or effort from requested values', () => {
  const result = resolveModelEffort({
    taskClass: 'tracked',
    requestedModel: 'gpt-5.6-luna',
    requestedEffort: 'max'
  });

  assert.equal(result.requestedModel, 'gpt-5.6-luna');
  assert.equal(result.requestedEffort, 'max');
  assert.equal(result.actualModel, 'unknown');
  assert.equal(result.actualEffort, 'unknown');
  assert.equal(result.actualObserved, false);
});

test('resolveModelEffort applies the durable routing policy and authenticated actual evidence gate', () => {
  assert.deepEqual(ROUTE_KINDS, ['quick', 'tracked']);

  for (const signals of [
    { multiFileIntegration: true },
    { uncertainDebugging: true },
    { lunaFailureCount: 2 }
  ]) {
    const result = resolveModelEffort({ taskClass: 'tracked', ...signals });
    assert.equal(result.requestedModel, 'gpt-5.6-terra');
    assert.equal(result.requestedEffort, 'max');
  }

  for (const signals of [
    { chiefArchitecture: true },
    { chiefPlanning: true },
    { majorGate: true },
    { finalAcceptance: true }
  ]) {
    const result = resolveModelEffort({ taskClass: 'tracked', ...signals });
    assert.equal(result.requestedModel, 'gpt-5.6-sol');
    assert.equal(result.requestedEffort, 'ultra');
  }

  for (const signals of [
    { security: true },
    { dataIntegrity: true },
    { irreversibleMigration: true }
  ]) {
    const result = resolveModelEffort({ taskClass: 'tracked', ...signals });
    assert.equal(result.requestedModel, 'gpt-5.6-sol');
    assert.equal(result.requestedEffort, 'max');
  }

  const unauthenticated = resolveModelEffort({
    taskClass: 'tracked',
    actualModel: 'gpt-5.6-terra',
    actualEffort: 'max',
    evidence: { authenticated: false, actualModel: 'gpt-5.6-terra', actualEffort: 'max' }
  });
  assert.equal(unauthenticated.actualModel, 'unknown');
  assert.equal(unauthenticated.actualEffort, 'unknown');

  const authenticated = resolveModelEffort({
    taskClass: 'tracked',
    evidence: { authenticated: true, actualModel: 'gpt-5.6-terra', actualEffort: 'max' }
  });
  assert.equal(authenticated.actualModel, 'gpt-5.6-terra');
  assert.equal(authenticated.actualEffort, 'max');
  assert.equal(authenticated.actualObserved, true);

  assert.throws(
    () => resolveModelEffort({
      taskClass: 'tracked',
      isChild: true,
      requestedModel: 'gpt-5.6-sol',
      requestedEffort: 'ultra'
    }),
    /child.*ultra/i
  );
});

test('buildAssignmentPacket emits exactly the eight approved fields from a verified Trio binding', async () => {
  const { root, taskDir } = await createBoundTrio();
  try {
    const reading = await trioRead.readTrioTask(root, { taskId: 'binding-task' });
  const input = {
      authority: {
        binding: reading.binding,
        bindingObservation: reading.binding
      },
    currentSlice: { name: 'wave-1', files: ['harness/trio/core/read.mjs'] },
    nonGoals: ['no writes', 'no default runtime cutover'],
    proof: { primary: ['focused tests'], backstop: ['diff check'] },
    capability: { requestedModel: 'gpt-5.6-luna', requestedEffort: 'max', actualModel: 'unknown' },
    allowedOperations: { files: ['harness/trio/core/read.mjs'], delegation: 'prohibited' },
    deadline: { stopAt: 'candidate_done', stopConditions: ['binding mismatch'] },
    expectedReturn: { status: ['candidate_done', 'blocked'], evidence: ['commands and exits'] }
  };

    const packet = buildAssignmentPacket(input);
    assert.deepEqual(Object.keys(packet), ASSIGNMENT_PACKET_FIELDS);
    assert.deepEqual(packet, input);

    assert.throws(
      () => buildAssignmentPacket({
        ...input,
        authority: {
          ...input.authority,
          binding: { ...reading.binding, authorityRoot: 'relative-root' }
        }
      }),
      /authority binding/i
    );
    assert.throws(
      () => buildAssignmentPacket({
        ...input,
        authority: {
          ...input.authority,
          bindingObservation: { ...reading.binding, taskId: 'different-task' }
        }
      }),
      /binding observation/i
    );

    await writeFile(path.join(taskDir, 'progress.md'), '# Progress drift\n', 'utf8');
    const verification = await trioRead.verifyTrioBinding(reading.binding);
    assert.equal(verification.matches, false);
    assert.deepEqual(verification.mismatches, ['progress']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('calculateNextAction exposes a tracked Trio initialization plan without performing a write', () => {
  const result = calculateNextAction({
    route: routeTask({ taskClass: 'tracked' }),
    hasTrio: false,
    dryRun: true
  });

  assert.equal(result.action, 'create-trio');
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.writes, []);
});

test('calculateNextAction keeps quick dry-run work inline and Trio-free', () => {
  const result = calculateNextAction({
    route: routeTask({ taskClass: 'quick' }),
    hasTrio: false,
    dryRun: true
  });

  assert.equal(result.action, 'execute-inline');
  assert.equal(result.createTrio, false);
  assert.deepEqual(result.writes, []);
});

test('calculateNextAction fails closed unless it is explicitly dry-run', () => {
  assert.throws(
    () => calculateNextAction({
      route: routeTask({ taskClass: 'tracked' }),
      hasTrio: false,
      dryRun: false
    }),
    /dry-run/i
  );
});
