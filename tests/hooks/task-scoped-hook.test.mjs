import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('task-scoped-hook emits Codex hookSpecificOutput payload', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'harness-hook-'));
  try {
    const taskRoot = path.join(fixtureRoot, 'planning/active/codex-hooks');
    await mkdir(taskRoot, { recursive: true });
    await writeFile(
      path.join(taskRoot, 'task_plan.md'),
      [
        '# Codex Hooks',
        '',
        '## 任务目标',
        '- Keep hook output compact.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(taskRoot, 'findings.md'), '## Notes\n- Use summary-first recovery.\n');
    await writeFile(
      path.join(taskRoot, 'progress.md'),
      ['- Captured planning progress.', '- Added compact hot context.'].join('\n')
    );

    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );
    const { stdout } = await execFileAsync('bash', [scriptPath, 'codex', 'user-prompt-submit'], {
      cwd: fixtureRoot
    });

    const payload = JSON.parse(stdout);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(payload.hookSpecificOutput.additionalContext, /HOT CONTEXT/);
    assert.match(payload.hookSpecificOutput.additionalContext, /Goal: Keep hook output compact\./);
    assert.doesNotMatch(payload.hookSpecificOutput.additionalContext, /Archive Eligible/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('task-scoped-hook still works after projection to the target hook root', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'harness-hook-projected-'));
  const commandCwd = await mkdtemp(path.join(os.tmpdir(), 'harness-hook-cwd-'));
  try {
    const taskRoot = path.join(fixtureRoot, 'planning/active/codex-hooks');
    const projectedHookRoot = path.join(fixtureRoot, '.codex/hooks');
    await mkdir(taskRoot, { recursive: true });
    await mkdir(projectedHookRoot, { recursive: true });
    await writeFile(
      path.join(taskRoot, 'task_plan.md'),
      [
        '# Codex Hooks',
        '',
        '## 任务目标',
        '- Keep hook output compact.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(taskRoot, 'findings.md'), '## Notes\n- Use summary-first recovery.\n');
    await writeFile(
      path.join(taskRoot, 'progress.md'),
      ['- Captured planning progress.', '- Added compact hot context.'].join('\n')
    );

    const sourceHookRoot = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts'
    );
    await copyFile(
      path.join(sourceHookRoot, 'task-scoped-hook.sh'),
      path.join(projectedHookRoot, 'task-scoped-hook.sh')
    );
    await copyFile(
      path.join(sourceHookRoot, 'render-hot-context.mjs'),
      path.join(projectedHookRoot, 'render-hot-context.mjs')
    );
    await copyFile(
      path.join(sourceHookRoot, 'planning-hot-context.mjs'),
      path.join(projectedHookRoot, 'planning-hot-context.mjs')
    );

    const { stdout } = await execFileAsync(
      'bash',
      [path.join(projectedHookRoot, 'task-scoped-hook.sh'), 'codex', 'user-prompt-submit'],
      {
        cwd: commandCwd,
        env: {
          ...process.env,
          HARNESS_PROJECT_ROOT: fixtureRoot
        }
      }
    );

    const payload = JSON.parse(stdout);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(payload.hookSpecificOutput.additionalContext, /HOT CONTEXT/);
    assert.match(payload.hookSpecificOutput.additionalContext, /Goal: Keep hook output compact\./);
    assert.doesNotMatch(payload.hookSpecificOutput.additionalContext, /Archive Eligible/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(commandCwd, { recursive: true, force: true });
  }
});
