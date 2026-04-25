import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function checkpointCommand(args = []) {
  const rootDir = process.cwd();
  const scriptPath = path.join(rootDir, 'harness/core/safety/bin/checkpoint');
  const { stdout, stderr } = await execFileAsync('bash', [scriptPath, ...args], { cwd: rootDir });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}
