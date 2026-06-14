import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const homepageNodeModules = path.resolve('homepage', 'node_modules');

try {
  await access(homepageNodeModules);
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }

  console.log('homepage/node_modules is missing; running npm ci --prefix homepage');
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['ci', '--prefix', 'homepage'], { stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}
