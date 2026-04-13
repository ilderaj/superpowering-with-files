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
    path.join(process.cwd(), 'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh')
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

test('planHookProjections models unsupported superpowers target explicitly', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    hookMode: 'on'
  });
  const superpowers = plans.find((plan) => plan.parentSkillName === 'superpowers');

  assert.equal(superpowers.status, 'unsupported');
  assert.match(superpowers.message, /No verified superpowers hook adapter for codex/);
});
