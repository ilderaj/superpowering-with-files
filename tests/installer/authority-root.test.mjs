import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { discoverAuthorityRoot } from '../../harness/runtime/authority-root.mjs';

const execFileAsync = promisify(execFile);

async function initGitRepo(root) {
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'harness@example.com'], { cwd: root });
}

test('discoverAuthorityRoot resolves the nearest ancestor harness marker from a nested cwd', async () => {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'authority-root-ancestor-'));
  const repoRoot = path.join(sandboxRoot, 'repo');
  const leafDir = path.join(repoRoot, 'packages/demo/src');

  try {
    await mkdir(path.join(repoRoot, 'planning/active/example-task'), { recursive: true });
    await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
    await mkdir(leafDir, { recursive: true });
    await writeFile(path.join(repoRoot, 'scripts/harness'), '#!/usr/bin/env bash\n');

    const result = await discoverAuthorityRoot(leafDir);
    const expectedRepoRoot = await realpath(repoRoot);

    assert.equal(result.rootDir, expectedRepoRoot);
    assert.equal(result.source, 'ancestor-marker');
    assert.match(result.markerPath, /planning\/active|scripts\/harness/);
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('discoverAuthorityRoot resolves override-file authority roots before ancestor markers', async () => {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'authority-root-override-'));
  const authorityRoot = path.join(sandboxRoot, 'authority');
  const workspaceRoot = path.join(sandboxRoot, 'workspace');
  const leafDir = path.join(workspaceRoot, 'apps/foo');

  try {
    await mkdir(path.join(authorityRoot, 'planning/active/example-task'), { recursive: true });
    await mkdir(path.join(workspaceRoot, '.harness'), { recursive: true });
    await mkdir(leafDir, { recursive: true });
    await writeFile(
      path.join(workspaceRoot, '.harness/authority-root.json'),
      `${JSON.stringify({ schemaVersion: 1, authorityRoot: '../../authority' }, null, 2)}\n`
    );

    const result = await discoverAuthorityRoot(leafDir);
    const expectedAuthorityRoot = await realpath(authorityRoot);
    const expectedOverridePath = await realpath(path.join(workspaceRoot, '.harness/authority-root.json'));

    assert.equal(result.rootDir, expectedAuthorityRoot);
    assert.equal(result.source, 'override-file');
    assert.equal(result.markerPath, expectedOverridePath);
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('discoverAuthorityRoot stops at the git top-level instead of escaping to outer harness markers', async () => {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'authority-root-git-boundary-marker-'));
  const outerRoot = path.join(sandboxRoot, 'outer');
  const repoRoot = path.join(outerRoot, 'repo');
  const leafDir = path.join(repoRoot, 'packages/demo');

  try {
    await mkdir(path.join(outerRoot, 'planning/active/outer-task'), { recursive: true });
    await mkdir(leafDir, { recursive: true });
    await initGitRepo(repoRoot);

    const result = await discoverAuthorityRoot(leafDir);
    const expectedRepoRoot = await realpath(repoRoot);

    assert.equal(result.rootDir, expectedRepoRoot);
    assert.equal(result.source, 'git-top-level');
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('discoverAuthorityRoot ignores override files above the git top-level by default', async () => {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'authority-root-git-boundary-override-'));
  const linkedAuthority = path.join(sandboxRoot, 'linked-authority');
  const outerRoot = path.join(sandboxRoot, 'outer');
  const repoRoot = path.join(outerRoot, 'repo');
  const leafDir = path.join(repoRoot, 'packages/demo');

  try {
    await mkdir(path.join(linkedAuthority, 'planning/active/linked-task'), { recursive: true });
    await mkdir(path.join(outerRoot, '.harness'), { recursive: true });
    await mkdir(leafDir, { recursive: true });
    await initGitRepo(repoRoot);
    await writeFile(
      path.join(outerRoot, '.harness/authority-root.json'),
      `${JSON.stringify({ schemaVersion: 1, authorityRoot: '../linked-authority' }, null, 2)}\n`
    );

    const result = await discoverAuthorityRoot(leafDir);
    const expectedRepoRoot = await realpath(repoRoot);

    assert.equal(result.rootDir, expectedRepoRoot);
    assert.equal(result.source, 'git-top-level');
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});
