import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, link, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { editProjectPolicy, setProjectPolicy } from '../../packages/plugin-kit/src/project-opt-in.mjs';

test('project opt-in preserves unrelated policy, is idempotent, and disables only its own block', () => {
  const original = '# Project\nKeep user instructions.\n';
  const enabled = editProjectPolicy(original, 'enable').text;
  assert.equal(editProjectPolicy(enabled, 'enable').text, enabled);
  assert.equal(editProjectPolicy(enabled, 'status').enabled, true);
  assert.equal(editProjectPolicy(enabled, 'disable').text, original);
  assert.throws(() => editProjectPolicy(enabled.replace('Quick tasks remain direct.', 'My override.'), 'disable'), /user changes/);
  assert.throws(() => editProjectPolicy(enabled + enabled, 'enable'), /Ambiguous/);
});

test('project opt-in refuses symlink and leaves target unchanged', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'swf-opt-in-'));
  try {
    const outside = path.join(root, 'original.md');
    await writeFile(outside, 'keep'); await symlink(outside, path.join(root, 'AGENTS.md'));
    await assert.rejects(setProjectPolicy(root, 'enable'), /regular file/);
    assert.equal(await readFile(outside, 'utf8'), 'keep');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('enable and disable preserve a project file without its final newline', () => {
  const original = '# User policy without newline';
  assert.equal(editProjectPolicy(editProjectPolicy(original, 'enable').text, 'disable').text, original);
});

test('project opt-in refuses invalid UTF-8 without replacing user bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'swf-opt-in-bytes-'));
  try {
    const filename = path.join(root, 'AGENTS.md');
    const bytes = Buffer.from([0x23, 0x20, 0xff, 0x0a]);
    await writeFile(filename, bytes);
    await assert.rejects(setProjectPolicy(root, 'enable'), /UTF-8/);
    assert.deepEqual(await readFile(filename), bytes);
  } finally { await rm(root, {recursive:true,force:true}); }
});

test('project opt-in refuses a hardlink to unrelated policy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'swf-opt-in-hardlink-'));
  try {
    const original = path.join(root,'original.md');
    await writeFile(original,'Unrelated policy');
    await link(original,path.join(root,'AGENTS.md'));
    await assert.rejects(setProjectPolicy(root,'enable'), /hardlink/);
    assert.equal(await readFile(original,'utf8'),'Unrelated policy');
  } finally { await rm(root,{recursive:true,force:true}); }
});
