import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { planHookProjections } from '../../harness/installer/lib/hook-projection.mjs';

test('planHookProjections returns no plans when hooks are off', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'cursor',
    hookMode: 'off'
  });

  assert.deepEqual(plans, []);
});

test('planHookProjections returns cursor planning hook config when hooks are on', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'cursor',
    hookMode: 'on'
  });
  const planning = plans.find((plan) => plan.parentSkillName === 'planning-with-files');

  assert.equal(planning.status, 'planned');
  assert.equal(
    planning.configSource,
    path.join(process.cwd(), 'harness/core/hooks/planning-with-files/cursor-hooks.json')
  );
  assert.equal(planning.configTarget, path.join(process.cwd(), '.cursor/hooks.json'));
  assert.deepEqual(planning.scriptSourcePaths, [
    path.join(process.cwd(), 'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'),
    path.join(process.cwd(), 'harness/core/hooks/planning-with-files/scripts/render-hot-context.mjs'),
    path.join(process.cwd(), 'harness/core/hooks/planning-with-files/scripts/planning-hot-context.mjs'),
    path.join(process.cwd(), 'harness/core/hooks/planning-with-files/scripts/render-session-summary.mjs'),
    path.join(process.cwd(), 'harness/core/hooks/planning-with-files/scripts/session-summary.mjs')
  ]);
  assert.equal(planning.scriptTargetRoot, path.join(process.cwd(), '.cursor/hooks'));
});

test('planHookProjections returns copilot planning hook config under .github/hooks', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'copilot',
    hookMode: 'on'
  });
  const planning = plans.find((plan) => plan.parentSkillName === 'planning-with-files');

  assert.equal(planning.status, 'planned');
  assert.equal(planning.configTarget, path.join(process.cwd(), '.github/hooks/planning-with-files.json'));
  assert.equal(planning.scriptTargetRoot, path.join(process.cwd(), '.github/hooks'));
});

test('planHookProjections returns claude workspace hook config in settings with scripts under hooks', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'claude-code',
    hookMode: 'on'
  });
  const planning = plans.find((plan) => plan.parentSkillName === 'planning-with-files');

  assert.equal(planning.status, 'planned');
  assert.equal(planning.configTarget, path.join(process.cwd(), '.claude/settings.json'));
  assert.equal(planning.configFormat, 'settings');
  assert.equal(planning.scriptTargetRoot, path.join(process.cwd(), '.claude/hooks'));
});

test('planHookProjections returns claude user-global hook config in settings with scripts under hooks', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'user-global',
    target: 'claude-code',
    hookMode: 'on'
  });
  const planning = plans.find((plan) => plan.parentSkillName === 'planning-with-files');

  assert.equal(planning.status, 'planned');
  assert.equal(planning.configTarget, '/home/user/.claude/settings.json');
  assert.equal(planning.configFormat, 'settings');
  assert.equal(planning.scriptTargetRoot, '/home/user/.claude/hooks');
});

test('planHookProjections returns codex planning hook config under .codex', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    hookMode: 'on'
  });
  const planning = plans.find((plan) => plan.parentSkillName === 'planning-with-files');

  assert.equal(planning.status, 'planned');
  assert.equal(planning.configTarget, path.join(process.cwd(), '.codex/hooks.json'));
  assert.equal(planning.configFormat, 'hooks');
  assert.equal(planning.scriptTargetRoot, path.join(process.cwd(), '.codex/hooks'));
});

test('planHookProjections returns codex superpowers hook config under .codex', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    hookMode: 'on'
  });
  const superpowers = plans.find((plan) => plan.parentSkillName === 'superpowers');

  assert.equal(superpowers.status, 'planned');
  assert.equal(superpowers.configTarget, path.join(process.cwd(), '.codex/hooks.json'));
  assert.deepEqual(superpowers.scriptSourcePaths, [
    path.join(process.cwd(), 'harness/core/hooks/superpowers/scripts/session-start'),
    path.join(process.cwd(), 'harness/core/hooks/superpowers/scripts/run-hook.cmd')
  ]);
  assert.equal(superpowers.scriptTargetRoot, path.join(process.cwd(), '.codex/hooks'));
});

test('planHookProjections returns copilot superpowers hook config under .github/hooks', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'copilot',
    hookMode: 'on'
  });
  const superpowers = plans.find((plan) => plan.parentSkillName === 'superpowers');

  assert.equal(superpowers.status, 'planned');
  assert.equal(superpowers.configTarget, path.join(process.cwd(), '.github/hooks/superpowers.json'));
  assert.deepEqual(superpowers.scriptSourcePaths, [
    path.join(process.cwd(), 'harness/core/hooks/superpowers/scripts/session-start'),
    path.join(process.cwd(), 'harness/core/hooks/superpowers/scripts/run-hook.cmd')
  ]);
  assert.equal(superpowers.scriptTargetRoot, path.join(process.cwd(), '.github/hooks'));
});

test('planHookProjections adds copilot safety hooks under .github/hooks', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'copilot',
    hookMode: 'on',
    policyProfile: 'safety'
  });
  const safety = plans.find((plan) => plan.parentSkillName === 'safety');

  assert.equal(safety.status, 'planned');
  assert.equal(safety.configTarget, path.join(process.cwd(), '.github/hooks/safety.json'));
  assert.deepEqual(safety.scriptSourcePaths, [
    path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh'),
    path.join(process.cwd(), 'harness/core/hooks/safety/scripts/session-checkpoint.sh')
  ]);
  assert.equal(safety.scriptTargetRoot, path.join(process.cwd(), '.github/hooks'));
});

test('planHookProjections adds safety hooks when the safety policy profile is active', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    hookMode: 'on',
    policyProfile: 'safety'
  });
  const safety = plans.find((plan) => plan.parentSkillName === 'safety');

  assert.equal(safety.status, 'planned');
  assert.equal(safety.configTarget, path.join(process.cwd(), '.codex/hooks.json'));
  assert.deepEqual(safety.scriptSourcePaths, [
    path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh'),
    path.join(process.cwd(), 'harness/core/hooks/safety/scripts/session-checkpoint.sh')
  ]);
  assert.equal(safety.scriptTargetRoot, path.join(process.cwd(), '.codex/hooks'));
});

test('planHookProjections adds copilot safety hooks under .github/hooks when the safety policy profile is active', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'copilot',
    hookMode: 'on',
    policyProfile: 'safety'
  });
  const safety = plans.find((plan) => plan.parentSkillName === 'safety');

  assert.equal(safety.status, 'planned');
  assert.equal(safety.configTarget, path.join(process.cwd(), '.github/hooks/safety.json'));
  assert.deepEqual(safety.scriptSourcePaths, [
    path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh'),
    path.join(process.cwd(), 'harness/core/hooks/safety/scripts/session-checkpoint.sh')
  ]);
  assert.equal(safety.scriptTargetRoot, path.join(process.cwd(), '.github/hooks'));
});

test('planHookProjections skips safety hooks outside safety profiles', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    hookMode: 'on',
    policyProfile: 'always-on-core'
  });

  assert.ok(!plans.some((plan) => plan.parentSkillName === 'safety'));
});
