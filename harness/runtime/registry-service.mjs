import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REGISTRY_DIR = '.harness/mcp/registry';
const REGISTRY_CHANNEL_PATTERN = /^[A-Za-z0-9._-]+$/;

function validateRegistryChannel(channel) {
  if (!REGISTRY_CHANNEL_PATTERN.test(channel)) {
    throw new Error(`Invalid registry channel: ${channel}`);
  }
}

async function registryPath(rootDir, channel = 'local-dev') {
  validateRegistryChannel(channel);
  const dir = path.join(rootDir, REGISTRY_DIR);
  await mkdir(dir, { recursive: true });
  return path.join(dir, `${channel}.json`);
}

export async function readRegistry(rootDir, channel = 'local-dev') {
  const filePath = await registryPath(rootDir, channel);
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeRegistry(rootDir, bundle, channel = 'local-dev') {
  const filePath = await registryPath(rootDir, channel);
  await writeFile(filePath, `${JSON.stringify(bundle, null, 2)}\n`);
  return filePath;
}
