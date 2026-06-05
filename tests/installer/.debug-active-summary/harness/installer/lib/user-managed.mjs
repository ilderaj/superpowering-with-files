import { access, lstat, mkdir, readFile, rm, symlink, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

export function userManagedPath(homeDir) {
  return path.join(homeDir, '.agent-config/user-managed.json');
}

export async function readUserManaged(homeDir) {
  try {
    const value = JSON.parse(await readFile(userManagedPath(homeDir), 'utf8'));
    return Array.isArray(value.paths) ? value : { schemaVersion: 1, paths: [] };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { schemaVersion: 1, paths: [] };
    }
    throw error;
  }
}

export async function writeUserManaged(homeDir, value) {
  const filePath = userManagedPath(homeDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function isUserManagedTarget(filePath, userManaged) {
  const resolved = path.resolve(filePath);
  return (userManaged.paths ?? []).some((managedPath) => {
    const candidate = path.resolve(managedPath);
    return resolved === candidate || resolved.startsWith(`${candidate}${path.sep}`);
  });
}

export async function targetExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function replaceManagedTarget(filePath) {
  const stat = await lstat(filePath).catch(() => null);
  if (!stat) return;
  await rm(filePath, { recursive: stat.isDirectory(), force: true });
}

export async function copyManagedFile(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

export async function linkManagedFile(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const type = process.platform === 'win32' ? 'file' : 'file';
  await symlink(sourcePath, targetPath, type);
}
