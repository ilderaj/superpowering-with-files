import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultState, readState, writeState } from '../../harness/installer/lib/state.mjs';

test('defaultState creates v1 workspace state', () => {
  assert.deepEqual(defaultState(), {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    targets: {},
    upstream: {}
  });
});

test('writeState and readState roundtrip local state', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    const state = {
      schemaVersion: 1,
      scope: 'both',
      projectionMode: 'portable',
      targets: { codex: { enabled: true, paths: ['AGENTS.md'] } },
      upstream: {}
    };

    await writeState(dir, state);
    assert.deepEqual(await readState(dir), state);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readState rejects invalid stored state shape', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    const stateFile = path.join(dir, '.harness', 'state.json');
    await mkdir(path.dirname(stateFile), { recursive: true });
    await writeFile(
      stateFile,
      JSON.stringify({
        schemaVersion: 1,
        scope: 'workspace',
        projectionMode: 'link',
        targets: { codex: { enabled: 'yes', paths: ['AGENTS.md'] } },
        upstream: {}
      })
    );

    await assert.rejects(readState(dir), /enabled must be boolean/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeState rejects invalid state shape', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    await assert.rejects(
      writeState(dir, {
        schemaVersion: 1,
        scope: 'workspace',
        projectionMode: 'link',
        targets: { codex: { enabled: true, paths: ['AGENTS.md'], extra: true } },
        upstream: {}
      }),
      /unsupported field: extra/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
