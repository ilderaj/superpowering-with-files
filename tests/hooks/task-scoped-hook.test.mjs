import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const artifactsRoot = path.join(process.cwd(), 'tests/hooks/.artifacts/task-scoped-hook');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
      'Archive Eligible: no',
      'Close Reason:',
      '',
      '### Phase 1: Baseline recovery',
      '- **Status:** complete',
      '- [x] Capture the existing hook behavior.',
      '',
      '### Phase 2: Rework prompt recovery',
      '- **Status:** in_progress',
      '- [ ] Initial next step.'
    ].join('\n'),
    findings: '## Notes\n- Use summary-first recovery.\n',
    progress: [
      '## Progress',
      '- Captured planning progress.',
      '- Added compact hot context.',
      '',
      '## Error Log',
      '| Error | Status |',
      '| --- | --- |',
      '| Repeated hot context tax | open |'
    ].join('\n')
  };
}

function hotContextFingerprintPath(fixtureRoot, taskId = 'codex-hooks') {
  return path.join(fixtureRoot, '.harness', 'planning-with-files', `${taskId}.last-hot-context.sha256`);
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

test('task-scoped-hook keeps Copilot session-start compact and defers hot context to user prompt submit', async () => {
  const { fixtureRoot, taskRoot } = await createFixture('copilot-compact-session-start', activeTaskFiles());

  try {
    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );
    const { stdout: sessionStartStdout } = await execFileAsync(
      'bash',
      [scriptPath, 'copilot', 'session-start'],
      {
        cwd: fixtureRoot
      }
    );
    const { stdout: promptStdout } = await execFileAsync(
      'bash',
      [scriptPath, 'copilot', 'user-prompt-submit'],
      {
        cwd: fixtureRoot
      }
    );

    const sessionStartPayload = JSON.parse(sessionStartStdout);
    const promptPayload = JSON.parse(promptStdout);

    assert.equal(sessionStartPayload.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.doesNotMatch(sessionStartPayload.hookSpecificOutput.additionalContext, /HOT CONTEXT/);
    assert.match(sessionStartPayload.hookSpecificOutput.additionalContext, /next user prompt/i);
    assert.match(sessionStartPayload.hookSpecificOutput.additionalContext, /planning\/active\/codex-hooks/);
    assert.doesNotMatch(
      sessionStartPayload.hookSpecificOutput.additionalContext,
      new RegExp(escapeRegExp(fixtureRoot))
    );
    const sessionSidecar = await readFile(
      path.join(fixtureRoot, '.harness', 'planning-with-files', 'codex-hooks.session-start'),
      'utf8'
    );
    assert.match(sessionSidecar.trim(), /^[0-9]+$/);
    await assert.rejects(readFile(path.join(taskRoot, '.session-start'), 'utf8'));

    assert.equal(promptPayload.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(promptPayload.hookSpecificOutput.additionalContext, /HOT CONTEXT/);
    assert.ok(
      sessionStartPayload.hookSpecificOutput.additionalContext.length <
        promptPayload.hookSpecificOutput.additionalContext.length
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('task-scoped-hook keeps Copilot pre-tool-use compact while allowing the tool call', async () => {
  const { fixtureRoot } = await createFixture('copilot-compact-pretool', activeTaskFiles());

  try {
    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );
    const { stdout } = await execFileAsync('bash', [scriptPath, 'copilot', 'pre-tool-use'], {
      cwd: fixtureRoot
    });

    const payload = JSON.parse(stdout);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(payload.hookSpecificOutput.permissionDecision, 'allow');
    assert.doesNotMatch(payload.hookSpecificOutput.additionalContext, /HOT CONTEXT/);
    assert.match(payload.hookSpecificOutput.additionalContext, /progress\.md/);
    assert.match(payload.hookSpecificOutput.additionalContext, /task_plan\.md/);
    assert.doesNotMatch(
      payload.hookSpecificOutput.additionalContext,
      new RegExp(escapeRegExp(fixtureRoot))
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('copilot user-prompt-submit emits full hot context only on first prompt after session start', async () => {
  const { fixtureRoot } = await createFixture('copilot-brief-reuse', activeTaskFiles());

  try {
    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );
    await execFileAsync('bash', [scriptPath, 'copilot', 'session-start'], {
      cwd: fixtureRoot
    });
    const { stdout: firstPromptStdout } = await execFileAsync(
      'bash',
      [scriptPath, 'copilot', 'user-prompt-submit'],
      {
        cwd: fixtureRoot
      }
    );
    const { stdout: secondPromptStdout } = await execFileAsync(
      'bash',
      [scriptPath, 'copilot', 'user-prompt-submit'],
      {
        cwd: fixtureRoot
      }
    );

    const firstPrompt = JSON.parse(firstPromptStdout).hookSpecificOutput;
    const secondPrompt = JSON.parse(secondPromptStdout).hookSpecificOutput;

    assert.match(firstPrompt.additionalContext, /HOT CONTEXT/);
    assert.doesNotMatch(secondPrompt.additionalContext, /HOT CONTEXT/);
    assert.match(secondPrompt.additionalContext, /\[planning-with-files\] BRIEF CONTEXT/);
    assert.match(secondPrompt.additionalContext, /Task: Codex Hooks/);
    assert.match(secondPrompt.additionalContext, /Phase: Phase 2: Rework prompt recovery/);
    assert.match(secondPrompt.additionalContext, /Next: Initial next step\./);
    assert.match(secondPrompt.additionalContext, /Last failure: Repeated hot context tax/);
    assert.match(secondPrompt.additionalContext, /No planning changes since last hot context emission/);

    const fingerprint = await readFile(hotContextFingerprintPath(fixtureRoot), 'utf8');
    assert.match(fingerprint.trim(), /^[a-f0-9]{64}$/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('copilot user-prompt-submit refreshes hot context after task_plan changes', async () => {
  const { fixtureRoot, taskRoot } = await createFixture('copilot-hot-refresh', activeTaskFiles());

  try {
    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );
    await execFileAsync('bash', [scriptPath, 'copilot', 'session-start'], {
      cwd: fixtureRoot
    });
    await execFileAsync('bash', [scriptPath, 'copilot', 'user-prompt-submit'], {
      cwd: fixtureRoot
    });

    const updatedFiles = activeTaskFiles();
    updatedFiles.taskPlan = updatedFiles.taskPlan.replace('Initial next step.', 'Updated next step.');
    await writeFile(path.join(taskRoot, 'task_plan.md'), updatedFiles.taskPlan);

    const { stdout } = await execFileAsync('bash', [scriptPath, 'copilot', 'user-prompt-submit'], {
      cwd: fixtureRoot
    });

    const updatedPrompt = JSON.parse(stdout).hookSpecificOutput;
    assert.match(updatedPrompt.additionalContext, /HOT CONTEXT/);
    assert.match(updatedPrompt.additionalContext, /Updated next step\./);
    assert.doesNotMatch(
      updatedPrompt.additionalContext,
      /No planning changes since last hot context emission/
    );
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
      'render-brief-context.mjs',
      'planning-brief-context.mjs',
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
