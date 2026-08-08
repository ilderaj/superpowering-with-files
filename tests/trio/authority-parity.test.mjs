import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import * as legacyAuthority from '../../harness/runtime/authority-root.mjs';
import * as coreAuthority from '../../harness/trio/core/authority.mjs';

const execFileAsync = promisify(execFile);

function assertAuthorityOracle(result, expected) {
  assert.equal(result.rootDir, expected.rootDir);
  assert.equal(result.source, expected.source);
  assert.equal(result.requestedRoot, expected.requestedRoot);
  assert.equal(result.markerPath, expected.markerPath);
}

async function initGitRepo(root) {
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Trio Test'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'trio@example.com'], { cwd: root });
}

test('legacy authority path and Trio Core authority expose the same API and nested-marker result', async () => {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-authority-parity-'));
  try {
    const repoRoot = path.join(sandboxRoot, 'repo');
    const leafDir = path.join(repoRoot, 'packages', 'demo');
    await mkdir(path.join(repoRoot, 'planning', 'active', 'task'), { recursive: true });
    await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
    await mkdir(leafDir, { recursive: true });
    await writeFile(path.join(repoRoot, 'scripts', 'harness'), '#!/usr/bin/env bash\n', 'utf8');

    assert.deepEqual(Object.keys(legacyAuthority).sort(), Object.keys(coreAuthority).sort());
    const expectedRoot = await realpath(repoRoot);
    const expectedLeaf = await realpath(leafDir);
    const coreResult = await coreAuthority.discoverAuthorityRoot(leafDir);
    assertAuthorityOracle(coreResult, {
      rootDir: expectedRoot,
      source: 'ancestor-marker',
      requestedRoot: expectedRoot,
      markerPath: await realpath(path.join(expectedRoot, 'planning', 'active'))
    });
    assert.deepEqual(
      await legacyAuthority.discoverAuthorityRoot(leafDir),
      coreResult
    );
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('legacy and Core authority preserve explicit, override, environment, and git-boundary behavior', async () => {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-authority-parity-matrix-'));
  const previousRoot = process.env.HARNESS_PROJECT_ROOT;
  try {
    const authorityRoot = path.join(sandboxRoot, 'authority');
    const workspaceRoot = path.join(sandboxRoot, 'workspace');
    const leafDir = path.join(workspaceRoot, 'packages', 'demo');
    await mkdir(path.join(authorityRoot, 'planning', 'active', 'task'), { recursive: true });
    await mkdir(leafDir, { recursive: true });
    await mkdir(path.join(workspaceRoot, '.harness'), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, '.harness', 'authority-root.json'),
      `${JSON.stringify({ schemaVersion: 1, authorityRoot: '../../authority' }, null, 2)}\n`,
      'utf8'
    );

    const explicitOptions = { inputRoot: authorityRoot };
    const expectedAuthorityRoot = await realpath(authorityRoot);
    const expectedLeaf = await realpath(leafDir);
    const expectedMarkerPath = path.join(workspaceRoot, '.harness', 'authority-root.json');
    const explicitCore = await coreAuthority.discoverAuthorityRoot(leafDir, explicitOptions);
    assertAuthorityOracle(explicitCore, {
      rootDir: expectedAuthorityRoot,
      source: 'explicit',
      requestedRoot: path.resolve(authorityRoot),
      markerPath: null
    });
    assert.deepEqual(
      await legacyAuthority.discoverAuthorityRoot(leafDir, explicitOptions),
      explicitCore
    );
    const overrideCore = await coreAuthority.discoverAuthorityRoot(leafDir);
    assertAuthorityOracle(overrideCore, {
      rootDir: expectedAuthorityRoot,
      source: 'override-file',
      requestedRoot: expectedAuthorityRoot,
      markerPath: await realpath(expectedMarkerPath)
    });
    assert.deepEqual(
      await legacyAuthority.discoverAuthorityRoot(leafDir),
      overrideCore
    );

    process.env.HARNESS_PROJECT_ROOT = await realpath(authorityRoot);
    const environmentCore = await coreAuthority.discoverAuthorityRoot(leafDir);
    assertAuthorityOracle(environmentCore, {
      rootDir: expectedAuthorityRoot,
      source: 'env',
      requestedRoot: expectedAuthorityRoot,
      markerPath: null
    });
    assert.deepEqual(
      await legacyAuthority.discoverAuthorityRoot(leafDir),
      environmentCore
    );

    delete process.env.HARNESS_PROJECT_ROOT;
    const gitRoot = path.join(sandboxRoot, 'git-repo');
    const gitLeaf = path.join(gitRoot, 'src');
    await mkdir(gitLeaf, { recursive: true });
    await initGitRepo(gitRoot);
    const gitCore = await coreAuthority.discoverAuthorityRoot(gitLeaf);
    assertAuthorityOracle(gitCore, {
      rootDir: await realpath(gitRoot),
      source: 'git-top-level',
      requestedRoot: await realpath(gitRoot),
      markerPath: null
    });
    assert.deepEqual(
      await legacyAuthority.discoverAuthorityRoot(gitLeaf),
      gitCore
    );
  } finally {
    if (previousRoot === undefined) delete process.env.HARNESS_PROJECT_ROOT;
    else process.env.HARNESS_PROJECT_ROOT = previousRoot;
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});
