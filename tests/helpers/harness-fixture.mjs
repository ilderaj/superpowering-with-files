import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function createHarnessFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-fixture-'));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await cp(path.join(process.cwd(), 'harness'), path.join(root, 'harness'), { recursive: true });
  await cp(path.join(process.cwd(), 'scripts'), path.join(root, 'scripts'), { recursive: true });
  await cp(path.join(process.cwd(), 'package.json'), path.join(root, 'package.json'));
  return root;
}

export async function removeHarnessFixture(root) {
  await rm(root, { recursive: true, force: true });
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
