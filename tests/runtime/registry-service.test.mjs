import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readRegistry, writeRegistry } from '../../harness/runtime/registry-service.mjs';

test('readRegistry returns null when the channel file does not exist yet', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'harness-registry-service-'));

  try {
    assert.equal(await readRegistry(rootDir), null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('writeRegistry persists a pretty-printed bundle that readRegistry can round-trip', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'harness-registry-service-'));
  const bundle = { version: 1, policy: { mode: 'local-dev' } };

  try {
    const filePath = await writeRegistry(rootDir, bundle, 'team-review');

    assert.match(filePath, /\.harness\/mcp\/registry\/team-review\.json$/);
    assert.deepEqual(await readRegistry(rootDir, 'team-review'), bundle);
    assert.match(await readFile(filePath, 'utf8'), /\n$/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('writeRegistry rejects channel names that escape the registry directory', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'harness-registry-service-'));

  try {
    await assert.rejects(
      writeRegistry(rootDir, { ok: true }, '../escape'),
      /invalid registry channel/i
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('readRegistry rejects unsafe channel names before reading from disk', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'harness-registry-service-'));

  try {
    await assert.rejects(readRegistry(rootDir, '../escape'), /invalid registry channel/i);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('readRegistry rethrows malformed registry JSON instead of treating it as missing', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'harness-registry-service-'));

  try {
    const filePath = await writeRegistry(rootDir, { ok: true });
    await writeFile(filePath, '{not-json}\n', 'utf8');

    await assert.rejects(readRegistry(rootDir), SyntaxError);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
