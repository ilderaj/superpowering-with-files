import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSkillProjections } from '../../harness/installer/lib/skill-projection.mjs';

function projectionKey(projection) {
  return `${projection.parentSkillName}:${projection.skillName}`;
}

test('minimal-global only projects the allow-listed subset for user-global Codex', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'user-global',
    target: 'codex',
    skillProfile: 'minimal-global'
  });

  const keys = plan.map(projectionKey).sort();
  const allowedGlobalRoot = '/home/user/.agents/skills/';
  assert.deepEqual(keys, [
    'planning-with-files:planning-with-files',
    'superpowers:executing-plans',
    'superpowers:using-superpowers',
    'superpowers:verification-before-completion',
    'superpowers:writing-plans'
  ]);
  assert.ok(plan.every((projection) => projection.targetPath.startsWith(allowedGlobalRoot)));
  assert.ok(!plan.some((projection) => projection.parentSkillName === 'superpowers' && projection.skillName === 'using-git-worktrees'));
  assert.ok(plan.some((projection) => projection.skillName === 'planning-with-files'));
});

test('full and default profile still project the full skill set', async () => {
  const fullPlan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    skillProfile: 'full'
  });
  const defaultPlan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex'
  });

  const fullKeys = fullPlan.map(projectionKey).sort();
  const defaultKeys = defaultPlan.map(projectionKey).sort();

  assert.deepEqual(defaultKeys, fullKeys);
  assert.ok(fullKeys.includes('planning-with-files:planning-with-files'));
  assert.ok(fullKeys.includes('superpowers:using-superpowers'));
});

test('unknown skill profile fails', async () => {
  await assert.rejects(
    planSkillProjections({
      rootDir: process.cwd(),
      homeDir: '/home/user',
      scope: 'workspace',
      target: 'codex',
      skillProfile: 'unknown'
    }),
    /Invalid skills profile: unknown/
  );
});
