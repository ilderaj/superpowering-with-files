import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('standalone checker detects changed, missing, extra, linked and escaping content', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'swf-integrity-'));
  const payload = 'retained skill';
  const manifest = { algorithm: 'sha256', excludes: ['CONTENT-MANIFEST.json', 'LICENSES.json'], files: [
    {path: 'skills/sample/SKILL.md', bytes: Buffer.byteLength(payload), sha256: createHash('sha256').update(payload).digest('hex')}
  ] };
  const run = () => {
    try { return JSON.parse(execFileSync('python3', ['scripts/verify-installed-harness.py', root], {encoding:'utf8'})); }
    catch (error) { assert.equal(error.status, 1); return JSON.parse(error.stdout); }
  };
  const entry = path.join(root, 'skills/sample/SKILL.md');
  try {
    await mkdir(path.dirname(entry), {recursive:true});
    await writeFile(entry, payload);
    await writeFile(path.join(root, 'LICENSES.json'), '{}');
    await writeFile(path.join(root, 'CONTENT-MANIFEST.json'), JSON.stringify(manifest));
    assert.equal(run().ok, true);
    await writeFile(entry, 'changed');
    assert.equal(run().ok, false);
    await rm(entry);
    assert.equal(run().ok, false);
    await symlink('/etc/hosts', entry);
    assert.equal(run().ok, false);
    await rm(entry);
    await writeFile(entry, payload);
    await writeFile(path.join(root, 'unexpected.txt'), 'extra');
    assert.equal(run().ok, false);
    await rm(path.join(root, 'unexpected.txt'));
    manifest.files[0].path = '../outside';
    await writeFile(path.join(root, 'CONTENT-MANIFEST.json'), JSON.stringify(manifest));
    assert.equal(run().ok, false);
  } finally { await rm(root, {recursive:true, force:true}); }
});
