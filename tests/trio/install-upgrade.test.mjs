import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access,
  cp,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrateV1ToV2, parseV2Config } from '../../harness/trio/config.mjs';
import { projectConfig } from '../../harness/trio/projection.mjs';
import { readLegacyTask } from '../../harness/trio/compatibility/legacy-reader.mjs';
import { install } from '../../harness/installer/commands/install.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { doctor } from '../../harness/installer/commands/doctor.mjs';
import { verify } from '../../harness/installer/commands/verify.mjs';
import { resolveTrioFixture } from '../../harness/installer/lib/state.mjs';
import { atomicWriteText } from '../../harness/trio/core/store.mjs';
import { applyTrioProjection, prepareTrioProjection } from '../../harness/installer/commands/sync.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'tests/fixtures/trio-v2/install');
const RUNTIME_TARGET_CONTRACT = JSON.parse(await readFile(
  path.join(REPO_ROOT, 'harness/trio/runtime-targets.json'),
  'utf8'
));
const EXPECTED_ROOTS = ['fresh-empty', 'upgrade-v1-standard', 'upgrade-v1-unmanaged'];
const EXPECTED_FILES = [
  'fresh-empty/input.json',
  'upgrade-v1-standard/state.json',
  'upgrade-v1-standard/projection-manifest.json',
  'upgrade-v1-standard/recovery.json',
  'upgrade-v1-standard/legacy-task/task_plan.md',
  'upgrade-v1-unmanaged/state.json',
  'upgrade-v1-unmanaged/projection-manifest.json',
  'upgrade-v1-unmanaged/recovery.json',
  'upgrade-v1-unmanaged/legacy-task/task_plan.md'
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function contentIdentity(bytes) {
  return `sha256:${sha256(bytes)}`;
}

function legacyOwnershipForConfig(config) {
  return new Map(config.ownership.entries
    .filter((entry) => entry.targetId === 'codex')
    .map((entry) => [entry.path, entry.identity]));
}

async function assertExactSettledOwnership(state, destinations) {
  const expected = await Promise.all(destinations.map(async (destination) => [
    'codex',
    destination,
    contentIdentity(await readFile(destination))
  ]));
  const actual = state.ownership.entries.map((entry) => [
    entry.targetId,
    entry.path,
    entry.identity
  ]);
  const compare = (left, right) => left.join('\u0000').localeCompare(right.join('\u0000'));
  assert.deepEqual(actual.sort(compare), expected.sort(compare));
}

async function captureRegularFile(targetPath) {
  const info = await lstat(targetPath, { bigint: true });
  assert.equal(info.isSymbolicLink(), false, `${targetPath} must not be a symlink.`);
  assert.equal(info.isFile(), true, `${targetPath} must be a regular file.`);
  return Object.freeze({
    dev: info.dev,
    ino: info.ino,
    nlink: info.nlink,
    bytes: await readFile(targetPath)
  });
}

function assertSameRegularFile(actual, expected) {
  assert.equal(actual.dev, expected.dev);
  assert.equal(actual.ino, expected.ino);
  assert.equal(actual.nlink, expected.nlink);
  assert.deepEqual(actual.bytes, expected.bytes);
}

function assertNoManagedConflicts(report, destinations) {
  assert.deepEqual(
    report.conflicts.filter((conflict) => destinations.includes(conflict.destination)),
    []
  );
}

async function captureCommandOutput(callback) {
  const originalLog = console.log;
  const originalWrite = process.stdout.write;
  const chunks = [];
  console.log = (...values) => {
    chunks.push(`${values.map((value) => String(value)).join(' ')}\n`);
  };
  process.stdout.write = (chunk, ...values) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    const callbackValue = values.find((value) => typeof value === 'function');
    if (callbackValue) callbackValue();
    return true;
  };
  try {
    await callback();
    return chunks.join('');
  } finally {
    console.log = originalLog;
    process.stdout.write = originalWrite;
  }
}

function selectedIdentity(manifestRef, entry) {
  return `sha256:${sha256(JSON.stringify([
    manifestRef,
    entry.kind,
    entry.target,
    entry.strategy,
    entry.sourcePath,
    entry.targetPath
  ]))}`;
}

function targetContract() {
  return structuredClone(RUNTIME_TARGET_CONTRACT);
}

function withObjectPrototypeValues(values, callback) {
  const previous = new Map();
  try {
    for (const [key, value] of Object.entries(values)) {
      previous.set(key, Object.getOwnPropertyDescriptor(Object.prototype, key));
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value
      });
    }
    return callback();
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
      else delete Object.prototype[key];
    }
  }
}

async function fileTree(root) {
  const result = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      if (entry.isDirectory()) await visit(target);
      else result.push(relative);
    }
  }
  await visit(root);
  return result.sort();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function fixtureSnapshot() {
  return Object.fromEntries(
    await Promise.all(EXPECTED_FILES.map(async (relative) => [
      relative,
      sha256(await readFile(path.join(FIXTURE_ROOT, relative)))
    ]))
  );
}

async function copyFixtureRoot(fixtureName) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `trio-v2-${fixtureName}-`));
  await cp(path.join(FIXTURE_ROOT, fixtureName), path.join(tempRoot, fixtureName), { recursive: true });
  return tempRoot;
}

async function stageV1Fixture(fixtureName) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `trio-v2-command-${fixtureName}-`));
  const source = path.join(FIXTURE_ROOT, fixtureName);
  await mkdir(path.join(tempRoot, '.harness'), { recursive: true });
  await cp(path.join(source, 'state.json'), path.join(tempRoot, '.harness', 'state.json'));
  await cp(path.join(source, 'projection-manifest.json'), path.join(tempRoot, '.harness', 'projections.json'));
  await cp(path.join(source, 'recovery.json'), path.join(tempRoot, 'recovery.json'));
  return tempRoot;
}

async function rebaseStandardCommandConfig(fixtureRoot) {
  const rootReal = await realpath(fixtureRoot);
  const stateBytes = await readFile(path.join(rootReal, '.harness', 'state.json'));
  const manifestBytes = await readFile(path.join(rootReal, '.harness', 'projections.json'));
  const recovery = await readJson(path.join(rootReal, 'recovery.json'));
  const migrated = migrateV1ToV2({
    persistedState: JSON.parse(stateBytes),
    projectionManifestJson: manifestBytes.toString('utf8'),
    projectionManifestRef: `sha256:${sha256(manifestBytes)}`,
    recoveryReferences: recovery
  });
  return parseV2Config({
    ...migrated,
    targets: migrated.targets.map((target) => ({
      ...target,
      paths: target.paths.map((entry) => `${rootReal}${entry.slice('/fixture'.length)}`)
    })),
    ownership: {
      ...migrated.ownership,
      entries: migrated.ownership.entries.map((entry) => ({
        ...entry,
        path: `${rootReal}${entry.path.slice('/fixture'.length)}`
      }))
    }
  });
}

function assertExactFixtureInventory(roots, files) {
  assert.deepEqual([...roots].sort(), EXPECTED_ROOTS);
  assert.deepEqual([...files].sort(), [...EXPECTED_FILES].sort());
}

async function migrationInputs(root, fixtureName) {
  const fixture = path.join(root, fixtureName);
  const stateBytes = await readFile(path.join(fixture, 'state.json'));
  const manifestBytes = await readFile(path.join(fixture, 'projection-manifest.json'));
  const recovery = await readJson(path.join(fixture, 'recovery.json'));
  return {
    persistedState: JSON.parse(stateBytes),
    projectionManifestJson: manifestBytes.toString('utf8'),
    projectionManifestRef: `sha256:${sha256(manifestBytes)}`,
    recoveryReferences: recovery,
    manifestBytes,
    manifest: JSON.parse(manifestBytes)
  };
}

function migrationRequest(inputs) {
  return {
    persistedState: inputs.persistedState,
    projectionManifestJson: inputs.projectionManifestJson,
    projectionManifestRef: inputs.projectionManifestRef,
    recoveryReferences: inputs.recoveryReferences
  };
}

function codexDestinations(root, scope = 'user-global') {
  const entry = scope === 'workspace' ? `${root}/AGENTS.md` : `${root}/.codex/AGENTS.md`;
  return [
    entry,
    `${root}/.agents/skills/trio/SKILL.md`,
    `${root}/.agents/skills/trio/dev/SKILL.md`,
    `${root}/.agents/skills/trio/office/SKILL.md`,
    `${root}/.agents/skills/trio/safety/SKILL.md`
  ];
}

function genericDestinations(root, targetId) {
  const base = `${root}/manual/${targetId}`;
  return [
    `${base}/entry-policy.md`,
    `${base}/skills/trio/SKILL.md`,
    `${base}/skills/trio/dev/SKILL.md`,
    `${base}/skills/trio/office/SKILL.md`,
    `${base}/skills/trio/safety/SKILL.md`
  ];
}

function absentObservations(descriptors) {
  return Object.fromEntries(descriptors.map((descriptor) => [
    descriptor.destination,
    { state: 'absent' }
  ]));
}

function projectWithAbsent(config, placements) {
  const shape = projectConfig({
    config,
    targetContract: targetContract(),
    placements,
    pathObservations: {}
  });
  return projectConfig({
    config,
    targetContract: targetContract(),
    placements,
    pathObservations: absentObservations(shape.descriptors)
  });
}

async function withRuntimeSelector(selector, callback) {
  const previous = process.env.SWF_RUNTIME;
  if (selector === undefined) delete process.env.SWF_RUNTIME;
  else process.env.SWF_RUNTIME = selector;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.SWF_RUNTIME;
    else process.env.SWF_RUNTIME = previous;
  }
}

test('Trio install requires an explicit contained fixture root before legacy dependencies', async () => {
  const before = await fixtureSnapshot();
  const tempRoot = await copyFixtureRoot('fresh-empty');
  try {
    await withRuntimeSelector('trio', async () => {
      await assert.rejects(
        install([], { rootDir: path.join(tempRoot, 'fresh-empty') }),
        /fixture-root.*absolute/i
      );
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio V1 standard upgrade applies only managed Codex surfaces and keeps generic targets manual', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  const codexEntry = path.join(fixtureRoot, 'home', '.codex', 'AGENTS.md');
  const genericEntry = path.join(fixtureRoot, 'home', 'manual', 'cursor', 'entry-policy.md');
  const originalManifest = await readFile(path.join(fixtureRoot, '.harness', 'projections.json'));
  const migrationConfig = await rebaseStandardCommandConfig(fixtureRoot);
  try {
    await mkdir(path.dirname(codexEntry), { recursive: true });
    await writeFile(codexEntry, 'legacy managed destination\n');
    await withRuntimeSelector('trio', async () => {
      await install([
        '--fixture-root', fixtureRoot,
        '--upgrade',
        '--recovery', path.join(fixtureRoot, 'recovery.json')
      ]);
    });
    const state = JSON.parse(await readFile(path.join(fixtureRoot, '.harness', 'state.json'), 'utf8'));
    assert.equal(state.schemaVersion, 2);
    assert.equal(state.runtime, 'trio');
    const codexDestinationsForFixture = codexDestinations(path.join(await realpath(fixtureRoot), 'home'));
    await assertExactSettledOwnership(state, codexDestinationsForFixture);
    assert.equal(state.ownership.source, migrationConfig.ownership.source);
    assert.equal(state.ownership.manifestRef, migrationConfig.ownership.manifestRef);
    assert.match(await readFile(codexEntry, 'utf8'), /Trio V2 Entry Policy/);
    for (const relative of [
      '.agents/skills/trio/SKILL.md',
      '.agents/skills/trio/dev/SKILL.md',
      '.agents/skills/trio/office/SKILL.md',
      '.agents/skills/trio/safety/SKILL.md'
    ]) {
      assert.ok((await readFile(path.join(fixtureRoot, 'home', relative), 'utf8')).length > 0);
    }
    await assert.rejects(access(genericEntry), /ENOENT/);
    assert.deepEqual(await readFile(path.join(fixtureRoot, '.harness', 'projections.json')), originalManifest);

    await withRuntimeSelector('trio', async () => {
      const dryRun = await sync(['--fixture-root', fixtureRoot, '--dry-run']);
      assertNoManagedConflicts(dryRun, codexDestinationsForFixture);
      const doctorReport = await doctor(['--fixture-root', fixtureRoot, '--check-only']);
      assertNoManagedConflicts(doctorReport, codexDestinationsForFixture);
      const verifyReport = await verify(['--fixture-root', fixtureRoot, '--output=stdout']);
      assertNoManagedConflicts(verifyReport, codexDestinationsForFixture);
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio fresh install persists exact V2 state and public reports remain read-only', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-fresh-command-'));
  try {
    await withRuntimeSelector('trio', async () => {
      await assert.rejects(
        sync(['--fixture-root', fixtureRoot]),
        (error) => error?.code === 'ERR_TRIO_DRY_RUN_REQUIRED'
      );
      await install(['--fixture-root', fixtureRoot]);
      const statePath = path.join(fixtureRoot, '.harness', 'state.json');
      const stateBytes = await readFile(statePath);
      const state = JSON.parse(stateBytes);
      assert.deepEqual(Object.keys(state), [
        'schemaVersion',
        'runtime',
        'scope',
        'targets',
        'ownership',
        'recovery'
      ]);
      const destinations = codexDestinations(path.join(await realpath(fixtureRoot), 'workspace'), 'workspace');
      await assertExactSettledOwnership(state, destinations);
      assert.equal(state.recovery.checkpointRef, null);
      assert.equal(state.recovery.rollbackRef, null);
      assert.equal(state.targets[0].paths[0], path.join(await realpath(fixtureRoot), 'workspace', 'AGENTS.md'));

      const dryRun = await sync(['--fixture-root', fixtureRoot, '--dry-run']);
      assert.equal(dryRun.runtime, 'trio');
      assert.equal(dryRun.mode, 'dry-run');
      assertNoManagedConflicts(dryRun, destinations);
      assert.deepEqual(await readFile(statePath), stateBytes);
      const doctorReport = await doctor(['--fixture-root', fixtureRoot, '--check-only']);
      assert.equal(doctorReport.runtime, 'trio');
      assertNoManagedConflicts(doctorReport, destinations);
      const verifyReport = await verify(['--fixture-root', fixtureRoot, '--output=stdout']);
      assert.equal(verifyReport.runtime, 'trio');
      assertNoManagedConflicts(verifyReport, destinations);
      await assert.rejects(
        verify(['--fixture-root', fixtureRoot, '--output=reports']),
        (error) => error?.code === 'ERR_TRIO_VERIFY_OUTPUT'
      );
      assert.deepEqual(await readFile(statePath), stateBytes);
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Trio public sync rejects check modes before report output or writes', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-sync-check-required-'));
  try {
    await withRuntimeSelector('trio', async () => {
      await install(['--fixture-root', fixtureRoot]);
      const rootReal = await realpath(fixtureRoot);
      const statePath = path.join(rootReal, '.harness', 'state.json');
      const destinations = codexDestinations(path.join(rootReal, 'workspace'), 'workspace');
      const before = new Map(await Promise.all(
        [...destinations, statePath].map(async (targetPath) => [targetPath, await captureRegularFile(targetPath)])
      ));

      for (const args of [
        ['--fixture-root', fixtureRoot, '--check'],
        ['--fixture-root', fixtureRoot, '--dry-run', '--check']
      ]) {
        let caught;
        const output = await captureCommandOutput(async () => {
          try {
            await sync(args);
          } catch (error) {
            caught = error;
          }
        });
        assert.equal(caught?.code, 'ERR_TRIO_DRY_RUN_REQUIRED');
        assert.equal(output, '');
      }

      for (const [targetPath, snapshot] of before) {
        assertSameRegularFile(await captureRegularFile(targetPath), snapshot);
      }

      const runLegacyCheck = async (selector) => withRuntimeSelector(selector, async () => {
        let caught;
        const output = await captureCommandOutput(async () => {
          try {
            await sync(['--check'], {
              rootDir: rootReal,
              homeDir: path.join(rootReal, 'workspace')
            });
          } catch (error) {
            caught = error;
          }
        });
        return { code: caught?.code ?? null, message: caught?.message ?? null, output };
      });
      assert.deepEqual(await runLegacyCheck('legacy'), await runLegacyCheck(undefined));

      for (const [targetPath, snapshot] of before) {
        assertSameRegularFile(await captureRegularFile(targetPath), snapshot);
      }
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Trio uses settled content digests to allow source updates and preserve user drift', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-content-ownership-'));
  try {
    await withRuntimeSelector('trio', async () => {
      await install(['--fixture-root', fixtureRoot]);
      const rootReal = await realpath(fixtureRoot);
      const statePath = path.join(rootReal, '.harness', 'state.json');
      const destinations = codexDestinations(path.join(rootReal, 'workspace'), 'workspace');
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      await assertExactSettledOwnership(state, destinations);

      const priorSourceBytes = Buffer.from('prior source artifact bytes\n');
      const entryDestination = destinations[0];
      const sourceChangedState = structuredClone(state);
      const entryOwnership = sourceChangedState.ownership.entries.find((entry) => entry.path === entryDestination);
      entryOwnership.identity = contentIdentity(priorSourceBytes);
      await atomicWriteText(entryDestination, priorSourceBytes.toString('utf8'));
      await atomicWriteText(statePath, `${JSON.stringify(sourceChangedState, null, 2)}\n`);
      const stateBeforeReadOnlyReports = await readFile(statePath);

      const sourceChange = await sync(['--fixture-root', fixtureRoot, '--dry-run']);
      const sourceChangeEntry = sourceChange.descriptors.find((descriptor) => descriptor.destination === entryDestination);
      assert.equal(sourceChangeEntry.action, 'update');
      assert.equal(sourceChangeEntry.conflict, false);
      assert.deepEqual(await readFile(statePath), stateBeforeReadOnlyReports);

      await atomicWriteText(entryDestination, 'user-modified destination bytes\n');
      const userDrift = await sync(['--fixture-root', fixtureRoot, '--dry-run']);
      const userDriftEntry = userDrift.descriptors.find((descriptor) => descriptor.destination === entryDestination);
      assert.equal(userDriftEntry.action, 'preserve');
      assert.equal(userDriftEntry.conflict, true);
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Trio public sync treats a content-digest mismatch as user-owned drift', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-public-content-drift-'));
  try {
    await withRuntimeSelector('trio', async () => {
      await install(['--fixture-root', fixtureRoot]);
      const rootReal = await realpath(fixtureRoot);
      const statePath = path.join(rootReal, '.harness', 'state.json');
      const destinations = codexDestinations(path.join(rootReal, 'workspace'), 'workspace');
      const settledState = JSON.parse(await readFile(statePath, 'utf8'));
      settledState.ownership.entries = await Promise.all(destinations.map(async (destination) => ({
        targetId: 'codex',
        path: destination,
        identity: contentIdentity(await readFile(destination))
      })));
      const entryDestination = destinations[0];
      const priorSourceBytes = Buffer.from('prior source artifact bytes\n');
      settledState.ownership.entries.find((entry) => entry.path === entryDestination).identity = contentIdentity(priorSourceBytes);
      await atomicWriteText(entryDestination, priorSourceBytes.toString('utf8'));
      await atomicWriteText(statePath, `${JSON.stringify(settledState, null, 2)}\n`);

      const sourceChange = await sync(['--fixture-root', fixtureRoot, '--dry-run']);
      assert.equal(
        sourceChange.descriptors.find((descriptor) => descriptor.destination === entryDestination).action,
        'update'
      );

      await atomicWriteText(entryDestination, 'user-modified destination bytes\n');
      const userDrift = await sync(['--fixture-root', fixtureRoot, '--dry-run']);
      const userDriftEntry = userDrift.descriptors.find((descriptor) => descriptor.destination === entryDestination);
      assert.equal(userDriftEntry.action, 'preserve');
      assert.equal(userDriftEntry.conflict, true);
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Trio physical fixture gate rejects a symlinked managed parent before state or target writes', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-symlink-gate-'));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-symlink-outside-'));
  const sentinel = path.join(outsideRoot, 'sentinel.txt');
  try {
    await writeFile(sentinel, 'outside bytes\n');
    await symlink(outsideRoot, path.join(fixtureRoot, 'workspace'));
    await withRuntimeSelector('trio', async () => {
      await assert.rejects(
        install(['--fixture-root', fixtureRoot]),
        (error) => error?.code === 'ERR_TRIO_PHYSICAL_GATE'
      );
    });
    assert.equal(await readFile(sentinel, 'utf8'), 'outside bytes\n');
    await assert.rejects(access(path.join(fixtureRoot, '.harness', 'state.json')), /ENOENT/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test('Trio internal apply compensates a mid-apply failure without changing V1 state', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  const codexEntry = path.join(fixtureRoot, 'home', '.codex', 'AGENTS.md');
  try {
    await mkdir(path.dirname(codexEntry), { recursive: true });
    await writeFile(codexEntry, 'original managed bytes\n');
    const originalState = await readFile(path.join(fixtureRoot, '.harness', 'state.json'));
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    let writes = 0;
    const injectedWriteText = async (targetPath, contents, options) => {
      writes += 1;
      if (writes === 2) {
        const error = new Error('injected mid-apply failure');
        error.code = 'ERR_TEST_MID_APPLY';
        throw error;
      }
      return atomicWriteText(targetPath, contents, options);
    };
    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        writeText: injectedWriteText
      }),
      (error) => error?.code === 'ERR_TEST_MID_APPLY'
    );
    assert.equal(await readFile(codexEntry, 'utf8'), 'original managed bytes\n');
    assert.deepEqual(await readFile(path.join(fixtureRoot, '.harness', 'state.json')), originalState);
    await assert.rejects(access(path.join(fixtureRoot, 'home', '.agents')), /ENOENT/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio internal apply preserves the original state when the state publish fails before rename', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  const codexEntry = path.join(fixtureRoot, 'home', '.codex', 'AGENTS.md');
  try {
    await mkdir(path.dirname(codexEntry), { recursive: true });
    await writeFile(codexEntry, 'original managed bytes\n');
    const originalState = await readFile(path.join(fixtureRoot, '.harness', 'state.json'));
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    const injectedWriteText = async (targetPath, contents, options) => {
      if (targetPath === fixture.stateFile) {
        const error = new Error('injected state publish failure');
        error.code = 'ERR_TEST_STATE_PUBLISH';
        throw error;
      }
      return atomicWriteText(targetPath, contents, options);
    };
    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        writeText: injectedWriteText
      }),
      (error) => error?.code === 'ERR_TEST_STATE_PUBLISH'
    );
    assert.equal(await readFile(codexEntry, 'utf8'), 'original managed bytes\n');
    assert.deepEqual(await readFile(path.join(fixtureRoot, '.harness', 'state.json')), originalState);
    await assert.rejects(access(path.join(fixtureRoot, 'home', '.agents')), /ENOENT/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio rollback preserves an ambiguous post-publish target and restores prior receipts', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  try {
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const codexEntry = path.join(fixture.fixtureRoot, 'home', '.codex', 'AGENTS.md');
    const trioSkill = path.join(fixture.fixtureRoot, 'home', '.agents', 'skills', 'trio', 'SKILL.md');
    const originalEntry = Buffer.from('original managed entry bytes\n');
    const originalSkill = Buffer.from('original managed skill bytes\n');
    const originalState = await readFile(fixture.stateFile);
    await mkdir(path.dirname(codexEntry), { recursive: true });
    await mkdir(path.dirname(trioSkill), { recursive: true });
    await writeFile(codexEntry, originalEntry);
    await writeFile(trioSkill, originalSkill);
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    const expectedSkill = await readFile(path.join(REPO_ROOT, 'harness', 'trio', 'skill', 'SKILL.md'));
    let postPublish;
    let injected = false;
    const injectedWriteText = async (targetPath, contents, options) => {
      await atomicWriteText(targetPath, contents, options);
      if (!injected && targetPath === trioSkill) {
        injected = true;
        postPublish = await captureRegularFile(targetPath);
        const error = new Error('injected post-publish target failure');
        error.code = 'ERR_TEST_POST_TARGET_PUBLISH';
        throw error;
      }
    };

    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        writeText: injectedWriteText
      }),
      (error) => {
        assert.equal(error?.code, 'ERR_TRIO_ROLLBACK');
        assert.equal(error?.cause?.code, 'ERR_TEST_POST_TARGET_PUBLISH');
        assert.ok(error.errors?.some((entry) => entry?.code === 'ERR_TRIO_ROLLBACK'));
        return true;
      }
    );

    assert.equal(injected, true);
    assert.deepEqual(await readFile(codexEntry), originalEntry);
    assertSameRegularFile(await captureRegularFile(trioSkill), postPublish);
    assert.deepEqual(await readFile(trioSkill), expectedSkill);
    assert.deepEqual(await readFile(fixture.stateFile), originalState);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio rollback preserves an ambiguous post-publish state and restores target receipts', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  try {
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const codexEntry = path.join(fixture.fixtureRoot, 'home', '.codex', 'AGENTS.md');
    const originalEntry = Buffer.from('original managed entry bytes\n');
    const originalState = await readFile(fixture.stateFile);
    await mkdir(path.dirname(codexEntry), { recursive: true });
    await writeFile(codexEntry, originalEntry);
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    let postPublish;
    let injected = false;
    const injectedWriteText = async (targetPath, contents, options) => {
      await atomicWriteText(targetPath, contents, options);
      if (!injected && targetPath === fixture.stateFile) {
        injected = true;
        postPublish = await captureRegularFile(targetPath);
        const error = new Error('injected post-publish state failure');
        error.code = 'ERR_TEST_POST_STATE_PUBLISH';
        throw error;
      }
    };

    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        writeText: injectedWriteText
      }),
      (error) => {
        assert.equal(error?.code, 'ERR_TRIO_ROLLBACK');
        assert.equal(error?.cause?.code, 'ERR_TEST_POST_STATE_PUBLISH');
        assert.ok(error.errors?.some((entry) => entry?.code === 'ERR_TRIO_ROLLBACK'));
        return true;
      }
    );

    assert.equal(injected, true);
    assert.deepEqual(await readFile(codexEntry), originalEntry);
    for (const destination of codexDestinations(path.join(fixture.fixtureRoot, 'home'))) {
      if (destination === codexEntry) continue;
      await assert.rejects(access(destination), /ENOENT/);
    }
    assertSameRegularFile(await captureRegularFile(fixture.stateFile), postPublish);
    assert.notDeepEqual(postPublish.bytes, originalState);
    assert.equal(JSON.parse(postPublish.bytes.toString('utf8')).schemaVersion, 2);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio apply rechecks a post-observation target swap before its first write', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-post-observation-outside-'));
  const codexEntry = path.join(await realpath(fixtureRoot), 'home', '.codex', 'AGENTS.md');
  const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
  try {
    await mkdir(path.dirname(codexEntry), { recursive: true });
    await writeFile(codexEntry, 'original managed bytes\n');
    await writeFile(outsideSentinel, 'outside sentinel bytes\n');
    const originalState = await readFile(path.join(fixtureRoot, '.harness', 'state.json'));
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    let swapped = false;
    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        beforeWrite: async ({ targetPath }) => {
          if (swapped || targetPath !== codexEntry) return;
          swapped = true;
          await rm(codexEntry);
          await symlink(outsideSentinel, codexEntry);
        }
      }),
      (error) => error?.code === 'ERR_TRIO_PHYSICAL_GATE'
    );
    assert.equal(await readFile(outsideSentinel, 'utf8'), 'outside sentinel bytes\n');
    assert.deepEqual(await readFile(path.join(fixtureRoot, '.harness', 'state.json')), originalState);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio selector and fixture inputs fail closed without legacy or target writes', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-selector-gate-'));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-selector-outside-'));
  try {
    await withRuntimeSelector('unknown-runtime', async () => {
      for (const command of [
        () => install(['--fixture-root', fixtureRoot]),
        () => sync(['--fixture-root', fixtureRoot, '--dry-run']),
        () => doctor(['--fixture-root', fixtureRoot]),
        () => verify(['--fixture-root', fixtureRoot])
      ]) {
        await assert.rejects(command(), (error) => error?.code === 'ERR_TRIO_RUNTIME_SELECTOR');
      }
    });
    await withRuntimeSelector('trio', async () => {
      await assert.rejects(
        install(['--fixture-root', fixtureRoot, '--home-dir', outsideRoot]),
        (error) => error?.code === 'ERR_TRIO_FIXTURE'
      );
    });
    await assert.rejects(access(path.join(fixtureRoot, '.harness', 'state.json')), /ENOENT/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test('unknown Trio selectors reject help before emitting command usage', async () => {
  const commands = [
    ['install', () => install(['--help'])],
    ['sync', () => sync(['--help'])],
    ['doctor', () => doctor(['--help'])],
    ['verify', () => verify(['--help'])]
  ];
  await withRuntimeSelector('unknown-runtime', async () => {
    const outcomes = [];
    for (const [name, invoke] of commands) {
      let error;
      const output = await captureCommandOutput(async () => {
        try {
          await invoke();
        } catch (caught) {
          error = caught;
        }
      });
      outcomes.push([name, error?.code ?? null, output]);
    }
    assert.deepEqual(outcomes, commands.map(([name]) => [name, 'ERR_TRIO_RUNTIME_SELECTOR', '']));
  });
});

test('default and legacy selector retain existing help output bytes', async () => {
  const commands = [
    () => install(['--help']),
    () => sync(['--help']),
    () => verify(['--help'])
  ];
  for (const invoke of commands) {
    const defaultOutput = await withRuntimeSelector(undefined, async () => captureCommandOutput(invoke));
    const legacyOutput = await withRuntimeSelector('legacy', async () => captureCommandOutput(invoke));
    assert.equal(legacyOutput, defaultOutput);
  }
});

test('Trio rollback preserves a same-content foreign replacement after publication', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  const codexEntry = path.join(fixtureRoot, 'home', '.codex', 'AGENTS.md');
  const heldPublication = path.join(fixtureRoot, 'home', '.codex', 'published-entry.md');
  try {
    await mkdir(path.dirname(codexEntry), { recursive: true });
    await writeFile(codexEntry, 'original managed bytes\n');
    const originalState = await readFile(path.join(fixtureRoot, '.harness', 'state.json'));
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const canonicalCodexEntry = path.join(fixture.fixtureRoot, 'home', '.codex', 'AGENTS.md');
    const canonicalHeldPublication = path.join(fixture.fixtureRoot, 'home', '.codex', 'published-entry.md');
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    const desiredEntry = await readFile(path.join(REPO_ROOT, 'harness', 'trio', 'templates', 'entry-policy.md'));
    let foreignIdentity;
    let entryPublicationStarted = false;
    let replaced = false;
    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        beforeWrite: async ({ targetPath }) => {
          if (targetPath === canonicalCodexEntry) {
            entryPublicationStarted = true;
            return;
          }
          if (replaced || !entryPublicationStarted) return;
          replaced = true;
          const published = await lstat(canonicalCodexEntry, { bigint: true });
          await rename(canonicalCodexEntry, canonicalHeldPublication);
          await writeFile(canonicalCodexEntry, desiredEntry);
          foreignIdentity = await lstat(canonicalCodexEntry, { bigint: true });
          assert.notEqual(foreignIdentity.ino, published.ino);
          const error = new Error('injected later failure after foreign replacement');
          error.code = 'ERR_TEST_LATER_FAILURE';
          throw error;
        }
      }),
      (error) => error?.code === 'ERR_TRIO_ROLLBACK' && error?.cause?.code === 'ERR_TEST_LATER_FAILURE'
    );
    const after = await lstat(canonicalCodexEntry, { bigint: true });
    assert.equal(after.dev, foreignIdentity.dev);
    assert.equal(after.ino, foreignIdentity.ino);
    assert.deepEqual(await readFile(canonicalCodexEntry), desiredEntry);
    assert.deepEqual(await readFile(path.join(fixtureRoot, '.harness', 'state.json')), originalState);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio rollback preserves a replaced transaction-created directory', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  const codexEntry = path.join(fixtureRoot, 'home', '.codex', 'AGENTS.md');
  const createdDirectory = path.join(fixtureRoot, 'home', '.agents');
  const foreignSentinel = path.join(createdDirectory, 'foreign.txt');
  try {
    await mkdir(path.dirname(codexEntry), { recursive: true });
    await writeFile(codexEntry, 'original managed bytes\n');
    const originalState = await readFile(path.join(fixtureRoot, '.harness', 'state.json'));
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const canonicalCodexEntry = path.join(fixture.fixtureRoot, 'home', '.codex', 'AGENTS.md');
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    let entryPublicationStarted = false;
    let replaced = false;
    let foreignIdentity;
    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        beforeWrite: async ({ targetPath }) => {
          if (targetPath === canonicalCodexEntry) {
            entryPublicationStarted = true;
            return;
          }
          if (replaced || !entryPublicationStarted) return;
          replaced = true;
          await rm(createdDirectory, { recursive: true, force: true });
          await mkdir(createdDirectory);
          await writeFile(foreignSentinel, 'foreign directory bytes\n');
          foreignIdentity = await lstat(createdDirectory, { bigint: true });
          const error = new Error('injected directory replacement failure');
          error.code = 'ERR_TEST_DIRECTORY_REPLACEMENT';
          throw error;
        }
      }),
      (error) => error?.code === 'ERR_TRIO_ROLLBACK' && error?.cause?.code === 'ERR_TEST_DIRECTORY_REPLACEMENT'
    );
    const after = await lstat(createdDirectory, { bigint: true });
    assert.equal(after.dev, foreignIdentity.dev);
    assert.equal(after.ino, foreignIdentity.ino);
    assert.equal(await readFile(foreignSentinel, 'utf8'), 'foreign directory bytes\n');
    assert.equal(await readFile(codexEntry, 'utf8'), 'original managed bytes\n');
    assert.deepEqual(await readFile(path.join(fixtureRoot, '.harness', 'state.json')), originalState);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio physical fixture gate rejects descriptor-to-state aliases', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-state-alias-'));
  try {
    await withRuntimeSelector('trio', async () => {
      await install(['--fixture-root', fixtureRoot]);
      const rootReal = await realpath(fixtureRoot);
      const statePath = path.join(rootReal, '.harness', 'state.json');
      const entryPath = path.join(rootReal, 'workspace', 'AGENTS.md');
      const config = JSON.parse(await readFile(statePath, 'utf8'));
      await rm(statePath);
      await link(entryPath, statePath);
      await assert.rejects(
        prepareTrioProjection({ fixture: await resolveTrioFixture({ fixtureRoot }), config }),
        (error) => error?.code === 'ERR_TRIO_PHYSICAL_GATE'
      );
      assert.equal((await lstat(entryPath, { bigint: true })).nlink, 2n);
      assert.equal((await lstat(statePath, { bigint: true })).nlink, 2n);
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Trio upgrade leaves legacy stale and retired sentinels untouched', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  const codexEntry = path.join(fixtureRoot, 'home', '.codex', 'AGENTS.md');
  const stalePath = path.join(fixtureRoot, 'home', '.agents', 'skills', 'legacy-stale', 'SKILL.md');
  const retiredPath = path.join(fixtureRoot, '.harness', 'legacy-retired-sentinel.json');
  try {
    await mkdir(path.dirname(codexEntry), { recursive: true });
    await writeFile(codexEntry, 'legacy managed destination\n');
    await mkdir(path.dirname(stalePath), { recursive: true });
    await writeFile(stalePath, 'legacy stale sentinel\n');
    await writeFile(retiredPath, 'legacy retired sentinel\n');
    const staleBefore = await lstat(stalePath, { bigint: true });
    const retiredBefore = await lstat(retiredPath, { bigint: true });
    await withRuntimeSelector('trio', async () => {
      await install([
        '--fixture-root', fixtureRoot,
        '--upgrade',
        '--recovery', path.join(fixtureRoot, 'recovery.json')
      ]);
    });
    const staleAfter = await lstat(stalePath, { bigint: true });
    const retiredAfter = await lstat(retiredPath, { bigint: true });
    assert.equal(await readFile(stalePath, 'utf8'), 'legacy stale sentinel\n');
    assert.equal(await readFile(retiredPath, 'utf8'), 'legacy retired sentinel\n');
    assert.equal(staleAfter.dev, staleBefore.dev);
    assert.equal(staleAfter.ino, staleBefore.ino);
    assert.equal(retiredAfter.dev, retiredBefore.dev);
    assert.equal(retiredAfter.ino, retiredBefore.ino);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio upgrade rejects unmanaged evidence and unsafe recovery or hard-link inputs before writes', async () => {
  const before = await fixtureSnapshot();
  const unmanagedRoot = await stageV1Fixture('upgrade-v1-unmanaged');
  const hardLinkRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-hard-link-gate-'));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-hard-link-outside-'));
  try {
    const unmanagedEntry = path.join(unmanagedRoot, 'home', '.codex', 'AGENTS.md');
    await mkdir(path.dirname(unmanagedEntry), { recursive: true });
    await writeFile(unmanagedEntry, 'user managed destination\n');
    const stateBefore = await readFile(path.join(unmanagedRoot, '.harness', 'state.json'));
    const inodeBefore = await stat(unmanagedEntry);
    await withRuntimeSelector('trio', async () => {
      await assert.rejects(
        install([
          '--fixture-root', unmanagedRoot,
          '--upgrade',
          '--recovery', path.join(unmanagedRoot, 'recovery.json')
        ]),
        (error) => error?.code === 'ERR_TRIO_CONFLICT'
      );
    });
    const inodeAfter = await stat(unmanagedEntry);
    assert.equal(await readFile(unmanagedEntry, 'utf8'), 'user managed destination\n');
    assert.equal(inodeAfter.ino, inodeBefore.ino);
    assert.equal(inodeAfter.mtimeMs, inodeBefore.mtimeMs);
    assert.deepEqual(await readFile(path.join(unmanagedRoot, '.harness', 'state.json')), stateBefore);
    await assert.rejects(access(path.join(unmanagedRoot, 'home', '.agents')), /ENOENT/);

    const recoveryLink = path.join(unmanagedRoot, 'recovery-link.json');
    await symlink(path.join(outsideRoot, 'recovery.json'), recoveryLink);
    await withRuntimeSelector('trio', async () => {
      await assert.rejects(
        install(['--fixture-root', unmanagedRoot, '--upgrade', '--recovery', recoveryLink]),
        (error) => error?.code === 'ERR_TRIO_FIXTURE'
      );
    });

    const outsideFile = path.join(outsideRoot, 'linked-entry.md');
    const linkedEntry = path.join(hardLinkRoot, 'workspace', 'AGENTS.md');
    await writeFile(outsideFile, 'outside hard-link bytes\n');
    await mkdir(path.dirname(linkedEntry), { recursive: true });
    await link(outsideFile, linkedEntry);
    await withRuntimeSelector('trio', async () => {
      await assert.rejects(
        install(['--fixture-root', hardLinkRoot]),
        (error) => error?.code === 'ERR_TRIO_PHYSICAL_GATE'
      );
    });
    assert.equal(await readFile(outsideFile, 'utf8'), 'outside hard-link bytes\n');
    assert.equal((await lstat(linkedEntry)).nlink, 2);
    await assert.rejects(access(path.join(hardLinkRoot, '.harness', 'state.json')), /ENOENT/);
  } finally {
    await rm(unmanagedRoot, { recursive: true, force: true });
    await rm(hardLinkRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('install fixtures have exact roots/files and fresh input is strict V2', async () => {
  const before = await fixtureSnapshot();
  const actualRoots = (await readdir(FIXTURE_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const actualFiles = await fileTree(FIXTURE_ROOT);
  assertExactFixtureInventory(actualRoots, actualFiles);
  assert.throws(
    () => assertExactFixtureInventory([...actualRoots, 'fourth-root'], actualFiles),
    /deepEqual|Expected/i
  );
  assert.throws(
    () => assertExactFixtureInventory(actualRoots, [...actualFiles, 'fresh-empty/extra.json']),
    /deepEqual|Expected/i
  );

  const tempRoot = await copyFixtureRoot('fresh-empty');
  try {
    const freshInput = await readJson(path.join(tempRoot, 'fresh-empty/input.json'));
    const config = parseV2Config(freshInput);
    const projected = projectWithAbsent(config, [{
      targetId: 'codex',
      targetPath: '/fixture/workspace/AGENTS.md',
      scope: 'workspace',
      root: '/fixture/workspace'
    }]);
    assert.equal(projected.descriptors.length, 5);
    assert.throws(
      () => migrateV1ToV2({
        persistedState: freshInput,
        projectionManifestJson: JSON.stringify({ schemaVersion: 2, entries: [] }),
        projectionManifestRef: `sha256:${'a'.repeat(64)}`,
        recoveryReferences: { checkpointRef: null, rollbackRef: null }
      }),
      /schemaVersion.*1|V1/i
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('standard V1 migration consumes real raw bytes from a temp copy and preserves provenance', async () => {
  const before = await fixtureSnapshot();
  const tempRoot = await copyFixtureRoot('upgrade-v1-standard');
  try {
    const inputs = await migrationInputs(tempRoot, 'upgrade-v1-standard');
    const config = migrateV1ToV2(migrationRequest(inputs));

    assert.deepEqual(Object.keys(config), [
      'schemaVersion',
      'runtime',
      'scope',
      'targets',
      'ownership',
      'recovery'
    ]);
    assert.equal(config.schemaVersion, 2);
    assert.equal(config.runtime, 'trio');
    assert.equal(config.scope.kind, 'user-global');
    assert.equal(config.recovery.checkpointRef, 'checkpoint-standard-v1');
    assert.equal(config.recovery.rollbackRef, 'rollback-standard-v1');
    assert.equal(config.ownership.manifestRef, inputs.projectionManifestRef);
    assert.deepEqual(
      config.targets.map((target) => ({ id: target.id, hostKind: target.hostKind, mode: target.mode })),
      [
        { id: 'codex', hostKind: 'codex', mode: 'managed' },
        { id: 'cursor', hostKind: 'generic', mode: 'manual' }
      ]
    );
    assert.equal(config.targets[0].paths[0], '/fixture/home/.codex/AGENTS.md');
    assert.equal(config.targets[1].paths[0], '/fixture/home/.cursor/instructions/trio.md');
    assert.equal(/deploymentProfile|policyProfile|skillProfile|hookMode|upstream|lastSync|lastFetch|lastUpdate/iu.test(JSON.stringify(config)), false);

    const selected = inputs.manifest.entries.filter((entry) =>
      (entry.kind === 'entry' || entry.kind === 'skill') &&
      ['codex', 'cursor'].includes(entry.target)
    );
    const expectedIdentities = [...new Set(selected.map((entry) => selectedIdentity(inputs.projectionManifestRef, entry)))].sort();
    assert.deepEqual(config.ownership.entries.map((entry) => entry.identity).sort(), expectedIdentities);
    assert.equal(config.ownership.entries.some((entry) => entry.path.endsWith('settings.json')), false);
    assert.equal(config.ownership.entries.some((entry) => entry.path.includes('unknown')), false);

    const placements = [
      {
        targetId: 'codex',
        targetPath: '/fixture/home/.codex/AGENTS.md',
        scope: 'user-global',
        root: '/fixture/home'
      },
      {
        targetId: 'cursor',
        targetPath: '/fixture/home/.cursor/instructions/trio.md',
        scope: 'user-global',
        root: '/fixture/home'
      }
    ];
    const shape = projectConfig({
      config,
      targetContract: targetContract(),
      placements,
      pathObservations: {}
    });
    const migratedCodexEntry = config.ownership.entries.find((entry) =>
      entry.targetId === 'codex' && entry.path === '/fixture/home/.codex/AGENTS.md'
    );
    assert.ok(migratedCodexEntry, 'The managed update identity must come from raw migration evidence.');
    const observations = absentObservations(shape.descriptors);
    observations['/fixture/home/.codex/AGENTS.md'] = {
      state: 'managed',
      identity: migratedCodexEntry.identity
    };
    const projected = projectConfig({
      config,
      targetContract: targetContract(),
      placements,
      pathObservations: observations
    });
    assert.equal(projected.descriptors.length, 10);
    assert.equal(projected.descriptors.filter((descriptor) => descriptor.targetId === 'codex').length, 5);
    const codexEntry = projected.descriptors.find((descriptor) =>
      descriptor.targetId === 'codex' && descriptor.surface === 'entry'
    );
    assert.equal(codexEntry.action, 'update');
    assert.equal(codexEntry.identity, migratedCodexEntry.identity);
    assert.deepEqual(
      projected.descriptors
        .filter((descriptor) => descriptor.targetId === 'codex' && descriptor.surface !== 'entry')
        .map((descriptor) => [descriptor.action, descriptor.execution]),
      Array.from({ length: 4 }, () => ['create', 'managed'])
    );
    assert.deepEqual(
      projected.descriptors
        .filter((descriptor) => descriptor.targetId === 'cursor')
        .map((descriptor) => [descriptor.action, descriptor.execution]),
      Array.from({ length: 5 }, () => ['create', 'manual'])
    );
    assert.deepEqual(projected.conflicts, []);
    assert.equal(projected.descriptors.some((descriptor) => descriptor.destination === '/fixture/home/.codex/AGENTS.md'), true);
    assert.equal(projected.descriptors.some((descriptor) => descriptor.destination === '/fixture/home/.cursor/instructions/trio.md'), false);

    await mkdir(path.join(tempRoot, 'planning', 'active'), { recursive: true });
    await cp(
      path.join(tempRoot, 'upgrade-v1-standard/legacy-task'),
      path.join(tempRoot, 'planning/active/legacy-task'),
      { recursive: true }
    );
    const legacy = await readLegacyTask(tempRoot, { taskId: 'legacy-task' });
    assert.equal(legacy.status, 'in_progress');
    assert.equal(legacy.terminal, false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('migration requires content-addressed raw manifest and explicit recovery references', async () => {
  const before = await fixtureSnapshot();
  const tempRoot = await copyFixtureRoot('upgrade-v1-standard');
  try {
    const inputs = await migrationInputs(tempRoot, 'upgrade-v1-standard');
    const base = {
      persistedState: inputs.persistedState,
      projectionManifestJson: inputs.projectionManifestJson,
      projectionManifestRef: inputs.projectionManifestRef,
      recoveryReferences: inputs.recoveryReferences
    };

    assert.throws(
      () => migrateV1ToV2({ persistedState: base.persistedState, recoveryReferences: base.recoveryReferences }),
      (error) => error?.code === 'ERR_TRIO_CONFIG'
    );
    assert.throws(
      () => migrateV1ToV2({ persistedState: base.persistedState, projectionManifestJson: base.projectionManifestJson, recoveryReferences: base.recoveryReferences }),
      (error) => error?.code === 'ERR_TRIO_CONFIG'
    );
    assert.throws(
      () => migrateV1ToV2({ ...base, projectionManifestRef: `sha256:${'0'.repeat(64)}` }),
      /hash|reference|manifest/i
    );
    assert.throws(
      () => migrateV1ToV2({ ...base, persistedState: { ...base.persistedState, schemaVersion: 2 } }),
      /schemaVersion|V1/i
    );
    assert.throws(
      () => migrateV1ToV2({
        ...base,
        projectionManifestJson: JSON.stringify({ schemaVersion: 2, entries: [] }),
        projectionManifestRef: `sha256:${sha256(JSON.stringify({ schemaVersion: 2, entries: [] }))}`
      }),
      /schemaVersion|manifest/i
    );
    assert.throws(
      () => migrateV1ToV2({ ...base, recoveryReferences: { checkpointRef: null } }),
      /recoveryReferences|rollbackRef/i
    );

    const changedManifest = `${base.projectionManifestJson}\n`;
    assert.throws(
      () => migrateV1ToV2({
        ...base,
        projectionManifestJson: changedManifest
      }),
      /hash|reference|manifest/i
    );
    const changedConfig = migrateV1ToV2({
      ...base,
      projectionManifestJson: changedManifest,
      projectionManifestRef: `sha256:${sha256(changedManifest)}`
    });
    const originalConfig = migrateV1ToV2(base);
    assert.notEqual(changedConfig.ownership.entries[0].identity, originalConfig.ownership.entries[0].identity);

    const conflictingManifest = {
      ...inputs.manifest,
      entries: [
        ...inputs.manifest.entries,
        {
          ...inputs.manifest.entries[0],
          strategy: 'conflicting-strategy'
        }
      ]
    };
    const conflictingJson = JSON.stringify(conflictingManifest, null, 2) + '\n';
    assert.throws(
      () => migrateV1ToV2({
        ...base,
        projectionManifestJson: conflictingJson,
        projectionManifestRef: `sha256:${sha256(conflictingJson)}`
      }),
      /ambiguous|conflict|duplicate/i
    );

    const inheritedState = Object.assign(Object.create({ schemaVersion: 1 }), base.persistedState);
    delete inheritedState.schemaVersion;
    assert.throws(() => migrateV1ToV2({ ...base, persistedState: inheritedState }), /plain|prototype|schema/i);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('V1 migration wrapper requires exactly four own fields', async () => {
  const before = await fixtureSnapshot();
  const tempRoot = await copyFixtureRoot('upgrade-v1-standard');
  try {
    const inputs = await migrationInputs(tempRoot, 'upgrade-v1-standard');
    const wrapper = {
      persistedState: inputs.persistedState,
      projectionManifestJson: inputs.projectionManifestJson,
      projectionManifestRef: inputs.projectionManifestRef,
      recoveryReferences: inputs.recoveryReferences
    };

    assert.equal(migrateV1ToV2(wrapper).targets.length, 2);
    assert.equal(migrateV1ToV2(JSON.parse(JSON.stringify(wrapper))).targets.length, 2);
    withObjectPrototypeValues(wrapper, () => {
      assert.throws(
        () => migrateV1ToV2({}),
        (error) => error?.code === 'ERR_TRIO_CONFIG'
      );
    });

    for (const key of Object.keys(wrapper)) {
      const missing = { ...wrapper };
      delete missing[key];
      assert.throws(
        () => migrateV1ToV2(missing),
        (error) => error?.code === 'ERR_TRIO_CONFIG'
      );
    }
    assert.throws(
      () => migrateV1ToV2({ ...wrapper, extra: true }),
      (error) => error?.code === 'ERR_TRIO_CONFIG'
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('migration rejects inherited V1 structural and selected manifest fields', async () => {
  const before = await fixtureSnapshot();
  const tempRoot = await copyFixtureRoot('upgrade-v1-standard');
  try {
    const inputs = await migrationInputs(tempRoot, 'upgrade-v1-standard');
    const base = {
      persistedState: inputs.persistedState,
      projectionManifestJson: inputs.projectionManifestJson,
      projectionManifestRef: inputs.projectionManifestRef,
      recoveryReferences: inputs.recoveryReferences
    };
    const selected = inputs.manifest.entries[0];
    const mutations = [
      ...['kind', 'target', 'strategy', 'sourcePath', 'targetPath'].map((field) => ({
        label: `selected.${field}`,
        field,
        value: selected[field],
        input() {
          const manifest = structuredClone(inputs.manifest);
          delete manifest.entries[0][field];
          const projectionManifestJson = JSON.stringify(manifest);
          return {
            ...base,
            projectionManifestJson,
            projectionManifestRef: `sha256:${sha256(projectionManifestJson)}`
          };
        }
      })),
      {
        label: 'manifest.schemaVersion',
        field: 'schemaVersion',
        value: inputs.manifest.schemaVersion,
        input() {
          const manifest = structuredClone(inputs.manifest);
          delete manifest.schemaVersion;
          const projectionManifestJson = JSON.stringify(manifest);
          return {
            ...base,
            projectionManifestJson,
            projectionManifestRef: `sha256:${sha256(projectionManifestJson)}`
          };
        }
      },
      {
        label: 'manifest.entries',
        field: 'entries',
        value: inputs.manifest.entries,
        input() {
          const manifest = structuredClone(inputs.manifest);
          delete manifest.entries;
          const projectionManifestJson = JSON.stringify(manifest);
          return {
            ...base,
            projectionManifestJson,
            projectionManifestRef: `sha256:${sha256(projectionManifestJson)}`
          };
        }
      },
      {
        label: 'scope.kind',
        field: 'kind',
        value: 'user-global',
        input() {
          return {
            ...base,
            persistedState: {
              ...base.persistedState,
              scope: {}
            }
          };
        }
      }
    ];
    const rejected = [];

    for (const mutation of mutations) {
      assert.equal(Object.getOwnPropertyDescriptor(Object.prototype, mutation.field), undefined);
      Object.defineProperty(Object.prototype, mutation.field, {
        configurable: true,
        enumerable: true,
        value: mutation.value
      });
      try {
        try {
          migrateV1ToV2(mutation.input());
        } catch {
          rejected.push(mutation.label);
        }
      } finally {
        delete Object.prototype[mutation.field];
      }
    }

    assert.deepEqual(rejected, mutations.map((mutation) => mutation.label));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('unmanaged V1 upgrade preserves the existing destination and never updates it', async () => {
  const before = await fixtureSnapshot();
  const tempRoot = await copyFixtureRoot('upgrade-v1-unmanaged');
  try {
    const inputs = await migrationInputs(tempRoot, 'upgrade-v1-unmanaged');
    const config = migrateV1ToV2(migrationRequest(inputs));
    const entryDestination = '/fixture/home/.codex/AGENTS.md';
    const codex = codexDestinations('/fixture/home');
    const observations = Object.fromEntries(codex.map((destination, index) => [
      destination,
      index === 0 ? { state: 'unmanaged' } : { state: 'absent' }
    ]));
    const result = projectConfig({
      config,
      targetContract: targetContract(),
      placements: [{
        targetId: 'codex',
        targetPath: entryDestination,
        scope: 'user-global',
        root: '/fixture/home'
      }],
      pathObservations: observations
    });
    const entry = result.descriptors.find((descriptor) => descriptor.surface === 'entry');
    assert.equal(entry.action, 'preserve');
    assert.equal(entry.conflict, true);
    assert.equal(result.descriptors.some((descriptor) => descriptor.action === 'update' || descriptor.action === 'overwrite'), false);

    await mkdir(path.join(tempRoot, 'planning', 'active'), { recursive: true });
    await cp(
      path.join(tempRoot, 'upgrade-v1-unmanaged/legacy-task'),
      path.join(tempRoot, 'planning/active/legacy-task'),
      { recursive: true }
    );
    const legacy = await readLegacyTask(tempRoot, { taskId: 'legacy-task' });
    assert.equal(legacy.status, 'in_progress');
    assert.equal(legacy.terminal, false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});
