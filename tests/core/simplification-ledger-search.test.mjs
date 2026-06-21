import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createSimplificationLedgerFixture,
  removeSimplificationLedgerFixture
} from '../helpers/simplification-ledger-fixture.mjs';

const execFileAsync = promisify(execFile);

test('canonical simplification-ledger rg search only matches supported slash and hash style markers', async () => {
  const root = await createSimplificationLedgerFixture();

  try {
    const { stdout } = await execFileAsync('rg', ['-n', '(#|//) ?swf-simplify:', '.'], {
      cwd: root
    });

    const hits = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort();

    assert.deepEqual(hits, [
      './scripts/b.py:1:# swf-simplify: local scan only; upgrade when cross-workspace support is needed',
      './src/a.js:1:// swf-simplify: single-pass only; upgrade when batching is required'
    ]);
  } finally {
    await removeSimplificationLedgerFixture(root);
  }
});
