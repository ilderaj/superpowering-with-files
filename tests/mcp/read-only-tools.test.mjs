import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarnessMcpServer } from '../../harness/mcp/server.mjs';

test('read-only mode registers only phase-1 tools', async () => {
  const server = createHarnessMcpServer({ mode: 'read-only' });
  const registeredNames = Object.keys(server._registeredTools);
  assert.deepEqual(registeredNames.sort(), [
    'harness_active_summary',
    'harness_doctor',
    'harness_list_resources',
    'harness_status',
    'harness_sync_dry_run',
    'harness_task_summary',
    'harness_verify_read'
  ]);
});
