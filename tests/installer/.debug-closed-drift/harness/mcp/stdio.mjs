#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { createHarnessMcpServer } from './server.mjs';

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    return inline.slice(name.length + 3);
  }
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return args[index + 1];
}

async function main() {
  const root = readOption(process.argv.slice(2), 'root');
  const mode = readOption(process.argv.slice(2), 'mode') ?? 'full';
  if (root) {
    process.env.HARNESS_MCP_ROOTS = root;
  }

  const server = createHarnessMcpServer({ mode });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Harness MCP stdio server running (${mode})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
