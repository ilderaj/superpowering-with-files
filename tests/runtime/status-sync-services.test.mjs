import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getHarnessStatus } from '../../harness/runtime/status-service.mjs';
import { getSyncDryRun } from '../../harness/runtime/sync-plan-service.mjs';
import { computeSyncPlanReport } from '../../harness/installer/commands/sync.mjs';
import { readHarnessHealth } from '../../harness/installer/lib/health.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

async function createRuntimeServiceFixture() {
  const root = await createHarnessFixture();
  await writeState(root, {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    targets: {
      codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
    },
    upstream: {}
  });
  await withCwd(root, () => sync([]));
  const leafDir = path.join(root, 'workspace/leaf');
  await mkdir(leafDir, { recursive: true });
  return { root, leafDir };
}

test('getHarnessStatus resolves a nested cwd and forwards an explicit homeDir', async () => {
  const { root, leafDir } = await createRuntimeServiceFixture();
  const homeDir = '/home/runtime-status-explicit';

  try {
    const result = await getHarnessStatus({ cwd: leafDir, homeDir });
    const expectedRoot = await realpath(root);
    const directHealth = await readHarnessHealth(expectedRoot, homeDir);

    assert.equal(result.rootDir, expectedRoot);
    assert.deepEqual(result.health, directHealth);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('getHarnessStatus falls back to os.homedir when no homeDir override is provided', async (t) => {
  const { root, leafDir } = await createRuntimeServiceFixture();
  const mockedHomeDir = '/home/runtime-status-default';
  t.mock.method(os, 'homedir', () => mockedHomeDir);

  try {
    const result = await getHarnessStatus({ cwd: leafDir });
    const expectedRoot = await realpath(root);
    const directHealth = await readHarnessHealth(expectedRoot, mockedHomeDir);

    assert.equal(result.rootDir, expectedRoot);
    assert.deepEqual(result.health, directHealth);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('getSyncDryRun resolves a nested cwd and returns the public sync report shape', async () => {
  const { root, leafDir } = await createRuntimeServiceFixture();
  const homeDir = '/home/runtime-sync-explicit';

  try {
    const result = await getSyncDryRun({ cwd: leafDir, homeDir });
    const expectedRoot = await realpath(root);
    const report = await computeSyncPlanReport({ rootDir: expectedRoot, homeDir });

    assert.equal(result.rootDir, expectedRoot);
    assert.deepEqual(result.targets, report.plan.targets);
    assert.deepEqual(result.summary, report.summary);
    assert.deepEqual(result.diff, report.diff);
    assert.deepEqual(result.warnings, report.warnings ?? []);
    assert.deepEqual(result.details, report.details ?? {});
    assert.equal(Object.hasOwn(result, 'plan'), false);
    assert.equal(Object.hasOwn(result, 'state'), false);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('getSyncDryRun falls back to os.homedir when no homeDir override is provided', async (t) => {
  const { root, leafDir } = await createRuntimeServiceFixture();
  const mockedHomeDir = '/home/runtime-sync-default';
  t.mock.method(os, 'homedir', () => mockedHomeDir);

  try {
    const result = await getSyncDryRun({ cwd: leafDir });
    const expectedRoot = await realpath(root);
    const report = await computeSyncPlanReport({ rootDir: expectedRoot, homeDir: mockedHomeDir });

    assert.equal(result.rootDir, expectedRoot);
    assert.deepEqual(result.targets, report.plan.targets);
    assert.deepEqual(result.summary, report.summary);
    assert.deepEqual(result.diff, report.diff);
    assert.deepEqual(result.warnings, report.warnings ?? []);
    assert.deepEqual(result.details, report.details ?? {});
  } finally {
    await removeHarnessFixture(root);
  }
});

test('getSyncDryRun exposes report buckets needed by operator review', async () => {
  const dryRun = await getSyncDryRun({ root: process.cwd() });

  assert.equal(typeof dryRun.rootDir, 'string');
  assert.equal(typeof dryRun.summary, 'object');
  assert.equal(typeof dryRun.diff, 'object');
  assert.equal(Array.isArray(dryRun.warnings), true);
  assert.equal(typeof dryRun.details, 'object');
});
