import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHarnessRoot } from '../../harness/runtime/root-policy.mjs';

test('resolveHarnessRoot allows the current repo root by default', async () => {
  const result = await resolveHarnessRoot(undefined, { cwd: process.cwd() });
  assert.equal(result.rootDir, process.cwd());
});

test('resolveHarnessRoot rejects an external root outside the allowlist', async () => {
  const externalRoot = await mkdtemp(path.join(os.tmpdir(), 'harness-root-external-'));
  try {
    await assert.rejects(
      resolveHarnessRoot(externalRoot, { cwd: process.cwd() }),
      /not allow-listed/
    );
  } finally {
    await rm(externalRoot, { recursive: true, force: true });
  }
});

test('resolveHarnessRoot resolves symlinks before boundary checks', async () => {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'harness-root-symlink-'));
  const repoDir = path.join(sandboxRoot, 'repo');
  const outsideDir = path.join(sandboxRoot, 'outside');
  const linkDir = path.join(repoDir, 'linked-outside');
  try {
    await mkdir(repoDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    await writeFile(path.join(outsideDir, 'marker.txt'), 'outside\n');
    await symlink(outsideDir, linkDir, 'dir');

    await assert.rejects(
      resolveHarnessRoot(linkDir, { cwd: repoDir }),
      /not allow-listed/
    );
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});
