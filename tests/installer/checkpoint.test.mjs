import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root
  });
}

async function git(root, ...args) {
  return execFileAsync('git', args, { cwd: root });
}

async function initGitRepo(root) {
  await git(root, 'init');
  await git(root, 'config', 'user.name', 'Harness Test');
  await git(root, 'config', 'user.email', 'harness@example.com');
  await git(root, 'add', '.');
  await git(root, 'commit', '-m', 'Initial fixture');
}

test('harness checkpoint creates a recovery bundle for git repositories', async () => {
  const root = await createHarnessFixture();
  try {
    await writeFile(path.join(root, 'tracked.txt'), 'initial\n');
    await initGitRepo(root);
    await writeFile(path.join(root, 'tracked.txt'), 'changed\n');
    await writeFile(path.join(root, 'untracked.txt'), 'scratch\n');

    const { stdout } = await harnessCommand(root, 'checkpoint', root, '--out=.harness/checkpoints/git-fixture');

    const outDir = stdout.trim();
    const realRoot = await realpath(root);
    const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf8'));

    await access(path.join(outDir, 'repo.bundle'));
    await access(path.join(outDir, 'uncommitted.diff'));
    await access(path.join(outDir, 'staged.diff'));
    await access(path.join(outDir, 'status.txt'));
    await access(path.join(outDir, 'untracked.tgz'));
    assert.equal(manifest.isGitRepo, true);
    assert.equal(await realpath(manifest.sourcePath), realRoot);
    assert.equal(manifest.checkpointPath, outDir);
    assert.ok(manifest.headSha);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness checkpoint skips clean repositories when asked', async () => {
  const root = await createHarnessFixture();
  try {
    await writeFile(path.join(root, 'tracked.txt'), 'initial\n');
    await initGitRepo(root);

    await harnessCommand(root, 'checkpoint', root, '--skip-if-clean', '--out=.harness/checkpoints/clean-fixture');

    await assert.rejects(access(path.join(root, '.harness/checkpoints/clean-fixture/manifest.json')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness checkpoint archives non-git directories as tarballs', async () => {
  const root = await createHarnessFixture();
  const externalDir = await mkdtemp(path.join(os.tmpdir(), 'harness-checkpoint-nongit-'));
  try {
    await mkdir(path.join(externalDir, 'nested'), { recursive: true });
    await writeFile(path.join(externalDir, 'nested', 'file.txt'), 'content\n');

    const { stdout } = await harnessCommand(
      root,
      'checkpoint',
      externalDir,
      '--out=.harness/checkpoints/non-git-fixture'
    );

    const outDir = stdout.trim();
    const realExternalDir = await realpath(externalDir);
    const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf8'));

    await access(path.join(outDir, 'workspace.tgz'));
    assert.equal(manifest.isGitRepo, false);
    assert.equal(await realpath(manifest.sourcePath), realExternalDir);
    assert.equal(manifest.checkpointPath, outDir);
  } finally {
    await removeHarnessFixture(root);
    await rm(externalDir, { recursive: true, force: true });
  }
});
