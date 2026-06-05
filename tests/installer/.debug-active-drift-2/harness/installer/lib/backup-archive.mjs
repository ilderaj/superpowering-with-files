import crypto from 'node:crypto';
import { lstat, mkdir, readFile, readdir, readlink, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHookRoots, resolveTargetPaths, resolveSkillRoots } from './paths.mjs';
import { projectionTargetRoots } from './projection-manifest.mjs';

export const BACKUP_INDEX_SCHEMA_VERSION = 1;

const DEFAULT_REASON = 'non-harness-owned-conflict';
const DEFAULT_TARGETS = ['codex', 'copilot', 'cursor', 'claude-code'];

export function backupArchiveRoot(homeDir = os.homedir()) {
  return path.join(homeDir, '.harness/backups');
}

export function backupIndexPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.harness/backup-index.json');
}

export function encodeTargetPath(targetPath) {
  const segments = path.resolve(targetPath).split(path.sep).filter(Boolean);
  if (segments.length === 0) return 'root';
  return path.join(...segments.map((segment) => segment.replaceAll(/[^a-zA-Z0-9._-]/g, '_')));
}

async function digestPath(targetPath, hash) {
  const targetStat = await lstat(targetPath);

  if (targetStat.isSymbolicLink()) {
    hash.update('symlink\0');
    hash.update(await readlink(targetPath));
    return;
  }

  if (targetStat.isDirectory()) {
    hash.update('directory\0');
    const entries = await readdir(targetPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      hash.update(entry.name);
      hash.update('\0');
      await digestPath(path.join(targetPath, entry.name), hash);
    }
    return;
  }

  hash.update('file\0');
  hash.update(await readFile(targetPath));
}

export async function digestTarget(targetPath) {
  const hash = crypto.createHash('sha256');
  await digestPath(targetPath, hash);
  return `sha256:${hash.digest('hex')}`;
}

export async function archiveConflictTarget({ homeDir, targetPath, sourcePath = targetPath, now, source }) {
  return {
    backupPath: path.join(backupArchiveRoot(homeDir), now(), source, encodeTargetPath(targetPath)),
    digest: await digestTarget(sourcePath)
  };
}

export function defaultBackupIndex() {
  return { schemaVersion: BACKUP_INDEX_SCHEMA_VERSION, entries: [] };
}

function normalizeBackupIndex(index) {
  if (!index || typeof index !== 'object' || Array.isArray(index)) {
    return defaultBackupIndex();
  }

  return {
    schemaVersion: BACKUP_INDEX_SCHEMA_VERSION,
    entries: Array.isArray(index.entries) ? index.entries : []
  };
}

export async function readBackupIndex(homeDir = os.homedir()) {
  try {
    return normalizeBackupIndex(JSON.parse(await readFile(backupIndexPath(homeDir), 'utf8')));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return defaultBackupIndex();
    }
    throw error;
  }
}

export async function writeBackupIndex(homeDir, index) {
  const filePath = backupIndexPath(homeDir);
  const directoryPath = path.dirname(filePath);
  const tempPath = path.join(
    directoryPath,
    `${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`
  );
  await mkdir(directoryPath, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(normalizeBackupIndex(index), null, 2)}\n`);
  await rename(tempPath, filePath);
}

export async function recordBackupIndexEntry(homeDir, entry) {
  const index = await readBackupIndex(homeDir);
  const entries = index.entries.filter(
    (current) =>
      !(
        current.originalPath === entry.originalPath &&
        current.digest === entry.digest &&
        current.reason === entry.reason
      )
  );
  entries.push(entry);
  await writeBackupIndex(homeDir, { schemaVersion: BACKUP_INDEX_SCHEMA_VERSION, entries });
}

function defaultArchiveTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function normalizeOriginalPath(targetPath) {
  return path.resolve(targetPath);
}

function latestBackupIndexEntry(index, originalPath) {
  for (let indexPosition = index.entries.length - 1; indexPosition >= 0; indexPosition -= 1) {
    const entry = index.entries[indexPosition];
    if (entry.originalPath === originalPath) {
      return entry;
    }
  }
  return null;
}

function uniquePaths(paths) {
  return [...new Set(paths.map((entry) => path.resolve(entry)))].sort((left, right) =>
    left.localeCompare(right)
  );
}

async function pathExists(targetPath) {
  try {
    await lstat(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function resolveArchiveHomes(rootDir, homeDir) {
  const candidates = [path.resolve(homeDir)];
  const fixtureHomeDir = path.join(rootDir, 'home');
  if (fixtureHomeDir !== homeDir && (await pathExists(fixtureHomeDir))) {
    candidates.push(path.resolve(fixtureHomeDir));
  }
  return uniquePaths(candidates);
}

function pickArchiveHome(targetPath, archiveHomes, fallbackHomeDir) {
  const resolvedTargetPath = path.resolve(targetPath);
  const matchingHome = [...archiveHomes]
    .sort((left, right) => right.length - left.length)
    .find(
      (candidate) =>
        resolvedTargetPath === candidate || resolvedTargetPath.startsWith(`${candidate}${path.sep}`)
    );

  return matchingHome ?? path.resolve(fallbackHomeDir);
}

function globalNormalizationRoots(rootDir, archiveHomes, targets) {
  const roots = [];

  for (const archiveHome of archiveHomes) {
    for (const target of targets) {
      roots.push(
        ...resolveTargetPaths(rootDir, archiveHome, 'user-global', target).map((entry) =>
          path.dirname(entry)
        )
      );
      roots.push(...resolveSkillRoots(rootDir, archiveHome, 'user-global', target));
      roots.push(...resolveHookRoots(rootDir, archiveHome, 'user-global', target));
    }
  }

  return uniquePaths(roots);
}

function parseLegacySiblingBackup(targetPath) {
  const marker = '.harness-backup-';
  const markerIndex = targetPath.lastIndexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  return targetPath.slice(0, markerIndex);
}

async function findLegacySiblingBackups(rootPath) {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.name.includes('.harness-backup-'))
      .map((entry) => {
        const targetPath = path.join(rootPath, entry.name);
        const originalPath = parseLegacySiblingBackup(targetPath);
        return originalPath ? { targetPath, originalPath } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.targetPath.localeCompare(right.targetPath));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function createBackupArchiveManager({
  rootDir,
  homeDir = os.homedir(),
  state,
  manifest = { entries: [] },
  plan,
  now = defaultArchiveTimestamp,
  source = 'harness',
  reason = DEFAULT_REASON
} = {}) {
  const archiveHomes = await resolveArchiveHomes(rootDir, homeDir);
  const normalizationTargets = Object.keys(state?.targets ?? {}).length
    ? Object.keys(state.targets)
    : DEFAULT_TARGETS;
  const targetRoots = uniquePaths([
    ...projectionTargetRoots(manifest),
    ...projectionTargetRoots(plan?.manifest ?? { entries: [] }),
    ...globalNormalizationRoots(rootDir, archiveHomes, normalizationTargets)
  ]);

  async function backupTarget({ targetPath, originalPath = targetPath }) {
    const normalizedOriginalPath = normalizeOriginalPath(originalPath);
    const resolvedTargetPath = path.resolve(targetPath);
    const archiveHome = pickArchiveHome(normalizedOriginalPath, archiveHomes, homeDir);
    const { backupPath, digest } = await archiveConflictTarget({
      homeDir: archiveHome,
      targetPath: normalizedOriginalPath,
      sourcePath: resolvedTargetPath,
      now,
      source
    });
    const index = await readBackupIndex(archiveHome);
    const latestEntry = latestBackupIndexEntry(index, normalizedOriginalPath);

    if (
      latestEntry &&
      latestEntry.originalPath === normalizedOriginalPath &&
      latestEntry.digest === digest &&
      (await pathExists(latestEntry.archivePath))
    ) {
      await rm(resolvedTargetPath, { recursive: true, force: true });
      return { backupPath: latestEntry.archivePath, deduped: true, digest };
    }

    await mkdir(path.dirname(backupPath), { recursive: true });
    await rename(resolvedTargetPath, backupPath);
    await recordBackupIndexEntry(archiveHome, {
      originalPath: normalizedOriginalPath,
      archivedAt: new Date().toISOString(),
      digest,
      archivePath: backupPath,
      reason
    });
    return { backupPath, deduped: false, digest };
  }

  return {
    backupHandler({ targetPath }) {
      return backupTarget({ targetPath });
    },
    async normalizeLegacyBackups() {
      const warnings = [];

      for (const rootPath of targetRoots) {
        const legacyBackups = await findLegacySiblingBackups(rootPath);
        for (const legacyBackup of legacyBackups) {
          await backupTarget(legacyBackup);
        }
      }

      return { warnings };
    }
  };
}

export function createBackupArchiveService({
  homeDir = os.homedir(),
  now = defaultArchiveTimestamp,
  source = 'harness',
  reason = DEFAULT_REASON
} = {}) {
  return {
    async backupHandler({ targetPath }) {
      const archivedAt = new Date().toISOString();
      const originalPath = normalizeOriginalPath(targetPath);
      const { backupPath, digest } = await archiveConflictTarget({
        homeDir,
        targetPath: originalPath,
        sourcePath: targetPath,
        now,
        source
      });
      await mkdir(path.dirname(backupPath), { recursive: true });
      await rename(targetPath, backupPath);
      await recordBackupIndexEntry(homeDir, {
        originalPath,
        archivedAt,
        digest,
        archivePath: backupPath,
        reason
      });
      return { backupPath, digest };
    }
  };
}
