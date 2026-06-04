import { ResourceTemplate, McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listHarnessResources, readHarnessResource } from '../../runtime/resource-service.mjs';

export function registerReadOnlyResources(server) {
  if (!(server instanceof McpServer)) {
    throw new Error('Expected an McpServer instance.');
  }

  server.registerResource(
    'harness-status',
    'harness://status',
    { mimeType: 'application/json', description: 'Harness health status' },
    async (uri) => readHarnessResource(String(uri))
  );
  server.registerResource(
    'harness-active-tasks',
    'harness://active-tasks',
    { mimeType: 'application/json', description: 'Active Harness task summary' },
    async (uri) => readHarnessResource(String(uri))
  );
  server.registerResource(
    'harness-verification',
    'harness://verification/latest',
    { mimeType: 'application/json', description: 'Latest verification report' },
    async (uri) => readHarnessResource(String(uri))
  );
  server.registerResource(
    'harness-policy-base',
    'harness://policy/base',
    { mimeType: 'text/markdown', description: 'Canonical Harness base policy' },
    async (uri) => readHarnessResource(String(uri))
  );
  server.registerResource(
    'harness-adapters',
    'harness://adapters',
    { mimeType: 'application/json', description: 'Harness adapter metadata' },
    async (uri) => readHarnessResource(String(uri))
  );
  server.registerResource(
    'harness-commands',
    'harness://commands',
    { mimeType: 'text/javascript', description: 'Harness command dispatcher source' },
    async (uri) => readHarnessResource(String(uri))
  );
  server.registerResource(
    'harness-task-resource',
    new ResourceTemplate('harness://task/{taskId}/{file}', { list: undefined }),
    { mimeType: 'text/markdown', description: 'Task-scoped planning file' },
    async (uri) => readHarnessResource(String(uri))
  );

  server.registerTool(
    'harness_list_resources',
    {
      description: 'List all Harness resources in a stable JSON payload.',
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async () => {
      const resources = await listHarnessResources();
      return {
        content: [{ type: 'text', text: `Resources available: ${resources.length}` }],
        structuredContent: { resources }
      };
    }
  );
}
