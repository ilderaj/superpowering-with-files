import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const artifactsRoot = path.join(process.cwd(), 'tests/hooks/.artifacts/task-scoped-hook');

async function createFixture(fixtureName, { taskId = 'codex-hooks', taskPlan, findings, progress } = {}) {
  const fixtureRoot = path.join(artifactsRoot, fixtureName);
  const taskRoot = path.join(fixtureRoot, 'planning/active', taskId);
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(taskRoot, { recursive: true });

  if (taskPlan) {
    await writeFile(path.join(taskRoot, 'task_plan.md'), taskPlan);
  }

  if (findings) {
    await writeFile(path.join(taskRoot, 'findings.md'), findings);
  }

  if (progress) {
    await writeFile(path.join(taskRoot, 'progress.md'), progress);
  }

  return {
    fixtureRoot,
    taskRoot
  };
}

function activeTaskFiles({ statusLine = 'Status: active' } = {}) {
  return {
    taskPlan: [
      '# Codex Hooks',
      '',
      '## 任务目标',
      '- Keep hook output compact.',
      '',
      '## Current State',
      statusLine,
      'Archive Eligible: no'
    ].join('\n'),
    findings: '## Notes\n- Use summary-first recovery.\n',
    progress: [
      '## Progress',
      '- Captured planning progress.',
      '- Added compact hot context.'
    ].join('\n')
  };
}

test('task-scoped-hook emits Codex hookSpecificOutput payload', async () => {
  const { fixtureRoot } = await createFixture('codex-payload', activeTaskFiles());

  try {
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

test('task-scoped-hook treats active status lines with extra whitespace as active', async () => {
  const { fixtureRoot } = await createFixture(
    'codex-payload-flexible-status',
    activeTaskFiles({ statusLine: 'Status:  active' })
  );

  try {
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
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('task-scoped-hook still works after projection to the target hook root', async () => {
  const { fixtureRoot } = await createFixture('projected-root', activeTaskFiles());
  const commandCwd = path.join(artifactsRoot, 'projected-root-cwd');

  try {
    const projectedHookRoot = path.join(fixtureRoot, '.codex/hooks');
    await mkdir(projectedHookRoot, { recursive: true });
    await mkdir(commandCwd, { recursive: true });

    const sourceHookRoot = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts'
    );

    for (const fileName of [
      'task-scoped-hook.sh',
      'render-hot-context.mjs',
      'planning-hot-context.mjs',
      'render-session-summary.mjs',
      'session-summary.mjs'
    ]) {
      await copyFile(path.join(sourceHookRoot, fileName), path.join(projectedHookRoot, fileName));
    }

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
