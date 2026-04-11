import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeState } from '../../harness/installer/lib/state.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function restoreOptional(filePath, content) {
  if (content === null) {
    await rm(filePath, { force: true });
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

test('sync renders codex workspace entry', async () => {
  const root = process.cwd();
  const entryPath = path.join(root, 'AGENTS.md');
  const statePath = path.join(root, '.harness', 'state.json');
  const previousEntry = await readOptional(entryPath);
  const previousState = await readOptional(statePath);

  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [entryPath] }
      },
      upstream: {}
    });

    await sync([]);
    const text = await readFile(entryPath, 'utf8');
    assert.match(text, /Harness Policy For Codex/);
  } finally {
    await restoreOptional(entryPath, previousEntry);
    await restoreOptional(statePath, previousState);
  }
});
