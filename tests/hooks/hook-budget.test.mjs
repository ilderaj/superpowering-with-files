import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';

test('superpowers session-start injection assets are physically retired', async () => {
  const retiredPaths = [
    'harness/core/hooks/superpowers/claude-hooks.json',
    'harness/core/hooks/superpowers/codex-hooks.json',
    'harness/core/hooks/superpowers/copilot-hooks.json',
    'harness/core/hooks/superpowers/cursor-hooks.json',
    'harness/core/hooks/superpowers/scripts/run-hook.cmd',
    'harness/core/hooks/superpowers/scripts/session-start'
  ];

  for (const retiredPath of retiredPaths) {
    await assert.rejects(access(path.join(process.cwd(), retiredPath)), { code: 'ENOENT' });
  }
});
