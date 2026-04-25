import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root
  });
}

test('sync projects safety assets into workspace and user-global agent-config roots', async (t) => {
  const root = await createHarnessFixture();
  try {
    const home = path.join(root, 'home');
    await mkdir(home, { recursive: true });
    t.mock.method(os, 'homedir', () => home);

    await writeState(root, {
      schemaVersion: 1,
      scope: 'both',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'safety',
      skillProfile: 'full',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    assert.match(
      await readFile(path.join(root, '.agent-config/safety/protected-paths.txt'), 'utf8'),
      /\/Users/
    );
    assert.match(
      await readFile(path.join(home, '.agent-config/safety/dangerous-patterns.txt'), 'utf8'),
      /git\\s\+reset\\s\+--hard/
    );
    assert.match(
      await readFile(path.join(home, '.agent-config/templates/vscode-settings.safety.jsonc'), 'utf8'),
      /chat\.tools\.global\.autoApprove/
    );
    assert.match(
      await readFile(path.join(home, '.agent-config/docs/safety/architecture.md'), 'utf8'),
      /Safety Harness Architecture/
    );

    const checkpointStat = await lstat(path.join(home, '.agent-config/bin/checkpoint'));
    assert.ok((checkpointStat.mode & 0o111) !== 0, 'checkpoint should be executable');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('cloud-bootstrap creates Codespaces safety files when devcontainer files are absent', async () => {
  const root = await createHarnessFixture();
  try {
    await harnessCommand(root, 'cloud-bootstrap', '--target=codespaces');

    assert.match(
      await readFile(path.join(root, '.devcontainer/devcontainer.json'), 'utf8'),
      /chat\.tools\.global\.autoApprove/
    );
    assert.match(
      await readFile(path.join(root, '.devcontainer/postCreateCommand.sh'), 'utf8'),
      /install --scope=workspace --profile=cloud-safe --hooks=on/
    );
    assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /\.agent-config\/checkpoints\//);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('cloud-bootstrap writes suggested files instead of overwriting existing devcontainer files', async () => {
  const root = await createHarnessFixture();
  try {
    await mkdir(path.join(root, '.devcontainer'), { recursive: true });
    await writeFile(path.join(root, '.devcontainer/devcontainer.json'), '{\n  "name": "custom"\n}\n');
    await writeFile(path.join(root, '.devcontainer/postCreateCommand.sh'), '#!/usr/bin/env bash\necho custom\n');

    await harnessCommand(root, 'cloud-bootstrap', '--target=codespaces');

    assert.equal(
      await readFile(path.join(root, '.devcontainer/devcontainer.json'), 'utf8'),
      '{\n  "name": "custom"\n}\n'
    );
    assert.match(
      await readFile(path.join(root, '.devcontainer/devcontainer.json.harness.suggested'), 'utf8'),
      /chat\.tools\.global\.autoApprove/
    );
    assert.match(
      await readFile(path.join(root, '.devcontainer/postCreateCommand.sh.harness.suggested'), 'utf8'),
      /install --scope=workspace --profile=cloud-safe --hooks=on/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});
