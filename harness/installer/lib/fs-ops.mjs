import { copyFile, cp, lstat, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function renderTemplate(template, values) {
  return template.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_, key) => {
    if (!(key in values)) {
      throw new Error(`Missing template value: ${key}`);
    }
    return values[key];
  });
}

async function pathStat(targetPath) {
  try {
    return await lstat(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function defaultTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
}

async function prepareProjectionTarget({
  targetPath,
  ownedTargets,
  conflictMode,
  now = defaultTimestamp
}) {
  const stat = await pathStat(targetPath);
  if (!stat) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    return { backupPath: undefined };
  }

  const resolvedTarget = path.resolve(targetPath);
  if (ownedTargets.has(resolvedTarget)) {
    await rm(targetPath, { recursive: true, force: true });
    await mkdir(path.dirname(targetPath), { recursive: true });
    return { backupPath: undefined };
  }

  if (conflictMode === 'backup') {
    const backupPath = `${targetPath}.harness-backup-${now()}`;
    await rename(targetPath, backupPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    return { backupPath };
  }

  throw new Error(`Refusing to overwrite non-Harness-owned path: ${targetPath}`);
}

export async function writeRenderedProjection(options) {
  const result = await prepareProjectionTarget(options);
  await writeFile(options.targetPath, options.content);
  return result;
}

export async function materializeDirectoryProjection(options) {
  const result = await prepareProjectionTarget(options);
  await cp(options.sourcePath, options.targetPath, { recursive: true });
  return result;
}

export async function materializeFileProjection(options) {
  const result = await prepareProjectionTarget(options);
  await copyFile(options.sourcePath, options.targetPath);
  return result;
}

export async function linkDirectoryProjection(options) {
  const result = await prepareProjectionTarget(options);
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  await symlink(options.sourcePath, options.targetPath, type);
  return result;
}

export async function writeRenderedFile(targetPath, content) {
  await writeRenderedProjection({
    targetPath,
    content,
    ownedTargets: new Set([path.resolve(targetPath)]),
    conflictMode: 'reject'
  });
}

export async function materializeFile(sourcePath, targetPath) {
  await prepareProjectionTarget({
    targetPath,
    ownedTargets: new Set([path.resolve(targetPath)]),
    conflictMode: 'reject'
  });
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

export async function linkPath(sourcePath, targetPath) {
  await linkDirectoryProjection({
    sourcePath,
    targetPath,
    ownedTargets: new Set([path.resolve(targetPath)]),
    conflictMode: 'reject'
  });
}

export async function readText(filePath) {
  return readFile(filePath, 'utf8');
}
