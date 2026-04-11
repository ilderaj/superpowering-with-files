import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeState } from '../../harness/installer/lib/state.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';

test('sync renders codex workspace entry', async () => {
  const root = process.cwd();
  await writeState(root, {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    targets: {
      codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
    },
    upstream: {}
  });

  await sync([]);
  const text = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(text, /Harness Policy For Codex/);
});
