import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planSkillProjections } from '../../harness/installer/lib/skill-projection.mjs';

function projectionKey(projection) {
  return `${projection.parentSkillName}:${projection.skillName}`;
}

test('second-opinion advisory joins the hybrid family while default profiles remain unchanged', async () => {
  const profiles = JSON.parse(await readFile('harness/core/skills/profiles.json', 'utf8'));
  const index = JSON.parse(await readFile('harness/core/skills/index.json', 'utf8'));

  assert.equal(profiles.defaultProfile, 'standard');
  assert.equal(profiles.policyProfileBySkillProfile['second-opinion-advisory'], 'always-on-core');
  assert.deepEqual(profiles.profiles['second-opinion-advisory'], [
    'planning-with-files',
    'second-opinion-advisory'
  ]);

  for (const profile of [
    'minimal-global',
    'standard',
    'copilot-default',
    'office',
    'matt-pilot',
    'superpowers-pilot'
  ]) {
    assert.ok(!profiles.profiles[profile].includes('second-opinion-advisory'), profile);
  }
  for (const profile of ['hybrid-candidate', 'high-assurance', 'full']) {
    assert.ok(profiles.profiles[profile].includes('second-opinion-advisory'), profile);
  }

  assert.deepEqual(index.skills['second-opinion-advisory'], {
    source: 'local',
    baselinePath: 'harness/core/skills/second-opinion-advisory',
    layout: 'single',
    targetName: 'second-opinion-advisory',
    projection: {
      default: 'materialize',
      copilot: 'materialize',
      cursor: 'materialize',
      codex: 'materialize',
      'claude-code': 'materialize'
    }
  });

  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    skillProfile: 'second-opinion-advisory'
  });

  assert.deepEqual(plan.map(projectionKey).sort(), [
    'planning-with-files:planning-with-files',
    'second-opinion-advisory:second-opinion-advisory'
  ]);

  const hybridPlan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex',
    skillProfile: 'hybrid-candidate'
  });
  assert.ok(
    hybridPlan.map(projectionKey).includes('second-opinion-advisory:second-opinion-advisory')
  );
});

test('second-opinion advisory documents a confirmed advisory-only workflow', async () => {
  const skill = await readFile('harness/core/skills/second-opinion-advisory/SKILL.md', 'utf8');

  assert.match(skill, /^---[\s\S]*^name:\s*second-opinion-advisory/m);
  assert.match(skill, /## Preflight Record/);
  assert.match(skill, /## Explicit Human Confirmation/);
  assert.match(skill, /I approve sharing the reviewed, redacted consultation package/);
  assert.match(skill, /## Advisory Handling/);
  assert.match(skill, /planning\/active\/<task-id>\//);
  assert.match(skill, /does not install, register, invoke, or control any external runtime/i);
  assert.match(skill, /must not automatically change Harness state/i);
});
