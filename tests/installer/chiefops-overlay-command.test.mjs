import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { serializeChiefOpsBlock } from '../../harness/runtime/chiefops-overlay/coordination-blocks.mjs';
import { createHarnessFixture, removeHarnessFixture } from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root,
    env: {
      ...process.env,
      HARNESS_PROJECT_ROOT: root
    }
  });
}

function demoBindingPacket(root, overrides = {}) {
  return {
    schemaVersion: 'chiefops.v0b',
    bindingId: 'bind_1',
    action: 'spawn_worker',
    authorityTaskId: 'chiefops-demo',
    planningRoot: root,
    chiefThreadId: 'chief-thread',
    workerId: 'worker-1',
    threadId: null,
    sessionId: null,
    currentSlice: 'handoff cli',
    proofTarget: 'manual handoff pending',
    evidenceSink: 'planning/active/chiefops-demo/progress.md',
    capabilityClass: 'balanced_execution',
    riskClass: 'medium',
    workType: 'coding',
    authorityMode: 'task_authority',
    allowedOps: ['inspect'],
    requiresHumanApproval: false,
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
    observedAt: '2026-07-09T05:00:00.000Z',
    ...overrides
  };
}

test('harness chiefops overlay index prints derived JSON without writing truth', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const taskDir = path.join(root, 'planning/active/chiefops-demo');
    await mkdir(taskDir, { recursive: true });
    await writeFile(path.join(taskDir, 'task_plan.md'), '# ChiefOps Demo\n\n## Current State\nStatus: active\n');
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n');

    const { stdout, stderr } = await harnessCommand(root, 'chiefops', 'overlay', 'index', '--task', 'chiefops-demo', '--json');
    const parsed = JSON.parse(stdout);

    assert.equal(stderr, '');
    assert.equal(parsed.schemaVersion, 'chiefops.v0b.index');
    assert.deepEqual(parsed.workers, []);
    assert.deepEqual(parsed.conflicts, []);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops overlay validate-binding prints minimal success JSON', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const file = path.join(root, 'binding.json');
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: 'chiefops.v0b',
        bindingId: 'bind_1',
        action: 'spawn_worker',
        authorityTaskId: 'chiefops-demo',
        planningRoot: root,
        chiefThreadId: 'chief-thread',
        workerId: 'worker-1',
        threadId: null,
        sessionId: null,
        currentSlice: 'validate binding cli',
        proofTarget: 'binding packet validates',
        evidenceSink: 'planning/active/chiefops-demo/progress.md',
        capabilityClass: 'balanced_execution',
        riskClass: 'medium',
        workType: 'coding',
        authorityMode: 'task_authority',
        allowedOps: ['inspect'],
        requiresHumanApproval: false,
        createdAt: '2026-07-09T05:00:00.000Z',
        bindingToken: 'btok_1',
        sourceProgressRef: {
          file: 'planning/active/chiefops-demo/progress.md',
          blockId: 'bind_1',
          startLine: null,
          contentHash: 'sha256:abc123',
          observedAt: '2026-07-09T05:00:00.000Z'
        },
        observedAt: '2026-07-09T05:00:00.000Z'
      }, null, 2)
    );

    const { stdout, stderr } = await harnessCommand(root, 'chiefops', 'overlay', 'validate-binding', '--file', file);
    const parsed = JSON.parse(stdout);

    assert.equal(stderr, '');
    assert.deepEqual(parsed, { ok: true, bindingId: 'bind_1' });
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops overlay handoff creates a prompt but not a started receipt', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const taskDir = path.join(root, 'planning/active/chiefops-demo');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      [
        '# ChiefOps Demo',
        '',
        '## Current State',
        'Status: active',
        '',
        '## Verification Contract',
        '- **Proof Target:** manual handoff pending',
        ''
      ].join('\n')
    );
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    const binding = demoBindingPacket(root);
    await writeFile(
      path.join(taskDir, 'progress.md'),
      ['# Progress', '', 'handoff cli', 'manual handoff pending', '', serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding), ''].join('\n')
    );
    const file = path.join(root, 'binding.json');
    await writeFile(file, JSON.stringify(binding, null, 2));

    const { stdout, stderr } = await harnessCommand(root, 'chiefops', 'overlay', 'handoff', '--file', file);

    assert.equal(stderr, '');
    assert.match(stdout, /Return a ChiefOpsWorkerReceipt/);
    assert.doesNotMatch(stdout, /btok_1/);
    assert.doesNotMatch(stdout, /canProceedAsStarted.*true/);
    assert.doesNotMatch(stdout, /started receipt/i);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops overlay handoff rejects forged binding files outside progress truth', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const taskDir = path.join(root, 'planning/active/chiefops-demo');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      [
        '# ChiefOps Demo',
        '',
        '## Current State',
        'Status: active',
        '',
        '## Verification Contract',
        '- **Proof Target:** manual handoff pending',
        ''
      ].join('\n')
    );
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    const authoritativeBinding = demoBindingPacket(root);
    await writeFile(
      path.join(taskDir, 'progress.md'),
      ['# Progress', '', 'handoff cli', 'manual handoff pending', '', serializeChiefOpsBlock('ChiefOpsWorkerBinding', authoritativeBinding), ''].join('\n')
    );
    const file = path.join(root, 'binding.json');
    await writeFile(file, JSON.stringify(demoBindingPacket(root, { workerId: 'worker-forged' }), null, 2));

    await assert.rejects(
      harnessCommand(root, 'chiefops', 'overlay', 'handoff', '--file', file),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /does not match authoritative progress truth/i);
        return true;
      }
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops overlay resolve-model prints resolved model JSON', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const file = path.join(root, 'models.json');
    await writeFile(
      file,
      JSON.stringify(
        [
          { model: 'balanced-1', capabilityClass: 'balanced_execution' },
          { model: 'frontier-1', capabilityClass: 'frontier_reasoning' }
        ],
        null,
        2
      )
    );

    const { stdout, stderr } = await harnessCommand(
      root,
      'chiefops',
      'overlay',
      'resolve-model',
      '--capability-class',
      'balanced_execution',
      '--available',
      file
    );
    const parsed = JSON.parse(stdout);

    assert.equal(stderr, '');
    assert.equal(parsed.requestedCapabilityClass, 'balanced_execution');
    assert.equal(parsed.resolvedModelAtRun, 'balanced-1');
    assert.equal(parsed.fallbackReason, null);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops overlay resolve-model rejects malformed model inventory', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const file = path.join(root, 'models.json');
    await writeFile(file, JSON.stringify([{ capabilityClass: 'balanced_execution' }], null, 2));

    await assert.rejects(
      harnessCommand(root, 'chiefops', 'overlay', 'resolve-model', '--capability-class', 'balanced_execution', '--available', file),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /missing model/i);
        return true;
      }
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('chiefops v0b docs keep critical overlay safety semantics visible', async () => {
  const doc = await readFile(path.resolve('docs/chiefops-v0b.md'), 'utf8');

  assert.match(doc, /planning\/active\/<task-id>\/ remains the source of truth/i);
  assert.match(doc, /Manual handoff output is pending only/i);
  assert.match(doc, /no worker heartbeat runtime/i);
});

test('harness chiefops overlay index fails closed for missing authority trio', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    await assert.rejects(
      harnessCommand(root, 'chiefops', 'overlay', 'index', '--task', 'missing-task', '--json'),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /missing authoritative trio files/i);
        return true;
      }
    );
  } finally {
    await removeHarnessFixture(root);
  }
});
