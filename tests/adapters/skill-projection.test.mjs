import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyCopilotPlanningPatch } from '../../harness/installer/lib/copilot-planning-patch.mjs';
import { materializeDirectoryProjection } from '../../harness/installer/lib/fs-ops.mjs';
import {
  planSkillProjections,
  projectionForSkill
} from '../../harness/installer/lib/skill-projection.mjs';

const execFileAsync = promisify(execFile);

function extractCopilotSnippet(skill) {
  const match = skill.match(/```bash\n([\s\S]*?)\n```/);
  assert.ok(match, 'expected Copilot shell snippet');
  return match[1];
}

async function resolveCopilotSkillRoot(snippet, cwd, env = {}) {
  const { stdout } = await execFileAsync(
    'sh',
    ['-c', `${snippet}\nprintf '%s' "$COPILOT_PLANNING_WITH_FILES_ROOT"`],
    {
      cwd,
      env: {
        ...process.env,
        ...env
      }
    }
  );

  return stdout.trim();
}

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

test('planSkillProjections applies the using-git-worktrees naming patch for every supported target', async () => {
  const expectations = {
    codex: /\.agents\/skills\/using-git-worktrees$/,
    copilot: /\.agents\/skills\/using-git-worktrees$/,
    cursor: /\.cursor\/skills\/using-git-worktrees$/,
    'claude-code': /\.claude\/skills\/using-git-worktrees$/
  };

  for (const [target, targetPathPattern] of Object.entries(expectations)) {
    const plan = await planSkillProjections({
      rootDir: process.cwd(),
      homeDir: '/home/user',
      scope: 'workspace',
      target
    });

    const usingGitWorktrees = plan.find((entry) => entry.skillName === 'using-git-worktrees');
    assert.ok(usingGitWorktrees, target);
    assert.equal(usingGitWorktrees.parentSkillName, 'superpowers', target);
    assert.equal(usingGitWorktrees.strategy, 'materialize', target);
    assert.deepEqual(
      usingGitWorktrees.patches.map((patch) => patch.type),
      ['superpowers-using-git-worktrees'],
      target
    );
    assert.equal(
      usingGitWorktrees.patches[0].marker,
      'Harness Superpowers using-git-worktrees naming patch',
      target
    );
    assert.match(
      usingGitWorktrees.sourcePath,
      /harness\/upstream\/superpowers\/skills\/using-git-worktrees$/,
      target
    );
    assert.match(usingGitWorktrees.targetPath, targetPathPattern, target);
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
    assert.match(
      skill,
      /```bash\nCOPILOT_PLANNING_WITH_FILES_ROOT="\$\{HARNESS_AGENT_SKILL_ROOT:-\$\{GITHUB_COPILOT_SKILL_ROOT:-\.agents\/skills\/planning-with-files\}\}"\nif \[ ! -f "\$COPILOT_PLANNING_WITH_FILES_ROOT\/scripts\/session-catchup\.py" \] && \[ -n "\$\{HOME:-\}" \]; then\n  COPILOT_PLANNING_WITH_FILES_ROOT="\$HOME\/\.agents\/skills\/planning-with-files"\nfi\nif \[ ! -f "\$COPILOT_PLANNING_WITH_FILES_ROOT\/scripts\/session-catchup\.py" \]; then\n  COPILOT_PLANNING_WITH_FILES_ROOT="\.github\/skills\/planning-with-files"\n  if \[ ! -f "\$COPILOT_PLANNING_WITH_FILES_ROOT\/scripts\/session-catchup\.py" \] && \[ -n "\$\{HOME:-\}" \]; then\n    COPILOT_PLANNING_WITH_FILES_ROOT="\$HOME\/\.copilot\/skills\/planning-with-files"\n  fi\nfi\n```/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applyCopilotPlanningPatch shell snippet honors explicit env override when it is valid', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-copilot-env-override-'));
  try {
    const target = path.join(dir, 'planning-with-files');
    const overrideRoot = path.join(dir, 'override-skill-root');

    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/planning-with-files'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });
    await mkdir(path.join(overrideRoot, 'scripts'), { recursive: true });
    await writeFile(path.join(overrideRoot, 'scripts/session-catchup.py'), '# test override\n');

    await applyCopilotPlanningPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');
    const snippet = extractCopilotSnippet(skill);

    const resolvedRoot = await resolveCopilotSkillRoot(snippet, dir, {
      HARNESS_AGENT_SKILL_ROOT: overrideRoot
    });

    assert.equal(resolvedRoot, overrideRoot);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applyCopilotPlanningPatch shell snippet falls back to legacy Copilot workspace root when shared roots are absent', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-copilot-legacy-fallback-'));
  try {
    const target = path.join(dir, 'planning-with-files');
    const legacyRoot = path.join(dir, '.github/skills/planning-with-files');

    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/planning-with-files'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });
    await mkdir(path.join(legacyRoot, 'scripts'), { recursive: true });
    await writeFile(path.join(legacyRoot, 'scripts/session-catchup.py'), '# legacy fallback\n');

    await applyCopilotPlanningPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');
    const snippet = extractCopilotSnippet(skill);

    const resolvedRoot = await resolveCopilotSkillRoot(snippet, dir, {
      HARNESS_AGENT_SKILL_ROOT: '',
      GITHUB_COPILOT_SKILL_ROOT: '',
      HOME: path.join(dir, 'home-without-shared-skill')
    });

    assert.equal(resolvedRoot, '.github/skills/planning-with-files');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
