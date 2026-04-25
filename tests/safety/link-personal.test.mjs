import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, home, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root,
    env: { ...process.env, HOME: home }
  });
}

async function git(cwd, ...args) {
  return execFileAsync('git', args, { cwd });
}

async function createPersonalRepo() {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'harness-personal-repo-'));
  await git(repo, 'init');
  await git(repo, 'config', 'user.name', 'Harness Test');
  await git(repo, 'config', 'user.email', 'harness@example.com');
  await mkdir(path.join(repo, 'copilot'), { recursive: true });
  await writeFile(path.join(repo, 'copilot/personal.instructions.md'), 'personal copilot instructions\n');
  await writeFile(
    path.join(repo, 'manifest.json'),
    `${JSON.stringify(
      {
        map: [
          {
            src: 'copilot/personal.instructions.md',
            dest: '~/.copilot/instructions/harness.instructions.md',
            mode: 'copy'
          }
        ]
      },
      null,
      2
    )}\n`
  );
  await git(repo, 'add', '.');
  await git(repo, 'commit', '-m', 'init');
  await git(repo, 'branch', '-M', 'main');
  return repo;
}

test('link-personal applies mappings and sync skips user-managed targets', async () => {
  const root = await createHarnessFixture();
  const repo = await createPersonalRepo();
  const home = await mkdtemp(path.join(os.tmpdir(), 'harness-personal-home-'));
  try {
    await harnessCommand(root, home, 'link-personal', `--repo=${repo}`);

    const targetPath = path.join(home, '.copilot/instructions/harness.instructions.md');
    assert.equal(await readFile(targetPath, 'utf8'), 'personal copilot instructions\n');

    const userManaged = JSON.parse(
      await readFile(path.join(home, '.agent-config/user-managed.json'), 'utf8')
    );
    assert.ok(userManaged.paths.includes(targetPath));

    await writeState(root, {
      schemaVersion: 1,
      scope: 'user-global',
      projectionMode: 'link',
      hookMode: 'off',
      policyProfile: 'always-on-core',
      skillProfile: 'full',
      targets: {
        copilot: {
          enabled: true,
          paths: [path.join(home, '.copilot/instructions/harness.instructions.md')]
        }
      },
      upstream: {}
    });

    await harnessCommand(root, home, 'sync');
    assert.equal(await readFile(targetPath, 'utf8'), 'personal copilot instructions\n');
  } finally {
    await removeHarnessFixture(root);
    await rm(repo, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test('link-personal aborts when a destination already exists outside managed ownership', async () => {
  const root = await createHarnessFixture();
  const repo = await createPersonalRepo();
  const home = await mkdtemp(path.join(os.tmpdir(), 'harness-personal-conflict-home-'));
  try {
    await mkdir(path.join(home, '.copilot/instructions'), { recursive: true });
    await writeFile(
      path.join(home, '.copilot/instructions/harness.instructions.md'),
      'existing unrelated file\n'
    );

    await assert.rejects(
      harnessCommand(root, home, 'link-personal', `--repo=${repo}`),
      /Refusing to overwrite existing non-managed path/
    );
  } finally {
    await removeHarnessFixture(root);
    await rm(repo, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});
