import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as trioRead from '../../harness/trio/core/read.mjs';

import {
  ASSIGNMENT_PACKET_FIELDS,
  CHIEF_WORK_ROLES,
  EXECUTION_WORK_ROLES,
  ROUTE_KINDS,
  buildAssignmentPacket,
  calculateNextAction,
  resolveModelEffort,
  routeTask
} from '../../harness/trio/core/routing.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function laneSection(markdown, heading) {
  const start = markdown.indexOf('## ' + heading);
  assert.notEqual(start, -1, 'Missing section: ' + heading);
  const rest = markdown.slice(start + heading.length + 3);
  const next = rest.indexOf('\n## ');
  return next === -1 ? rest : rest.slice(0, next);
}

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

test('resolveModelEffort fails closed without a declared work role and never infers actual values', () => {
  assert.throws(
    () => resolveModelEffort({ taskClass: 'tracked' }),
    /declared workRole/i
  );
  assert.throws(
    () => resolveModelEffort({
      taskClass: 'tracked',
      requestedModel: 'gpt-5.6-luna',
      requestedEffort: 'max'
    }),
    /declared workRole/i
  );

  const result = resolveModelEffort({
    taskClass: 'tracked',
    workRole: 'chief',
    requestedModel: 'gpt-5.6-sol',
    requestedEffort: 'max',
    actualModel: 'gpt-5.6-sol',
    actualEffort: 'max'
  });
  assert.equal(result.requestedModel, 'gpt-5.6-sol');
  assert.equal(result.requestedEffort, 'max');
  assert.equal(result.actualModel, 'unknown');
  assert.equal(result.actualEffort, 'unknown');
  assert.equal(result.actualObserved, false);
});

test('resolveModelEffort requires a declared work role and keeps the authenticated actual evidence gate', () => {
  assert.deepEqual(ROUTE_KINDS, ['quick', 'tracked']);

  // Legacy signal-only classification is gone: without a declared work role
  // the same signals fail closed instead of silently selecting a model.
  for (const signals of [
    { security: true },
    { chiefArchitecture: true },
    { multiFileIntegration: true },
    { lunaFailureCount: 2 }
  ]) {
    assert.throws(
      () => resolveModelEffort({ taskClass: 'tracked', ...signals }),
      /declared workRole/i
    );
  }

  const unauthenticated = resolveModelEffort({
    taskClass: 'tracked',
    workRole: 'planning',
    requestedModel: 'gpt-5.6-sol',
    requestedEffort: 'max',
    actualModel: 'gpt-5.6-terra',
    actualEffort: 'max',
    evidence: { authenticated: false, actualModel: 'gpt-5.6-terra', actualEffort: 'max' }
  });
  assert.equal(unauthenticated.actualModel, 'unknown');
  assert.equal(unauthenticated.actualEffort, 'unknown');

  const authenticated = resolveModelEffort({
    taskClass: 'tracked',
    workRole: 'planning',
    requestedModel: 'gpt-5.6-sol',
    requestedEffort: 'max',
    evidence: { authenticated: true, actualModel: 'gpt-5.6-terra', actualEffort: 'max' }
  });
  assert.equal(authenticated.actualModel, 'gpt-5.6-terra');
  assert.equal(authenticated.actualEffort, 'max');
  assert.equal(authenticated.actualObserved, true);

  assert.throws(
    () => resolveModelEffort({
      taskClass: 'tracked',
      isChild: true,
      workRole: 'chief',
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
    capability: {
      workRole: 'chief',
      requestedModel: 'gpt-5.6-sol',
      requestedEffort: 'max',
      actualModel: 'unknown'
    },
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

test('execution work roles always request the Flash model with calibrated effort', () => {
  for (const workRole of EXECUTION_WORK_ROLES) {
    const bounded = resolveModelEffort({ taskClass: 'tracked', workRole, complexity: 'high' });
    assert.equal(bounded.requestedModel, 'opencode-go/deepseek-v4-flash');
    assert.equal(bounded.requestedEffort, 'high');
    assert.equal(bounded.requestedProvider, 'opencode-go');
    assert.equal(bounded.workRole, workRole);
    assert.equal(bounded.complexity, 'high');
    assert.equal(bounded.route, 'tracked');

    const iterative = resolveModelEffort({ taskClass: 'tracked', workRole, complexity: 'xhigh' });
    assert.equal(iterative.requestedModel, 'opencode-go/deepseek-v4-flash');
    assert.equal(iterative.requestedEffort, 'xhigh');

    const longRunning = resolveModelEffort({ taskClass: 'tracked', workRole, complexity: 'max' });
    assert.equal(longRunning.requestedModel, 'opencode-go/deepseek-v4-flash');
    assert.equal(longRunning.requestedEffort, 'max');
    assert.equal(longRunning.actualModel, 'unknown');
    assert.equal(longRunning.actualEffort, 'unknown');
    assert.equal(longRunning.actualObserved, false);
  }
});

test('execution complexity classifiers map bounded, multi-file, and long-running work to high, xhigh, and max', () => {
  const bounded = resolveModelEffort({ taskClass: 'tracked', workRole: 'coding', bounded: true });
  assert.equal(bounded.complexity, 'high');
  assert.equal(bounded.requestedEffort, 'high');

  const routine = resolveModelEffort({ taskClass: 'tracked', workRole: 'executing', routine: true });
  assert.equal(routine.complexity, 'high');

  const multiFile = resolveModelEffort({
    taskClass: 'tracked',
    workRole: 'coding',
    multiFile: true,
    verificationHeavy: true
  });
  assert.equal(multiFile.complexity, 'xhigh');
  assert.equal(multiFile.requestedEffort, 'xhigh');

  const research = resolveModelEffort({ taskClass: 'tracked', workRole: 'researching', research: true });
  assert.equal(research.requestedEffort, 'xhigh');

  const repeated = resolveModelEffort({ taskClass: 'tracked', workRole: 'coding', repeatedRepair: true });
  assert.equal(repeated.complexity, 'max');
  assert.equal(repeated.requestedEffort, 'max');

  const broad = resolveModelEffort({ taskClass: 'tracked', workRole: 'coding', broadIntegration: true });
  assert.equal(broad.requestedEffort, 'max');

  const explicit = resolveModelEffort({ taskClass: 'tracked', workRole: 'executing', highComplexity: true });
  assert.equal(explicit.complexity, 'max');
});

test('chief roles respect explicit modern models and supported effort', () => {
  for (const workRole of CHIEF_WORK_ROLES) {
    for (const requestedModel of ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
      const result = resolveModelEffort({ workRole, requestedModel, requestedEffort: 'medium' });
      assert.equal(result.requestedProvider, 'openai');
      assert.equal(result.requestedModel, requestedModel);
      assert.equal(result.requestedEffort, 'medium');
    }
  }
});

test('unknown work roles and unknown or ambiguous complexity fail closed instead of escalating', () => {
  assert.throws(
    () => resolveModelEffort({ taskClass: 'tracked', workRole: 'deep-reasoning' }),
    /unknown work role/i
  );
  assert.throws(
    () => resolveModelEffort({ taskClass: 'tracked', workRole: 'coding' }),
    /unknown complexity.*blocker/i
  );
  assert.throws(
    () => resolveModelEffort({ taskClass: 'tracked', workRole: 'coding', complexity: 'ultra' }),
    /complexity/i
  );
  assert.throws(
    () => resolveModelEffort({ taskClass: 'tracked', workRole: 'coding', bounded: true, longRunning: true }),
    /blocker/i
  );
  assert.throws(
    () => resolveModelEffort({ taskClass: 'tracked', workRole: 'planning', complexity: 'max' }),
    /execution-scoped/i
  );
});

test('explicit execution model and effort override legacy defaults without changing role or complexity', () => {
  const result = resolveModelEffort({ workRole: 'coding', complexity: 'xhigh', requestedModel: 'gpt-6-astra', requestedEffort: 'low' });
  assert.equal(result.requestedModel, 'gpt-6-astra');
  assert.equal(result.requestedEffort, 'low');
  assert.equal(result.complexity, 'xhigh');
  assert.equal(result.workRole, 'coding');
  const legacy = resolveModelEffort({ workRole: 'coding', complexity: 'xhigh', requestedEffort: 'max' });
  assert.equal(legacy.requestedModel, 'opencode-go/deepseek-v4-flash');
  assert.equal(legacy.requestedEffort, 'max');
});

test('structured human overrides classify only Chief slices and carry provenance', () => {
  const override = {
    reason: 'host gate requires chief acceptance review',
    provenance: 'operator:jared'
  };
  const result = resolveModelEffort({
    taskClass: 'tracked',
    workRole: 'planning',
    requestedModel: 'gpt-5.6-sol',
    requestedEffort: 'max',
    override
  });
  assert.deepEqual(result.override, override);
  assert.equal(result.requestedModel, 'gpt-5.6-sol');
  assert.equal(result.requestedEffort, 'max');

  assert.throws(
    () => resolveModelEffort({
      taskClass: 'tracked',
      workRole: 'coding',
      complexity: 'xhigh',
      override
    }),
    /override.*execution|execution roles never upgrade/i
  );
  assert.throws(
    () => resolveModelEffort({
      taskClass: 'tracked',
      workRole: 'planning',
      override: { reason: '' }
    }),
    /override/i
  );
});

test('Chief planning and Flash execution slices never leak model or effort into each other', () => {
  const chief = resolveModelEffort({
    taskClass: 'tracked',
    workRole: 'planning',
    requestedModel: 'gpt-5.6-sol',
    requestedEffort: 'max'
  });
  const execution = resolveModelEffort({
    taskClass: 'tracked',
    workRole: 'executing',
    complexity: 'xhigh'
  });

  assert.equal(chief.requestedModel, 'gpt-5.6-sol');
  assert.equal(execution.requestedModel, 'opencode-go/deepseek-v4-flash');
  assert.notEqual(chief.requestedModel, execution.requestedModel);
  assert.notEqual(chief.requestedEffort, execution.requestedEffort);
  assert.equal(chief.workRole, 'planning');
  assert.equal(execution.workRole, 'executing');
  assert.equal(execution.actualModel, 'unknown');
  assert.equal(execution.actualEffort, 'unknown');
});

test('economic policy results keep actual evidence unknown without authenticated Host evidence', () => {
  const result = resolveModelEffort({
    taskClass: 'tracked',
    workRole: 'coding',
    complexity: 'max',
    actualModel: 'gpt-5.6-sol',
    actualEffort: 'ultra',
    evidence: { authenticated: false, actualModel: 'gpt-5.6-sol', actualEffort: 'ultra' }
  });
  assert.equal(result.requestedModel, 'opencode-go/deepseek-v4-flash');
  assert.equal(result.requestedEffort, 'max');
  assert.equal(result.actualModel, 'unknown');
  assert.equal(result.actualEffort, 'unknown');
  assert.equal(result.actualObserved, false);

  const authenticated = resolveModelEffort({
    taskClass: 'tracked',
    workRole: 'coding',
    complexity: 'xhigh',
    evidence: { authenticated: true, actualModel: 'opencode-go/deepseek-v4-flash', actualEffort: 'xhigh' }
  });
  assert.equal(authenticated.actualModel, 'opencode-go/deepseek-v4-flash');
  assert.equal(authenticated.actualEffort, 'xhigh');
  assert.equal(authenticated.actualObserved, true);
});

function goalContract(overrides = {}) {
  return {
    objective: 'Implement the reviewed routing plan',
    successCriteria: ['focused RED tests pass', 'verify:trio passes'],
    stopConditions: ['binding mismatch', 'three failed attempts'],
    expectedEvidence: ['test exits', 'changed paths'],
    maxIterations: 24,
    milestoneCheckIn: 'after each completed slice',
    returnCondition: 'candidate_done or blocked',
    ...overrides
  };
}

test('worker_self_goal packets require a complete bounded goal contract with an exact closed shape', async () => {
  const { root, taskDir } = await createBoundTrio();
  try {
    const reading = await trioRead.readTrioTask(root, { taskId: 'binding-task' });
    const baseCapability = {
      workRole: 'coding',
      complexity: 'xhigh',
      executionMode: 'worker_self_goal',
      goalContract: goalContract()
    };
    const base = {
      authority: { binding: reading.binding, bindingObservation: reading.binding },
      currentSlice: { name: 'goal-slice' },
      nonGoals: ['no cross-thread goal control'],
      proof: { primary: ['focused tests'] },
      capability: baseCapability,
      allowedOperations: { files: [] },
      deadline: { stopConditions: [] },
      expectedReturn: { status: ['candidate_done', 'blocked'], evidence: ['commands and exits'] }
    };

    const packet = buildAssignmentPacket(base);
    assert.equal(packet.capability.executionMode, 'worker_self_goal');
    assert.deepEqual(Object.keys(packet.capability.goalContract), [
      'objective',
      'successCriteria',
      'stopConditions',
      'expectedEvidence',
      'maxIterations',
      'milestoneCheckIn',
      'returnCondition'
    ]);

    const invalidCases = [
      { label: 'missing contract', capability: { ...baseCapability, goalContract: undefined } },
      { label: 'empty objective', capability: { ...baseCapability, goalContract: goalContract({ objective: '' }) } },
      { label: 'empty success criteria', capability: { ...baseCapability, goalContract: goalContract({ successCriteria: [] }) } },
      { label: 'blank stop condition', capability: { ...baseCapability, goalContract: goalContract({ stopConditions: [' '] }) } },
      { label: 'zero iterations', capability: { ...baseCapability, goalContract: goalContract({ maxIterations: 0 }) } },
      { label: 'excessive iterations', capability: { ...baseCapability, goalContract: goalContract({ maxIterations: 101 }) } },
      { label: 'non-integer iterations', capability: { ...baseCapability, goalContract: goalContract({ maxIterations: 24.5 }) } },
      { label: 'missing milestone check-in', capability: { ...baseCapability, goalContract: goalContract({ milestoneCheckIn: '' }) } },
      { label: 'extra contract field', capability: { ...baseCapability, goalContract: goalContract({ threadControl: true }) } }
    ];
    for (const invalid of invalidCases) {
      assert.throws(
        () => buildAssignmentPacket({ ...base, capability: invalid.capability }),
        /goal contract|objective|successCriteria|stopConditions|maxIterations|milestoneCheckIn|closed shape/i,
        invalid.label
      );
    }

    const bounded = buildAssignmentPacket({
      ...base,
      capability: {
        workRole: 'coding',
        complexity: 'xhigh',
        executionMode: 'bounded_slice'
      }
    });
    assert.equal(bounded.capability.executionMode, 'bounded_slice');
    assert.equal(Object.hasOwn(bounded.capability, 'goalContract'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('goal packets retain their exact bounded shape through the packet round trip', async () => {
  const { root, taskDir } = await createBoundTrio();
  try {
    const reading = await trioRead.readTrioTask(root, { taskId: 'binding-task' });
    const contract = goalContract();
    const packet = buildAssignmentPacket({
      authority: { binding: reading.binding, bindingObservation: reading.binding },
      currentSlice: { name: 'goal-slice' },
      nonGoals: [],
      proof: { primary: ['focused tests'] },
      capability: {
        workRole: 'coding',
        complexity: 'xhigh',
        executionMode: 'worker_self_goal',
        goalContract: contract
      },
      allowedOperations: { files: [] },
      deadline: { stopConditions: [] },
      expectedReturn: { status: ['candidate_done', 'blocked'] }
    });

    assert.deepEqual(packet.capability.goalContract, contract);
    assert.equal(packet.capability.goalContract.maxIterations, 24);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('assignment packets fail closed without a declared work role or execution complexity', async () => {
  const { root, taskDir } = await createBoundTrio();
  try {
    const reading = await trioRead.readTrioTask(root, { taskId: 'binding-task' });
    const base = {
      authority: { binding: reading.binding, bindingObservation: reading.binding },
      currentSlice: { name: 'negative-slice' },
      nonGoals: [],
      proof: { primary: ['focused negative tests'] },
      capability: {},
      allowedOperations: { files: [] },
      deadline: { stopConditions: [] },
      expectedReturn: { status: ['candidate_done', 'blocked'] }
    };

    assert.throws(
      () => buildAssignmentPacket(base),
      /declared workRole/i
    );
    assert.throws(
      () => buildAssignmentPacket({
        ...base,
        capability: { workRole: 'coding' }
      }),
      /exactly one valid complexity/i
    );
    assert.throws(
      () => buildAssignmentPacket({
        ...base,
        capability: { workRole: 'planning', complexity: 'max' }
      }),
      /execution-scoped/i
    );
    assert.throws(
      () => buildAssignmentPacket({
        ...base,
        capability: { workRole: 'coding', bounded: true, longRunning: true }
      }),
      /ambiguous complexity/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('legacy packets keep their defaults while explicit Luna selection is admitted', async () => {

  const allowedRequestedModels = new Set([
    'opencode-go/deepseek-v4-flash',
    'gpt-5.6-sol',
    'gpt-5.6-terra'
  ]);
  const cases = [
    ...CHIEF_WORK_ROLES.flatMap((workRole) => [
      { workRole },
      { workRole, requestedModel: 'gpt-5.6-sol', requestedEffort: 'max' },
      { workRole, requestedModel: 'gpt-5.6-terra', requestedEffort: 'max' }
    ]),
    ...EXECUTION_WORK_ROLES.flatMap((workRole) => [
      { workRole, complexity: 'high' },
      { workRole, complexity: 'xhigh' },
      { workRole, complexity: 'max' },
      { workRole, bounded: true },
      { workRole, multiFile: true, verificationHeavy: true },
      { workRole, longRunning: true, highComplexity: true }
    ])
  ];
  for (const input of cases) {
    const result = resolveModelEffort({ taskClass: 'tracked', ...input });
    assert.equal(result.requestedModel.includes('luna'), false, JSON.stringify(input));
    assert.ok(allowedRequestedModels.has(result.requestedModel), result.requestedModel);
  }

  const chief = resolveModelEffort({ taskClass: 'tracked', workRole: 'planning', requestedModel: 'gpt-5.6-sol', requestedEffort: 'max' });
  const execution = resolveModelEffort({ taskClass: 'tracked', workRole: 'coding', complexity: 'xhigh' });
  assert.equal(chief.requestedModel, 'gpt-5.6-sol');
  assert.equal(execution.requestedModel, 'opencode-go/deepseek-v4-flash');
});

test('entry policy keeps direct completion distinct from delegated acceptance and strict visibility', async () => {
  const [skill, entry, chiefops, execution] = await Promise.all([
    readFile(path.join(REPO_ROOT, 'harness/trio/skill/SKILL.md'), 'utf8'),
    readFile(path.join(REPO_ROOT, 'harness/trio/templates/entry-policy.md'), 'utf8'),
    readFile(path.join(REPO_ROOT, 'harness/trio/governance/chiefops/SKILL.md'), 'utf8'),
    readFile(path.join(REPO_ROOT, 'harness/trio/skill/references/execution.md'), 'utf8')
  ]);
  assert.match(skill, /Direct work may complete after relevant verification without Chief acceptance/);
  assert.match(skill, /Delegated primary work returns a candidate[\s\S]*Chief acceptance plus Trio writeback/);
  assert.match(entry, /Direct work can complete on its own verification; delegated primary execution requires Chief acceptance/);
  assert.match(chiefops, /direct tracked work needs no ChiefOps check-in/);
  assert.match(chiefops, /not a runner/);
  assert.match(execution, /visible_worker_required[\s\S]*no Chief inline execution or native-subagent substitution/);
  assert.match(execution, /manual_pending[\s\S]*blocked[\s\S]*do not silently change topology/);
  assert.match(execution, /proper-subset scope/);
  assert.match(skill, /sole durable task authority/);
  assert.match(skill, /actual remains unknown without authenticated Host evidence/);
  assert.match(entry, /Host and human gates remain binding/);
});
