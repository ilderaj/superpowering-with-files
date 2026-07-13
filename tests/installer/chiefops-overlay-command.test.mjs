import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { serializeChiefOpsBlock } from '../../harness/runtime/chiefops-overlay/coordination-blocks.mjs';
import { buildHandoffFromFile } from '../../harness/runtime/chiefops-overlay/overlay-service.mjs';
import { readLiveCodexModelInventory } from '../../harness/runtime/chiefops-overlay/model-inventory.mjs';
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

test('harness chiefops overlay validate-binding reports a V2 delta identity without a V0b alias', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const file = path.join(root, 'v2-delta.json');
    await writeFile(file, JSON.stringify({
      schemaVersion: 'chiefops.v2',
      kind: 'execution_delta',
      deltaBindingId: 'delta_prefix-demo_1',
      authorityTaskId: 'chiefops-demo',
      planningRoot: root,
      bindingVersion: 'binding-v2',
      prefixBindingId: 'prefix-demo',
      prefixHash: 'sha256:' + 'a'.repeat(64),
      sequence: 1,
      predecessorDeltaHash: null,
      currentSlice: 'validate V2 CLI input',
      majorPhase: 'design',
      observedAt: '2026-07-13T00:15:00.000Z',
      createdAt: '2026-07-13T00:15:00.000Z'
    }, null, 2));

    const { stdout, stderr } = await harnessCommand(root, 'chiefops', 'overlay', 'validate-binding', '--file', file);
    assert.equal(stderr, '');
    assert.deepEqual(JSON.parse(stdout), { ok: true, bindingIdentity: 'delta_prefix-demo_1' });
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

test('harness chiefops overlay handoff keeps legacy timing and upgrade fields out of the strict envelope', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const taskDir = path.join(root, 'planning/active/chiefops-demo');
    await mkdir(taskDir, { recursive: true });
    await writeFile(path.join(taskDir, 'task_plan.md'), '# ChiefOps Demo\n');
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    const binding = demoBindingPacket(root, {
      upgradeTrigger: 'legacy escalation note',
      expectedCheckInBy: '2026-07-09T05:10:00.000Z'
    });
    await writeFile(
      path.join(taskDir, 'progress.md'),
      ['# Progress', '', serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding), ''].join('\n')
    );
    const file = path.join(root, 'binding.json');
    await writeFile(file, JSON.stringify(binding, null, 2));

    const { stdout } = await harnessCommand(root, 'chiefops', 'overlay', 'handoff', '--file', file);
    assert.match(stdout, /Return a ChiefOpsWorkerReceipt/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops overlay strict handoff fails closed without runtime permission evidence', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const taskDir = path.join(root, 'planning/active/chiefops-demo');
    await mkdir(taskDir, { recursive: true });
    await writeFile(path.join(taskDir, 'task_plan.md'), '# ChiefOps Demo\n\n## Current State\nStatus: active\n');
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    const binding = demoBindingPacket(root, {
      majorPhase: 'design',
      nonGoals: ['do not publish'],
      primaryProof: 'focused envelope tests',
      reasoningDemand: 'standard',
      costPreference: 'balanced',
      latencyClass: 'standard',
      permissionClass: 'observe',
      delegationPolicy: 'worker_discretion',
      upgradeTrigger: 'scope change',
      expectedCheckInBy: '2026-07-09T05:10:00.000Z',
      stopCondition: 'return at design gate',
      expectedReceipt: 'done',
      returnToChiefInstruction: 'request design gate'
    });
    await writeFile(
      path.join(taskDir, 'progress.md'),
      ['# Progress', '', 'operating model handoff', '', serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding), ''].join('\n')
    );
    const file = path.join(root, 'binding.json');
    await writeFile(file, JSON.stringify(binding, null, 2));
    const modelResolutionFile = path.join(root, 'model-resolution.json');
    await writeFile(modelResolutionFile, JSON.stringify({
      requestedCapabilityClass: binding.capabilityClass,
      requestedReasoningDemand: binding.reasoningDemand,
      requestedCostPreference: binding.costPreference,
      requestedLatencyClass: binding.latencyClass,
      upgradeTrigger: binding.upgradeTrigger,
      resolvedModelAtRun: 'balanced-current',
      resolvedThinkingAtRun: 'medium',
      modelResolutionReason: 'first_compatible_profile_match',
      nativeThreadControl: false
    }, null, 2));

    await assert.rejects(
      harnessCommand(root, 'chiefops', 'overlay', 'handoff', '--file', file, '--model-resolution', modelResolutionFile),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /permission_enforcement_unverified/);
        return true;
      }
    );

    const prompt = await buildHandoffFromFile({
      root,
      file,
      modelResolutionFile,
      permissionEnforcementObservation: {
        status: 'verified',
        effectiveClass: 'observe',
        effectiveOps: ['inspect'],
        evidenceRef: 'test:permission-observation'
      }
    });
    assert.match(prompt, /resolvedModelAtRun: balanced-current/);
    assert.match(prompt, /resolvedThinkingAtRun: medium/);
    assert.match(prompt, /modelResolutionReason: first_compatible_profile_match/);

    const mismatchedResolutionFile = path.join(root, 'model-resolution-mismatch.json');
    await writeFile(mismatchedResolutionFile, JSON.stringify({
      ...JSON.parse(await readFile(modelResolutionFile, 'utf8')),
      requestedCostPreference: 'economy'
    }, null, 2));
    await assert.rejects(
      buildHandoffFromFile({
        root,
        file,
        modelResolutionFile: mismatchedResolutionFile,
        permissionEnforcementObservation: {
          status: 'verified',
          effectiveClass: 'observe',
          effectiveOps: ['inspect'],
          evidenceRef: 'test:permission-observation'
        }
      }),
      /model_resolution_profile_mismatch/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('public explicit-dispatch handoff uses trusted catalog evidence and stays manual pending', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const taskDir = path.join(root, 'planning/active/chiefops-demo');
    const codexHome = path.join(root, '.codex');
    await mkdir(taskDir, { recursive: true });
    await mkdir(codexHome, { recursive: true });
    await writeFile(path.join(taskDir, 'task_plan.md'), '# ChiefOps Demo\n\n## Current State\nStatus: active\n');
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    await writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({
      models: [
        { slug: 'balanced-preferred', supported_reasoning_levels: [{ effort: 'medium' }, { effort: 'high' }] },
        { slug: 'balanced-substitute', supported_reasoning_levels: [{ effort: 'medium' }] }
      ]
    }));
    const now = new Date().toISOString();
    const inventory = await readLiveCodexModelInventory({ codexHome, now });
    const binding = demoBindingPacket(root, {
      majorPhase: 'execute',
      nonGoals: ['no native application claim'],
      primaryProof: 'public handoff integration',
      reasoningDemand: 'standard',
      costPreference: 'balanced',
      latencyClass: 'standard',
      permissionClass: 'observe',
      delegationPolicy: 'prohibited',
      dispatchIntentVersion: 'chiefops.dispatch-intent.v1',
      dispatchDecision: {
        decidedBy: 'chief-thread',
        decidedAt: now,
        inventory,
        preferredModel: 'balanced-preferred',
        preferredThinking: 'medium',
        applicationStatus: 'manual_pending'
      },
      upgradeTrigger: 'scope change',
      expectedCheckInBy: new Date(Date.parse(now) + 600000).toISOString(),
      stopCondition: 'return to Chief',
      expectedReceipt: 'done',
      returnToChiefInstruction: 'return only to Chief'
    });
    const resolution = {
      requestedCapabilityClass: 'balanced_execution',
      requestedReasoningDemand: 'standard',
      requestedCostPreference: 'balanced',
      requestedLatencyClass: 'standard',
      upgradeTrigger: 'scope change',
      resolvedModelAtRun: 'balanced-preferred',
      resolvedThinkingAtRun: 'medium',
      modelResolutionReason: 'preferred_profile_match',
      nativeThreadControl: false,
      inventorySourceRef: inventory.sourceRef,
      inventoryObservedAt: inventory.observedAt,
      inventoryFingerprint: inventory.fingerprint,
      applicationStatus: 'manual_pending'
    };
    await writeFile(path.join(taskDir, 'progress.md'), '# Progress\n\n' + serializeChiefOpsBlock('ChiefOpsWorkerBinding', binding) + '\n');
    const bindingFile = path.join(root, 'dispatch-binding.json');
    const resolutionFile = path.join(root, 'dispatch-resolution.json');
    await writeFile(bindingFile, JSON.stringify(binding));
    await writeFile(resolutionFile, JSON.stringify(resolution));

    const command = ['chiefops', 'overlay', 'handoff', '--file', bindingFile, '--model-resolution', resolutionFile, '--codex-home', codexHome];
    const { stdout, stderr } = await harnessCommand(root, ...command);
    assert.equal(stderr, '');
    assert.match(stdout, /resolvedModelAtRun: balanced-preferred/);
    assert.match(stdout, /resolvedThinkingAtRun: medium/);
    assert.match(stdout, /applicationStatus: manual_pending/);
    assert.match(stdout, /permissionEnforcementStatus: unverified/);

    await assert.rejects(
      buildHandoffFromFile({
        root,
        file: bindingFile,
        modelResolutionFile: resolutionFile,
        codexHome,
        now,
        permissionEnforcementObservation: {
          status: 'verified',
          effectiveClass: 'observe',
          effectiveOps: ['inspect']
        }
      }),
      /permission_enforcement_unverified/,
      'forged verified observation without evidence must fail'
    );
    await assert.rejects(
      buildHandoffFromFile({
        root,
        file: bindingFile,
        modelResolutionFile: resolutionFile,
        codexHome,
        now,
        permissionEnforcementObservation: {
          status: 'verified',
          effectiveClass: 'workspace',
          effectiveOps: ['inspect', 'write'],
          evidenceRef: 'test:overprivileged'
        }
      }),
      /permission_enforcement_unverified/,
      'over-privileged observation must fail'
    );
    const assessedPrompt = await buildHandoffFromFile({
      root,
      file: bindingFile,
      modelResolutionFile: resolutionFile,
      codexHome,
      now,
      permissionEnforcementObservation: {
        status: 'verified',
        effectiveClass: 'observe',
        effectiveOps: ['inspect'],
        evidenceRef: 'test:permission-observation'
      }
    });
    assert.match(assessedPrompt, /permissionEnforcementStatus: verified/);

    for (const [name, overrides] of [
      ['model', { resolvedModelAtRun: 'balanced-substitute' }],
      ['thinking', { resolvedThinkingAtRun: 'high' }]
    ]) {
      await writeFile(resolutionFile, JSON.stringify({ ...resolution, ...overrides }));
      await assert.rejects(
        harnessCommand(root, ...command),
        (error) => error.code === 1 && /trusted_dispatch_context_mismatch/.test(error.stderr),
        `substituted ${name} must fail through the public route`
      );
    }
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops overlay handoff preserves authority truth from an out-of-tree worker cwd', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  const workerParent = await mkdtemp(path.join(os.tmpdir(), 'swf-codex-worker-'));
  const workerRoot = path.join(workerParent, 'SuperpoweringWithFiles');
  try {
    await writeFile(path.join(root, '.gitignore'), 'planning/\n');
    await writeFile(path.join(root, 'worker-anchor.txt'), 'tracked worktree anchor\n');
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['add', '.gitignore', 'worker-anchor.txt'], { cwd: root });
    await execFileAsync(
      'git',
      ['-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', 'commit', '-m', 'test: seed worker topology'],
      { cwd: root }
    );
    await execFileAsync('git', ['worktree', 'add', '-b', 'codex/test-worker', workerRoot], { cwd: root });

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

    await assert.rejects(access(path.join(workerRoot, 'planning/active/chiefops-demo/task_plan.md')));

    const { stdout, stderr } = await execFileAsync(
      'node',
      [path.join(root, 'harness/installer/commands/harness.mjs'), 'chiefops', 'overlay', 'handoff', '--file', file],
      {
        cwd: workerRoot,
        env: { ...process.env, HARNESS_PROJECT_ROOT: root }
      }
    );

    const canonicalRoot = await realpath(root);
    assert.equal(stderr, '');
    assert.match(stdout, new RegExp(`authorityRoot: ${canonicalRoot.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
    assert.match(stdout, new RegExp(`taskPlanPath: ${path.join(canonicalRoot, 'planning/active/chiefops-demo/task_plan.md').replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
    assert.match(stdout, /bindingObservation\.taskPlanHash: sha256:[a-f0-9]{64}/);
    assert.match(stdout, /bindingObservation\.findingsHash: sha256:[a-f0-9]{64}/);
    assert.match(stdout, /bindingObservation\.progressHash: sha256:[a-f0-9]{64}/);
    assert.match(stdout, /HARNESS_PROJECT_ROOT/);
  } finally {
    await execFileAsync('git', ['worktree', 'remove', '--force', workerRoot], { cwd: root }).catch(() => {});
    await rm(workerParent, { recursive: true, force: true });
    await removeHarnessFixture(root);
  }
});

test('harness chiefops overlay handoff rejects a contradictory authoritative planning root', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const taskDir = path.join(root, 'planning/active/chiefops-demo');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task_plan.md'),
      '# ChiefOps Demo\n\n## Current State\nStatus: active\n\nmanual handoff pending\n'
    );
    await writeFile(path.join(taskDir, 'findings.md'), '# Findings\n');
    const binding = demoBindingPacket(root);
    const contradictory = { ...binding, planningRoot: path.join(root, 'other-authority') };
    await writeFile(
      path.join(taskDir, 'progress.md'),
      ['# Progress', '', 'handoff cli', 'manual handoff pending', '', serializeChiefOpsBlock('ChiefOpsWorkerBinding', contradictory), ''].join('\n')
    );
    const file = path.join(root, 'binding.json');
    await writeFile(file, JSON.stringify(binding, null, 2));

    await assert.rejects(
      harnessCommand(root, 'chiefops', 'overlay', 'handoff', '--file', file),
      /binding packet does not match authoritative progress truth/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness chiefops overlay handoff accepts public bindingVersion without raw token', async () => {
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
    const { bindingToken, ...publicBinding } = binding;
    const file = path.join(root, 'binding.json');
    await writeFile(file, JSON.stringify(publicBinding, null, 2));

    const { stdout, stderr } = await harnessCommand(root, 'chiefops', 'overlay', 'handoff', '--file', file);

    assert.equal(stderr, '');
    assert.match(stdout, /bindingVersion: binding-v1/);
    assert.doesNotMatch(stdout, /btok_1/);
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
          {
            model: 'balanced-1',
            capabilityClass: 'balanced_execution',
            reasoningByDemand: { light: 'low', standard: 'medium', deep: 'high' },
            costPreferences: ['balanced'],
            latencyClasses: ['standard', 'long_running']
          },
          {
            model: 'frontier-1',
            capabilityClass: 'frontier_reasoning',
            reasoningByDemand: { standard: 'high', deep: 'max' },
            costPreferences: ['quality_first'],
            latencyClasses: ['standard', 'long_running']
          }
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
      '--reasoning-demand',
      'standard',
      '--cost-preference',
      'balanced',
      '--latency-class',
      'standard',
      '--upgrade-trigger',
      'architecture ambiguity',
      '--available',
      file
    );
    const parsed = JSON.parse(stdout);

    assert.equal(stderr, '');
    assert.equal(parsed.requestedCapabilityClass, 'balanced_execution');
    assert.equal(parsed.requestedReasoningDemand, 'standard');
    assert.equal(parsed.requestedCostPreference, 'balanced');
    assert.equal(parsed.requestedLatencyClass, 'standard');
    assert.equal(parsed.upgradeTrigger, 'architecture ambiguity');
    assert.equal(parsed.resolvedModelAtRun, 'balanced-1');
    assert.equal(parsed.resolvedThinkingAtRun, 'medium');
    assert.equal(parsed.modelResolutionReason, 'first_compatible_profile_match');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('public explicit-dispatch CLI requires the trusted catalog producer and preferred mapping', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const codexHome = path.join(root, '.codex');
    const mapping = path.join(root, 'mapping.json');
    const callerInventory = path.join(root, 'caller-inventory.json');
    await mkdir(codexHome, { recursive: true });
    await writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({
      models: [
        { slug: 'balanced-preferred', supported_reasoning_levels: [{ effort: 'medium' }] },
        { slug: 'balanced-substitute', supported_reasoning_levels: [{ effort: 'medium' }] }
      ]
    }));
    await writeFile(mapping, JSON.stringify([{
      model: 'balanced-preferred', capabilityClass: 'balanced_execution', reasoningByDemand: { standard: 'medium' },
      costPreferences: ['balanced'], latencyClasses: ['standard']
    }]));
    await writeFile(callerInventory, JSON.stringify([{
      model: 'caller-authored', capabilityClass: 'balanced_execution', reasoningByDemand: { standard: 'medium' },
      costPreferences: ['balanced'], latencyClasses: ['standard']
    }]));

    const args = ['chiefops', 'overlay', 'resolve-model', '--dispatch-intent', '--codex-home', codexHome, '--mapping', mapping,
      '--capability-class', 'balanced_execution', '--reasoning-demand', 'standard', '--cost-preference', 'balanced', '--latency-class', 'standard'];
    const { stdout } = await harnessCommand(root, ...args);
    assert.equal(JSON.parse(stdout).resolvedModelAtRun, 'balanced-preferred');
    await assert.rejects(
      harnessCommand(root, ...args, '--available', callerInventory),
      (error) => error.code === 1 && /forbids --available/i.test(error.stderr)
    );
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
      harnessCommand(root, 'chiefops', 'overlay', 'resolve-model', '--capability-class', 'balanced_execution', '--reasoning-demand', 'standard', '--cost-preference', 'balanced', '--latency-class', 'standard', '--available', file),
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

test('public non-explicit resolve-model rejects an economy high candidate without authority eligibility', async () => {
  const root = await createHarnessFixture({ linkNodeModules: true });
  try {
    const file = path.join(root, 'economy-models.json');
    await writeFile(file, JSON.stringify([{
      model: 'economy-current', capabilityClass: 'economy_mechanical',
      reasoningByDemand: { deep: 'high' }, costPreferences: ['economy'], latencyClasses: ['standard']
    }]));
    await assert.rejects(
      harnessCommand(root, 'chiefops', 'overlay', 'resolve-model', '--capability-class', 'economy_mechanical', '--reasoning-demand', 'deep', '--cost-preference', 'economy', '--latency-class', 'standard', '--available', file),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /detailed_plan_eligibility_required/);
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
  assert.match(doc, /Worker\/session state is control plane only/i);
  assert.match(doc, /does not create a second durable memory root/i);
  assert.match(doc, /Manual handoff output is pending only/i);
  assert.match(doc, /no worker heartbeat runtime/i);
  assert.match(doc, /two Chief-managed visible executing lanes/i);
  assert.match(doc, /restore and rebind before respawn/i);
  assert.match(doc, /worker_discretion/i);
  assert.match(doc, /permissionClass/i);
  assert.match(doc, /reasoning-demand/i);
  assert.match(doc, /does not provide a native visible-thread spawn adapter/i);
  assert.match(doc, /ChiefOpsModelUpgradeAdmission/i);
  assert.match(doc, /models_cache\.json/i);
  assert.match(doc, /manual_pending/i);
  assert.match(doc, /trusted host adapter/i);
  assert.match(doc, /manual recovery artifact, not a public rollback API/i);
  assert.doesNotMatch(doc, /V0b hard max: `3`/i);
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
