import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  createSimplificationLedgerFixture,
  removeSimplificationLedgerFixture
} from '../helpers/simplification-ledger-fixture.mjs';

const execFileAsync = promisify(execFile);
const canonicalMarkerPattern = /^(#|\/\/) ?swf-simplify:/;

async function collectCanonicalFallbackHits(root, relativeDir = '.') {
  const currentDir = path.join(root, relativeDir);
  const entries = await readdir(currentDir, { withFileTypes: true });
  const hits = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      hits.push(...await collectCanonicalFallbackHits(root, relativePath));
      continue;
    }

    const contents = await readFile(path.join(root, relativePath), 'utf8');
    const lines = contents.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (!canonicalMarkerPattern.test(line)) continue;
      hits.push(`./${relativePath}:${index + 1}:${line}`);
    }
  }

  return hits;
}

async function searchCanonicalSimplificationMarkers(root) {
  try {
    const { stdout } = await execFileAsync('rg', ['-n', canonicalMarkerPattern.source, '.'], {
      cwd: root
    });

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort();
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    return (await collectCanonicalFallbackHits(root)).sort();
  }
}

test('canonical simplification-ledger search only matches supported slash and hash style markers', async () => {
  const root = await createSimplificationLedgerFixture();

  try {
    const hits = await searchCanonicalSimplificationMarkers(root);

    assert.deepEqual(hits, [
      './scripts/b.py:1:# swf-simplify: local scan only; upgrade when cross-workspace support is needed',
      './src/a.js:1:// swf-simplify: single-pass only; upgrade when batching is required'
    ]);
  } finally {
    await removeSimplificationLedgerFixture(root);
  }
});
