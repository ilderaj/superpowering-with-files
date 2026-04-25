import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultState, readState, updateState, writeState } from '../../harness/installer/lib/state.mjs';

test('defaultState creates v1 workspace state', () => {
  assert.deepEqual(defaultState(), {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    hookMode: 'off',
    policyProfile: 'always-on-core',
    skillProfile: 'full',
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
      hookMode: 'off',
      policyProfile: 'always-on-core',
      skillProfile: 'full',
      targets: { codex: { enabled: true, paths: ['AGENTS.md'] } },
      upstream: {}
    };

    await writeState(dir, state);
    assert.deepEqual(await readState(dir), state);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('updateState persists state returned by updater', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    await writeState(dir, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      policyProfile: 'always-on-core',
      skillProfile: 'full',
      targets: {},
      upstream: {}
    });

    await updateState(dir, (state) => ({
      ...state,
      lastSync: '2026-04-13T00:00:00.000Z'
    }));

    assert.equal((await readState(dir)).lastSync, '2026-04-13T00:00:00.000Z');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeState and readState roundtrip enabled hook mode', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    const state = {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'always-on-core',
      skillProfile: 'full',
      targets: { cursor: { enabled: true, paths: ['.cursor/rules/harness.mdc'] } },
      upstream: {}
    };

    await writeState(dir, state);
    assert.deepEqual(await readState(dir), state);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readState treats missing hookMode as off for v1 compatibility', async () => {
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
        skillProfile: 'full',
        targets: { codex: { enabled: true, paths: ['AGENTS.md'] } },
        upstream: {}
      })
    );

    const state = await readState(dir);
    assert.equal(state.hookMode, 'off');
    assert.equal(state.policyProfile, 'always-on-core');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readState treats missing policyProfile as always-on-core for v1 compatibility', async () => {
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
        hookMode: 'off',
        skillProfile: 'full',
        targets: { codex: { enabled: true, paths: ['AGENTS.md'] } },
        upstream: {}
      })
    );

    const state = await readState(dir);
    assert.equal(state.policyProfile, 'always-on-core');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readState treats missing skillProfile as full for v1 compatibility', async () => {
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
        hookMode: 'off',
        targets: { codex: { enabled: true, paths: ['AGENTS.md'] } },
        upstream: {}
      })
    );

    const state = await readState(dir);
    assert.equal(state.skillProfile, 'full');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('state schema keeps skillProfile optional and stringly typed', async () => {
  const schema = JSON.parse(await readFile('harness/core/state-schema/state.schema.json', 'utf8'));
  assert.ok(!schema.required.includes('policyProfile'));
  assert.equal(schema.properties.policyProfile.type, 'string');
  assert.equal(schema.properties.policyProfile.enum, undefined);
  assert.ok(!schema.required.includes('skillProfile'));
  assert.equal(schema.properties.skillProfile.type, 'string');
  assert.equal(schema.properties.skillProfile.enum, undefined);
});

test('writeState preserves arbitrary skillProfile strings for loader-based validation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    const state = {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      policyProfile: 'safety',
      skillProfile: 'legacy',
      targets: {},
      upstream: {}
    };

    await writeState(dir, state);
    assert.deepEqual(await readState(dir), state);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeState rejects invalid hook mode', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    await assert.rejects(
      writeState(dir, {
        schemaVersion: 1,
        scope: 'workspace',
        projectionMode: 'link',
        hookMode: 'always',
        policyProfile: 'always-on-core',
        skillProfile: 'full',
        targets: {},
        upstream: {}
      }),
      /hookMode must be off or on/
    );
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
        hookMode: 'off',
        policyProfile: 'always-on-core',
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
        hookMode: 'off',
        policyProfile: 'always-on-core',
        skillProfile: 'full',
        targets: { codex: { enabled: true, paths: ['AGENTS.md'], extra: true } },
        upstream: {}
      }),
      /unsupported field: extra/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeState survives concurrent writes with a constant timestamp', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  const originalNow = Date.now;
  Date.now = () => 1700000000000;
  try {
      const states = Array.from({ length: 12 }, (_, index) => ({
        schemaVersion: 1,
        scope: index % 2 === 0 ? 'workspace' : 'both',
        projectionMode: index % 3 === 0 ? 'link' : 'portable',
        hookMode: 'off',
        policyProfile: index % 2 === 0 ? 'always-on-core' : 'safety',
        skillProfile: 'full',
        targets: { codex: { enabled: true, paths: ['AGENTS.md'] } },
        upstream: {}
    }));

    const results = await Promise.allSettled(states.map((state) => writeState(dir, state)));
    assert.deepEqual(
      results.map((result) => result.status),
      Array(states.length).fill('fulfilled')
    );
    const stored = await readState(dir);
    assert.ok(
      states.some((state) => JSON.stringify(state) === JSON.stringify(stored)),
      'stored state should match one of the concurrent writes'
    );
  } finally {
    Date.now = originalNow;
    await rm(dir, { recursive: true, force: true });
  }
});
