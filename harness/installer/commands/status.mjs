import os from 'node:os';
import { readHarnessHealth } from '../lib/health.mjs';

export async function status() {
  const health = await readHarnessHealth(process.cwd(), os.homedir());
  console.log(JSON.stringify(health, null, 2));
}
