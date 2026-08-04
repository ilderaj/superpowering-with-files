import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  evaluateBudget,
  loadContextBudgets,
  measureText,
  selectBudgetForTarget
} from '../../harness/installer/lib/context-budget.mjs';

const execFileAsync = promisify(execFile);
const artifactsRoot = path.join(process.cwd(), 'tests/hooks/.artifacts/hook-budget');

async function createFixture(fixtureName, { taskPlan, findings, progress }) {
  const fixtureRoot = path.join(artifactsRoot, fixtureName);
  const taskRoot = path.join(fixtureRoot, 'planning/active/compact-task');
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(taskRoot, { recursive: true });
  await writeFile(path.join(taskRoot, 'task_plan.md'), taskPlan);
  await writeFile(path.join(taskRoot, 'findings.md'), findings);
  await writeFile(path.join(taskRoot, 'progress.md'), progress);
  return fixtureRoot;
}

function deepRichRoutingDecision() {
  return [
    '## Routing Decision',
    '- Selected Route: deep-rich',
    '- Route Reason: architecture is unclear',
    '- Promotion Trigger: architecture unclear',
    '- Route Evidence Surface: planning + summary + active-summary'
  ];
}

test('superpowers session-start injection assets are physically retired', async () => {
  const retiredPaths = [
    'harness/core/hooks/superpowers/claude-hooks.json',
    'harness/core/hooks/superpowers/codex-hooks.json',
    'harness/core/hooks/superpowers/copilot-hooks.json',
    'harness/core/hooks/superpowers/cursor-hooks.json',
    'harness/core/hooks/superpowers/scripts/run-hook.cmd',
    'harness/core/hooks/superpowers/scripts/session-start'
  ];
  const presentRetiredPaths = [];
  for (const relativePath of retiredPaths) {
    try {
      await access(path.join(process.cwd(), relativePath));
      presentRetiredPaths.push(relativePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  assert.deepEqual(presentRetiredPaths, []);
});

test('planning hot context payload stays within the configured hook budget', async () => {
  const fixtureRoot = await createFixture('planning-hot-context-budget', {
    taskPlan: [
      '# Compact Task',
      '',
      '## 任务目标',
      '- Keep planning hot context compact.',
      '',
      '## Current State',
      'Status: active',
      'Archive Eligible: no',
      '',
      ...deepRichRoutingDecision()
    ].join('\n'),
    findings: '## Notes\n- Keep the payload under budget.\n',
    progress: '- Verified the hook payload budget.\n'
  });
  try {
    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );

    const { stdout } = await execFileAsync(
      'bash',
      [scriptPath, 'codex', 'user-prompt-submit'],
      {
        cwd: fixtureRoot,
        env: {
          ...process.env,
          HARNESS_PROJECT_ROOT: fixtureRoot
        }
      }
    );

    const payload = JSON.parse(stdout);
    const additionalContext = payload.hookSpecificOutput.additionalContext;
    const budgets = await loadContextBudgets(process.cwd());
    const evaluation = evaluateBudget(
      measureText(additionalContext),
      selectBudgetForTarget(budgets.budgets.hookPayload, 'codex')
    );

    assert.ok(additionalContext.length < 4000);
    assert.match(additionalContext, /HOT CONTEXT/);
    assert.equal(evaluation.verdict, 'ok');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('copilot repeated prompts collapse to a brief payload within the configured hook budget', async () => {
  const repeatedPlanBullets = Array.from({ length: 80 }, (_, index) => `- [ ] Follow-up step ${index + 1}.`);
  const repeatedFindings = Array.from(
    { length: 120 },
    (_, index) => `- Finding ${index + 1}: keep repeated prompt recovery compact.`
  );
  const repeatedProgress = Array.from(
    { length: 120 },
    (_, index) => `- Progress ${index + 1}: track prompt recovery churn.`
  );
  const fixtureRoot = await createFixture('copilot-brief-budget', {
    taskPlan: [
      '# Compact Task',
      '',
      '## 任务目标',
      '- Keep planning hot context compact.',
      '',
      '## Current State',
      'Status: active',
      'Archive Eligible: no',
      'Close Reason:',
      '',
      '### Phase 1: Stabilize prompt recovery',
      '- **Status:** in_progress',
      ...repeatedPlanBullets,
      '',
      ...deepRichRoutingDecision()
    ].join('\n'),
    findings: ['## Notes', ...repeatedFindings].join('\n'),
    progress: [
      '## Progress',
      ...repeatedProgress,
      '',
      '## Error Log',
      '| Error | Status |',
      '| --- | --- |',
      '| Repeated prompt budget overflow | open |'
    ].join('\n')
  });

  try {
    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );
    await execFileAsync('bash', [scriptPath, 'copilot', 'session-start'], {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        HARNESS_PROJECT_ROOT: fixtureRoot
      }
    });
    const { stdout: firstPromptStdout } = await execFileAsync(
      'bash',
      [scriptPath, 'copilot', 'user-prompt-submit'],
      {
        cwd: fixtureRoot,
        env: {
          ...process.env,
          HARNESS_PROJECT_ROOT: fixtureRoot
        }
      }
    );
    const { stdout: secondPromptStdout } = await execFileAsync(
      'bash',
      [scriptPath, 'copilot', 'user-prompt-submit'],
      {
        cwd: fixtureRoot,
        env: {
          ...process.env,
          HARNESS_PROJECT_ROOT: fixtureRoot
        }
      }
    );

    const firstPrompt = JSON.parse(firstPromptStdout).hookSpecificOutput.additionalContext;
    const secondPrompt = JSON.parse(secondPromptStdout).hookSpecificOutput.additionalContext;
    const budgets = await loadContextBudgets(process.cwd());
    const evaluation = evaluateBudget(
      measureText(secondPrompt),
      selectBudgetForTarget(budgets.budgets.hookPayload, 'copilot')
    );

    assert.match(firstPrompt, /HOT CONTEXT/);
    assert.match(secondPrompt, /\[planning-with-files\] BRIEF CONTEXT/);
    assert.match(secondPrompt, /No planning changes since last hot context emission/);
    assert.ok(secondPrompt.length < firstPrompt.length);
    assert.equal(evaluation.verdict, 'ok');
    assert.doesNotMatch(secondPrompt, new RegExp(fixtureRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

for (const target of ['codex', 'cursor', 'claude-code']) {
  test(`${target} repeated prompts collapse to a brief payload within the configured hook budget`, async () => {
    const repeatedPlanBullets = Array.from(
      { length: 80 },
      (_, index) => `- [ ] Follow-up step ${index + 1}.`
    );
    const repeatedFindings = Array.from(
      { length: 120 },
      (_, index) => `- Finding ${index + 1}: keep repeated prompt recovery compact.`
    );
    const repeatedProgress = Array.from(
      { length: 120 },
      (_, index) => `- Progress ${index + 1}: track prompt recovery churn.`
    );
    const fixtureRoot = await createFixture(`${target}-brief-budget`, {
      taskPlan: [
        '# Compact Task',
        '',
        '## 任务目标',
        '- Keep planning hot context compact.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '### Phase 1: Stabilize prompt recovery',
        '- **Status:** in_progress',
        ...repeatedPlanBullets,
        '',
        ...deepRichRoutingDecision()
      ].join('\n'),
      findings: ['## Notes', ...repeatedFindings].join('\n'),
      progress: [
        '## Progress',
        ...repeatedProgress,
        '',
        '## Error Log',
        '| Error | Status |',
        '| --- | --- |',
        '| Repeated prompt budget overflow | open |'
      ].join('\n')
    });

    try {
      const scriptPath = path.join(
        process.cwd(),
        'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
      );
      await execFileAsync('bash', [scriptPath, target, 'session-start'], {
        cwd: fixtureRoot,
        env: {
          ...process.env,
          HARNESS_PROJECT_ROOT: fixtureRoot
        }
      });
      const { stdout: firstPromptStdout } = await execFileAsync(
        'bash',
        [scriptPath, target, 'user-prompt-submit'],
        {
          cwd: fixtureRoot,
          env: {
            ...process.env,
            HARNESS_PROJECT_ROOT: fixtureRoot
          }
        }
      );
      const { stdout: secondPromptStdout } = await execFileAsync(
        'bash',
        [scriptPath, target, 'user-prompt-submit'],
        {
          cwd: fixtureRoot,
          env: {
            ...process.env,
            HARNESS_PROJECT_ROOT: fixtureRoot
          }
        }
      );

      const firstPayload = JSON.parse(firstPromptStdout);
      const secondPayload = JSON.parse(secondPromptStdout);
      const firstPrompt =
        target === 'cursor'
          ? firstPayload.additional_context
          : firstPayload.hookSpecificOutput.additionalContext;
      const secondPrompt =
        target === 'cursor'
          ? secondPayload.additional_context
          : secondPayload.hookSpecificOutput.additionalContext;
      const budgets = await loadContextBudgets(process.cwd());
      const evaluation = evaluateBudget(
        measureText(secondPrompt),
        selectBudgetForTarget(budgets.budgets.hookPayload, target)
      );

      assert.match(firstPrompt, /HOT CONTEXT/);
      assert.match(secondPrompt, /\[planning-with-files\] BRIEF CONTEXT/);
      assert.match(secondPrompt, /No planning changes since last hot context emission/);
      assert.ok(secondPrompt.length < firstPrompt.length);
      assert.equal(evaluation.verdict, 'ok');
      assert.doesNotMatch(secondPrompt, new RegExp(fixtureRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
}
