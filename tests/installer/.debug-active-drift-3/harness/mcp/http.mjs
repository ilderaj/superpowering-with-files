#!/usr/bin/env node
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { URL, pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHarnessMcpServer } from './server.mjs';
import { loadMcpProfile, validateProfileRequest } from './profile-policy.mjs';
import { validateBearerToken } from './auth.mjs';
import { discoverAuthorityRoot } from '../runtime/authority-root.mjs';

function readOption(args, name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function isInitializeRequest(body) {
  return body && typeof body === 'object' && body.method === 'initialize';
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

export async function createHttpServer({ rootDir, profileName = 'local', host = '127.0.0.1', port = 0 }) {
  const profile = await loadMcpProfile(rootDir, profileName);
  const transports = new Map();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/mcp', `http://${req.headers.host ?? host}`);
    if (url.pathname !== '/mcp') {
      res.writeHead(404).end('Not found');
      return;
    }

    try {
      validateProfileRequest(profile, {
        host: (req.headers.host ?? '').split(':')[0],
        origin: req.headers.origin
      });
      validateBearerToken(profile, req.headers);
    } catch (error) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }

    const method = req.method ?? 'GET';
    const sessionId = req.headers['mcp-session-id'];

    if (method === 'POST') {
      const body = await readJsonBody(req);
      let transport = sessionId ? transports.get(sessionId) : null;
      if (!transport && !sessionId && isInitializeRequest(body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (createdSessionId) => {
            transports.set(createdSessionId, transport);
          }
        });
        const mcpServer = createHarnessMcpServer({ mode: profile.mode });
        await mcpServer.connect(transport);
        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };
      }

      if (!transport) {
        res.writeHead(400).end('Invalid or missing session');
        return;
      }

      await transport.handleRequest(req, res, body);
      return;
    }

    if (method === 'GET' || method === 'DELETE') {
      const transport = sessionId ? transports.get(sessionId) : null;
      if (!transport) {
        if (method === 'GET' && !sessionId) {
          res.writeHead(405).end('Standalone SSE stream is not supported');
          return;
        }
        res.writeHead(400).end('Invalid or missing session');
        return;
      }
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(405).end('Method not allowed');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  return {
    profile,
    server,
    address: server.address()
  };
}

export async function runHttpSelfTest({ rootDir, profileName = 'local', live = false }) {
  if (live && profileName !== 'local' && !process.env.HARNESS_MCP_BEARER_TOKEN) {
    throw new Error(`contract complete; platform activation blocked by missing credentials for ${profileName}`);
  }

  const { server, address, profile } = await createHttpServer({ rootDir, profileName });
  const baseUrl = new URL(`http://${address.address}:${address.port}/mcp`);
  const requestInit = profile.requireAuth
    ? { headers: { Authorization: `Bearer ${process.env.HARNESS_MCP_BEARER_TOKEN}` } }
    : undefined;

  try {
    const client = new Client({
      name: 'harness-http-self-test',
      version: '1.0.0'
    });
    const transport = new StreamableHTTPClientTransport(baseUrl, { requestInit });
    await client.connect(transport);
    const tools = await client.listTools();
    if (!tools.tools.some((tool) => tool.name === 'harness_status')) {
      throw new Error('HTTP self-test failed: missing harness_status tool');
    }
    const result = await client.callTool({ name: 'harness_status', arguments: {} });
    await client.close();
    return {
      ok: true,
      toolCount: tools.tools.length,
      result
    };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const profileName = readOption(args, 'profile', 'local');
  const requestedRoot = readOption(args, 'root', undefined);
  const { rootDir } = await discoverAuthorityRoot(process.cwd(), { inputRoot: requestedRoot });
  if (hasFlag(args, '--self-test')) {
    const result = await runHttpSelfTest({ rootDir, profileName });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (hasFlag(args, '--self-test-live')) {
    const result = await runHttpSelfTest({ rootDir, profileName, live: true });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const host = readOption(args, 'host', '127.0.0.1');
  const port = Number(readOption(args, 'port', '3001'));
  const { address } = await createHttpServer({ rootDir, profileName, host, port });
  console.error(`Harness MCP HTTP server listening on http://${address.address}:${address.port}/mcp`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
