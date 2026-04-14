import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { readState, writeState } from '../../harness/installer/lib/state.mjs';
import { readProjectionManifest } from '../../harness/installer/lib/projection-manifest.mjs';
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

test('sync records lastSync timestamp in state', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {},
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    assert.match((await readState(root)).lastSync, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync garbage-collects stale entry and skill projections', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {},
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    await assert.rejects(lstat(path.join(root, 'AGENTS.md')), /ENOENT/);
    await assert.rejects(lstat(path.join(root, '.codex/skills/using-superpowers')), /ENOENT/);
    assert.deepEqual((await readProjectionManifest(root)).entries, []);
  } finally {
    await removeHarnessFixture(root);
  }
});
