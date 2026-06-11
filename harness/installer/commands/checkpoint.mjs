import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import { resolveHarnessSourcePath } from '../../runtime/source-root.mjs';

const execFileAsync = promisify(execFile);

export async function checkpointCommand(args = [], options = {}) {
  const rootDir = options.rootDir ?? (await discoverAuthorityRoot(process.cwd())).rootDir;
  const scriptPath = resolveHarnessSourcePath(rootDir, 'harness/core/safety/bin/checkpoint');
  const { stdout, stderr } = await execFileAsync('bash', [scriptPath, ...args], { cwd: rootDir });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}
