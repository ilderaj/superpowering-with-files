import os from 'node:os';
import { readHarnessHealth } from '../lib/health.mjs';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';

export async function status() {
  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const health = await readHarnessHealth(rootDir, os.homedir());
  console.log(JSON.stringify(health, null, 2));
}
