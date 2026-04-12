import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeState } from '../../harness/installer/lib/state.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

test('sync renders codex workspace entry', async () => {
  const root = await createHarnessFixture();
  try {
    const entryPath = path.join(root, 'AGENTS.md');
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [entryPath] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const text = await readFile(entryPath, 'utf8');
    assert.match(text, /Harness Policy For Codex/);
  } finally {
    await removeHarnessFixture(root);
  }
});
