import path from 'node:path';

export function resolveHarnessSourceRoot(rootDir = process.cwd(), env = process.env) {
  const configured = env.HARNESS_SOURCE_ROOT?.trim();
  return path.resolve(rootDir, configured || '.');
}

export function resolveHarnessSourcePath(rootDir, ...segments) {
  return path.join(resolveHarnessSourceRoot(rootDir), ...segments);
}
