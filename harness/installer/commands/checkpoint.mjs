import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';

const execFileAsync = promisify(execFile);

export async function checkpointCommand(args = []) {
  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const scriptPath = path.join(rootDir, 'harness/core/safety/bin/checkpoint');
  const { stdout, stderr } = await execFileAsync('bash', [scriptPath, ...args], { cwd: rootDir });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}
