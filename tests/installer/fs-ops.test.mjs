import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materializeFile, renderTemplate, writeRenderedFile } from '../../harness/installer/lib/fs-ops.mjs';

test('renderTemplate replaces named tokens', () => {
  assert.equal(renderTemplate('Hello {{name}}', { name: 'Harness' }), 'Hello Harness');
});

test('materializeFile copies content and creates parent dirs', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const source = path.join(dir, 'source.md');
    const target = path.join(dir, 'nested/target.md');
    await writeFile(source, 'content');
    await materializeFile(source, target);
    assert.equal(await readFile(target, 'utf8'), 'content');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeRenderedFile replaces an existing symlink target', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const linked = path.join(dir, 'linked.md');
    const target = path.join(dir, 'nested/target.md');
    await writeFile(linked, 'linked content');
    await mkdir(path.dirname(target), { recursive: true });
    await symlink(linked, target);

    await writeRenderedFile(target, 'rendered content');

    assert.equal(await readFile(linked, 'utf8'), 'linked content');
    assert.equal(await readFile(target, 'utf8'), 'rendered content');
    assert.equal((await lstat(target)).isSymbolicLink(), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('materializeFile replaces an existing symlink target', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const source = path.join(dir, 'source.md');
    const linked = path.join(dir, 'linked.md');
    const target = path.join(dir, 'nested/target.md');
    await writeFile(source, 'portable content');
    await writeFile(linked, 'linked content');
    await mkdir(path.dirname(target), { recursive: true });
    await symlink(linked, target);

    await materializeFile(source, target);

    assert.equal(await readFile(linked, 'utf8'), 'linked content');
    assert.equal(await readFile(target, 'utf8'), 'portable content');
    assert.equal((await lstat(target)).isSymbolicLink(), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
