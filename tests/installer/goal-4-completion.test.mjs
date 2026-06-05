import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createHarnessFixture, removeHarnessFixture } from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

test('quick-task completion proof does not create tracked planning artifacts', async () => {
  const root = await createHarnessFixture();
  try {
    const activeDir = path.join(root, 'planning/active');
    const before = await readdir(activeDir).catch(() => []);
    const scriptPath = path.join(
      root,
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );

    const { stdout } = await execFileAsync('bash', [scriptPath, 'codex', 'user-prompt-submit'], {
      cwd: root,
      env: {
        ...process.env,
        HARNESS_PROJECT_ROOT: root
      }
    });

    const after = await readdir(activeDir).catch(() => []);
    assert.equal(stdout.trim(), '{}');
    assert.deepEqual(after, before);
    assert.equal(before.length, 0);
  } finally {
    await removeHarnessFixture(root);
  }
});
