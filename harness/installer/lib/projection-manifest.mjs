import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PROJECTION_MANIFEST_RELATIVE_PATH = '.harness/projections.json';

export function projectionManifestPath(rootDir) {
  return path.join(rootDir, PROJECTION_MANIFEST_RELATIVE_PATH);
}

export async function readProjectionManifest(rootDir) {
  try {
    const manifest = JSON.parse(await readFile(projectionManifestPath(rootDir), 'utf8'));
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
      throw new Error('Invalid projection manifest.');
    }
    return manifest;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { schemaVersion: 1, entries: [] };
    }
    throw error;
  }
}

export async function writeProjectionManifest(rootDir, manifest) {
  const filePath = projectionManifestPath(rootDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(tempPath, filePath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Best-effort cleanup only.
    }
    throw error;
  }
}

export function ownedTargetSet(manifest) {
  return new Set(manifest.entries.map((entry) => path.resolve(entry.targetPath)));
}

export function upsertProjectionEntry(manifest, entry) {
  const targetPath = path.resolve(entry.targetPath);
  return {
    schemaVersion: 1,
    entries: [
      ...manifest.entries.filter((existing) => path.resolve(existing.targetPath) !== targetPath),
      { ...entry, targetPath }
    ].sort((left, right) => left.targetPath.localeCompare(right.targetPath))
  };
}
