import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { assertInstallerStateEvidence } from './state.mjs';
import { PROJECTION_SURFACES } from '../../trio/projection.mjs';

const SURFACE_ORDER = Object.freeze(PROJECTION_SURFACES.map((surface) => surface.id));
const STATE_SURFACE = 'state';
const BACKUP_ANCESTOR_RELATIVES = Object.freeze(['.harness-backup', path.join('.harness-backup', 'trio-takeover')]);
const BACKUP_REF_PREFIX = 'trio-backup-v1:';
const SHA256_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

function takeoverBackupError(message, code = 'ERR_TRIO_BACKUP') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isMissingPathError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function takeoverTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

/**
 * Capture one stable preimage for a target file and its parent directory.
 * The snapshot carries exact bytes, sha256, and dev/ino/nlink identities so a
 * later atomic write can be bound to this exact pre-write state.
 */
async function capturePreimage(targetPath) {
  const absolute = path.resolve(targetPath);
  const parentPath = path.dirname(absolute);
  let parent;
  try {
    parent = await lstat(parentPath, { bigint: true });
  } catch (error) {
    throw takeoverBackupError(`Takeover preimage parent is unavailable: ${parentPath}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  if (parent.isSymbolicLink() || !parent.isDirectory()) {
    throw takeoverBackupError(`Takeover preimage parent is not a real directory: ${parentPath}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  const parentIdentity = Object.freeze({ dev: parent.dev, ino: parent.ino, nlink: parent.nlink });
  let info;
  try {
    info = await lstat(absolute, { bigint: true });
  } catch (error) {
    throw takeoverBackupError(`Takeover preimage is missing: ${absolute}.`, 'ERR_TRIO_BACKUP');
  }
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1n) {
    throw takeoverBackupError(`Takeover preimage is not a real regular file: ${absolute}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  const bytes = await readFile(absolute);
  // Stable capture: re-lstat the file and its parent after the read and require
  // the exact device/inode/nlink identities (and a size matching the read), so
  // a replacement between the stat and the read fails closed before any backup
  // or apply write.
  let infoAfter;
  let parentAfter;
  try {
    [infoAfter, parentAfter] = await Promise.all([
      lstat(absolute, { bigint: true }),
      lstat(parentPath, { bigint: true })
    ]);
  } catch (error) {
    throw takeoverBackupError(`Takeover preimage disappeared during capture: ${absolute}.`, 'ERR_TRIO_PREIMAGE_DRIFT');
  }
  if (infoAfter.dev !== info.dev
    || infoAfter.ino !== info.ino
    || infoAfter.nlink !== info.nlink
    || infoAfter.size !== BigInt(bytes.length)
    || parentAfter.dev !== parent.dev
    || parentAfter.ino !== parent.ino
    || parentAfter.nlink !== parent.nlink) {
    throw takeoverBackupError(
      `Takeover preimage identity changed between stat and read: ${absolute}.`,
      'ERR_TRIO_PREIMAGE_DRIFT'
    );
  }
  return Object.freeze({
    path: absolute,
    exists: true,
    bytes,
    sha256: sha256(bytes),
    dev: info.dev,
    ino: info.ino,
    nlink: info.nlink,
    parent: parentIdentity
  });
}

// An absent support file has no bytes or inode. Bind it to the nearest real
// directory without creating directories before the backup is published.
async function captureAbsentPreimage(targetPath) {
  const absolute = path.resolve(targetPath);
  let parentPath = path.dirname(absolute);
  let parent;
  for (;;) {
    try {
      parent = await lstat(parentPath, { bigint: true });
      break;
    } catch (error) {
      if (error?.code !== 'ENOENT' || path.dirname(parentPath) === parentPath) throw error;
      parentPath = path.dirname(parentPath);
    }
  }
  if (parent.isSymbolicLink() || !parent.isDirectory() || await realpath(parentPath) !== parentPath) {
    throw takeoverBackupError(`Unsafe absent preimage ancestor: ${parentPath}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  try {
    await lstat(absolute);
    throw takeoverBackupError(`Absent takeover preimage appeared: ${absolute}.`, 'ERR_TRIO_PREIMAGE_DRIFT');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const after = await lstat(parentPath, { bigint: true });
  if (parent.dev !== after.dev || parent.ino !== after.ino || parent.nlink !== after.nlink) {
    throw takeoverBackupError(`Absent preimage ancestor changed: ${parentPath}.`, 'ERR_TRIO_PREIMAGE_DRIFT');
  }
  return Object.freeze({
    path: absolute, exists: false, bytes: null, sha256: null,
    dev: null, ino: null, nlink: null, parentPath,
    parent: Object.freeze({ dev: parent.dev, ino: parent.ino, nlink: parent.nlink })
  });
}

function samePreimageState(preimage, evidence) {
  return preimage.exists === evidence.exists
    && preimage.sha256 === evidence.sha256
    && preimage.dev === evidence.identity?.dev
    && preimage.ino === evidence.identity?.ino
    && preimage.nlink === evidence.identity?.nlink
    && preimage.parent.dev === evidence.nearest.identity.dev
    && preimage.parent.ino === evidence.nearest.identity.ino
    && preimage.parent.nlink === evidence.nearest.identity.nlink;
}

/**
 * Parse a trio-backup-v1 file reference:
 * `trio-backup-v1:<canonical absolute manifest path>:<sha256 digest>`.
 * The digest is the sha256 of the manifest file bytes as written and re-read,
 * so a verifier can recompute it from the manifest file alone.
 */
export function parseTrioBackupV1Ref(reference) {
  if (typeof reference !== 'string' || !reference.startsWith(BACKUP_REF_PREFIX)) {
    throw takeoverBackupError('Recovery rollback reference is not a trio-backup-v1 file reference.', 'ERR_TRIO_BACKUP');
  }
  const lastSeparator = reference.lastIndexOf(':');
  if (lastSeparator <= BACKUP_REF_PREFIX.length) {
    throw takeoverBackupError('Recovery rollback reference is missing its digest.', 'ERR_TRIO_BACKUP');
  }
  const manifestPath = reference.slice(BACKUP_REF_PREFIX.length, lastSeparator);
  const digest = reference.slice(lastSeparator + 1);
  if (!path.isAbsolute(manifestPath) || !SHA256_DIGEST_PATTERN.test(digest)) {
    throw takeoverBackupError('Recovery rollback reference is not a canonical path plus sha256 digest.', 'ERR_TRIO_BACKUP');
  }
  return Object.freeze({ manifestPath, digest });
}

async function assertRealDirectoryContained(ancestor, authorityRootReal) {
  const stat = await lstat(ancestor, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw takeoverBackupError(`Takeover backup ancestor is not a real directory: ${ancestor}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  const physical = await realpath(ancestor);
  if (physical !== authorityRootReal && !physical.startsWith(`${authorityRootReal}${path.sep}`)) {
    throw takeoverBackupError(`Takeover backup ancestor escapes the authority root: ${ancestor}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
}

/**
 * Prove the backup-root chain is physically safe before any backup write: the
 * authority root and every existing ancestor from it through
 * `.harness-backup/trio-takeover` must be a real, non-symlink directory whose
 * physical path is contained under the authority root. When `verifyLeaf` is
 * set (after creation), the unique backup directory itself is checked too.
 */
async function assertTrioBackupRootChain({ authorityRoot, backupRoot, verifyLeaf = false } = {}) {
  if (typeof authorityRoot !== 'string' || typeof backupRoot !== 'string') {
    throw takeoverBackupError('Takeover backup root verification requires explicit paths.', 'ERR_TRIO_PHYSICAL_GATE');
  }
  let authorityRootReal;
  try {
    authorityRootReal = await realpath(authorityRoot);
  } catch (error) {
    throw takeoverBackupError(`Takeover authority root is unavailable: ${authorityRoot}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  const authorityStat = await lstat(authorityRoot, { bigint: true });
  if (authorityStat.isSymbolicLink() || !authorityStat.isDirectory()) {
    throw takeoverBackupError(`Takeover authority root is not a real directory: ${authorityRoot}.`, 'ERR_TRIO_PHYSICAL_GATE');
  }
  for (const relative of BACKUP_ANCESTOR_RELATIVES) {
    const ancestor = path.join(authorityRoot, relative);
    try {
      await assertRealDirectoryContained(ancestor, authorityRootReal);
    } catch (error) {
      if (isMissingPathError(error)) {
        continue; // Not created yet; creation below is followed by re-verification.
      }
      throw error;
    }
  }
  if (verifyLeaf) {
    await assertRealDirectoryContained(backupRoot, authorityRootReal);
  }
}

/**
 * Capture all primary and support preimages of an existing-V2 ChiefOps
 * takeover, including explicit absence, plus the prior V2 state. The caller
 * must hold the authority publication lock.
 */
export async function captureTrioTakeoverPreimages({ environment, descriptors, statePrecondition } = {}) {
  if (!environment || typeof environment !== 'object') {
    throw takeoverBackupError('Takeover preimages require a resolved environment.', 'ERR_TRIO_PHYSICAL_GATE');
  }
  if (!Array.isArray(descriptors)) {
    throw takeoverBackupError('Takeover preimages require a descriptor list.', 'ERR_TRIO_BACKUP');
  }
  const expectedSurfaces = new Set(SURFACE_ORDER);
  const seenSurfaces = new Set();
  const snapshots = new Map();
  const objects = [];
  for (const descriptor of descriptors) {
    const surface = PROJECTION_SURFACES.find((surface) => surface.id === descriptor.surface);
    const expectedDestination = surface && path.join(environment.homeDir, surface.id === 'entry'
      ? '.codex/AGENTS.md' : `.agents/skills/${surface.relativePath}`);
    if (descriptor.management !== 'managed' || !expectedSurfaces.has(descriptor.surface)
      || descriptor.targetId !== 'codex' || descriptor.scope !== 'user-global'
      || descriptor.source !== surface.source || descriptor.destination !== expectedDestination) {
      throw takeoverBackupError(`Unexpected takeover surface: ${descriptor.surface}.`, 'ERR_TRIO_BACKUP');
    }
    if (seenSurfaces.has(descriptor.surface)) {
      throw takeoverBackupError(`Duplicate takeover surface: ${descriptor.surface}.`, 'ERR_TRIO_BACKUP');
    }
    seenSurfaces.add(descriptor.surface);
    const snapshot = surface.supportFor && descriptor.action === 'create'
      ? await captureAbsentPreimage(descriptor.destination)
      : await capturePreimage(descriptor.destination);
    snapshots.set(snapshot.path, snapshot);
    objects.push(Object.freeze({ path: snapshot.path, surface: descriptor.surface, snapshot }));
  }
  if (seenSurfaces.size !== expectedSurfaces.size) {
    throw takeoverBackupError('Takeover preimages must cover the complete static global Trio inventory.', 'ERR_TRIO_BACKUP');
  }

  const stateSnapshot = await capturePreimage(environment.stateFile);
  snapshots.set(stateSnapshot.path, stateSnapshot);
  objects.push(Object.freeze({ path: stateSnapshot.path, surface: STATE_SURFACE, snapshot: stateSnapshot }));

  if (statePrecondition !== undefined) {
    const evidence = await assertInstallerStateEvidence(environment.authorityRoot, statePrecondition);
    if (!samePreimageState(stateSnapshot, evidence)) {
      throw takeoverBackupError('Takeover state preimage drifted from the routed state evidence.', 'ERR_TRIO_STATE_DRIFT');
    }
  }
  return Object.freeze({
    snapshots,
    objects: Object.freeze(objects),
    stateSnapshot
  });
}

function manifestObjectValue(object, offset, length) {
  const snapshot = object.snapshot;
  return Object.freeze({
    path: snapshot.path,
    surface: object.surface,
    exists: snapshot.exists,
    sha256: snapshot.exists ? `sha256:${snapshot.sha256}` : null,
    dev: snapshot.exists ? String(snapshot.dev) : null,
    ino: snapshot.exists ? String(snapshot.ino) : null,
    nlink: snapshot.exists ? String(snapshot.nlink) : null,
    ...(snapshot.parentPath ? { parentPath: snapshot.parentPath } : {}),
    parent: Object.freeze({
      dev: String(snapshot.parent.dev),
      ino: String(snapshot.parent.ino),
      nlink: String(snapshot.parent.nlink)
    }),
    offset,
    length
  });
}

async function createExclusiveFile(targetPath, bytes, label) {
  let handle;
  try {
    handle = await open(targetPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw takeoverBackupError(`Takeover backup ${label} already exists: ${targetPath}.`);
    }
    throw takeoverBackupError(`Unable to publish takeover backup ${label}: ${targetPath}.`, 'ERR_TRIO_BACKUP');
  }
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    throw takeoverBackupError(`Unable to publish takeover backup ${label}: ${targetPath}.`, 'ERR_TRIO_BACKUP');
  } finally {
    await handle.close();
  }
}

/**
 * Publish a unique immutable complete-inventory backup bundle and manifest outside
 * the projected destinations, then re-read and verify both files. The caller
 * must hold the authority publication lock. The returned rollback reference is
 * a parseable trio-backup-v1 file reference to the manifest (canonical absolute
 * manifest path plus the sha256 digest of the written and re-read manifest
 * bytes) and is the value the takeover writes into the settled state
 * recovery.rollbackRef. The manifest's recovery section records the original
 * checkpoint and rollback references from the pre-takeover state.
 */
export async function publishTrioTakeoverBackup({ environment, preimages, ownership, recovery } = {}) {
  if (!environment || typeof environment !== 'object' || !preimages?.objects || !Array.isArray(preimages.objects)) {
    throw takeoverBackupError('Takeover backup requires captured preimages and a resolved environment.');
  }
  if (!ownership || typeof ownership !== 'object') {
    throw takeoverBackupError('Takeover backup requires the existing ownership provenance.');
  }
  if (!recovery || typeof recovery !== 'object') {
    throw takeoverBackupError('Takeover backup requires the existing recovery values.');
  }

  const liveByPath = new Map(preimages.objects.map((object) => [object.snapshot.path, object.snapshot]));
  for (const object of preimages.objects) {
    if (!object.snapshot.exists) {
      const live = await captureAbsentPreimage(object.snapshot.path);
      if (live.parentPath !== object.snapshot.parentPath
        || live.parent.dev !== object.snapshot.parent.dev
        || live.parent.ino !== object.snapshot.parent.ino
        || live.parent.nlink !== object.snapshot.parent.nlink) {
        throw takeoverBackupError(`Absent preimage drifted before backup: ${object.snapshot.path}.`, 'ERR_TRIO_PREIMAGE_DRIFT');
      }
      continue;
    }
    const live = await readFile(object.snapshot.path);
    if (sha256(live) !== object.snapshot.sha256) {
      throw takeoverBackupError(`Takeover preimage drifted before backup publication: ${object.snapshot.path}.`);
    }
  }

  const uniqueId = `${takeoverTimestamp()}-${randomUUID()}`;
  // The backup lives outside the projected destinations and outside `.harness`,
  // whose directory link count is part of the bound state identity evidence.
  const backupRoot = path.join(
    environment.authorityRoot,
    '.harness-backup',
    'trio-takeover',
    uniqueId
  );
  // Prove the backup-root chain is physically safe before creating or writing
  // anything: a symlinked or escaping ancestor fails closed with no state or
  // target change and no backup artifact.
  await assertTrioBackupRootChain({
    authorityRoot: environment.authorityRoot,
    backupRoot
  });
  try {
    await mkdir(backupRoot, { recursive: true });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw takeoverBackupError(`Takeover backup destination already exists: ${backupRoot}.`);
    }
    throw takeoverBackupError(`Unable to create takeover backup destination: ${backupRoot}.`, 'ERR_TRIO_BACKUP');
  }
  // Re-verify the full chain (including the freshly created leaf) before any
  // backup file write, so a same-window ancestor swap cannot redirect writes.
  try {
    await assertTrioBackupRootChain({
      authorityRoot: environment.authorityRoot,
      backupRoot,
      verifyLeaf: true
    });
  } catch (error) {
    try {
      await rm(backupRoot, { recursive: true, force: true });
    } catch {
      // Preserve the chain failure; a partial cleanup is reported by the caller.
    }
    throw error;
  }

  const bundle = Buffer.concat(preimages.objects.map((object) => object.snapshot.bytes ?? Buffer.alloc(0)));
  const manifestObjects = [];
  let offset = 0;
  for (const object of preimages.objects) {
    const length = object.snapshot.bytes?.length ?? 0;
    manifestObjects.push(manifestObjectValue(object, offset, length));
    offset += length;
  }
  const manifest = {
    schemaVersion: 1,
    kind: 'trio-takeover-backup',
    id: uniqueId,
    createdAt: new Date().toISOString(),
    bundleSha256: `sha256:${sha256(bundle)}`,
    objects: manifestObjects,
    ownership: {
      source: ownership.source,
      manifestRef: ownership.manifestRef,
      entries: ownership.entries
    },
    recovery: {
      checkpointRef: recovery.checkpointRef,
      rollbackRef: recovery.rollbackRef
    }
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const manifestPath = path.resolve(backupRoot, 'manifest.json');
  const bundlePath = path.resolve(backupRoot, 'bundle.bin');
  let rollbackRef;
  try {
    await createExclusiveFile(bundlePath, bundle, 'bundle');
    await createExclusiveFile(manifestPath, manifestBytes, 'manifest');

    const [readManifest, readBundle] = await Promise.all([
      readFile(manifestPath),
      readFile(bundlePath)
    ]);
    if (!readManifest.equals(manifestBytes) || !readBundle.equals(bundle)) {
      throw takeoverBackupError('Takeover backup bytes drifted between publication and verification.');
    }
    // The rollback reference must be derived from the manifest bytes as
    // written and re-read: the digest is recomputed over the read-back file.
    const manifestDigest = sha256(readManifest);
    rollbackRef = `${BACKUP_REF_PREFIX}${manifestPath}:${manifestDigest}`;
    let parsedRef;
    try {
      parsedRef = parseTrioBackupV1Ref(rollbackRef);
    } catch (error) {
      throw takeoverBackupError(`Takeover backup manifest reference is not parseable: ${error.message}.`);
    }
    if (parsedRef.manifestPath !== manifestPath || parsedRef.digest !== manifestDigest) {
      throw takeoverBackupError('Takeover backup manifest reference does not match the published manifest.');
    }
    let verified;
    try {
      verified = JSON.parse(readManifest.toString('utf8'));
    } catch (error) {
      throw takeoverBackupError(`Takeover backup manifest is invalid after publication: ${error.message}.`);
    }
    if (verified.kind !== 'trio-takeover-backup' || verified.schemaVersion !== 1 || verified.id !== uniqueId) {
      throw takeoverBackupError('Takeover backup manifest does not match the published bundle.');
    }
    let cursor = 0;
    for (const object of verified.objects) {
      if (object.offset !== cursor) {
        throw takeoverBackupError('Takeover backup manifest offsets are inconsistent.');
      }
      const slice = readBundle.subarray(object.offset, object.offset + object.length);
      const contentMatches = object.exists
        ? sha256(slice) === object.sha256?.slice('sha256:'.length)
        : object.length === 0 && object.sha256 === null;
      if (slice.length !== object.length || !contentMatches) {
        throw takeoverBackupError(`Takeover backup object verification failed: ${object.path}.`);
      }
      const expected = liveByPath.get(object.path);
      if (!expected || object.exists !== expected.exists
        || object.sha256 !== (expected.exists ? `sha256:${expected.sha256}` : null)
        || String(object.dev) !== String(expected.dev)
        || String(object.ino) !== String(expected.ino)
        || String(object.nlink) !== String(expected.nlink)) {
        throw takeoverBackupError(`Takeover backup object identity drifted: ${object.path}.`);
      }
      cursor = object.offset + object.length;
    }
    if (cursor !== readBundle.length) {
      throw takeoverBackupError('Takeover backup bundle has trailing bytes.');
    }
  } catch (error) {
    try {
      await rm(backupRoot, { recursive: true, force: true });
    } catch {
      // Preserve the original backup failure; a partial cleanup is reported by the caller.
    }
    throw error;
  }

  return Object.freeze({
    uniqueId,
    root: backupRoot,
    manifestPath,
    bundlePath,
    rollbackRef,
    manifest,
    manifestBytes,
    bundle
  });
}
