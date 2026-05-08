import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHttpSelfTest } from '../../harness/mcp/http.mjs';

test('remote self-test blocks live activation without credentials', async () => {
  const originalToken = process.env.HARNESS_MCP_BEARER_TOKEN;
  delete process.env.HARNESS_MCP_BEARER_TOKEN;
  try {
    await assert.rejects(
      runHttpSelfTest({ rootDir: process.cwd(), profileName: 'codespaces', live: true }),
      /blocked by missing credentials/
    );
  } finally {
    if (originalToken) {
      process.env.HARNESS_MCP_BEARER_TOKEN = originalToken;
    }
  }
});
