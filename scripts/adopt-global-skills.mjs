#!/usr/bin/env node
// Explicit, reversible adoption of optional skills. Trio governance uses harness sync.
import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const INSTALLS = Object.freeze([
  ['planning-with-files', 'harness/core/upstream-overlays/planning-with-files'],
  ['overengineering-review', 'harness/core/skills/overengineering-review'],
  ['simplification-ledger', 'harness/core/skills/simplification-ledger'],
  ...['tdd', 'code-review', 'codebase-design', 'diagnosing-bugs', 'domain-modeling']
    .map(name => [name, `harness/optional-skills/methods/${name}`])
]);
export const RETIRED = Object.freeze([
  'risk-assessment-before-destructive-changes', 'safe-bypass-flow', 'office-work-quality'
]);
const excluded = name => ['.git', '.codex', '__pycache__', '.DS_Store'].includes(name) || name.endsWith('.pyc');

async function exists(p) {
  try { return await lstat(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

async function assertRealParents(p) {
  for (let current = path.resolve(p); ; current = path.dirname(current)) {
    const info = await exists(current);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`Unsafe directory: ${current}`);
    if (path.dirname(current) === current) break;
  }
}

// Include all destination bytes in ownership checks, even files excluded from new packages.
export async function treeDigest(root, { source = false } = {}) {
  const info = await exists(root);
  if (!info) return null;
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Unsafe skill root: ${root}`);
  const hash = createHash('sha256');
  async function visit(dir) {
    for (const name of (await readdir(dir)).sort()) {
      if (source && excluded(name)) continue;
      const p = path.join(dir, name), entry = await lstat(p);
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()) || entry.nlink > 1 && entry.isFile()) {
        throw new Error(`Unsafe skill entry: ${p}`);
      }
      const rel = path.relative(root, p);
      if (entry.isDirectory()) {
        hash.update(JSON.stringify([rel, 'dir']) + '\n');
        await visit(p);
      } else {
        const bytes = await readFile(p);
        // Length framing prevents a file's content from impersonating another entry.
        hash.update(JSON.stringify([rel, 'file', bytes.length, entry.mode & 0o111]) + '\n');
        hash.update(bytes);
      }
    }
  }
  await visit(root);
  return `sha256:${hash.digest('hex')}`;
}

export async function adoptGlobalSkills({ homeDir, rootDir = ROOT, apply = false, takeover = false, renamePath = rename } = {}) {
  if (!homeDir || !path.isAbsolute(homeDir)) throw new Error('An explicit absolute --home is required.');
  const skillRoot = path.join(homeDir, '.agents', 'skills');
  const stateRoot = path.join(homeDir, '.agents', 'swf-adoption');
  await assertRealParents(skillRoot);
  await assertRealParents(stateRoot);
  const receiptPath = path.join(stateRoot, 'receipt.json');
  const receiptInfo = await exists(receiptPath);
  if (receiptInfo && (!receiptInfo.isFile() || receiptInfo.isSymbolicLink() || receiptInfo.nlink > 1)) throw new Error('Unsafe adoption receipt.');
  const prior = receiptInfo ? JSON.parse(await readFile(receiptPath, 'utf8')) : { entries: [] };
  if (prior.schemaVersion && prior.schemaVersion !== 1 || !Array.isArray(prior.entries)) throw new Error('Invalid adoption receipt.');
  const entries = [];
  for (const [name, source] of [...INSTALLS, ...RETIRED.map(name => [name, null])]) {
    const destination = path.join(skillRoot, name);
    const before = await treeDigest(destination);
    const after = source ? await treeDigest(path.join(rootDir, source), { source: true }) : null;
    if (source && !after) throw new Error(`Missing skill source: ${source}`);
    const owned = prior.entries.find(e => e.name === name);
    const conflict = before !== null && before !== after && before !== owned?.digest && !takeover;
    entries.push({ name, source, destination, before, after, conflict, action: before === after ? 'unchanged' : source ? 'install' : 'retire' });
  }
  if (!apply) return { mode: 'dry-run', entries };
  if (entries.some(e => e.conflict)) throw new Error('Unowned or modified optional skills; review the dry run before explicit --takeover.');
  const changes = entries.filter(e => e.action !== 'unchanged');
  if (!changes.length && prior.schemaVersion === 1
    && entries.every(e => prior.entries.some(p => p.name === e.name && p.digest === e.after))) {
    return { mode: 'apply', changed: 0, entries };
  }
  await mkdir(stateRoot, { recursive: true });
  // mkdir provides a fail-closed single writer lock; never remove another run's lock.
  const lock = path.join(stateRoot, 'lock');
  await mkdir(lock);
  const backup = path.join(stateRoot, 'backups', `${Date.now()}-${randomUUID()}`);
  const applied = [];
  let retainStaging = false;
  try {
    await assertRealParents(backup);
    await mkdir(backup, { recursive: true });
    await assertRealParents(backup);
    await mkdir(skillRoot, { recursive: true });
    if (receiptInfo) await cp(receiptPath, path.join(backup, 'receipt.json'));
    for (const e of changes) {
      if (e.before) await cp(e.destination, path.join(backup, e.name), { recursive: true, errorOnExist: true, force: false });
      if (await treeDigest(path.join(backup, e.name)) !== e.before) throw new Error(`Backup mismatch: ${e.name}`);
      if (e.source) {
        const sourceRoot = path.join(rootDir, e.source);
        await cp(sourceRoot, path.join(lock, e.name), {
          recursive: true,
          filter: candidate => !path.relative(sourceRoot, candidate).split(path.sep).some(excluded)
        });
        if (await treeDigest(path.join(lock, e.name)) !== e.after) throw new Error(`Source changed: ${e.name}`);
      }
    }
    await writeFile(path.join(backup, 'manifest.json'), JSON.stringify({ schemaVersion: 1, entries }, null, 2) + '\n', { flag: 'wx' });
    for (const e of changes) {
      await assertRealParents(path.dirname(e.destination));
      if (await treeDigest(e.destination) !== e.before) throw new Error(`Destination changed: ${e.name}`);
      const old = path.join(lock, `${e.name}.previous`);
      if (e.before) await renamePath(e.destination, old);
      applied.push({ ...e, old });
      if (e.source) await renamePath(path.join(lock, e.name), e.destination);
      if (await treeDigest(e.destination) !== e.after) throw new Error(`Readback mismatch: ${e.name}`);
    }
    const receipt = { schemaVersion: 1, sourceRoot: rootDir, backup, entries: entries.map(e => ({ name: e.name, digest: e.after })) };
    await writeFile(path.join(lock, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    await renamePath(path.join(lock, 'receipt.json'), receiptPath);
    return { mode: 'apply', changed: changes.length, backup, entries };
  } catch (error) {
    const failures = [];
    for (const e of applied.reverse()) {
      try {
        if (await exists(e.destination)) {
          // Preserve unexpected concurrent bytes rather than deleting them during recovery.
          try { if (await treeDigest(e.destination) !== e.after) retainStaging = true; }
          catch { retainStaging = true; }
          await renamePath(e.destination, path.join(lock, `${e.name}.failed`));
        }
        if (e.before) await renamePath(e.old, e.destination);
      } catch (cause) {
        failures.push(cause);
      }
    }
    if (failures.length || retainStaging) {
      retainStaging = true;
      throw new AggregateError([error, ...failures], `Adoption failed; recovery files retained at ${lock}; verified backup at ${backup}.`);
    }
    throw error;
  } finally {
    if (!retainStaging) await rm(lock, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valid = args.every((arg, i) => ['--home', '--apply', '--takeover'].includes(arg) || i > 0 && args[i - 1] === '--home');
  if (!valid) throw new Error('Usage: node scripts/adopt-global-skills.mjs --home /absolute/home [--apply] [--takeover]');
  const index = args.indexOf('--home');
  console.log(JSON.stringify(await adoptGlobalSkills({ homeDir: index < 0 ? null : args[index + 1], apply: args.includes('--apply'), takeover: args.includes('--takeover') }), null, 2));
}
