import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { evaluateBudget, loadContextBudgets, measureText } from '../../harness/installer/lib/context-budget.mjs';

const execFileAsync = promisify(execFile);

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
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'harness-hot-context-'));
  try {
    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );
    const taskRoot = path.join(fixtureRoot, 'planning/active/compact-task');
    await mkdir(taskRoot, { recursive: true });
    await writeFile(
      path.join(taskRoot, 'task_plan.md'),
      [
        '# Compact Task',
        '',
        '## 任务目标',
        '- Keep planning hot context compact.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(taskRoot, 'findings.md'), '## Notes\n- Keep the payload under budget.\n');
    await writeFile(path.join(taskRoot, 'progress.md'), '- Verified the hook payload budget.\n');

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
