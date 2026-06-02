import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { platformContractFor } from './platform-contracts.mjs';

const execFileAsync = promisify(execFile);

export async function packPlugin({ pluginRoot, target, version, outDir }) {
  const contract = platformContractFor(target);
  await mkdir(outDir, { recursive: true });
  const name = `${contract.packageName}-${version}.tgz`;
  const artifactPath = path.join(outDir, name);

  await execFileAsync('tar', ['-czf', artifactPath, '-C', pluginRoot, '.']);

  return {
    name,
    path: artifactPath,
    target,
    type: 'plugin'
  };
}

export async function packDirectory({ sourceRoot, name, target = 'runtime', type = 'runtime', outDir }) {
  await mkdir(outDir, { recursive: true });
  const artifactPath = path.join(outDir, name);
  await execFileAsync('tar', ['-czf', artifactPath, '-C', sourceRoot, '.']);
  return {
    name,
    path: artifactPath,
    target,
    type
  };
}
