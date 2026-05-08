import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('stdio server handshakes with a real MCP client in read-only mode', async () => {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(process.cwd(), 'harness/mcp/stdio.mjs'), '--mode=read-only', '--root', process.cwd()],
    cwd: process.cwd(),
    stderr: 'pipe'
  });
  const client = new Client({
    name: 'harness-mcp-test-client',
    version: '1.0.0'
  });

  await client.connect(transport);
  const tools = await client.listTools();
  assert(tools.tools.some((tool) => tool.name === 'harness_status'));
  assert(!tools.tools.some((tool) => tool.name === 'harness_sync_apply'));

  const status = await client.callTool({ name: 'harness_status', arguments: {} });
  assert.equal(status.structuredContent.rootDir, process.cwd());

  const resource = await client.readResource({ uri: 'harness://active-tasks' });
  assert.equal(resource.contents[0].uri, 'harness://active-tasks');

  await client.close();
});
