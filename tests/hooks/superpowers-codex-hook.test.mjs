import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('superpowers codex session-start emits hookSpecificOutput payload', async () => {
  const { stdout } = await execFileAsync('bash', [
    'harness/core/hooks/superpowers/scripts/session-start'
  ]);

  const payload = JSON.parse(stdout);
  assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(payload.hookSpecificOutput.additionalContext.length < 4000);
  assert.match(payload.hookSpecificOutput.additionalContext, /You have superpowers/);
  assert.match(payload.hookSpecificOutput.additionalContext, /reclassify the round/i);
  assert.doesNotMatch(
    payload.hookSpecificOutput.additionalContext,
    /description: Use when starting any conversation/
  );
});

test('superpowers cursor session-start emits Cursor additional_context payload', async () => {
  const { stdout } = await execFileAsync('bash', [
    'harness/core/hooks/superpowers/scripts/session-start',
    'cursor'
  ]);

  const payload = JSON.parse(stdout);
  assert.ok(payload.additional_context.length < 4000);
  assert.match(payload.additional_context, /You have superpowers/);
  assert.match(payload.additional_context, /reclassify the round/i);
  assert.doesNotMatch(payload.additional_context, /description: Use when starting any conversation/);
});

test('superpowers claude-code session-start keeps hookSpecificOutput payload compact', async () => {
  const { stdout } = await execFileAsync('bash', [
    'harness/core/hooks/superpowers/scripts/session-start',
    'claude-code'
  ]);

  const payload = JSON.parse(stdout);
  assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(payload.hookSpecificOutput.additionalContext.length < 4000);
  assert.match(payload.hookSpecificOutput.additionalContext, /You have superpowers/);
  assert.match(payload.hookSpecificOutput.additionalContext, /reclassify the round/i);
  assert.doesNotMatch(
    payload.hookSpecificOutput.additionalContext,
    /description: Use when starting any conversation/
  );
});
