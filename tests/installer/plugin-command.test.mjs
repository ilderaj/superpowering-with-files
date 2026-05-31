import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root,
    env: { ...process.env, HOME: path.join(root, 'home') }
  });
}

test('harness --help includes plugin migration commands', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, '--help');
    assert.match(stdout, /plugin  Inspect and plan plugin adoption/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('plugin doctor prints migration-oriented JSON status', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, 'plugin', 'doctor');
    const result = JSON.parse(stdout);
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.command, 'plugin doctor');
    assert.deepEqual(result.supportedTargets, ['codex', 'claude-code', 'cursor', 'copilot']);
    assert.equal(result.globalAdoption.availableAsMigrationSeed, true);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('plugin migrate requires dry-run for now and produces a cutover plan', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, 'plugin', 'migrate', '--target=codex', '--dry-run');
    const result = JSON.parse(stdout);
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.command, 'plugin migrate');
    assert.equal(result.target, 'codex');
    assert.equal(result.dryRun, true);
    assert.deepEqual(result.steps.map((step) => step.id), [
      'capture-baseline',
      'install-plugin-shadow',
      'dual-run',
      'cutover',
      'cleanup'
    ]);
  } finally {
    await removeHarnessFixture(root);
  }
});
