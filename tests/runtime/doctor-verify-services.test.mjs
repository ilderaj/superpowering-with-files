import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runHarnessDoctor } from '../../harness/runtime/doctor-service.mjs';
import { runHarnessVerify } from '../../harness/runtime/verify-service.mjs';
import { readHarnessHealth } from '../../harness/installer/lib/health.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

async function createRuntimeDoctorVerifyFixture() {
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

test('runHarnessVerify resolves a nested cwd and forwards an explicit homeDir', async () => {
  const { root, leafDir } = await createRuntimeDoctorVerifyFixture();
  const homeDir = '/home/runtime-verify-explicit';

  try {
    const result = await runHarnessVerify({ cwd: leafDir, homeDir });
    const expectedRoot = await realpath(root);
    const directHealth = await readHarnessHealth(expectedRoot, homeDir);

    assert.equal(result.rootDir, expectedRoot);
    assert.deepEqual(result.report.health, directHealth);
    assert.equal(result.report.checks.stateReadable, true);
    assert.deepEqual(result.report.checks.selectedTargets, ['codex']);
    assert.equal(result.report.checks.scope, 'workspace');
    assert.equal(result.report.checks.projectionMode, 'link');
    assert.match(result.report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(result.markdown, /^# Harness Verification Report/m);
    assert.match(result.markdown, /^Targets: codex$/m);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('runHarnessVerify falls back to os.homedir when no homeDir override is provided', async (t) => {
  const { root, leafDir } = await createRuntimeDoctorVerifyFixture();
  const mockedHomeDir = '/home/runtime-verify-default';
  t.mock.method(os, 'homedir', () => mockedHomeDir);

  try {
    const result = await runHarnessVerify({ cwd: leafDir });
    const expectedRoot = await realpath(root);
    const directHealth = await readHarnessHealth(expectedRoot, mockedHomeDir);

    assert.equal(result.rootDir, expectedRoot);
    assert.deepEqual(result.report.health, directHealth);
    assert.deepEqual(result.report.checks.selectedTargets, ['codex']);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('runHarnessDoctor returns a clean report for a healthy fixture', async () => {
  const { root, leafDir } = await createRuntimeDoctorVerifyFixture();
  const homeDir = '/home/runtime-doctor-clean';

  try {
    const result = await runHarnessDoctor({ cwd: leafDir, homeDir });
    const expectedRoot = await realpath(root);
    const directHealth = await readHarnessHealth(expectedRoot, homeDir);

    assert.equal(result.rootDir, expectedRoot);
    assert.equal(result.ok, true);
    assert.deepEqual(result.health, directHealth);
    assert.deepEqual(result.problems, []);
    assert.match(result.markdown, /^# Harness Doctor$/m);
    assert.match(result.markdown, /^Hook payload$/m);
    assert.match(result.markdown, /^Budget ledger$/m);
    assert.match(result.markdown, /^Warnings$/m);
    assert.match(result.markdown, /^Problems$/m);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('runHarnessDoctor flags personal paths found in projected entry content', async () => {
  const { root, leafDir } = await createRuntimeDoctorVerifyFixture();
  const homeDir = '/Users/runtime-doctor-sensitive';

  try {
    await appendFile(path.join(root, 'AGENTS.md'), `\n${homeDir}/private-project\n`);

    const result = await runHarnessDoctor({ cwd: leafDir, homeDir });
    const expectedRoot = await realpath(root);

    assert.equal(result.rootDir, expectedRoot);
    assert.equal(result.ok, false);
    assert.ok(
      result.problems.some((problem) => problem.includes('codex: personal path found in')),
      'doctor should report personal-path findings against the projected entry'
    );
    assert.equal(
      result.health.problems.some((problem) => problem.includes('personal path found in')),
      false
    );
  } finally {
    await removeHarnessFixture(root);
  }
});
