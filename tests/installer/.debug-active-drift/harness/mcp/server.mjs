import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerReadOnlyTools } from './tools/read-only.mjs';
import { registerWriteTools } from './tools/write.mjs';
import { registerRegistryTools } from './tools/registry.mjs';
import { registerReadOnlyResources } from './resources/read-only.mjs';

export function createHarnessMcpServer(options = {}) {
  const server = new McpServer({
    name: 'harness-runtime-facade',
    version: '1.0.0'
  });

  registerReadOnlyTools(server);
  registerReadOnlyResources(server);
  if (options.mode !== 'read-only') {
    registerWriteTools(server);
    registerRegistryTools(server);
  }
  return server;
}
