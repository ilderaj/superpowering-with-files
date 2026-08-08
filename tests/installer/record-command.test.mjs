import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';

const RETIRED_PRODUCTION_PATHS = [
  'harness/installer/commands/summary.mjs',
  'harness/installer/commands/active-summary.mjs',
  'harness/installer/commands/record.mjs',
  'harness/runtime/summary-service.mjs',
  'harness/runtime/execution-receipt.mjs',
  'harness/runtime/followup-closure.mjs',
  'harness/runtime/safe-apply.mjs',
  'harness/runtime/audit-receipt.mjs',
  'harness/runtime/approval-token.mjs',
  'harness/runtime/registry-service.mjs'
];

test('legacy summary and receipt control-plane modules are physically retired', async () => {
  for (const relativePath of RETIRED_PRODUCTION_PATHS) {
    await assert.rejects(access(path.join(process.cwd(), relativePath)), { code: 'ENOENT' });
  }
});
