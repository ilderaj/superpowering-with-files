import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { plan, apply, rollback } from '../../packages/plugin-kit/src/managed-skill-migration.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'swf-migration-')));
  const source = path.join(root, 'legacy', 'skill'); const backup = path.join(root, 'backups');
  await mkdir(source, { recursive: true }); await writeFile(path.join(source, 'SKILL.md'), 'legacy');
  return { root, source, backup, spec: { path: source, files: [{ path: 'SKILL.md', sha256: hash('legacy') }] } };
}
const cleanup = root => rm(root, { recursive: true, force: true });

test('interrupted restore copy leaves the live source absent and can be retried', async () => {
  const f = await fixture();
  const originalCopy = fsPromises.cp;
  try {
    const receipt = await apply(await plan({targets:[f.spec],allowedRoots:[path.join(f.root,'legacy')],backupRoot:f.backup}));
    fsPromises.cp = async (_source, destination) => {
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, 'SKILL.md'), 'partial');
      throw new Error('simulated copy interruption');
    };
    syncBuiltinESMExports();
    await assert.rejects(rollback(receipt), /simulated copy interruption/);
    await assert.rejects(readFile(path.join(f.source, 'SKILL.md')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(receipt.entries[0].backup,'SKILL.md'),'utf8'),'legacy');
    fsPromises.cp = originalCopy;
    syncBuiltinESMExports();
    await rollback(receipt);
    assert.equal(await readFile(path.join(f.source,'SKILL.md'),'utf8'),'legacy');
  } finally {
    fsPromises.cp = originalCopy;
    syncBuiltinESMExports();
    await cleanup(f.root);
  }
});

test('rollback succeeds despite an abandoned receipt temporary file', async () => {
  const f = await fixture(); try {
    const receipt = await apply(await plan({targets:[f.spec],allowedRoots:[path.join(f.root,'legacy')],backupRoot:f.backup}));
    const abandoned = path.join(f.backup, `receipt.json.tmp-${process.pid}`);
    await writeFile(abandoned, 'interrupted write');
    await rollback(receipt);
    assert.equal(await readFile(path.join(f.source,'SKILL.md'),'utf8'),'legacy');
    assert.equal(await readFile(abandoned,'utf8'),'interrupted write');
  } finally { await cleanup(f.root); }
});

test('plans and applies expected managed directory, retaining a rollback receipt', async () => {
  const f = await fixture(); try {
    const p = await plan({ targets: [f.spec], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: f.backup });
    const receipt = await apply(p); assert.equal(receipt.applied, true);
    await assert.rejects(readFile(path.join(f.source, 'SKILL.md')));
    await rollback(receipt); assert.equal(await readFile(path.join(f.source, 'SKILL.md'), 'utf8'), 'legacy');
  } finally { await cleanup(f.root); }
});

test('refuses changed or newly added files, symlinks, escapes, and overlap', async () => {
  const f = await fixture(); try {
    await writeFile(path.join(f.source, 'new.txt'), 'new');
    await assert.rejects(plan({ targets: [f.spec], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: f.backup }), /unknown/);
    await rm(path.join(f.source, 'new.txt')); await symlink('/tmp', path.join(f.source, 'escape'));
    await assert.rejects(plan({ targets: [f.spec], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: f.backup }), /symlink/);
    await assert.rejects(plan({ targets: [{ ...f.spec, path: path.join(f.root, 'outside') }], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: f.backup }), /outside/);
    await assert.rejects(plan({ targets: [f.spec, { ...f.spec, path: path.join(f.root, 'legacy') }], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: f.backup }), /overlapping/);
  } finally { await cleanup(f.root); }
});

test('rollback refuses overwrite and missing backup, preserving user state', async () => {
  const f = await fixture(); try {
    const receipt = await apply(await plan({ targets: [f.spec], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: f.backup }));
    await mkdir(f.source, { recursive: true }); await writeFile(path.join(f.source, 'user.txt'), 'user');
    await assert.rejects(rollback(receipt), /overwrite/); assert.equal(await readFile(path.join(f.source, 'user.txt'), 'utf8'), 'user');
  } finally { await cleanup(f.root); }
});

test('interrupted or missing targets never cause a fresh deletion', async () => {
  const f = await fixture(); try {
    await rm(f.source, { recursive: true });
    await assert.rejects(plan({ targets: [f.spec], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: f.backup }), /real directory/);
    await assert.rejects(apply({ targets: [f.spec], backupRoot: f.backup }), /invalid migration plan/);
  } finally { await cleanup(f.root); }
});

test('apply revalidates mutations after plan and leaves the source untouched', async () => {
  const f = await fixture(); try {
    const p = await plan({ targets: [f.spec], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: f.backup });
    await writeFile(path.join(f.source, 'SKILL.md'), 'changed');
    await assert.rejects(apply(p), /changed/);
    assert.equal(await readFile(path.join(f.source, 'SKILL.md'), 'utf8'), 'changed');
  } finally { await cleanup(f.root); }
});

test('rejects symlink ancestors and unsafe or occupied backup roots', async () => {
  const f = await fixture(); try {
    const moved = path.join(f.root, 'moved'); await symlink(path.join(f.root, 'legacy'), moved);
    await assert.rejects(plan({ targets: [{ ...f.spec, path: path.join(moved, 'skill') }], allowedRoots: [f.root], backupRoot: path.join(path.dirname(f.root), 'safe-backup') }), /symlink ancestor/);
    const unsafe = path.join(f.root, 'unsafe'); await symlink('/tmp', unsafe);
    await assert.rejects(plan({ targets: [f.spec], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: unsafe }), /backupRoot is a symlink/);
    await mkdir(f.backup, { recursive: true }); await writeFile(path.join(f.backup, 'receipt.json'), '{}');
    await assert.rejects(apply(await plan({ targets: [f.spec], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: f.backup })), /receipt/);
  } finally { await cleanup(f.root); }
});

test('rollback recovers a durable partial receipt and verifies the backup first', async () => {
  const f = await fixture(); try {
    await mkdir(f.backup, { recursive: true }); const backup = path.join(f.backup, '0-skill');
    const { cp } = await import('node:fs/promises'); await cp(f.source, backup, { recursive: true }); await rm(f.source, { recursive: true });
    const receipt = { version: 1, backupRoot: f.backup, allowedRoots: [path.join(f.root, 'legacy')], entries: [{ source: f.source, backup, files: f.spec.files, status: 'removed' }] };
    await rollback(receipt); assert.equal(await readFile(path.join(f.source, 'SKILL.md'), 'utf8'), 'legacy');
    await rm(f.source, { recursive: true }); await writeFile(path.join(backup, 'SKILL.md'), 'tampered');
    await assert.rejects(rollback({ ...receipt, entries: [{ ...receipt.entries[0], status: 'removed' }] }), /backup hash mismatch/);
  } finally { await cleanup(f.root); }
});

test('retries an interrupted moving entry and accepts flat inventory in any order', async () => {
  const f = await fixture(); try {
    await mkdir(path.join(f.source, 'nested'), { recursive: true }); await writeFile(path.join(f.source, 'nested', 'extra.md'), 'extra');
    const unordered = { ...f.spec, files: [{ path: 'nested/extra.md', sha256: hash('extra') }, ...f.spec.files] };
    const p = await plan({ targets: [unordered], allowedRoots: [path.join(f.root, 'legacy')], backupRoot: f.backup });
    const backup = path.join(f.backup, '0-skill'); const { cp } = await import('node:fs/promises'); await mkdir(f.backup, { recursive: true }); await cp(f.source, backup, { recursive: true }); await rm(f.source, { recursive: true });
    const receipt = { version: 1, backupRoot: f.backup, allowedRoots: [path.join(f.root, 'legacy')], entries: [{ source: f.source, backup, files: unordered.files, status: 'moving' }] };
    await rollback(receipt); assert.equal(await readFile(path.join(f.source, 'nested', 'extra.md'), 'utf8'), 'extra');
  } finally { await cleanup(f.root); }
});

test('flat manifest ordering survives nested paths and occupied backup slots are preserved', async () => {
  const f = await fixture(); try {
    await mkdir(path.join(f.source, 'a'));
    await writeFile(path.join(f.source, 'a', 'z'), 'nested');
    await writeFile(path.join(f.source, 'a.txt'), 'flat');
    f.spec.files.push({path:'a/z',sha256:hash('nested')},{path:'a.txt',sha256:hash('flat')});
    const p = await plan({targets:[f.spec],allowedRoots:[path.join(f.root,'legacy')],backupRoot:f.backup});
    await mkdir(path.join(f.backup,'0-skill'),{recursive:true});
    await assert.rejects(apply(p), /occupied/);
    assert.equal(await readFile(path.join(f.source,'SKILL.md'),'utf8'),'legacy');
  } finally { await cleanup(f.root); }
});

test('rollback rejects a source replaced by a symlink even when content matches', async () => {
  const f = await fixture(); try {
    const receipt = await apply(await plan({targets:[f.spec],allowedRoots:[path.join(f.root,'legacy')],backupRoot:f.backup}));
    await symlink(receipt.entries[0].backup, f.source);
    await assert.rejects(rollback(receipt), /symlink|real directory/);
    assert.equal(await readFile(path.join(receipt.entries[0].backup,'SKILL.md'),'utf8'),'legacy');
  } finally { await cleanup(f.root); }
});

test('rollback reconciles a completed restore whose receipt update was interrupted', async () => {
  const f = await fixture(); try {
    const receipt = await apply(await plan({targets:[f.spec],allowedRoots:[path.join(f.root,'legacy')],backupRoot:f.backup}));
    const stale = JSON.parse(JSON.stringify(receipt));
    await rollback(receipt);
    const retried = await rollback(stale);
    assert.equal(retried.entries[0].status,'restored');
    const persisted = JSON.parse(await readFile(path.join(f.backup,'receipt.json'),'utf8'));
    assert.equal(persisted.entries[0].status,'restored');
    assert.equal(persisted.rolledBack,true);
  } finally { await cleanup(f.root); }
});
