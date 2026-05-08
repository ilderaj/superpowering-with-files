import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHttpSelfTest } from '../../harness/mcp/http.mjs';

test('HTTP self-test succeeds for the local profile', async (t) => {
  try {
    const result = await runHttpSelfTest({ rootDir: process.cwd(), profileName: 'local' });
    assert.equal(result.ok, true);
    assert(result.toolCount >= 1);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EPERM' && error.syscall === 'listen') {
      t.skip('sandbox blocks localhost listen for HTTP transport self-test');
      return;
    }
    throw error;
  }
});
