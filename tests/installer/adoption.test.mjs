import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readState, writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, homeDir, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root,
    env: {
      ...process.env,
      HOME: homeDir
    }
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

async function currentHead(root) {
  const { stdout } = await git(root, 'rev-parse', 'HEAD');
  return stdout.trim();
}

async function commitFixtureChange(root, relativePath, content) {
  await writeFile(path.join(root, relativePath), content);
  await git(root, 'add', relativePath);
  await git(root, 'commit', '-m', `Update ${relativePath}`);
}

test('adopt-global bootstraps user-global state, verification output, and receipt', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  try {
    await mkdir(homeDir, { recursive: true });
    await initGitRepo(root);

    await harnessCommand(root, homeDir, 'adopt-global');

    const state = await readState(root);
    const receipt = JSON.parse(
      await readFile(path.join(root, '.harness/adoption/global.json'), 'utf8')
    );
    const verification = JSON.parse(
      await readFile(path.join(root, '.harness/adoption/verification/latest.json'), 'utf8')
    );

    assert.equal(state.scope, 'user-global');
    assert.equal(state.policyProfile, 'always-on-core');
    assert.equal(Object.keys(state.targets).length, 4);
    assert.equal(receipt.status, 'success');
    assert.equal(receipt.scope, 'user-global');
    assert.equal(receipt.policyProfile, 'always-on-core');
    assert.equal(receipt.repoHead, await currentHead(root));
    assert.equal(verification.health.problems.length, 0);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('adopt-global preserves an existing user-global install instead of overwriting it', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  try {
    await mkdir(homeDir, { recursive: true });
    await initGitRepo(root);

    await writeState(root, {
      schemaVersion: 1,
      scope: 'user-global',
      projectionMode: 'portable',
      hookMode: 'on',
      policyProfile: 'safety',
      skillProfile: 'minimal-global',
      targets: {
        codex: {
          enabled: true,
          paths: [path.join(homeDir, '.codex/AGENTS.md')]
        }
      },
      upstream: {}
    });

    await harnessCommand(root, homeDir, 'adopt-global');

    const state = await readState(root);
    const receipt = JSON.parse(
      await readFile(path.join(root, '.harness/adoption/global.json'), 'utf8')
    );

    assert.equal(state.scope, 'user-global');
    assert.equal(state.projectionMode, 'portable');
    assert.equal(state.hookMode, 'on');
    assert.equal(state.policyProfile, 'safety');
    assert.equal(state.skillProfile, 'minimal-global');
    assert.deepEqual(Object.keys(state.targets), ['codex']);
    assert.equal(receipt.policyProfile, 'safety');
    assert.deepEqual(receipt.targets, ['codex']);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('adopt-global rejects non-user-global install state to avoid workspace mutation', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  try {
    await mkdir(homeDir, { recursive: true });
    await initGitRepo(root);

    await writeState(root, {
      schemaVersion: 1,
      scope: 'both',
      projectionMode: 'link',
      hookMode: 'off',
      policyProfile: 'always-on-core',
      skillProfile: 'full',
      targets: {
        codex: {
          enabled: true,
          paths: [path.join(root, 'AGENTS.md'), path.join(homeDir, '.codex/AGENTS.md')]
        }
      },
      upstream: {}
    });

    await assert.rejects(
      harnessCommand(root, homeDir, 'adopt-global'),
      /user-global-only|workspace mutation/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('adoption-status reports in_sync after a successful global adoption', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  try {
    await mkdir(homeDir, { recursive: true });
    await initGitRepo(root);
    await harnessCommand(root, homeDir, 'adopt-global');

    const { stdout } = await harnessCommand(root, homeDir, 'adoption-status');
    const status = JSON.parse(stdout);

    assert.equal(status.status, 'in_sync');
    assert.equal(status.scope, 'user-global');
    assert.equal(status.repoHead, await currentHead(root));
  } finally {
    await removeHarnessFixture(root);
  }
});

test('adoption-status reports needs_apply when repo HEAD advances after adoption', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  try {
    await mkdir(homeDir, { recursive: true });
    await initGitRepo(root);
    await harnessCommand(root, homeDir, 'adopt-global');
    await commitFixtureChange(root, 'README.md', '# changed\n');

    const { stdout } = await harnessCommand(root, homeDir, 'adoption-status');
    const status = JSON.parse(stdout);

    assert.equal(status.status, 'needs_apply');
    assert.notEqual(status.receipt.repoHead, status.repoHead);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('adoption-status reports state_mismatch when install state drifts after adoption', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  try {
    await mkdir(homeDir, { recursive: true });
    await initGitRepo(root);
    await harnessCommand(root, homeDir, 'adopt-global');

    const state = await readState(root);
    await writeState(root, {
      ...state,
      policyProfile: 'safety',
      skillProfile: 'minimal-global'
    });

    const { stdout } = await harnessCommand(root, homeDir, 'adoption-status');
    const status = JSON.parse(stdout);

    assert.equal(status.status, 'state_mismatch');
    assert.match(status.reasons.join('\n'), /policyProfile/);
    assert.match(status.reasons.join('\n'), /skillProfile/);
  } finally {
    await removeHarnessFixture(root);
  }
});
