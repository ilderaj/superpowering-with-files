import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { coalesceSkillProjections } from '../../harness/installer/lib/skill-projection.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

test('sync projects selected workspace entries and skills', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      skillProfile: 'superpowers-pilot',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /Harness Policy For Codex/);
    await assert.rejects(lstat(path.join(root, '.agents/skills/using-superpowers')), /ENOENT/);

    const copilotPlanning = await readFile(path.join(root, '.agents/skills/planning-with-files/SKILL.md'), 'utf8');
    assert.match(copilotPlanning, /Harness planning-with-files companion-plan patch/);
    assert.match(copilotPlanning, /Harness planning-with-files skill-root resolution patch/);
    assert.match(
      copilotPlanning,
      /If superpowers is used on a Deep-reasoning task, persist the detailed implementation plan/
    );
    assert.match(
      copilotPlanning,
      /docs\/superpowers\/plans\/<date>-<task-id>\.md/
    );
    assert.match(
      copilotPlanning,
      /\$\{HARNESS_AGENT_SKILL_ROOT:-\$\{GITHUB_COPILOT_SKILL_ROOT:-\.agents\/skills\/planning-with-files\}\}[\s\S]*\$HOME\/\.agents\/skills\/planning-with-files[\s\S]*\.github\/skills\/planning-with-files[\s\S]*\$HOME\/\.cursor\/skills\/planning-with-files[\s\S]*\$HOME\/\.copilot\/skills\/planning-with-files[\s\S]*\$HOME\/\.claude\/skills\/planning-with-files/
    );
    await assert.rejects(lstat(path.join(root, '.github/skills/planning-with-files/SKILL.md')), /ENOENT/);
    assert.doesNotMatch(
      copilotPlanning,
      /Do not create a parallel long-lived superpowers plan unless the user explicitly requests that file\.|Harness Copilot planning-with-files patch/
    );
    assert.match(copilotPlanning, /tracked tasks/);
    assert.match(copilotPlanning, /Tool-call count is only a hint/);
    assert.match(
      await readFile(path.join(root, '.agents/skills/planning-with-files/.codex/hooks/permission_request.py'), 'utf8'),
      /resolve-active-plan-dir\.sh/
    );
    assert.match(
      await readFile(path.join(root, '.agents/skills/planning-with-files/.codex/hooks/resolve-active-plan-dir.sh'), 'utf8'),
      /planning_paths\.py/
    );
    assert.match(
      await readFile(path.join(root, '.agents/skills/planning-with-files/tests/test_codex_hooks.py'), 'utf8'),
      /test_permission_request_adapter_emits_plan_reminder_for_active_task_dir/
    );

    const writingPlans = await readFile(path.join(root, '.agents/skills/writing-plans/SKILL.md'), 'utf8');
    assert.match(writingPlans, /Harness Superpowers writing-plans location patch/);
    assert.match(writingPlans, /planning\/active\/<task-id>\/` as the primary task-memory location/);
    assert.match(writingPlans, /\*\*Save durable task state to:\*\* `planning\/active\/<task-id>\/task_plan\.md`/);
    assert.match(
      writingPlans,
      /Declare the proof stack explicitly: `proof target`, `primary proof`, `backstop proof`, `escalation trigger`, `evidence sink`, `reconcile rule`, and `unacceptable substitute`\./
    );
    assert.match(writingPlans, /Do not stop at listing commands;/);
    assert.match(
      writingPlans,
      /If a Deep-reasoning task actually uses Superpowers, create a companion plan/
    );
    assert.match(writingPlans, /secondary artifact for reasoning and review, not the primary task-memory record/);
    assert.match(writingPlans, /Keep the detailed implementation plan and execution checklist in that companion artifact/);
    assert.match(writingPlans, /write its path, a short summary, and the current sync-back status/);
    assert.match(
      writingPlans,
      /The companion plan must also point back to `planning\/active\/<task-id>\/`/
    );
    assert.match(
      writingPlans,
      /For Deep-reasoning rounds, restore the authoritative planning files before revising the companion plan/
    );
    assert.match(
      writingPlans,
      /require 1 read-only reviewer subagent before execution/
    );
    assert.match(writingPlans, /Bound plan-polishing to three verification rounds/);
    assert.match(
      writingPlans,
      /execute from that companion plan using normal Superpowers execution discipline/
    );
    assert.doesNotMatch(writingPlans, /you may additionally create a companion plan/);
    assert.doesNotMatch(writingPlans, /\*\*Save plans to:\*\* `docs\/superpowers\/plans/);

    const executingPlans = await readFile(path.join(root, '.agents/skills/executing-plans/SKILL.md'), 'utf8');
    assert.match(executingPlans, /Harness Superpowers executing-plans replan patch/);
    assert.match(
      executingPlans,
      /classify it first: `implementation issue`, `plan issue`, `acceptance proof issue`, or `governance proof issue`/
    );
    assert.match(executingPlans, /Only a `plan issue` may trigger a bounded mini `review -> revise -> verify` loop/);
    assert.doesNotMatch(
      executingPlans,
      /Do not invoke `finishing-a-development-branch` just because verification feels incomplete/
    );

    const verificationBeforeCompletion = await readFile(
      path.join(root, '.agents/skills/verification-before-completion/SKILL.md'),
      'utf8'
    );
    assert.match(
      verificationBeforeCompletion,
      /Harness Superpowers verification-before-completion proof patch/
    );
    assert.match(verificationBeforeCompletion, /Start from the declared proof stack, not from a convenient command/);
    assert.match(verificationBeforeCompletion, /Run the declared `primary proof` first/);
    assert.match(
      verificationBeforeCompletion,
      /Only use the declared `backstop proof` when the `escalation trigger` is actually met/
    );

    const usingGitWorktrees = await readFile(path.join(root, '.agents/skills/using-git-worktrees/SKILL.md'), 'utf8');
    assert.match(usingGitWorktrees, /Harness Superpowers using-git-worktrees naming patch/);
    assert.match(usingGitWorktrees, /Before creating a manual worktree, run \.\/scripts\/harness worktree-name/);
    assert.match(usingGitWorktrees, /Use the suggested worktree basename and branch name/);
    assert.match(
      usingGitWorktrees,
      /If the host already manages the worktree \(for example, Codex App\), treat this helper as a supplementary naming tool rather than a host override/
    );

    const subagentSkill = await readFile(
      path.join(root, '.agents/skills/subagent-driven-development/SKILL.md'),
      'utf8'
    );
    assert.match(subagentSkill, /Treat subagents as a budgeted resource/);
    assert.match(subagentSkill, /Before upgrading model capability, first narrow the task slice or trim context/);

    const implementerPrompt = await readFile(
      path.join(root, '.agents/skills/subagent-driven-development/implementer-prompt.md'),
      'utf8'
    );
    assert.match(implementerPrompt, /## Context Budget/);
    assert.match(implementerPrompt, /Do not accept broad session history or unrelated tasks as required context/);

    const taskReviewerPrompt = await readFile(
      path.join(root, '.agents/skills/subagent-driven-development/task-reviewer-prompt.md'),
      'utf8'
    );
    assert.match(taskReviewerPrompt, /## Review Budget/);
    assert.match(taskReviewerPrompt, /Review the changed files and the explicit requirements only/);
    assert.match(taskReviewerPrompt, /Include whether the controller kept the task narrow enough for the assigned model tier/);

    const finishingBranch = await readFile(
      path.join(root, '.agents/skills/finishing-a-development-branch/SKILL.md'),
      'utf8'
    );
    assert.match(finishingBranch, /Harness Superpowers finishing-a-development-branch base patch/);
    assert.match(finishingBranch, /Prefer the recorded `Worktree base: <base-ref> @ <base-sha>` from planning\/active\/<task-id>\//);
    assert.match(finishingBranch, /Only fall back to explicit user confirmation or a conservative branch check when no recorded worktree base is available/);
    assert.doesNotMatch(finishingBranch, /This branch split from main - is that correct\?/);

    const riskSkill = await readFile(
      path.join(root, '.agents/skills/risk-assessment-before-destructive-changes/SKILL.md'),
      'utf8'
    );
    assert.match(riskSkill, /Use when destructive changes/);

    const bypassSkill = await readFile(path.join(root, '.agents/skills/safe-bypass-flow/SKILL.md'), 'utf8');
    assert.match(bypassSkill, /Use when starting bypass/);

    const goalWriter = await readFile(path.join(root, '.agents/skills/goal-writer/SKILL.md'), 'utf8');
    assert.match(goalWriter, /name: goal-writer/);
    assert.match(goalWriter, /Use when preparing a Codex `\/goal` prompt/);
    assert.match(goalWriter, /## Outcome Contract/);
    assert.match(goalWriter, /## When to Use/);
    assert.match(goalWriter, /## Common Mistakes/);

    const goalWriterTemplate = await readFile(path.join(root, '.agents/skills/goal-writer/template.md'), 'utf8');
    assert.match(goalWriterTemplate, /Goal Writer Template/);
    assert.match(goalWriterTemplate, /Compact Frame for Simple \/ Quick Goals/);
    assert.match(goalWriterTemplate, /Return exactly one markdown fenced block/);
    assert.match(goalWriterTemplate, /Done Criteria:/);
    assert.match(goalWriterTemplate, /new or materially revised companion plan/);
    assert.match(goalWriterTemplate, /normal Superpowers execution, worktree, and git-progress discipline/);

    const goalWriterRubric = await readFile(path.join(root, '.agents/skills/goal-writer/rubric.md'), 'utf8');
    assert.match(goalWriterRubric, /Hard Checks/);
    assert.match(goalWriterRubric, /score `>=9\/10`/);

    const goalWriterFixture = await readFile(
      path.join(root, '.agents/skills/goal-writer/fixtures/deep-reasoning-task.json'),
      'utf8'
    );
    assert.match(goalWriterFixture, /deep-reasoning/);

    const goalWriterOutput = await readFile(
      path.join(root, '.agents/skills/goal-writer/outputs/tracked-task.goal.md'),
      'utf8'
    );
    assert.match(goalWriterOutput, /^```(?:text|md|markdown)?\n\/goal Objective:/);
    assert.match(goalWriterOutput, /All `8` fixture prompts pass/);

    const goal2plan = await readFile(path.join(root, '.agents/skills/goal2plan/SKILL.md'), 'utf8');
    assert.match(goal2plan, /name: goal2plan/);
    assert.match(goal2plan, /Mode B Contract/);
    assert.match(goal2plan, /native Codex `\/goal` prompt/);
    assert.match(goal2plan, /reviewed implementation plan/);
    assert.match(goal2plan, /planning\/active\/<task-id>\//);

    const goal2planTemplate = await readFile(path.join(root, '.agents/skills/goal2plan/template.md'), 'utf8');
    assert.match(goal2planTemplate, /native \/goal/);
    assert.match(goal2planTemplate, /do not execute implementation/i);
    assert.match(goal2planTemplate, /docs\/superpowers\/plans\/<date>-<task-id>\.md/);

    const goal2planRubric = await readFile(path.join(root, '.agents/skills/goal2plan/rubric.md'), 'utf8');
    assert.match(goal2planRubric, /Hard Checks/);
    assert.match(goal2planRubric, /does not implement a runner/i);

    const overengineeringReview = await readFile(
      path.join(root, '.agents/skills/overengineering-review/SKILL.md'),
      'utf8'
    );
    assert.match(overengineeringReview, /name: overengineering-review/);
    assert.match(overengineeringReview, /`delete`, `stdlib`, `native`, `yagni`, or `shrink`/);
    assert.match(overengineeringReview, /net: -<N> lines possible\./);
    assert.match(overengineeringReview, /Correctness, security, and performance findings belong to normal review, not this skill\./);

    const overengineeringRubric = await readFile(
      path.join(root, '.agents/skills/overengineering-review/rubric.md'),
      'utf8'
    );
    assert.match(overengineeringRubric, /Overengineering Review Rubric/);
    assert.match(overengineeringRubric, /`delete`, `stdlib`, `native`, `yagni`, or `shrink`/);

    const overengineeringFixture = await readFile(
      path.join(root, '.agents/skills/overengineering-review/fixtures/delete-wrapper.json'),
      'utf8'
    );
    assert.match(overengineeringFixture, /"requiredTag": "delete"/);

    const overengineeringOutput = await readFile(
      path.join(root, '.agents/skills/overengineering-review/outputs/delete-wrapper.md'),
      'utf8'
    );
    assert.match(overengineeringOutput, /tag: delete/);

    const simplificationLedger = await readFile(
      path.join(root, '.agents/skills/simplification-ledger/SKILL.md'),
      'utf8'
    );
    assert.match(simplificationLedger, /name: simplification-ledger/);
    assert.match(simplificationLedger, /rg -n '\(#\|\/\/\) \?swf-simplify:' \./);
    assert.match(simplificationLedger, /V1 supports hash-style and slash-style line comments only\./);
    assert.match(simplificationLedger, /no-trigger/);

    const simplificationLedgerRubric = await readFile(
      path.join(root, '.agents/skills/simplification-ledger/rubric.md'),
      'utf8'
    );
    assert.match(simplificationLedgerRubric, /Simplification Ledger Rubric/);
    assert.match(
      simplificationLedgerRubric,
      /No simplification markers found|Unsupported marker locations such as prose and block comments are ignored in V1/i
    );

    const simplificationLedgerFixture = await readFile(
      path.join(root, '.agents/skills/simplification-ledger/fixtures/missing-trigger.json'),
      'utf8'
    );
    assert.match(simplificationLedgerFixture, /"requireNoTrigger": true/);

    const simplificationLedgerOutput = await readFile(
      path.join(root, '.agents/skills/simplification-ledger/outputs/missing-trigger.md'),
      'utf8'
    );
    assert.match(simplificationLedgerOutput, /upgrade trigger: no-trigger/);

    const chiefops = await readFile(path.join(root, '.agents/skills/chiefops/SKILL.md'), 'utf8');
    assert.match(chiefops, /name: chiefops/);
    assert.match(chiefops, /planning\/active\/<task-id>\//);
    assert.match(chiefops, /\.harness\/execution\/receipts\/<taskId>\/\*\.json/);
    assert.match(chiefops, /does not create durable state, replace task memory, or act as a runner/i);

    const chiefopsTemplate = await readFile(path.join(root, '.agents/skills/chiefops/template.md'), 'utf8');
    assert.match(chiefopsTemplate, /ChiefOps Readout/);
    assert.match(chiefopsTemplate, /Forbidden moves:/);

    const chiefopsRubric = await readFile(path.join(root, '.agents/skills/chiefops/rubric.md'), 'utf8');
    assert.match(chiefopsRubric, /only durable task memory/);
    assert.match(chiefopsRubric, /one bounded next slice/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync materializes autonomous-release-closure for the full profile', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      skillProfile: 'full',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    const releaseClosure = await readFile(
      path.join(root, '.agents/skills/autonomous-release-closure/SKILL.md'),
      'utf8'
    );
    assert.match(releaseClosure, /name: autonomous-release-closure/);
    assert.match(releaseClosure, /## Outcome Contract/);
    assert.match(releaseClosure, /## Stage Contracts/);
    assert.match(releaseClosure, /planning\/active\/<task-id>\//);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync materializes executing-plans replan guidance for shared and Claude skill roots without regressing existing Superpowers patches', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] },
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] },
        'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    const targets = {
      shared: path.join(root, '.agents/skills/executing-plans/SKILL.md'),
      claude: path.join(root, '.claude/skills/executing-plans/SKILL.md')
    };

    for (const [target, skillPath] of Object.entries(targets)) {
      const skill = await readFile(skillPath, 'utf8');
      assert.match(skill, /Harness Superpowers executing-plans replan patch/, target);
      assert.match(skill, /Keep the root goal stable instead of reopening broad planning or route selection\./, target);
      assert.match(skill, /acceptance proof issue/, target);
      assert.match(skill, /governance proof issue/, target);
      assert.doesNotMatch(
        skill,
        /Do not invoke `finishing-a-development-branch` just because verification feels incomplete/,
        target
      );
    }

    const verificationTargets = {
      shared: path.join(root, '.agents/skills/verification-before-completion/SKILL.md'),
      claude: path.join(root, '.claude/skills/verification-before-completion/SKILL.md')
    };

    for (const [target, skillPath] of Object.entries(verificationTargets)) {
      const skill = await readFile(skillPath, 'utf8');
      assert.match(skill, /Harness Superpowers verification-before-completion proof patch/, target);
      assert.match(skill, /declared proof stack/, target);
      assert.match(skill, /declared `unacceptable substitute`/, target);
    }

    const writingPlansTargets = {
      shared: path.join(root, '.agents/skills/writing-plans/SKILL.md'),
      claude: path.join(root, '.claude/skills/writing-plans/SKILL.md')
    };

    for (const [target, skillPath] of Object.entries(writingPlansTargets)) {
      const skill = await readFile(skillPath, 'utf8');
      assert.match(skill, /Harness Superpowers writing-plans location patch/, target);
      assert.match(
        skill,
        /Declare the proof stack explicitly: `proof target`, `primary proof`, `backstop proof`, `escalation trigger`, `evidence sink`, `reconcile rule`, and `unacceptable substitute`\./,
        target
      );
      assert.match(skill, /Do not stop at listing commands;/, target);
    }

    assert.match(
      await readFile(path.join(root, '.agents/skills/writing-plans/SKILL.md'), 'utf8'),
      /Harness Superpowers writing-plans location patch/
    );
    assert.match(
      await readFile(path.join(root, '.agents/skills/using-git-worktrees/SKILL.md'), 'utf8'),
      /Harness Superpowers using-git-worktrees naming patch/
    );
    assert.match(
      await readFile(path.join(root, '.agents/skills/finishing-a-development-branch/SKILL.md'), 'utf8'),
      /Harness Superpowers finishing-a-development-branch base patch/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync normalizes legacy sibling backups under managed skill roots', async () => {
    const root = await createHarnessFixture();
    const homeDir = path.join(root, 'home');
    try {
      await mkdir(path.join(homeDir, '.claude/skills'), { recursive: true });
      const legacyBackup = path.join(
        homeDir,
        '.claude/skills/using-superpowers.harness-backup-20260426T044458'
      );
      await mkdir(legacyBackup, { recursive: true });
      await writeFile(
        path.join(legacyBackup, 'SKILL.md'),
        `---
name: using-superpowers
description: Legacy backup of a materialized skill
---

# using-superpowers
`
      );

      await withCwd(root, () => sync([]));

    await assert.rejects(
      lstat(path.join(homeDir, '.claude/skills/using-superpowers.harness-backup-20260426T044458')),
      /ENOENT/
    );
    const index = JSON.parse(await readFile(path.join(homeDir, '.harness/backup-index.json'), 'utf8'));
    assert.equal(index.entries.some((entry) => entry.originalPath.endsWith('using-superpowers')), true);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync coalesces shared skill projections across codex, copilot, and cursor', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] },
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    const realRoot = await realpath(root);
    const manifest = JSON.parse(
      await readFile(path.join(root, '.harness/projections.json'), 'utf8')
    );
    const planningEntries = manifest.entries.filter(
      (entry) =>
        entry.kind === 'skill' &&
        path.relative(realRoot, entry.targetPath) === '.agents/skills/planning-with-files'
    );

    assert.equal(planningEntries.length, 1);
    assert.deepEqual(planningEntries[0].targets, ['codex', 'copilot', 'cursor']);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('coalesceSkillProjections preserves first-seen order while deduping targets and patches', async () => {
  const projections = coalesceSkillProjections([
    {
      targetPath: '/tmp/shared-skill',
      sourcePath: '/tmp/source',
      target: 'copilot',
      patches: [
        { type: 'beta', marker: '2' },
        { type: 'alpha', marker: '1' }
      ]
    },
    {
      targetPath: '/tmp/shared-skill',
      sourcePath: '/tmp/source',
      target: 'codex',
      patches: [
        { type: 'alpha', marker: '1' },
        { type: 'gamma', marker: '3' }
      ]
    }
  ]);

  assert.deepEqual(projections, [
    {
      targetPath: '/tmp/shared-skill',
      sourcePath: '/tmp/source',
      target: 'copilot',
      patches: [
        { type: 'beta', marker: '2' },
        { type: 'alpha', marker: '1' },
        { type: 'gamma', marker: '3' }
      ],
      targets: ['copilot', 'codex']
    }
  ]);
});

test('coalesceSkillProjections still rejects shared target paths backed by different source strings', async () => {
  await assert.throws(
    () =>
      coalesceSkillProjections([
        {
          targetPath: '/tmp/shared-skill',
          sourcePath: '/tmp/upstream/using-superpowers',
          target: 'copilot',
          patches: []
        },
        {
          targetPath: '/tmp/shared-skill',
          sourcePath: '/tmp/upstream/using-superpowers-alias',
          target: 'copilot',
          patches: []
        }
      ]),
    /Shared skill root conflict/
  );
});

test('sync rejects non-owned skill target by default', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });
    await mkdir(path.join(root, '.agents/skills'), { recursive: true });
    await writeFile(path.join(root, '.agents/skills/planning-with-files'), 'user file');

    await assert.rejects(withCwd(root, () => sync([])), /Refusing to overwrite non-Harness-owned path/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync backs up non-owned skill target when requested', async () => {
  const root = await createHarnessFixture();
  const previousHome = process.env.HOME;
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });
    await mkdir(path.join(root, '.agents/skills'), { recursive: true });
    await writeFile(path.join(root, '.agents/skills/planning-with-files'), 'user file');
    process.env.HOME = path.join(root, 'home');

    await withCwd(root, () => sync(['--conflict=backup']));

    const skill = await readFile(path.join(root, '.agents/skills/planning-with-files/SKILL.md'), 'utf8');
    assert.match(skill, /Harness planning-with-files companion-plan patch/);
    assert.match(skill, /Harness planning-with-files skill-root resolution patch/);
    assert.doesNotMatch(skill, /Harness Copilot planning-with-files patch/);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    await removeHarnessFixture(root);
  }
});

test('sync patches planning-with-files companion-plan semantics for every supported target', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] },
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] },
        'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    const targets = {
      codex: path.join(root, '.agents/skills/planning-with-files/SKILL.md'),
      copilot: path.join(root, '.agents/skills/planning-with-files/SKILL.md'),
      cursor: path.join(root, '.agents/skills/planning-with-files/SKILL.md'),
      'claude-code': path.join(root, '.claude/skills/planning-with-files/SKILL.md')
    };

    for (const [target, skillPath] of Object.entries(targets)) {
      const skill = await readFile(skillPath, 'utf8');
      assert.match(skill, /Harness planning-with-files companion-plan patch/, target);
      assert.match(
        skill,
        /If superpowers is used on a Deep-reasoning task, persist the detailed implementation plan/,
        target
      );
      assert.match(skill, /companion plan path, a short summary, and the current sync-back status/, target);
      assert.match(skill, /The companion plan must also point back to `planning\/active\/<task-id>\/`/, target);
      assert.doesNotMatch(
        skill,
        /Do not create a parallel long-lived superpowers plan unless the user explicitly requests that file\./,
        target
      );
    }

    const copilotSkill = await readFile(targets.copilot, 'utf8');
    assert.match(copilotSkill, /Harness planning-with-files skill-root resolution patch/);
    await assert.rejects(lstat(path.join(root, '.github/skills/planning-with-files/SKILL.md')), /ENOENT/);
    await assert.rejects(lstat(path.join(root, '.cursor/skills/planning-with-files/SKILL.md')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync removes stale Harness-managed Cursor skill projections after shared root migration', async () => {
  const root = await createHarnessFixture();
  try {
    const staleSkill = path.join(root, '.cursor/skills/planning-with-files');
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });
    await mkdir(staleSkill, { recursive: true });
    await writeFile(
      path.join(staleSkill, 'SKILL.md'),
      [
        '---',
        'name: planning-with-files',
        'description: stale cursor projection',
        '---',
        '',
        '# planning-with-files',
        '',
        'Harness planning-with-files companion-plan patch'
      ].join('\n')
    );
    await writeFile(
      path.join(root, '.harness/projections.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              kind: 'skill',
              parentSkillName: 'planning-with-files',
              skillName: 'planning-with-files',
              target: 'cursor',
              deploymentProfile: 'standard',
              strategy: 'materialize',
              sourcePath: path.join(root, 'harness/upstream/planning-with-files'),
              targetPath: staleSkill,
              patches: [
                {
                  type: 'planning-with-files-companion-plan',
                  marker: 'Harness planning-with-files companion-plan patch'
                }
              ]
            }
          ]
        },
        null,
        2
      )}\n`
    );

    await withCwd(root, () => sync([]));

    await assert.rejects(lstat(path.join(staleSkill, 'SKILL.md')), /ENOENT/);
    assert.equal((await lstat(path.join(root, '.agents/skills/planning-with-files'))).isDirectory(), true);
    assert.match(
      await readFile(path.join(root, '.agents/skills/planning-with-files/SKILL.md'), 'utf8'),
      /Harness planning-with-files companion-plan patch/
    );
    assert.match(
      await readFile(path.join(root, '.agents/skills/planning-with-files/SKILL.md'), 'utf8'),
      /Harness planning-with-files skill-root resolution patch/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync refreshes materialized Copilot skill after upstream changes', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, 'harness/upstream/planning-with-files/UPSTREAM_REFRESH_MARKER.md'),
      'refreshed baseline'
    );
    await withCwd(root, () => sync([]));

    assert.equal(
      await readFile(path.join(root, '.agents/skills/planning-with-files/UPSTREAM_REFRESH_MARKER.md'), 'utf8'),
      'refreshed baseline'
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync refreshes a materialized Codex collection skill after upstream changes', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      skillProfile: 'superpowers-pilot',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, 'harness/upstream/superpowers/skills/writing-plans/UPSTREAM_REFRESH_MARKER.md'),
      'refreshed baseline'
    );
    await withCwd(root, () => sync([]));

    assert.equal(
      await readFile(path.join(root, '.agents/skills/writing-plans/UPSTREAM_REFRESH_MARKER.md'), 'utf8'),
      'refreshed baseline'
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync trims full-only skills when switching to minimal-global', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      skillProfile: 'full',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    assert.equal((await lstat(path.join(root, '.agents/skills/using-git-worktrees'))).isDirectory(), true);

    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      skillProfile: 'minimal-global',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    await assert.rejects(lstat(path.join(root, '.agents/skills/using-git-worktrees')), /ENOENT/);
    await assert.rejects(lstat(path.join(root, '.agents/skills/brainstorming')), /ENOENT/);

    assert.equal((await lstat(path.join(root, '.agents/skills/planning-with-files'))).isDirectory(), true);
    for (const skillName of [
      'using-superpowers',
      'writing-plans',
      'executing-plans',
      'verification-before-completion'
    ]) {
      await assert.rejects(lstat(path.join(root, '.agents/skills', skillName)), /ENOENT/, skillName);
    }

    const planning = await readFile(path.join(root, '.agents/skills/planning-with-files/SKILL.md'), 'utf8');
    assert.match(planning, /Harness planning-with-files companion-plan patch/);
  } finally {
    await removeHarnessFixture(root);
  }
});
