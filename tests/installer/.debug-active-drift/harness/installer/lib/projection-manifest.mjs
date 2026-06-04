import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
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

export function projectionTargetRoots(manifest) {
  return [
    ...new Set(manifest.entries.map((entry) => path.dirname(path.resolve(entry.targetPath))))
  ].sort((left, right) => left.localeCompare(right));
}

function projectionEntryKey(entry) {
  const targetPath = path.resolve(entry.targetPath);
  const parts = [entry.kind ?? 'projection', targetPath];

  if (typeof entry.parentSkillName === 'string') {
    parts.push(entry.parentSkillName);
  }

  return parts.join('::');
}

function normalizeProjectionEntry(entry) {
  return {
    ...entry,
    targetPath: path.resolve(entry.targetPath)
  };
}

function sortProjectionEntries(entries) {
  return [...entries].sort((left, right) => {
    const leftKey = projectionEntryKey(left);
    const rightKey = projectionEntryKey(right);
    return leftKey.localeCompare(rightKey);
  });
}

export function createProjectionManifest(entries = []) {
  const byKey = new Map();
  for (const entry of entries.map(normalizeProjectionEntry)) {
    byKey.set(projectionEntryKey(entry), entry);
  }

  return {
    schemaVersion: 1,
    entries: sortProjectionEntries([...byKey.values()])
  };
}

export function diffProjectionManifest(currentManifest, desiredManifest) {
  const currentByKey = new Map(
    currentManifest.entries.map((entry) => [projectionEntryKey(entry), normalizeProjectionEntry(entry)])
  );
  const desiredByKey = new Map(
    desiredManifest.entries.map((entry) => [projectionEntryKey(entry), normalizeProjectionEntry(entry)])
  );

  const create = [];
  const update = [];
  const unchanged = [];
  const stale = [];

  for (const [key, desiredEntry] of desiredByKey) {
    const currentEntry = currentByKey.get(key);
    if (!currentEntry) {
      create.push(desiredEntry);
      continue;
    }

    if (isDeepStrictEqual(currentEntry, desiredEntry)) {
      unchanged.push(desiredEntry);
      continue;
    }

    update.push({ before: currentEntry, after: desiredEntry });
  }

  for (const [key, currentEntry] of currentByKey) {
    if (!desiredByKey.has(key)) {
      stale.push(currentEntry);
    }
  }

  return { create, update, unchanged, stale };
}

export function upsertProjectionEntry(manifest, entry) {
  const nextEntries = [
    ...manifest.entries.filter(
      (existing) => projectionEntryKey(existing) !== projectionEntryKey(entry)
    ),
    normalizeProjectionEntry(entry)
  ];
  return createProjectionManifest(nextEntries);
}
