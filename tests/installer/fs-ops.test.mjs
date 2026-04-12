import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  linkDirectoryProjection,
  materializeDirectoryProjection,
  materializeFile,
  renderTemplate,
  writeRenderedFile,
  writeRenderedProjection
} from '../../harness/installer/lib/fs-ops.mjs';

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

test('writeRenderedProjection rejects non-owned existing file by default', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const target = path.join(dir, 'AGENTS.md');
    await writeFile(target, 'user content');

    await assert.rejects(
      writeRenderedProjection({
        targetPath: target,
        content: 'generated',
        ownedTargets: new Set(),
        conflictMode: 'reject'
      }),
      /Refusing to overwrite non-Harness-owned path/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeRenderedProjection backs up non-owned existing file when requested', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const target = path.join(dir, 'AGENTS.md');
    await writeFile(target, 'user content');

    const result = await writeRenderedProjection({
      targetPath: target,
      content: 'generated',
      ownedTargets: new Set(),
      conflictMode: 'backup',
      now: () => '20260413T010203'
    });

    assert.equal(await readFile(target, 'utf8'), 'generated');
    assert.equal(await readFile(result.backupPath, 'utf8'), 'user content');
    assert.match(path.basename(result.backupPath), /AGENTS\.md\.harness-backup-20260413T010203/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('linkDirectoryProjection replaces owned path with symlink to source', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const source = path.join(dir, 'source');
    const target = path.join(dir, 'target');
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, 'SKILL.md'), 'skill');

    await linkDirectoryProjection({
      sourcePath: source,
      targetPath: target,
      ownedTargets: new Set([path.resolve(target)]),
      conflictMode: 'reject'
    });

    assert.equal(await readlink(target), source);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('materializeDirectoryProjection copies a directory tree', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-'));
  try {
    const source = path.join(dir, 'source');
    const target = path.join(dir, 'target');
    await mkdir(path.join(source, 'scripts'), { recursive: true });
    await writeFile(path.join(source, 'SKILL.md'), 'skill');
    await writeFile(path.join(source, 'scripts/check.sh'), 'echo ok');

    await materializeDirectoryProjection({
      sourcePath: source,
      targetPath: target,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });

    assert.equal(await readFile(path.join(target, 'SKILL.md'), 'utf8'), 'skill');
    assert.equal(await readFile(path.join(target, 'scripts/check.sh'), 'utf8'), 'echo ok');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
