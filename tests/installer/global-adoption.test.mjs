import assert from 'node:assert/strict';
import { chmod, cp, mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { adoptGlobalSkills, INSTALLS, treeDigest } from '../../scripts/adopt-global-skills.mjs';

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'swf-adopt-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const homeDir = path.join(root, 'home'), rootDir = path.join(root, 'source');
  for (const [name, source] of INSTALLS) {
    await mkdir(path.join(rootDir, source, 'references'), { recursive: true });
    await writeFile(path.join(rootDir, source, 'SKILL.md'), `Skill ${name}\n`);
    await writeFile(path.join(rootDir, source, 'references', 'detail.md'), 'Relevant detail\n');
  }
  return { homeDir, rootDir };
}

test('optional adoption is dry by default, preserves unrelated skills, backs up retirement, and is idempotent', async t => {
  const f = await fixture(t), skills = path.join(f.homeDir, '.agents', 'skills');
  for (const name of ['tdd', 'safe-bypass-flow', 'unrelated']) {
    await mkdir(path.join(skills, name), { recursive: true });
    await writeFile(path.join(skills, name, 'SKILL.md'), `old ${name}`);
  }
  const plan = await adoptGlobalSkills(f);
  assert.equal(plan.entries.find(e => e.name === 'tdd').conflict, true);
  assert.equal(await readFile(path.join(skills, 'tdd', 'SKILL.md'), 'utf8'), 'old tdd');
  await assert.rejects(adoptGlobalSkills({ ...f, apply: true }), /Unowned/);
  const result = await adoptGlobalSkills({ ...f, apply: true, takeover: true });
  assert.equal(await readFile(path.join(result.backup, 'safe-bypass-flow', 'SKILL.md'), 'utf8'), 'old safe-bypass-flow');
  assert.equal(await treeDigest(path.join(skills, 'safe-bypass-flow')), null);
  assert.equal(await readFile(path.join(skills, 'unrelated', 'SKILL.md'), 'utf8'), 'old unrelated');
  assert.equal(await readFile(path.join(skills, 'tdd', 'references', 'detail.md'), 'utf8'), 'Relevant detail\n');
  assert.equal((await adoptGlobalSkills({ ...f, apply: true })).changed, 0);
  await writeFile(path.join(skills, 'tdd', 'SKILL.md'), 'later local edit');
  await assert.rejects(adoptGlobalSkills({ ...f, apply: true }), /modified/);
});

test('source updates use ownership evidence and do not follow skill symlinks', async t => {
  const f = await fixture(t);
  await adoptGlobalSkills({ ...f, apply: true });
  const [name, source] = INSTALLS[0];
  await writeFile(path.join(f.rootDir, source, 'SKILL.md'), 'new revision');
  assert.equal((await adoptGlobalSkills({ ...f, apply: true })).changed, 1);
  const destination = path.join(f.homeDir, '.agents', 'skills', name);
  await rm(destination, { recursive: true });
  await symlink(path.join(f.rootDir, source), destination);
  await assert.rejects(adoptGlobalSkills({ ...f, apply: true, takeover: true }), /Unsafe skill root/);
  assert.equal(await readFile(path.join(f.rootDir, source, 'SKILL.md'), 'utf8'), 'new revision');
});

test('a held adoption lock fails without touching any installed skill', async t => {
  const f = await fixture(t);
  await adoptGlobalSkills({ ...f, apply: true });
  const [name, source] = INSTALLS[0];
  const before = await treeDigest(path.join(f.homeDir, '.agents', 'skills', name));
  await writeFile(path.join(f.rootDir, source, 'SKILL.md'), 'new revision');
  const lock = path.join(f.homeDir, '.agents', 'swf-adoption', 'lock');
  await mkdir(lock);
  await assert.rejects(adoptGlobalSkills({ ...f, apply: true }), { code: 'EEXIST' });
  assert.equal(await treeDigest(path.join(f.homeDir, '.agents', 'skills', name)), before);
});

test('ownership digests distinguish a file payload from an additional tree entry', async t => {
  const f = await fixture(t);
  const a = path.join(f.rootDir, 'a'), b = path.join(f.rootDir, 'b');
  await mkdir(a); await mkdir(b);
  await writeFile(path.join(a, 'one'), '["two","file"]\npayload');
  await writeFile(path.join(b, 'one'), '');
  await writeFile(path.join(b, 'two'), 'payload');
  assert.notEqual(await treeDigest(a), await treeDigest(b));
});

test('adoption rejects a backup-parent symlink without writing outside home', async t => {
  const f = await fixture(t), outside = path.join(f.rootDir, 'outside');
  await mkdir(outside);
  await mkdir(path.join(f.homeDir, '.agents', 'swf-adoption'), { recursive: true });
  await symlink(outside, path.join(f.homeDir, '.agents', 'swf-adoption', 'backups'));
  const before = await treeDigest(outside);
  await assert.rejects(adoptGlobalSkills({ ...f, apply: true }), /Unsafe directory/);
  assert.equal(await treeDigest(outside), before);
});

test('failed rollback retains originals and continues restoring independent skills', async t => {
  const f = await fixture(t);
  await adoptGlobalSkills({ ...f, apply: true });
  for (const [, source] of INSTALLS.slice(0, 2)) await writeFile(path.join(f.rootDir, source, 'SKILL.md'), 'new revision');
  const [first, second] = INSTALLS.map(([name]) => name);
  const skillRoot = path.join(f.homeDir, '.agents', 'skills');
  const before = await treeDigest(path.join(skillRoot, first));
  const renamePath = async (from, to) => {
    if (from.endsWith(`/lock/${second}`) || from.endsWith(`/lock/${second}.previous`)) throw new Error('injected filesystem failure');
    return rename(from, to);
  };
  await assert.rejects(adoptGlobalSkills({ ...f, apply: true, renamePath }), /recovery files retained/);
  assert.equal(await treeDigest(path.join(skillRoot, first)), before, 'earlier publication is independently restored');
  const retained = path.join(f.homeDir, '.agents', 'swf-adoption', 'lock', `${second}.previous`, 'SKILL.md');
  assert.equal(await readFile(retained, 'utf8'), `Skill ${second}\n`);
});

test('matching first adoption records ownership and executable mode changes are detected', async t => {
  const f = await fixture(t);
  for (const [name, source] of INSTALLS) {
    const target = path.join(f.homeDir, '.agents', 'skills', name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(f.rootDir, source), target, { recursive: true });
  }
  assert.equal((await adoptGlobalSkills({ ...f, apply: true })).changed, 0);
  const receipt = JSON.parse(await readFile(path.join(f.homeDir, '.agents', 'swf-adoption', 'receipt.json'), 'utf8'));
  assert.equal(receipt.entries.length, 11);
  const [name, source] = INSTALLS[0];
  await chmod(path.join(f.rootDir, source, 'SKILL.md'), 0o755);
  assert.equal((await adoptGlobalSkills({ ...f, apply: true })).changed, 1);
  assert.equal(await treeDigest(path.join(f.rootDir, source)), await treeDigest(path.join(f.homeDir, '.agents', 'skills', name)));
});
