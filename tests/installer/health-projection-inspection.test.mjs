import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { inspectProjectionHealth } from '../../harness/installer/lib/health-projection-inspection.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { readState, writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

test('inspectProjectionHealth preserves hook and skill inspection semantics', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const state = await readState(root);

    const projection = await inspectProjectionHealth({
      rootDir: root,
      homeDir: '/home/user',
      state,
      target: 'codex'
    });

    assert.equal(Array.isArray(projection.skills), true);
    assert.equal(Array.isArray(projection.hooks), true);
    assert.ok(projection.skills.length > 0);
    assert.ok(projection.hooks.length > 0);
    assert.ok(projection.skills.every((entry) => typeof entry.status === 'string'));
    assert.ok(projection.hooks.every((entry) => typeof entry.status === 'string'));
  } finally {
    await removeHarnessFixture(root);
  }
});
