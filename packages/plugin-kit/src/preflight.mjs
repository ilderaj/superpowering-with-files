import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { platformContractFor } from './platform-contracts.mjs';

export async function validateBuiltPlugin({ target, pluginRoot }) {
  const contract = platformContractFor(target);
  const errors = [];

  for (const requiredFile of contract.requiredFiles) {
    if (!(await pathExists(path.join(pluginRoot, requiredFile)))) {
      errors.push(`Missing required file: ${requiredFile}`);
    }
  }

  await validateJsonFile(path.join(pluginRoot, contract.manifestPath), contract.manifestPath, errors);

  for (const forbiddenPath of ['.mcp.json', 'mcp', 'runtime', 'node_modules']) {
    if (await pathExists(path.join(pluginRoot, forbiddenPath))) {
      errors.push(`Plugin artifact must not include forbidden path: ${forbiddenPath}/`);
    }
  }

  return {
    ok: errors.length === 0,
    target,
    pluginRoot,
    errors
  };
}

async function validateJsonFile(filePath, label, errors) {
  try {
    JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function pathExists(candidatePath) {
  try {
    await access(candidatePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}
