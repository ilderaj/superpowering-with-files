import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyCopilotPlanningPatch } from '../../harness/installer/lib/copilot-planning-patch.mjs';
import { materializeDirectoryProjection } from '../../harness/installer/lib/fs-ops.mjs';
import { applyPlanningWithFilesSkillRootPatch } from '../../harness/installer/lib/planning-with-files-skill-root-patch.mjs';
import { applySuperpowersExecutingPlansReplanPatch } from '../../harness/installer/lib/superpowers-executing-plans-replan-patch.mjs';
import { applySuperpowersFinishingADevelopmentBranchPatch } from '../../harness/installer/lib/superpowers-finishing-a-development-branch-patch.mjs';
import { applySuperpowersUsingGitWorktreesPatch } from '../../harness/installer/lib/superpowers-using-git-worktrees-patch.mjs';
import { applySuperpowersVerificationBeforeCompletionPatch } from '../../harness/installer/lib/superpowers-verification-before-completion-patch.mjs';
import {
  classifySkillProjectionDuplicates,
  planSkillProjections,
  projectionForSkill
} from '../../harness/installer/lib/skill-projection.mjs';

const execFileAsync = promisify(execFile);

function extractPlanningSkillRootSnippet(skill) {
  const match = skill.match(/```bash\n([\s\S]*?)\n```/);
  assert.ok(match, 'expected planning-with-files shell snippet');
  return match[1];
}

async function resolvePlanningSkillRoot(snippet, cwd, env = {}) {
  const { stdout } = await execFileAsync(
    'sh',
    ['-c', `${snippet}\nprintf '%s' "$HARNESS_PLANNING_WITH_FILES_ROOT"`],
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

test('projectionForSkill returns materialize for local goal-writer skill', async () => {
  const result = await projectionForSkill(process.cwd(), 'goal-writer', 'codex');
  assert.equal(result.strategy, 'materialize');
  assert.match(result.source, /harness\/core\/skills\/goal-writer/);
});

test('projectionForSkill returns materialize for local goal2plan skill', async () => {
  const result = await projectionForSkill(process.cwd(), 'goal2plan', 'codex');
  assert.equal(result.strategy, 'materialize');
  assert.match(result.source, /harness\/core\/skills\/goal2plan/);
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

test('planSkillProjections marks Superpowers verification-before-completion for proof patching', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex'
  });

  const verificationSkill = plan.find((entry) => entry.skillName === 'verification-before-completion');
  assert.ok(verificationSkill);
  assert.deepEqual(
    verificationSkill.patches.map((patch) => patch.type),
    ['superpowers-verification-before-completion']
  );
  assert.equal(
    verificationSkill.patches[0].marker,
    'Harness Superpowers verification-before-completion proof patch'
  );
});

test('planSkillProjections includes local goal-writer in the full Codex workspace profile', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex'
  });

  const goalWriter = plan.find((entry) => entry.skillName === 'goal-writer');
  assert.ok(goalWriter);
  assert.equal(goalWriter.parentSkillName, 'goal-writer');
  assert.equal(goalWriter.strategy, 'materialize');
  assert.deepEqual(goalWriter.patches, []);
  assert.match(goalWriter.sourcePath, /harness\/core\/skills\/goal-writer$/);
  assert.match(goalWriter.targetPath, /\.agents\/skills\/goal-writer$/);
});

test('planSkillProjections includes local goal2plan in the full Codex workspace profile', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'codex'
  });

  const goal2plan = plan.find((entry) => entry.skillName === 'goal2plan');
  assert.ok(goal2plan);
  assert.equal(goal2plan.parentSkillName, 'goal2plan');
  assert.equal(goal2plan.strategy, 'materialize');
  assert.deepEqual(goal2plan.patches, []);
  assert.match(goal2plan.sourcePath, /harness\/core\/skills\/goal2plan$/);
  assert.match(goal2plan.targetPath, /\.agents\/skills\/goal2plan$/);
});

test('planSkillProjections applies the writing-plans patch for every supported target', async () => {
  const expectations = {
    codex: /\.agents\/skills\/writing-plans$/,
    copilot: /\.agents\/skills\/writing-plans$/,
    cursor: /\.agents\/skills\/writing-plans$/,
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
    cursor: /\.agents\/skills\/using-git-worktrees$/,
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

test('planSkillProjections applies the finishing-a-development-branch base patch for every supported target', async () => {
  const expectations = {
    codex: /\.agents\/skills\/finishing-a-development-branch$/,
    copilot: /\.agents\/skills\/finishing-a-development-branch$/,
    cursor: /\.agents\/skills\/finishing-a-development-branch$/,
    'claude-code': /\.claude\/skills\/finishing-a-development-branch$/
  };

  for (const [target, targetPathPattern] of Object.entries(expectations)) {
    const plan = await planSkillProjections({
      rootDir: process.cwd(),
      homeDir: '/home/user',
      scope: 'workspace',
      target
    });

    const finishingBranch = plan.find((entry) => entry.skillName === 'finishing-a-development-branch');
    assert.ok(finishingBranch, target);
    assert.equal(finishingBranch.parentSkillName, 'superpowers', target);
    assert.equal(finishingBranch.strategy, 'materialize', target);
    assert.deepEqual(
      finishingBranch.patches.map((patch) => patch.type),
      ['superpowers-finishing-a-development-branch'],
      target
    );
    assert.equal(
      finishingBranch.patches[0].marker,
      'Harness Superpowers finishing-a-development-branch base patch',
      target
    );
    assert.match(
      finishingBranch.sourcePath,
      /harness\/upstream\/superpowers\/skills\/finishing-a-development-branch$/,
      target
    );
    assert.match(finishingBranch.targetPath, targetPathPattern, target);
  }
});

test('planSkillProjections applies the executing-plans replan patch for every supported target', async () => {
  const expectations = {
    codex: /\.agents\/skills\/executing-plans$/,
    copilot: /\.agents\/skills\/executing-plans$/,
    cursor: /\.agents\/skills\/executing-plans$/,
    'claude-code': /\.claude\/skills\/executing-plans$/
  };

  for (const [target, targetPathPattern] of Object.entries(expectations)) {
    const plan = await planSkillProjections({
      rootDir: process.cwd(),
      homeDir: '/home/user',
      scope: 'workspace',
      target
    });

    const executingPlans = plan.find((entry) => entry.skillName === 'executing-plans');
    assert.ok(executingPlans, target);
    assert.equal(executingPlans.parentSkillName, 'superpowers', target);
    assert.equal(executingPlans.strategy, 'materialize', target);
    assert.deepEqual(
      executingPlans.patches.map((patch) => patch.type),
      ['superpowers-executing-plans-replan'],
      target
    );
    assert.equal(
      executingPlans.patches[0].marker,
      'Harness Superpowers executing-plans replan patch',
      target
    );
    assert.match(
      executingPlans.sourcePath,
      /harness\/upstream\/superpowers\/skills\/executing-plans$/,
      target
    );
    assert.match(executingPlans.targetPath, targetPathPattern, target);
  }
});

test('planSkillProjections applies the verification-before-completion proof patch for every supported target', async () => {
  const expectations = {
    codex: /\.agents\/skills\/verification-before-completion$/,
    copilot: /\.agents\/skills\/verification-before-completion$/,
    cursor: /\.agents\/skills\/verification-before-completion$/,
    'claude-code': /\.claude\/skills\/verification-before-completion$/
  };

  for (const [target, targetPathPattern] of Object.entries(expectations)) {
    const plan = await planSkillProjections({
      rootDir: process.cwd(),
      homeDir: '/home/user',
      scope: 'workspace',
      target
    });

    const verificationSkill = plan.find((entry) => entry.skillName === 'verification-before-completion');
    assert.ok(verificationSkill, target);
    assert.equal(verificationSkill.parentSkillName, 'superpowers', target);
    assert.equal(verificationSkill.strategy, 'materialize', target);
    assert.deepEqual(
      verificationSkill.patches.map((patch) => patch.type),
      ['superpowers-verification-before-completion'],
      target
    );
    assert.equal(
      verificationSkill.patches[0].marker,
      'Harness Superpowers verification-before-completion proof patch',
      target
    );
    assert.match(
      verificationSkill.sourcePath,
      /harness\/upstream\/superpowers\/skills\/verification-before-completion$/,
      target
    );
    assert.match(verificationSkill.targetPath, targetPathPattern, target);
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
    ['planning-with-files-companion-plan', 'planning-with-files-skill-root']
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

    if (['codex', 'copilot', 'cursor'].includes(target)) {
      assert.ok(
        planning.patches.some((patch) => patch.type === 'planning-with-files-skill-root'),
        target
      );
      assert.ok(
        planning.patches.some(
          (patch) => patch.marker === 'Harness planning-with-files skill-root resolution patch'
        ),
        target
      );
    } else {
      assert.ok(
        planning.patches.every((patch) => patch.type !== 'planning-with-files-skill-root'),
        target
      );
    }
  }
});

test('applyPlanningWithFilesSkillRootPatch materializes shared skill-root content', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-planning-skill-root-patch-'));
  try {
    const target = path.join(dir, 'planning-with-files');
    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/planning-with-files'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    await applyPlanningWithFilesSkillRootPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.match(skill, /Harness planning-with-files companion-plan patch/);
    assert.match(skill, /Harness planning-with-files skill-root resolution patch/);
    assert.match(skill, /If superpowers is used on a Deep-reasoning task, persist the detailed implementation plan/);
    assert.match(skill, /\$HARNESS_PLANNING_WITH_FILES_ROOT/);
    assert.doesNotMatch(
      skill,
      /Do not create a parallel long-lived superpowers plan unless the user explicitly requests that file\./
    );
    assert.doesNotMatch(skill, /\$\{CLAUDE_PLUGIN_ROOT\}/);
    assert.doesNotMatch(skill, /Harness Copilot planning-with-files patch/);
    assert.doesNotMatch(skill, /\.claude\\skills\\planning-with-files\\scripts\\session-catchup\.py/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applyPlanningWithFilesSkillRootPatch shell snippet honors explicit env override when it is valid', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-planning-skill-root-env-override-'));
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

    await applyPlanningWithFilesSkillRootPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');
    const snippet = extractPlanningSkillRootSnippet(skill);

    const resolvedRoot = await resolvePlanningSkillRoot(snippet, dir, {
      HARNESS_AGENT_SKILL_ROOT: overrideRoot
    });

    assert.equal(resolvedRoot, overrideRoot);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applyPlanningWithFilesSkillRootPatch replaces legacy Copilot-specific materialized content', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-planning-skill-root-legacy-materialized-'));
  try {
    const target = path.join(dir, 'planning-with-files');

    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/planning-with-files'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });
    await applyCopilotPlanningPatch(target);

    await applyPlanningWithFilesSkillRootPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.match(skill, /Harness planning-with-files skill-root resolution patch/);
    assert.match(skill, /HARNESS_PLANNING_WITH_FILES_ROOT/);
    assert.doesNotMatch(skill, /Harness Copilot planning-with-files patch/);
    assert.doesNotMatch(skill, /COPILOT_PLANNING_WITH_FILES_ROOT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applyPlanningWithFilesSkillRootPatch shell snippet falls back to legacy workspace root when shared roots are absent', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-planning-skill-root-legacy-fallback-'));
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

    await applyPlanningWithFilesSkillRootPatch(target, { preferGithubSkillRoot: true });
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');
    const snippet = extractPlanningSkillRootSnippet(skill);

    const resolvedRoot = await resolvePlanningSkillRoot(snippet, dir, {
      HARNESS_AGENT_SKILL_ROOT: '',
      GITHUB_COPILOT_SKILL_ROOT: '',
      HOME: path.join(dir, 'home-without-shared-skill')
    });

    assert.equal(resolvedRoot, '.github/skills/planning-with-files');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applyPlanningWithFilesSkillRootPatch preserves the shared block when cleaning a mixed legacy copy', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-planning-skill-root-mixed-copy-'));
  try {
    const target = path.join(dir, 'planning-with-files');

    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/planning-with-files'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });
    await applyCopilotPlanningPatch(target);

    const skillPath = path.join(target, 'SKILL.md');
    const mixed = (await readFile(skillPath, 'utf8')).replace(
      '# Planning with Files',
      [
        '# Harness planning-with-files skill-root resolution patch',
        '',
        'This materialized copy is maintained by Harness for Agent Skills compatible tools.',
        '',
        '```bash',
        'HARNESS_PLANNING_WITH_FILES_ROOT="${HARNESS_AGENT_SKILL_ROOT:-${GITHUB_COPILOT_SKILL_ROOT:-.agents/skills/planning-with-files}}"',
        '```',
        '',
        '# Planning with Files'
      ].join('\n')
    );
    await writeFile(skillPath, mixed);

    await applyPlanningWithFilesSkillRootPatch(target);
    const skill = await readFile(skillPath, 'utf8');

    assert.equal((skill.match(/Harness planning-with-files skill-root resolution patch/g) ?? []).length, 1);
    assert.doesNotMatch(skill, /Harness Copilot planning-with-files patch/);
    assert.match(skill, /\$HOME\/\.copilot\/skills\/planning-with-files/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersFinishingADevelopmentBranchPatch materializes Harness base guidance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-finishing-branch-patch-'));
  try {
    const target = path.join(dir, 'finishing-a-development-branch');
    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/superpowers/skills/finishing-a-development-branch'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    await applySuperpowersFinishingADevelopmentBranchPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.match(skill, /Harness Superpowers finishing-a-development-branch base patch/);
    assert.match(skill, /Prefer the recorded `Worktree base: <base-ref> @ <base-sha>` from planning\/active\/<task-id>\//);
    assert.match(skill, /Only fall back to explicit user confirmation or a conservative branch check when no recorded worktree base is available/);
    assert.doesNotMatch(skill, /This branch split from main - is that correct\?/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersFinishingADevelopmentBranchPatch is idempotent', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-finishing-branch-idempotent-'));
  try {
    const target = path.join(dir, 'finishing-a-development-branch');
    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/superpowers/skills/finishing-a-development-branch'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    await applySuperpowersFinishingADevelopmentBranchPatch(target);
    const once = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    await applySuperpowersFinishingADevelopmentBranchPatch(target);
    const twice = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.equal(twice, once);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersFinishingADevelopmentBranchPatch preserves upstream detect-environment step', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-finishing-branch-new-layout-'));
  try {
    const target = path.join(dir, 'finishing-a-development-branch');
    await mkdir(target, { recursive: true });
    await writeFile(
      path.join(target, 'SKILL.md'),
      [
        '# Finishing a Development Branch',
        '',
        '### Step 1: Verify Tests',
        '',
        'Tests first.',
        '',
        '### Step 2: Detect Environment',
        '',
        'Figure out the workspace type first.',
        '',
        '### Step 3: Determine Base Branch',
        '',
        'Or ask: "This branch split from main - is that correct?"',
        '',
        '### Step 4: Present Options',
        '',
        'Show the menu.'
      ].join('\n')
    );

    await applySuperpowersFinishingADevelopmentBranchPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.match(skill, /### Step 2: Detect Environment/);
    assert.match(skill, /## Harness Superpowers finishing-a-development-branch base patch/);
    assert.match(skill, /### Step 3: Determine Base Branch/);
    assert.match(skill, /Worktree base: <base-ref> @ <base-sha>/);
    assert.doesNotMatch(skill, /This branch split from main - is that correct\?/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersFinishingADevelopmentBranchPatch fails when Step 2 cannot be found', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-finishing-branch-missing-step-'));
  try {
    const target = path.join(dir, 'finishing-a-development-branch');
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'SKILL.md'), '# broken skill\n');

    await assert.rejects(
      applySuperpowersFinishingADevelopmentBranchPatch(target),
      /Unable to apply Harness Superpowers finishing-a-development-branch base patch/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersUsingGitWorktreesPatch preserves directory-selection fallback layout', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-using-worktrees-new-layout-'));
  try {
    const target = path.join(dir, 'using-git-worktrees');
    await mkdir(target, { recursive: true });
    await writeFile(
      path.join(target, 'SKILL.md'),
      [
        '# Using Git Worktrees',
        '',
        '## Step 1: Create Isolated Workspace',
        '',
        '### 1b. Git Worktree Fallback',
        '',
        'Use git directly.',
        '',
        '#### Directory Selection',
        '',
        'Pick a directory.',
        '',
        '#### Create the Worktree',
        '',
        'Run git worktree add.'
      ].join('\n')
    );

    await applySuperpowersUsingGitWorktreesPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.match(skill, /## Harness Superpowers using-git-worktrees naming patch/);
    assert.match(skill, /Before creating a manual worktree, run \.\/scripts\/harness worktree-name/);
    assert.match(skill, /#### Directory Selection/);
    assert.match(skill, /#### Create the Worktree/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersExecutingPlansReplanPatch materializes Harness replan guidance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-executing-plans-patch-'));
  try {
    const target = path.join(dir, 'executing-plans');
    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/superpowers/skills/executing-plans'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    await applySuperpowersExecutingPlansReplanPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.match(skill, /## Harness Superpowers executing-plans replan patch/);
    assert.match(
      skill,
      /classify it first: `implementation issue`, `plan issue`, `acceptance proof issue`, or `governance proof issue`/
    );
    assert.match(skill, /Only a `plan issue` may trigger a bounded mini `review -> revise -> verify` loop/);
    assert.match(skill, /An `implementation issue` means the approved plan is still sound but the code or local fix is not there yet/);
    assert.match(skill, /An `acceptance proof issue` means the declared proof target is still unproven/);
    assert.match(skill, /A `governance proof issue` means the evidence sink, reconcile rule, or handoff record is incomplete/);
    assert.match(skill, /Keep the root goal stable/);
    assert.match(skill, /Sync durable changes back to `planning\/active\/<task-id>\/`/);
    assert.match(skill, /stop and record blockers instead of looping forever/);
    assert.doesNotMatch(skill, /Do not invoke `finishing-a-development-branch` just because verification feels incomplete/);
    assert.match(
      skill,
      /## Harness Superpowers executing-plans replan patch[\s\S]*## Remember/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersExecutingPlansReplanPatch is idempotent', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-executing-plans-idempotent-'));
  try {
    const target = path.join(dir, 'executing-plans');
    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/superpowers/skills/executing-plans'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    await applySuperpowersExecutingPlansReplanPatch(target);
    const once = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    await applySuperpowersExecutingPlansReplanPatch(target);
    const twice = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.equal(twice, once);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersExecutingPlansReplanPatch fails when Remember anchor cannot be found', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-executing-plans-missing-anchor-'));
  try {
    const target = path.join(dir, 'executing-plans');
    await mkdir(target, { recursive: true });
    await writeFile(
      path.join(target, 'SKILL.md'),
      [
        '# Executing Plans',
        '',
        '## Overview',
        '',
        'Broken anchor surface.',
        '',
        '## Integration',
        '',
        'Still missing the expected section.'
      ].join('\n')
    );

    await assert.rejects(
      applySuperpowersExecutingPlansReplanPatch(target),
      /Unable to apply Harness Superpowers executing-plans replan patch/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersVerificationBeforeCompletionPatch materializes declared-proof guidance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-verification-before-completion-patch-'));
  try {
    const target = path.join(dir, 'verification-before-completion');
    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/superpowers/skills/verification-before-completion'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    await applySuperpowersVerificationBeforeCompletionPatch(target);
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.match(skill, /## Harness Superpowers verification-before-completion proof patch/);
    assert.match(skill, /Start from the declared proof stack, not from a convenient command/);
    assert.match(skill, /Identify the `proof target`, `primary proof`, `backstop proof`, `escalation trigger`, `evidence sink`, `reconcile rule`, and `unacceptable substitute`/);
    assert.match(skill, /Run the declared `primary proof` first/);
    assert.match(skill, /Only use the declared `backstop proof` when the `escalation trigger` is actually met/);
    assert.match(skill, /Store the result in the declared `evidence sink` and apply the declared `reconcile rule` before claiming success/);
    assert.match(skill, /Treat the declared `unacceptable substitute` as disallowed evidence even if it is faster or greener/);
    assert.match(
      skill,
      /## Harness Superpowers verification-before-completion proof patch[\s\S]*## Common Failures/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersVerificationBeforeCompletionPatch is idempotent', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-verification-before-completion-idempotent-'));
  try {
    const target = path.join(dir, 'verification-before-completion');
    await materializeDirectoryProjection({
      sourcePath: path.join(process.cwd(), 'harness/upstream/superpowers/skills/verification-before-completion'),
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    await applySuperpowersVerificationBeforeCompletionPatch(target);
    const once = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    await applySuperpowersVerificationBeforeCompletionPatch(target);
    const twice = await readFile(path.join(target, 'SKILL.md'), 'utf8');

    assert.equal(twice, once);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySuperpowersVerificationBeforeCompletionPatch fails when Common Failures anchor cannot be found', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-verification-before-completion-missing-anchor-'));
  try {
    const target = path.join(dir, 'verification-before-completion');
    await mkdir(target, { recursive: true });
    await writeFile(
      path.join(target, 'SKILL.md'),
      [
        '# Verification Before Completion',
        '',
        '## Overview',
        '',
        'Broken anchor surface.',
        '',
        '## Missing Section',
        '',
        'Still missing the expected section.'
      ].join('\n')
    );

    await assert.rejects(
      applySuperpowersVerificationBeforeCompletionPatch(target),
      /Unable to apply Harness Superpowers verification-before-completion proof patch/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('classifySkillProjectionDuplicates distinguishes display duplicates from true duplicates', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-skill-duplicate-classifier-'));

  try {
    const sourceRoot = path.join(dir, 'sources');
    const canonicalSource = path.join(sourceRoot, 'using-superpowers');
    const canonicalSourceCopy = path.join(sourceRoot, 'using-superpowers-copy');
    const aliasSource = path.join(sourceRoot, 'using-superpowers-alias');
    const targetRoot = path.join(dir, 'targets');
    const firstTarget = path.join(targetRoot, 'workspace');
    const secondTarget = path.join(targetRoot, 'global');

    await mkdir(canonicalSource, { recursive: true });
    await mkdir(canonicalSourceCopy, { recursive: true });
    await mkdir(targetRoot, { recursive: true });
    await writeFile(path.join(canonicalSource, 'SKILL.md'), '# canonical\n');
    await writeFile(path.join(canonicalSourceCopy, 'SKILL.md'), '# duplicate\n');
    await symlink(canonicalSource, aliasSource);
    await symlink(canonicalSource, firstTarget);
    await symlink(aliasSource, secondTarget);
    const canonicalResolvedPath = await realpath(canonicalSource);

    const displayDuplicates = await classifySkillProjectionDuplicates([
      {
        kind: 'skill',
        target: 'copilot',
        skillName: 'using-superpowers',
        sourcePath: canonicalSource,
        targetPath: firstTarget
      },
      {
        kind: 'skill',
        target: 'copilot',
        skillName: 'using-superpowers',
        sourcePath: aliasSource,
        targetPath: secondTarget
      }
    ]);

    assert.deepEqual(displayDuplicates, [
      {
        target: 'copilot',
        skillName: 'using-superpowers',
        classification: 'display-duplicate',
        resolvedPath: canonicalResolvedPath,
        resolvedPaths: [canonicalResolvedPath],
        sourcePaths: [canonicalSource, aliasSource].sort(),
        targetPaths: [firstTarget, secondTarget].sort()
      }
    ]);

    await rm(secondTarget, { recursive: true, force: true });
    await symlink(canonicalSourceCopy, secondTarget);
    const duplicateResolvedPath = await realpath(canonicalSourceCopy);

    const trueDuplicates = await classifySkillProjectionDuplicates([
      {
        kind: 'skill',
        target: 'copilot',
        skillName: 'using-superpowers',
        sourcePath: canonicalSource,
        targetPath: firstTarget
      },
      {
        kind: 'skill',
        target: 'copilot',
        skillName: 'using-superpowers',
        sourcePath: canonicalSourceCopy,
        targetPath: secondTarget
      }
    ]);

    assert.deepEqual(trueDuplicates, [
      {
        target: 'copilot',
        skillName: 'using-superpowers',
        classification: 'true-duplicate',
        resolvedPath: [canonicalResolvedPath, duplicateResolvedPath].sort().join(', '),
        resolvedPaths: [canonicalResolvedPath, duplicateResolvedPath].sort(),
        sourcePaths: [canonicalSource, canonicalSourceCopy].sort(),
        targetPaths: [firstTarget, secondTarget].sort()
      }
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
