import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { discoverAuthorityRoot } from '../../trio/core/authority.mjs';

const execFileAsync = promisify(execFile);
const CAPABILITY_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../trio/capabilities/safety/bin/checkpoint'
);

export async function checkpointCommand(args = [], options = {}) {
  const rootDir = options.rootDir ?? (await discoverAuthorityRoot(process.cwd())).rootDir;
  const { stdout, stderr } = await execFileAsync('bash', [CAPABILITY_SCRIPT, ...args], { cwd: rootDir });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}
