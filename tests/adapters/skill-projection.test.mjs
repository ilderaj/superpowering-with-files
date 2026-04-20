import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyCopilotPlanningPatch } from '../../harness/installer/lib/copilot-planning-patch.mjs';
import { materializeDirectoryProjection } from '../../harness/installer/lib/fs-ops.mjs';
import {
  planSkillProjections,
  projectionForSkill
} from '../../harness/installer/lib/skill-projection.mjs';

test('projectionForSkill returns Copilot materialize for planning-with-files', async () => {
  const result = await projectionForSkill(process.cwd(), 'planning-with-files', 'copilot');
  assert.equal(result.strategy, 'materialize');
  assert.match(result.source, /harness\/upstream\/planning-with-files/);
});

test('projectionForSkill returns materialize for Codex superpowers', async () => {
  const result = await projectionForSkill(process.cwd(), 'superpowers', 'codex');
  assert.equal(result.strategy, 'materialize');
  assert.match(result.source, /harness\/upstream\/superpowers\/skills/);
});

test('projectionForSkill rejects unknown targets', async () => {
  await assert.rejects(
    projectionForSkill(process.cwd(), 'superpowers', 'unknown'),
    /Unknown target/
  );
});

test('planSkillProjections expands superpowers collection children', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex'
  });

  const usingSuperpowers = plan.find((entry) => entry.skillName === 'using-superpowers');
  assert.ok(usingSuperpowers);
  assert.equal(usingSuperpowers.parentSkillName, 'superpowers');
  assert.equal(usingSuperpowers.strategy, 'materialize');
  assert.match(usingSuperpowers.sourcePath, /harness\/upstream\/superpowers\/skills\/using-superpowers$/);
  assert.match(usingSuperpowers.targetPath, /\.agents\/skills\/using-superpowers$/);
});

test('planSkillProjections marks Superpowers writing-plans for Harness plan-location patching', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex'
  });

  const writingPlans = plan.find((entry) => entry.skillName === 'writing-plans');
  assert.ok(writingPlans);
  assert.deepEqual(writingPlans.patches.map((patch) => patch.type), ['superpowers-writing-plans']);
  assert.equal(writingPlans.patches[0].marker, 'Harness Superpowers writing-plans location patch');
});

test('planSkillProjections applies the writing-plans patch for every supported target', async () => {
  const expectations = {
    codex: /\.agents\/skills\/writing-plans$/,
    copilot: /\.agents\/skills\/writing-plans$/,
    cursor: /\.cursor\/skills\/writing-plans$/,
    'claude-code': /\.claude\/skills\/writing-plans$/
  };

  for (const [target, targetPathPattern] of Object.entries(expectations)) {
    const plan = await planSkillProjections({
      rootDir: process.cwd(),
      homeDir: '/home/user',
      scope: 'workspace',
      target
    });

    const writingPlans = plan.find((entry) => entry.skillName === 'writing-plans');
    assert.ok(writingPlans, target);
    assert.equal(writingPlans.parentSkillName, 'superpowers', target);
    assert.equal(writingPlans.strategy, 'materialize', target);
    assert.deepEqual(writingPlans.patches.map((patch) => patch.type), ['superpowers-writing-plans'], target);
    assert.equal(writingPlans.patches[0].marker, 'Harness Superpowers writing-plans location patch', target);
    assert.match(writingPlans.sourcePath, /harness\/upstream\/superpowers\/skills\/writing-plans$/, target);
    assert.match(writingPlans.targetPath, targetPathPattern, target);
  }
});

test('planSkillProjections materializes Copilot planning-with-files', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'copilot'
  });

  const planning = plan.find((entry) => entry.skillName === 'planning-with-files');
  assert.equal(planning.strategy, 'materialize');
  assert.deepEqual(
    planning.patches.map((patch) => patch.type),
    ['planning-with-files-companion-plan', 'copilot-planning-with-files']
  );
  assert.match(planning.targetPath, /\.agents\/skills\/planning-with-files$/);
});

test('planSkillProjections materializes Copilot planning-with-files for both scopes', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'both',
    target: 'copilot'
  });

  const planningTargets = plan
    .filter((entry) => entry.skillName === 'planning-with-files')
    .map((entry) => entry.targetPath)
    .sort();

  assert.deepEqual(planningTargets, [
    '/home/user/.agents/skills/planning-with-files',
    `${process.cwd()}/.agents/skills/planning-with-files`
  ].sort());
});

test('planSkillProjections applies the planning-with-files companion-plan patch for every supported target', async () => {
  const supportedTargets = ['codex', 'copilot', 'cursor', 'claude-code'];

  for (const target of supportedTargets) {
    const plan = await planSkillProjections({
      rootDir: process.cwd(),
      homeDir: '/home/user',
      scope: 'workspace',
      target
    });

    const planning = plan.find((entry) => entry.skillName === 'planning-with-files');
    assert.ok(planning, target);
    assert.equal(planning.strategy, 'materialize', target);
    assert.ok(Array.isArray(planning.patches), target);
    assert.ok(
      planning.patches.some((patch) => patch.type === 'planning-with-files-companion-plan'),
      target
    );
    assert.ok(
      planning.patches.some((patch) => patch.marker === 'Harness planning-with-files companion-plan patch'),
      target
    );

    if (target === 'copilot') {
      assert.ok(
        planning.patches.some((patch) => patch.type === 'copilot-planning-with-files'),
        target
      );
      assert.ok(
        planning.patches.some((patch) => patch.marker === 'Harness Copilot planning-with-files patch'),
        target
      );
    } else {
      assert.ok(
        planning.patches.every((patch) => patch.type !== 'copilot-planning-with-files'),
        target
      );
    }
  }
});

test('applyCopilotPlanningPatch materializes Copilot-specific skill content', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-copilot-patch-'));
  try {
    const target = path.join(dir, 'planning-with-files');
    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/planning-with-files'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    await applyCopilotPlanningPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.match(skill, /Harness planning-with-files companion-plan patch/);
    assert.match(skill, /Harness Copilot planning-with-files patch/);
    assert.match(skill, /If superpowers is used on a Deep-reasoning task, persist the detailed implementation plan/);
    assert.doesNotMatch(
      skill,
      /Do not create a parallel long-lived superpowers plan unless the user explicitly requests that file\./
    );
    assert.doesNotMatch(skill, /\$\{CLAUDE_PLUGIN_ROOT\}/);
    assert.match(skill, /\.github\/skills\/planning-with-files/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
