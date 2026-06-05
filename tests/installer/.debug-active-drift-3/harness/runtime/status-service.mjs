import os from 'node:os';
import { readHarnessHealth } from '../installer/lib/health.mjs';
import { resolveHarnessRoot } from './root-policy.mjs';

export async function getHarnessStatus(input = {}) {
  const resolved = await resolveHarnessRoot(input.root, input);
  const health = await readHarnessHealth(resolved.rootDir, input.homeDir ?? os.homedir());
  return {
    rootDir: resolved.rootDir,
    health
  };
}
