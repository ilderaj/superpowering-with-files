import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readState, writeState } from '../../harness/installer/lib/state.mjs';
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

test('harness --help prints top-level usage', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, '--help');
    assert.match(stdout, /Usage: \.\/scripts\/harness <command>/);
    assert.match(stdout, /verify   Print or write verification reports/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync --help prints usage without executing sync', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, 'sync', '--help');
    assert.match(stdout, /Usage: \.\/scripts\/harness sync/);
    await assert.rejects(access(path.join(root, '.harness/projections.json')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('verify --help prints usage without writing reports', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, 'verify', '--help');
    assert.match(stdout, /Usage: \.\/scripts\/harness verify/);
    await assert.rejects(access(path.join(root, 'reports/verification/latest.md')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync --dry-run prints diff without writing files or state', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    const { stdout } = await harnessCommand(root, 'sync', '--dry-run');
    const state = await readState(root);

    assert.match(stdout, /"mode": "dry-run"/);
    assert.match(stdout, /"create":/);
    assert.equal(state.lastSync, undefined);
    await assert.rejects(access(path.join(root, 'AGENTS.md')), /ENOENT/);
    await assert.rejects(access(path.join(root, '.harness/projections.json')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync --check exits non-zero when projections are out of sync and does not write files', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await assert.rejects(
      harnessCommand(root, 'sync', '--check'),
      /Harness sync check failed: projections are out of sync/
    );
    await assert.rejects(access(path.join(root, 'AGENTS.md')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('verify prints to stdout by default without writing reports', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {},
      upstream: {}
    });

    const { stdout } = await harnessCommand(root, 'verify');
    assert.match(stdout, /# Harness Verification Report/);
    await assert.rejects(access(path.join(root, 'reports/verification/latest.md')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('verify --output writes report files only to the requested directory', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {},
      upstream: {}
    });

    await harnessCommand(root, 'verify', '--output=.harness/custom-verification');

    await access(path.join(root, '.harness/custom-verification/latest.md'));
    await access(path.join(root, '.harness/custom-verification/latest.json'));
    await assert.rejects(access(path.join(root, 'reports/verification/latest.md')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});
