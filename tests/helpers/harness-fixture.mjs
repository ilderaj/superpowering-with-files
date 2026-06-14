import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function createHarnessFixture(options = {}) {
  const {
    linkNodeModules = false,
    includeLiveCompanionPlans = false
  } = options;
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-fixture-'));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await cp(path.join(process.cwd(), 'harness'), path.join(root, 'harness'), { recursive: true });
  await cp(path.join(process.cwd(), 'docs'), path.join(root, 'docs'), { recursive: true });
  if (!includeLiveCompanionPlans) {
    await rm(path.join(root, 'docs/superpowers/plans'), { recursive: true, force: true });
  }
  await cp(path.join(process.cwd(), 'scripts'), path.join(root, 'scripts'), { recursive: true });
  await cp(path.join(process.cwd(), 'package.json'), path.join(root, 'package.json'));
  await cp(path.join(process.cwd(), 'package-lock.json'), path.join(root, 'package-lock.json')).catch(() => {});
  if (linkNodeModules) {
    await symlink(path.join(process.cwd(), 'node_modules'), path.join(root, 'node_modules'), 'dir').catch(() => {});
  }
  return root;
}

export async function removeHarnessFixture(root) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code)) {
        throw error;
      }
      lastError = error;
      await delay(50 * (attempt + 1));
    }
  }

  throw lastError;
}

export async function withCwd(dir, fn) {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}
