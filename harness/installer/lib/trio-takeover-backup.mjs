import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { assertInstallerStateEvidence } from './state.mjs';

const SURFACE_ORDER = Object.freeze(['entry', 'trio', 'dev', 'office', 'safety', 'chiefops']);
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
 * Capture and revalidate the seven stable preimages of an existing-V2 ChiefOps
 * takeover: the six managed Codex user-global Trio surfaces plus the prior V2
 * state. The caller must hold the authority publication lock.
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
    if (descriptor.management !== 'managed' || !expectedSurfaces.has(descriptor.surface)) {
      throw takeoverBackupError(`Unexpected takeover surface: ${descriptor.surface}.`, 'ERR_TRIO_BACKUP');
    }
    if (seenSurfaces.has(descriptor.surface)) {
      throw takeoverBackupError(`Duplicate takeover surface: ${descriptor.surface}.`, 'ERR_TRIO_BACKUP');
    }
    seenSurfaces.add(descriptor.surface);
    const snapshot = await capturePreimage(descriptor.destination);
    snapshots.set(snapshot.path, snapshot);
    objects.push(Object.freeze({ path: snapshot.path, surface: descriptor.surface, snapshot }));
  }
  if (seenSurfaces.size !== expectedSurfaces.size) {
    throw takeoverBackupError('Takeover preimages must cover all six global Trio surfaces.', 'ERR_TRIO_BACKUP');
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
    sha256: `sha256:${snapshot.sha256}`,
    dev: String(snapshot.dev),
    ino: String(snapshot.ino),
    nlink: String(snapshot.nlink),
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
 * Publish a unique immutable seven-object backup bundle and manifest outside
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

  const bundle = Buffer.concat(preimages.objects.map((object) => object.snapshot.bytes));
  const manifestObjects = [];
  let offset = 0;
  for (const object of preimages.objects) {
    manifestObjects.push(manifestObjectValue(object, offset, object.snapshot.bytes.length));
    offset += object.snapshot.bytes.length;
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
      if (slice.length !== object.length || sha256(slice) !== object.sha256.slice('sha256:'.length)) {
        throw takeoverBackupError(`Takeover backup object verification failed: ${object.path}.`);
      }
      const expected = liveByPath.get(object.path);
      if (!expected || object.sha256 !== `sha256:${expected.sha256}`
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
