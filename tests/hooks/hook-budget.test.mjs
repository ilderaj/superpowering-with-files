import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { evaluateBudget, loadContextBudgets, measureText } from '../../harness/installer/lib/context-budget.mjs';

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

test('superpowers session-start payload stays compact', async () => {
  const { stdout } = await execFileAsync('bash', [
    'harness/core/hooks/superpowers/scripts/session-start'
  ]);

  const payload = JSON.parse(stdout);
  const additionalContext = payload.hookSpecificOutput.additionalContext;

  assert.ok(additionalContext.length < 4000);
  assert.doesNotMatch(additionalContext, /description: Use when starting any conversation/);
  assert.doesNotMatch(additionalContext, /using-superpowers\/SKILL\.md/);
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
      'Archive Eligible: no'
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
    const evaluation = evaluateBudget(measureText(additionalContext), budgets.budgets.hookPayload);

    assert.ok(additionalContext.length < 4000);
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
      ...repeatedPlanBullets
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
    const evaluation = evaluateBudget(measureText(secondPrompt), budgets.budgets.hookPayload);

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
