import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import * as coreAuthority from '../../harness/trio/core/authority.mjs';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const RETIRED_RUNTIME_MODULES = Object.freeze([
  'authority-root',
  'decision-plane-router',
  'execution-contract',
  'policy-evaluator',
  'policy-signature',
  'redaction',
  'root-policy',
  'source-root',
  'verification-contract',
  'write-plan'
]);

const INSTALLER_AUTHORITY_CONSUMERS = Object.freeze([
  'checkpoint-push',
  'checkpoint',
  'doctor',
  'fetch',
  'install',
  'sync',
  'token-audit',
  'update',
  'verify',
  'workspace-link',
  'worktree-preflight'
]);

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

test('Trio Core authority resolves the nearest ancestor harness marker from a nested cwd', async () => {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-authority-parity-'));
  try {
    const repoRoot = path.join(sandboxRoot, 'repo');
    const leafDir = path.join(repoRoot, 'packages', 'demo');
    await mkdir(path.join(repoRoot, 'planning', 'active', 'task'), { recursive: true });
    await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
    await mkdir(leafDir, { recursive: true });
    await writeFile(path.join(repoRoot, 'scripts', 'harness'), '#!/usr/bin/env bash\n', 'utf8');

    const expectedRoot = await realpath(repoRoot);
    const expectedLeaf = await realpath(leafDir);
    const coreResult = await coreAuthority.discoverAuthorityRoot(leafDir);
    assertAuthorityOracle(coreResult, {
      rootDir: expectedRoot,
      source: 'ancestor-marker',
      requestedRoot: expectedRoot,
      markerPath: await realpath(path.join(expectedRoot, 'planning', 'active'))
    });
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('Core authority preserves explicit, override, environment, and git-boundary behavior', async () => {
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
    const overrideCore = await coreAuthority.discoverAuthorityRoot(leafDir);
    assertAuthorityOracle(overrideCore, {
      rootDir: expectedAuthorityRoot,
      source: 'override-file',
      requestedRoot: expectedAuthorityRoot,
      markerPath: await realpath(expectedMarkerPath)
    });

    process.env.HARNESS_PROJECT_ROOT = await realpath(authorityRoot);
    const environmentCore = await coreAuthority.discoverAuthorityRoot(leafDir);
    assertAuthorityOracle(environmentCore, {
      rootDir: expectedAuthorityRoot,
      source: 'env',
      requestedRoot: expectedAuthorityRoot,
      markerPath: null
    });

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
  } finally {
    if (previousRoot === undefined) delete process.env.HARNESS_PROJECT_ROOT;
    else process.env.HARNESS_PROJECT_ROOT = previousRoot;
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('retired runtime authority modules are absent and installer consumers import Trio Core directly', async () => {
  for (const moduleName of RETIRED_RUNTIME_MODULES) {
    await assert.rejects(
      access(path.join(REPO_ROOT, `harness/runtime/${moduleName}.mjs`)),
      (error) => error?.code === 'ENOENT',
      `expected harness/runtime/${moduleName}.mjs to be retired`
    );
  }

  for (const commandName of INSTALLER_AUTHORITY_CONSUMERS) {
    const source = await readFile(
      path.join(REPO_ROOT, `harness/installer/commands/${commandName}.mjs`),
      'utf8'
    );
    assert.match(
      source,
      /from '\.\.\/\.\.\/trio\/core\/authority\.mjs'/,
      `${commandName}.mjs must import Trio Core authority directly`
    );
    assert.doesNotMatch(
      source,
      /runtime\/authority-root/,
      `${commandName}.mjs must not import the retired runtime authority shim`
    );
  }
});
