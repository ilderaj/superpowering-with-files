import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readState, writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, homeDir, ...args) {
  const maybeOptions = args.at(-1);
  const options =
    maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions) ? args.pop() : {};

  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: options.cwd ?? root,
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


test('adoption starter kit documents profiles, rollback path, and recovery boundary', async () => {
  const [doc, maintenanceDoc] = await Promise.all([
    readFile(path.join(process.cwd(), 'docs/install/adoption-starter-kit.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'docs/maintenance.md'), 'utf8')
  ]);

  assert.match(doc, /minimal-global, full-local, and cloud-dev profiles/i);
  assert.match(doc, /rollback, doctor, sync dry-run, verify, and smoke-check/i);
  assert.match(
    doc,
    /The starter kit must explain what upstream update can overwrite, what it cannot overwrite, and how to recover safely\./
  );
  assert.match(
    maintenanceDoc,
    /When using the adoption starter kit, verify rollback, doctor, sync dry-run, verify, and smoke-check steps before treating the profile as reusable team guidance\./
  );
});






test('adopt-global rejects user-global safety profiles', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  try {
    await mkdir(homeDir, { recursive: true });
    await initGitRepo(root);

    await writeState(root, {
      schemaVersion: 1,
      scope: 'user-global',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'safety',
      skillProfile: 'full',
      targets: {
        copilot: {
          enabled: true,
          paths: [path.join(homeDir, '.copilot/instructions/harness.instructions.md')]
        }
      },
      upstream: {}
    });

    await assert.rejects(
      harnessCommand(root, homeDir, 'adopt-global'),
      /Safety profiles are workspace-only/
    );
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
