import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const real = p => path.resolve(p);
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const inside = (child, parent) => { const r = path.relative(real(parent), real(child)); return r === '' || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r)); };
const fail = message => { throw new Error(`managed skill migration refused: ${message}`); };
const absent = async file => lstat(file).catch(error => error.code === 'ENOENT' ? null : (() => { throw error; })());
async function safeAncestors(target) { const absolute = real(target); const parts = absolute.split(path.sep); let current = path.parse(absolute).root; for (const part of parts.slice(1, -1)) { current = path.join(current, part); if ((await lstat(current)).isSymbolicLink()) fail(`symlink ancestor at ${current}`); } }
async function walk(root, current = root, out = []) { for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const file = path.join(current, entry.name); const rel = path.relative(root, file); if (entry.isSymbolicLink()) fail(`symlink encountered at ${rel}`); if (entry.isDirectory()) await walk(root, file, out); else if (entry.isFile()) out.push({ path: rel, sha256: await digest(file) }); else fail(`unsupported filesystem entry at ${rel}`); } return out.sort((a, b) => a.path.localeCompare(b.path)); }
function normalizeTarget(target) { if (!target || typeof target.path !== 'string' || !Array.isArray(target.files)) fail('each target needs path and files'); const files = target.files.map(file => { if (!file || typeof file.path !== 'string' || !/^[a-f0-9]{64}$/i.test(file.sha256)) fail(`invalid expected hash for ${target.path}`); if (path.isAbsolute(file.path) || file.path.split(path.sep).includes('..')) fail(`invalid relative file ${file.path}`); return { path: file.path, sha256: file.sha256.toLowerCase() }; }).sort((a, b) => a.path.localeCompare(b.path)); if (new Set(files.map(file => file.path)).size !== files.length) fail(`duplicate expected file in ${target.path}`); return { path: real(target.path), files }; }
async function validatePlan(input) { if (!input?.targets || !Array.isArray(input.allowedRoots) || !input.backupRoot) fail('invalid migration plan'); const roots = input.allowedRoots.map(real); const backupRoot = real(input.backupRoot); await safeAncestors(backupRoot); const backupStat = await absent(backupRoot); if (backupStat?.isSymbolicLink()) fail('backupRoot is a symlink'); if (backupStat && !backupStat.isDirectory()) fail('backupRoot is not a directory'); if (roots.some(root => inside(backupRoot, root) || inside(root, backupRoot))) fail('backupRoot overlaps an allowed root'); const targets = input.targets.map(normalizeTarget); for (const [i, target] of targets.entries()) { await safeAncestors(target.path); if (!roots.some(root => inside(target.path, root) && real(target.path) !== root)) fail(`target is outside allowed roots: ${target.path}`); if (targets.some((other, j) => i !== j && (inside(target.path, other.path) || inside(other.path, target.path)))) fail('overlapping targets'); if (inside(backupRoot, target.path) || inside(target.path, backupRoot)) fail('backupRoot overlaps a target'); const stat = await absent(target.path); if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) fail(`target is not a real directory: ${target.path}`); if (JSON.stringify(await walk(target.path)) !== JSON.stringify(target.files)) fail(`unknown, missing, or changed files in ${target.path}`); } return { ...input, targets, allowedRoots: roots, backupRoot }; }
async function persist(file, value) {
  const temp = `${file}.tmp-${randomUUID()}`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}
async function verifyBackup(entry) { const expected = [...entry.files].sort((a, b) => a.path.localeCompare(b.path)); if (JSON.stringify(await walk(entry.backup)) !== JSON.stringify(expected)) fail(`backup hash mismatch for ${entry.source}`); }
async function validateReceipt(receipt) { if (!receipt?.entries || !receipt.backupRoot || !Array.isArray(receipt.allowedRoots)) fail('invalid receipt'); const checked = { backupRoot: real(receipt.backupRoot), allowedRoots: receipt.allowedRoots.map(real) }; await safeAncestors(checked.backupRoot); const rootStat = await absent(checked.backupRoot); if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) fail('unsafe backupRoot in receipt'); if (checked.allowedRoots.some(root => inside(checked.backupRoot, root) || inside(root, checked.backupRoot))) fail('backupRoot overlaps an allowed root'); for (const entry of receipt.entries) { if (!entry || !['planned', 'moving', 'removed', 'restored'].includes(entry.status)) fail('invalid receipt entry status'); await safeAncestors(entry.source); await safeAncestors(entry.backup); if (!checked.allowedRoots.some(root => inside(entry.source, root) && real(entry.source) !== root) || !inside(entry.backup, checked.backupRoot) || inside(entry.backup, entry.source)) fail(`unsafe receipt path for ${entry.source}`); } return checked; }
export async function plan(input) { return validatePlan(input); }
export async function apply(inputPlan) {
  const migrationPlan = await validatePlan(inputPlan); await mkdir(migrationPlan.backupRoot, { recursive: true }); const receiptPath = path.join(migrationPlan.backupRoot, 'receipt.json'); if (await absent(receiptPath)) fail('backupRoot already contains a receipt'); if ((await readdir(migrationPlan.backupRoot)).length) fail('backupRoot is occupied');
  const receipt = { version: 1, backupRoot: migrationPlan.backupRoot, allowedRoots: migrationPlan.allowedRoots, entries: migrationPlan.targets.map((target, i) => ({ source: target.path, backup: path.join(migrationPlan.backupRoot, `${i}-${path.basename(target.path)}`), files: target.files, status: 'planned' })) }; await persist(receiptPath, receipt);
  try { await validatePlan(migrationPlan); for (const entry of receipt.entries) { await persist(receiptPath, receipt); entry.status = 'moving'; await persist(receiptPath, receipt); try { if (await absent(entry.backup)) fail('backup destination is occupied'); await rename(entry.source, entry.backup); } catch (error) { if (error.code !== 'EXDEV') throw error; await cp(entry.source, entry.backup, { recursive: true, errorOnExist: true, force: false }); await verifyBackup(entry); if (JSON.stringify(await walk(entry.source)) !== JSON.stringify(entry.files)) fail(`source changed during backup for ${entry.source}`); await persist(receiptPath, receipt); await rm(entry.source, { recursive: true, force: false }); } await verifyBackup(entry); entry.status = 'removed'; await persist(receiptPath, receipt); } receipt.applied = true; await persist(receiptPath, receipt); return receipt; } catch (error) { throw new Error(`managed skill migration interrupted; durable receipt retained: ${error.message}`); }
}
export async function rollback(receipt) {
  const checked = await validateReceipt(receipt);
  const receiptPath = path.join(checked.backupRoot, 'receipt.json');
  const recoverable = receipt.entries.filter(item => ['moving', 'removed', 'restored'].includes(item.status));
  // Preflight every entry before restoring any directory. Existing content is
  // accepted only as an exact, real-directory restore after an interrupted write.
  for (const entry of recoverable) {
    const source = await absent(entry.source);
    if (source && (source.isSymbolicLink() || !source.isDirectory())) fail(`source is not a real directory: ${entry.source}`);
    if (source) {
      if (JSON.stringify(await walk(entry.source)) !== JSON.stringify(entry.files)) fail(`refusing to overwrite user changes at ${entry.source}`);
    } else {
      const backup = await absent(entry.backup);
      if (!backup || !backup.isDirectory() || backup.isSymbolicLink()) fail(`missing or unsafe backup for ${entry.source}`);
      await verifyBackup(entry);
    }
  }
  for (const entry of recoverable) {
    await safeAncestors(entry.source);
    if (!(await absent(entry.source))) {
      // Copy beside the destination first: interruption must not expose a
      // partially restored skill or make the next rollback look like user edits.
      const staging = await mkdtemp(path.join(path.dirname(entry.source), '.swf-restore-'));
      const candidate = path.join(staging, 'skill');
      try {
        await cp(entry.backup, candidate, { recursive: true, errorOnExist: true, force: false });
        await verifyBackup({ ...entry, backup: candidate });
        await safeAncestors(entry.source);
        if (await absent(entry.source)) fail(`source appeared during restore: ${entry.source}`);
        await rename(candidate, entry.source);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }
    const restored = await lstat(entry.source);
    if (restored.isSymbolicLink() || !restored.isDirectory()) fail(`source is not a real directory: ${entry.source}`);
    if (JSON.stringify(await walk(entry.source)) !== JSON.stringify(entry.files)) fail(`restore verification failed for ${entry.source}`);
    entry.status = 'restored';
    await persist(receiptPath, receipt);
  }
  receipt.rolledBack = true;
  await persist(receiptPath, receipt);
  return receipt;
}
export const planMigration = plan;
export const applyMigration = apply;
export const rollbackMigration = rollback;
