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
  assert.match(payload.hookSpecificOutput.additionalContext, /using-superpowers/);
});
