import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
import { projectConfig, SURFACES, SUPPORT_SURFACES, PROJECTION_SURFACES } from '../../harness/trio/projection.mjs';
import { readLegacyTask } from '../../harness/trio/compatibility/legacy-reader.mjs';
import { install } from '../../harness/installer/commands/install.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { doctor } from '../../harness/installer/commands/doctor.mjs';
import { verify } from '../../harness/installer/commands/verify.mjs';
import { resolveTrioFixture, resolveTrioProductionEnvironment } from '../../harness/installer/lib/state.mjs';
import { atomicWriteText } from '../../harness/trio/core/store.mjs';
import { applyTrioProjection, prepareTrioProjection } from '../../harness/installer/commands/sync.mjs';
import { parseTrioBackupV1Ref, captureTrioTakeoverPreimages } from '../../harness/installer/lib/trio-takeover-backup.mjs';

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
const TRIO_MANAGED_SOURCE_PATHS = Object.freeze(PROJECTION_SURFACES.map(({ source }) => source));

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

async function assertExactTrioMaterialization(destinations) {
  assert.equal(destinations.length, TRIO_MANAGED_SOURCE_PATHS.length);
  for (const [index, destination] of destinations.entries()) {
    assert.deepEqual(
      await readFile(destination),
      await readFile(path.join(REPO_ROOT, TRIO_MANAGED_SOURCE_PATHS[index])),
      destination
    );
  }
}

async function assertAbsentTrioMaterialization(destinations) {
  for (const destination of destinations) {
    await assert.rejects(access(destination), /ENOENT/, destination);
  }
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

async function captureDirectoryIdentity(targetPath) {
  const info = await lstat(targetPath, { bigint: true });
  assert.equal(info.isSymbolicLink(), false, `${targetPath} must not be a symlink.`);
  assert.equal(info.isDirectory(), true, `${targetPath} must be a directory.`);
  return Object.freeze({ dev: info.dev, ino: info.ino, nlink: info.nlink });
}

function runProcess(command, args, environmentOverrides = {}) {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env, ...environmentOverrides };
    delete environment.NODE_TEST_CONTEXT;
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function runNode(args, environmentOverrides = {}) {
  return runProcess(process.execPath, args, environmentOverrides);
}

async function harnessSourceSnapshot() {
  const status = await runProcess('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', 'harness']);
  assert.equal(status.code, 0, status.stderr);
  const sourceRoot = path.join(REPO_ROOT, 'harness');
  const files = await fileTree(sourceRoot);
  return Object.freeze({
    status: status.stdout,
    files: Object.freeze(await Promise.all(files.map(async (relative) => Object.freeze([
      relative,
      sha256(await readFile(path.join(sourceRoot, relative)))
    ]))))
  });
}

async function abandonPublicationLock(rootDir) {
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  const result = await runNode([
    '--input-type=module',
    '--eval',
    [
      `import { acquireTrioPublicationLock } from ${JSON.stringify(storeUrl)};`,
      `const lock = await acquireTrioPublicationLock(${JSON.stringify(rootDir)});`,
      'process.stdout.write(JSON.stringify({ path: lock.path }));'
    ].join('\n')
  ]);
  assert.equal(result.code, 0, result.stderr);
  const lock = JSON.parse(result.stdout);
  assert.equal(typeof lock.path, 'string');
  assert.equal(path.dirname(lock.path), os.tmpdir());
  assert.equal(path.basename(lock.path).startsWith('swf-trio-v2-lock-'), true);
  return lock;
}

function productionStateRaceProbeSource({ installUrl, stateUrl, storeUrl }) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realState from ${JSON.stringify(stateUrl)};
import * as realStore from ${JSON.stringify(storeUrl)};
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const INSTALL_URL = ${JSON.stringify(installUrl)};
const STATE_URL = ${JSON.stringify(stateUrl)};
const STORE_URL = ${JSON.stringify(storeUrl)};
const PROBE_SENTINEL = 'SWF_TRIO_FAULT_PROBE:state-race';
const V1_STATE = {
  schemaVersion: 1,
  scope: 'workspace',
  projectionMode: 'link',
  hookMode: 'off',
  deploymentProfile: 'standard',
  policyProfile: 'always-on-core',
  workspacePolicyOverlay: null,
  skillProfile: 'standard',
  targets: {},
  upstream: {}
};
const identity = async (targetPath) => {
  const info = await lstat(targetPath, { bigint: true });
  return { dev: info.dev, ino: info.ino, nlink: info.nlink };
};
const files = async (root) => {
  const result = [];
  const visit = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else result.push(path.relative(root, target).split(path.sep).join('/'));
    }
  };
  await visit(root);
  return result.sort();
};

test('production install retains foreign V1 state that appears after an absent lock-held probe', async (t) => {
  assert.equal(process.env.SWF_TRIO_FAULT_PROBE, 'state-race');
  process.stdout.write(\`${'${PROBE_SENTINEL}'}\\n\`);
  delete process.env.SWF_RUNTIME;
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-production-state-race-'));
  const rootDir = path.join(sandbox, 'authority');
  const homeDir = path.join(sandbox, 'home');
  await Promise.all([mkdir(rootDir), mkdir(homeDir)]);
  const statePath = path.join(rootDir, '.harness', 'state.json');
  const foreignBytes = Buffer.from(JSON.stringify(V1_STATE, null, 2) + '\\n');
  let injected = false;
  let foreignIdentity;
  let managedPublications = 0;
  try {
    await t.mock.module(STATE_URL, {
      namedExports: {
        ...realState,
        probeInstallerState: async (requestedRoot) => {
          const probe = await realState.probeInstallerState(requestedRoot);
          if (!injected && path.resolve(requestedRoot) === rootDir && probe.kind === 'absent') {
            injected = true;
            await mkdir(path.dirname(statePath));
            await writeFile(statePath, foreignBytes);
            foreignIdentity = await identity(statePath);
          }
          return probe;
        }
      }
    });
    await t.mock.module(STORE_URL, {
      namedExports: {
        ...realStore,
        atomicWriteText: async (...args) => {
          managedPublications += 1;
          return realStore.atomicWriteText(...args);
        }
      }
    });
    const { install } = await import(INSTALL_URL);
    await assert.rejects(
      () => install([], { rootDir, homeDir }),
      (error) => error?.code === 'ERR_TRIO_UPGRADE_REQUIRED'
    );
    assert.equal(injected, true);
    assert.equal(managedPublications, 0, 'foreign state must fail before any managed publication');
    assert.deepEqual(await readFile(statePath), foreignBytes);
    assert.deepEqual(await identity(statePath), foreignIdentity);
    assert.deepEqual(await files(rootDir), ['.harness/state.json']);
    assert.deepEqual(await files(homeDir), []);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
`;
}

async function runInstallFaultProbe(label, source) {
  const root = await mkdtemp(path.join(os.tmpdir(), `trio-v2-install-${label}-`));
  const probePath = path.join(root, `${label}.test.mjs`);
  try {
    await writeFile(probePath, source, 'utf8');
    return await runNode(
      ['--experimental-test-module-mocks', '--test', probePath],
      { SWF_TRIO_FAULT_PROBE: label }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

async function createProductionRoots(label) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), `trio-v2-production-${label}-`));
  const rootDir = path.join(sandbox, 'authority');
  const homeDir = path.join(sandbox, 'home');
  await Promise.all([
    mkdir(rootDir, { recursive: true }),
    mkdir(homeDir, { recursive: true })
  ]);
  return Object.freeze({ sandbox, rootDir, homeDir });
}

function productionTrioConfig(environment, scopeKind, { includeCodex = true } = {}) {
  const paths = scopeKind === 'both'
    ? [
      path.join(environment.authorityRoot, 'AGENTS.md'),
      path.join(environment.homeDir, '.codex', 'AGENTS.md')
    ]
    : [path.join(environment.authorityRoot, 'AGENTS.md')];
  return parseV2Config({
    schemaVersion: 2,
    runtime: 'trio',
    scope: { kind: scopeKind },
    targets: includeCodex ? [{
      id: 'codex',
      enabled: true,
      paths,
      hostKind: 'codex',
      mode: 'managed'
    }] : [],
    ownership: { source: 'test-runtime', manifestRef: null, entries: [] },
    recovery: { checkpointRef: null, rollbackRef: null }
  });
}

async function assertProductionDiagnosticFailure({ label, expectedCode, mutate, assertAfter }) {
  const roots = await createProductionRoots(`diagnostic-${label}`);
  try {
    const options = { rootDir: roots.rootDir, homeDir: roots.homeDir };
    await install([], options);
    const rootReal = await realpath(roots.rootDir);
    const statePath = path.join(rootReal, '.harness', 'state.json');
    const entryPath = path.join(rootReal, 'AGENTS.md');
    await mutate({ roots, options, rootReal, statePath, entryPath });
    const stateAfterMutation = await readFile(statePath);
    for (const invoke of [
      () => doctor(['--check-only'], options),
      () => verify(['--output=stdout'], options)
    ]) {
      let caught;
      const output = await captureCommandOutput(async () => {
        try {
          await invoke();
        } catch (error) {
          caught = error;
        }
      });
      assert.equal(caught?.code, expectedCode, label);
      assert.equal(output, '', label);
    }
    assert.deepEqual(await readFile(statePath), stateAfterMutation, label);
    await assertAfter({ roots, rootReal, statePath, entryPath });
  } finally {
    await rm(roots.sandbox, { recursive: true, force: true });
  }
}

async function stageProductionV1Fixture(fixtureName = 'upgrade-v1-standard') {
  const roots = await createProductionRoots(fixtureName);
  const sourceRoot = path.join(FIXTURE_ROOT, fixtureName);
  const state = JSON.parse(await readFile(path.join(sourceRoot, 'state.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(sourceRoot, 'projection-manifest.json'), 'utf8'));
  const rebase = (value) => value.startsWith('/fixture/home')
    ? `${roots.homeDir}${value.slice('/fixture/home'.length)}`
    : value;

  for (const target of Object.values(state.targets)) {
    target.paths = target.paths.map(rebase);
  }
  for (const entry of manifest.entries) {
    entry.targetPath = rebase(entry.targetPath);
  }

  await mkdir(path.join(roots.rootDir, '.harness'), { recursive: true });
  await Promise.all([
    writeFile(path.join(roots.rootDir, '.harness', 'state.json'), `${JSON.stringify(state, null, 2)}\n`),
    writeFile(path.join(roots.rootDir, '.harness', 'projections.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    cp(path.join(sourceRoot, 'recovery.json'), path.join(roots.rootDir, 'recovery.json'))
  ]);
  return roots;
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
  return PROJECTION_SURFACES.map((surface) => surface.id === 'entry'
    ? `${root}/${scope === 'workspace' ? 'AGENTS.md' : '.codex/AGENTS.md'}`
    : `${root}/.agents/skills/${surface.relativePath}`);
}

function genericDestinations(root, targetId) {
  const base = `${root}/manual/${targetId}`;
  return PROJECTION_SURFACES.map((surface) => surface.id === 'entry'
    ? `${base}/entry-policy.md` : `${base}/skills/${surface.relativePath}`);
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

async function withTemporaryLegacyEnvironment(homeDir, callback) {
  const previousHome = Object.getOwnPropertyDescriptor(process.env, 'HOME');
  const previousSourceRoot = Object.getOwnPropertyDescriptor(process.env, 'HARNESS_SOURCE_ROOT');
  process.env.HOME = homeDir;
  process.env.HARNESS_SOURCE_ROOT = REPO_ROOT;
  try {
    return await callback();
  } finally {
    if (previousHome) Object.defineProperty(process.env, 'HOME', previousHome);
    else delete process.env.HOME;
    if (previousSourceRoot) Object.defineProperty(process.env, 'HARNESS_SOURCE_ROOT', previousSourceRoot);
    else delete process.env.HARNESS_SOURCE_ROOT;
  }
}

test('production selectors require an explicit fixture bridge before any legacy dependency', async () => {
  const before = await fixtureSnapshot();
  const tempRoot = await copyFixtureRoot('fresh-empty');
  try {
    await withRuntimeSelector('trio', async () => {
      await assert.rejects(
        install([], { rootDir: path.join(tempRoot, 'fresh-empty') }),
        (error) => error?.code === 'ERR_TRIO_RUNTIME_SELECTOR'
      );
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('production no-state defaults to Trio and uses one scope-aware environment for lifecycle commands', async () => {
  const roots = await createProductionRoots('fresh');
  try {
    const options = { rootDir: roots.rootDir, homeDir: roots.homeDir };
    await install([], options);

    const rootReal = await realpath(roots.rootDir);
    const stateFile = path.join(rootReal, '.harness', 'state.json');
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    const destinations = codexDestinations(rootReal, 'workspace');
    assert.equal(state.schemaVersion, 2);
    assert.equal(state.runtime, 'trio');
    assert.equal(state.scope.kind, 'workspace');
    await assertExactSettledOwnership(state, destinations);
    await assert.rejects(access(path.join(rootReal, '.harness', 'projections.json')), /ENOENT/);

    const dryRun = await sync(['--dry-run'], options);
    assert.equal(dryRun.runtime, 'trio');
    assert.equal(dryRun.mode, 'dry-run');
    await sync(['--check'], options);
    const apply = await sync([], options);
    assert.equal(apply.runtime, 'trio');
    assert.equal(apply.mode, 'apply');

    const doctorReport = await doctor(['--check-only'], options);
    assert.equal(doctorReport.runtime, 'trio');
    const verifyReport = await verify(['--output=stdout'], options);
    assert.equal(verifyReport.runtime, 'trio');
  } finally {
    await rm(roots.sandbox, { recursive: true, force: true });
  }
});

test('Trio projection passes externally captured target and parent conditions to every publication', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  try {
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    const destinations = codexDestinations(path.join(fixture.fixtureRoot, 'home'));
    await mkdir(path.dirname(destinations[0]), { recursive: true });
    await writeFile(destinations[0], 'legacy managed destination\n');
    await Promise.all(destinations.slice(1).map((destination) => mkdir(path.dirname(destination), { recursive: true })));

    const beforeByPath = new Map();
    for (const targetPath of [...destinations, fixture.stateFile]) {
      let target = null;
      try {
        target = await captureRegularFile(targetPath);
      } catch (error) {
        assert.equal(error?.code, 'ENOENT');
      }
      beforeByPath.set(targetPath, Object.freeze({
        target,
        parent: await captureDirectoryIdentity(path.dirname(targetPath))
      }));
    }

    const observed = [];
    const writeText = async (targetPath, contents, options) => {
      const captured = { targetPath, options: { expectedSha256: options.expectedSha256 } };
      if (Object.hasOwn(options, 'expectedTargetIdentity')) {
        captured.options.expectedTargetIdentity = { ...options.expectedTargetIdentity };
      }
      if (Object.hasOwn(options, 'expectedParentIdentity')) {
        captured.options.expectedParentIdentity = { ...options.expectedParentIdentity };
      }
      captured.parentAtPublication = await captureDirectoryIdentity(path.dirname(targetPath));
      observed.push(captured);
      return atomicWriteText(targetPath, contents, options);
    };

    await applyTrioProjection({
      fixture,
      config,
      legacyOwnershipByPath: legacyOwnershipForConfig(config),
      writeText
    });

    assert.deepEqual(
      observed.map((entry) => entry.targetPath).sort(),
      [...beforeByPath.keys()].sort()
    );
    for (const { targetPath, options, parentAtPublication } of observed) {
      const prior = beforeByPath.get(targetPath);
      assert.equal(Object.hasOwn(options, 'expectedSha256'), true, targetPath);
      assert.deepEqual(options.expectedParentIdentity, parentAtPublication, targetPath);
      assert.equal(options.expectedParentIdentity.dev, prior.parent.dev, targetPath);
      assert.equal(options.expectedParentIdentity.ino, prior.parent.ino, targetPath);
      if (prior.target) {
        assert.equal(options.expectedSha256, sha256(prior.target.bytes), targetPath);
        assert.deepEqual(options.expectedTargetIdentity, {
          dev: prior.target.dev,
          ino: prior.target.ino,
          nlink: prior.target.nlink
        }, targetPath);
      } else {
        assert.equal(options.expectedSha256, null, targetPath);
        assert.equal(Object.hasOwn(options, 'expectedTargetIdentity'), false, targetPath);
      }
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('concurrent production installs serialize and re-probe state inside the authority publication lock', async () => {
  const roots = await createProductionRoots('concurrent-install');
  try {
    const options = { rootDir: roots.rootDir, homeDir: roots.homeDir };
    const results = await Promise.allSettled([install([], options), install([], options)]);
    assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'fulfilled']);
    const modes = results.map((result) => result.value.mode).sort();
    assert.deepEqual(modes, ['fresh', 'reinstall']);

    const rootReal = await realpath(roots.rootDir);
    const state = JSON.parse(await readFile(path.join(rootReal, '.harness', 'state.json'), 'utf8'));
    await assertExactSettledOwnership(state, codexDestinations(rootReal, 'workspace'));
  } finally {
    await rm(roots.sandbox, { recursive: true, force: true });
  }
});

test('a residual publication lock makes actual production install time out before any state or target mutation', async () => {
  const roots = await createProductionRoots('residual-install-lock');
  let lockPath;
  try {
    const before = {
      authority: await fileTree(roots.rootDir),
      home: await fileTree(roots.homeDir)
    };
    lockPath = (await abandonPublicationLock(roots.rootDir)).path;
    await assert.rejects(
      () => install([], { rootDir: roots.rootDir, homeDir: roots.homeDir }),
      (error) => error?.code === 'ERR_TRIO_LOCK_TIMEOUT'
    );
    assert.deepEqual(await fileTree(roots.rootDir), before.authority);
    assert.deepEqual(await fileTree(roots.homeDir), before.home);
  } finally {
    if (lockPath) await rm(lockPath, { recursive: true, force: true });
    await rm(roots.sandbox, { recursive: true, force: true });
  }
});

test('a persisted V1 fixture requires explicit upgrade and never falls through to fresh Trio overwrite', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  try {
    const statePath = path.join(fixtureRoot, '.harness', 'state.json');
    const manifestPath = path.join(fixtureRoot, '.harness', 'projections.json');
    const beforeState = await captureRegularFile(statePath);
    const beforeManifest = await captureRegularFile(manifestPath);
    await withRuntimeSelector('trio', async () => {
      await assert.rejects(
        () => install(['--fixture-root', fixtureRoot]),
        (error) => error?.code === 'ERR_TRIO_UPGRADE_REQUIRED'
      );
    });
    assertSameRegularFile(await captureRegularFile(statePath), beforeState);
    assertSameRegularFile(await captureRegularFile(manifestPath), beforeManifest);
    await assert.rejects(access(path.join(fixtureRoot, 'workspace', 'AGENTS.md')), /ENOENT/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('production V2 reinstall preserves recovery and ownership while refusing user-owned drift', async () => {
  const roots = await createProductionRoots('v2-reinstall');
  try {
    const options = { rootDir: roots.rootDir, homeDir: roots.homeDir };
    await install([], options);
    const statePath = path.join(roots.rootDir, '.harness', 'state.json');
    const configured = JSON.parse(await readFile(statePath, 'utf8'));
    configured.recovery = {
      checkpointRef: 'checkpoint-v2-reinstall',
      rollbackRef: 'rollback-v2-reinstall'
    };
    await atomicWriteText(statePath, `${JSON.stringify(configured, null, 2)}\n`);

    const outcome = await install([], options);
    assert.equal(outcome.mode, 'reinstall');
    const settled = JSON.parse(await readFile(statePath, 'utf8'));
    assert.deepEqual(settled.recovery, configured.recovery);
    await assertExactSettledOwnership(settled, codexDestinations(await realpath(roots.rootDir), 'workspace'));

    const entryPath = path.join(await realpath(roots.rootDir), 'AGENTS.md');
    await writeFile(entryPath, 'user-owned drift\n');
    const stateBeforeDrift = await readFile(statePath);
    await assert.rejects(
      () => install([], options),
      (error) => error?.code === 'ERR_TRIO_CONFLICT'
    );
    assert.equal(await readFile(entryPath, 'utf8'), 'user-owned drift\n');
    assert.deepEqual(await readFile(statePath), stateBeforeDrift);
  } finally {
    await rm(roots.sandbox, { recursive: true, force: true });
  }
});

test('production projection settles zero, single-scope, and both-scope managed surface cardinalities', async () => {
  const cases = [
    { label: 'zero', scopeKind: 'workspace', includeCodex: false, count: 0 },
    { label: 'single-scope', scopeKind: 'workspace', includeCodex: true, count: PROJECTION_SURFACES.length },
    { label: 'both-scopes', scopeKind: 'both', includeCodex: true, count: PROJECTION_SURFACES.length * 2 }
  ];
  for (const item of cases) {
    const roots = await createProductionRoots(`cardinality-${item.label}`);
    try {
      const environment = await resolveTrioProductionEnvironment({
        rootDir: roots.rootDir,
        homeDir: roots.homeDir
      });
      const result = await applyTrioProjection({
        environment,
        config: productionTrioConfig(environment, item.scopeKind, { includeCodex: item.includeCodex })
      });
      assert.equal(result.writes.length, item.count, item.label);
      const persisted = JSON.parse(await readFile(environment.stateFile, 'utf8'));
      assert.equal(persisted.ownership.entries.length, item.count, item.label);
      const workspaceDestinations = codexDestinations(environment.authorityRoot, 'workspace');
      const homeDestinations = codexDestinations(environment.homeDir, 'user-global');
      if (item.count === 0) {
        await assertAbsentTrioMaterialization([...workspaceDestinations, ...homeDestinations]);
        await assertExactSettledOwnership(persisted, []);
      } else if (item.count === PROJECTION_SURFACES.length) {
        await assertExactTrioMaterialization(workspaceDestinations);
        await assertAbsentTrioMaterialization(homeDestinations);
        await assertExactSettledOwnership(persisted, workspaceDestinations);
      } else {
        const destinations = [...workspaceDestinations, ...homeDestinations];
        await assertExactTrioMaterialization(workspaceDestinations);
        await assertExactTrioMaterialization(homeDestinations);
        await assertExactSettledOwnership(persisted, destinations);
      }
    } finally {
      await rm(roots.sandbox, { recursive: true, force: true });
    }
  }
});

test('production doctor and verify fail closed on a missing managed projection', async () => {
  await assertProductionDiagnosticFailure({
    label: 'missing',
    expectedCode: 'ERR_TRIO_CHECK',
    mutate: async ({ entryPath }) => {
      await rm(entryPath);
    },
    assertAfter: async ({ entryPath }) => {
      await assert.rejects(access(entryPath), /ENOENT/);
    }
  });
});

test('production doctor and verify fail closed on user content drift', async () => {
  await assertProductionDiagnosticFailure({
    label: 'content-drift',
    expectedCode: 'ERR_TRIO_CHECK',
    mutate: async ({ entryPath }) => {
      await writeFile(entryPath, 'user content drift\n');
    },
    assertAfter: async ({ entryPath }) => {
      assert.equal(await readFile(entryPath, 'utf8'), 'user content drift\n');
    }
  });
});

test('production doctor and verify fail closed on ownership evidence drift', async () => {
  await assertProductionDiagnosticFailure({
    label: 'ownership-drift',
    expectedCode: 'ERR_TRIO_CHECK',
    mutate: async ({ statePath }) => {
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      state.ownership.entries[0].identity = contentIdentity(Buffer.from('untrusted ownership evidence\n'));
      await atomicWriteText(statePath, `${JSON.stringify(state, null, 2)}\n`);
    },
    assertAfter: async ({ entryPath }) => {
      assert.match(await readFile(entryPath, 'utf8'), /name: trio-v2-entry/);
    }
  });
});

test('production doctor and verify preserve physical-gate failure for a symlinked projection', async () => {
  await assertProductionDiagnosticFailure({
    label: 'physical-gate',
    expectedCode: 'ERR_TRIO_PHYSICAL_GATE',
    mutate: async ({ roots, entryPath }) => {
      const outside = path.join(roots.sandbox, 'outside-entry.md');
      await writeFile(outside, 'outside physical sentinel\n');
      await rm(entryPath);
      await symlink(outside, entryPath);
    },
    assertAfter: async ({ roots, entryPath }) => {
      assert.equal(await readFile(path.join(roots.sandbox, 'outside-entry.md'), 'utf8'), 'outside physical sentinel\n');
      assert.equal((await lstat(entryPath)).isSymbolicLink(), true);
    }
  });
});

test('Trio apply preserves a foreign create after an absent precondition and reports incomplete rollback honestly', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  try {
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    const destinations = codexDestinations(path.join(fixture.fixtureRoot, 'home'));
    const entryPath = destinations[0];
    const foreignBytes = Buffer.from('foreign create after absent probe\n');
    const originalState = await readFile(fixture.stateFile);
    let foreign;
    let injected = false;
    const writeText = async (targetPath, contents, options) => {
      if (!injected && targetPath === entryPath) {
        injected = true;
        await writeFile(targetPath, foreignBytes);
        foreign = await captureRegularFile(targetPath);
      }
      return atomicWriteText(targetPath, contents, options);
    };

    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        writeText
      }),
      (error) => error?.code === 'ERR_TRIO_ROLLBACK' && error?.cause?.code === 'ERR_TRIO_CREATE_CONFLICT'
    );

    assert.equal(injected, true);
    assertSameRegularFile(await captureRegularFile(entryPath), foreign);
    assert.deepEqual(await readFile(entryPath), foreignBytes);
    assert.deepEqual(await readFile(fixture.stateFile), originalState);
    for (const destination of destinations.slice(1)) {
      await assert.rejects(access(destination), /ENOENT/);
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('production install retains foreign V1 state injected immediately after its lock-held absent probe', async () => {
  const result = await runInstallFaultProbe('state-race', productionStateRaceProbeSource({
    installUrl: new URL('../../harness/installer/commands/install.mjs', import.meta.url).href,
    stateUrl: new URL('../../harness/installer/lib/state.mjs', import.meta.url).href,
    storeUrl: new URL('../../harness/trio/core/store.mjs', import.meta.url).href
  }));
  assert.match(result.stdout, /SWF_TRIO_FAULT_PROBE:state-race/);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
});

test('Trio apply consumes a thrown Core publication receipt and compensates its proven identity', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  try {
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    const destinations = codexDestinations(path.join(fixture.fixtureRoot, 'home'));
    const entryPath = destinations[0];
    const originalEntry = Buffer.from('original entry before published receipt\n');
    const originalState = await readFile(fixture.stateFile);
    await mkdir(path.dirname(entryPath), { recursive: true });
    await writeFile(entryPath, originalEntry);
    let injected = false;
    let receipt;
    const writeText = async (targetPath, contents, options) => {
      const publication = await atomicWriteText(targetPath, contents, options);
      if (!injected && targetPath === entryPath) {
        injected = true;
        receipt = publication;
        const error = new Error('injected failure after real Core publication');
        error.code = 'ERR_TEST_THROWN_PUBLICATION_RECEIPT';
        error.publication = publication;
        throw error;
      }
      return publication;
    };

    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        writeText
      }),
      (error) => error?.code === 'ERR_TEST_THROWN_PUBLICATION_RECEIPT'
    );

    assert.equal(injected, true);
    assert.deepEqual(receipt?.path, entryPath);
    assert.deepEqual(await readFile(entryPath), originalEntry);
    assert.deepEqual(await readFile(fixture.stateFile), originalState);
    for (const destination of destinations.slice(1)) {
      await assert.rejects(access(destination), /ENOENT/);
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio compensation preserves a stable parent replacement encountered after a proven publication', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-post-publication-parent-outside-'));
  try {
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    const destinations = codexDestinations(path.join(fixture.fixtureRoot, 'home'));
    const entryPath = destinations[0];
    const parent = path.dirname(entryPath);
    const displacedParent = `${parent}-published`;
    const displacedEntry = path.join(displacedParent, path.basename(entryPath));
    const replacementBytes = Buffer.from('foreign replacement after publication\n');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    const originalState = await readFile(fixture.stateFile);
    await mkdir(parent, { recursive: true });
    await Promise.all([
      writeFile(entryPath, 'entry before publication\n'),
      writeFile(outsideSentinel, 'outside post-publication sentinel\n')
    ]);
    let replacement;
    let published;
    let replaced = false;
    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        beforeWrite: async ({ targetPath }) => {
          if (replaced || targetPath === entryPath) return;
          replaced = true;
          await rename(parent, displacedParent);
          published = await captureRegularFile(displacedEntry);
          await mkdir(parent);
          await writeFile(entryPath, replacementBytes);
          replacement = await captureRegularFile(entryPath);
          const error = new Error('injected later failure after stable parent replacement');
          error.code = 'ERR_TEST_POST_PUBLICATION_PARENT_REPLACEMENT';
          throw error;
        }
      }),
      (error) => {
        assert.equal(error?.code, 'ERR_TRIO_ROLLBACK');
        assert.equal(error?.cause?.code, 'ERR_TEST_POST_PUBLICATION_PARENT_REPLACEMENT');
        assert.ok(error.errors?.some((entry) => entry?.code === 'ERR_TRIO_ROLLBACK'));
        return true;
      }
    );

    assert.equal(replaced, true);
    assertSameRegularFile(await captureRegularFile(displacedEntry), published);
    assertSameRegularFile(await captureRegularFile(entryPath), replacement);
    assert.deepEqual(await readFile(entryPath), replacementBytes);
    assert.equal(await readFile(outsideSentinel, 'utf8'), 'outside post-publication sentinel\n');
    assert.deepEqual(await readFile(fixture.stateFile), originalState);
    for (const destination of destinations.slice(1)) {
      await assert.rejects(access(destination), /ENOENT/);
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('Trio apply preserves a stable real parent replacement with zero later target or state mutation', async () => {
  const before = await fixtureSnapshot();
  const fixtureRoot = await stageV1Fixture('upgrade-v1-standard');
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-stable-parent-outside-'));
  try {
    const fixture = await resolveTrioFixture({ fixtureRoot });
    const config = await rebaseStandardCommandConfig(fixtureRoot);
    const destinations = codexDestinations(path.join(fixture.fixtureRoot, 'home'));
    const entryPath = destinations[0];
    const parent = path.dirname(entryPath);
    const displacedParent = `${parent}-displaced`;
    const displacedEntry = path.join(displacedParent, path.basename(entryPath));
    const oldBytes = Buffer.from('old stable parent entry\n');
    const replacementBytes = Buffer.from('replacement stable parent entry\n');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    const originalState = await readFile(fixture.stateFile);
    await mkdir(parent, { recursive: true });
    await Promise.all([
      writeFile(entryPath, oldBytes),
      writeFile(outsideSentinel, 'outside sentinel bytes\n')
    ]);
    const originalEntry = await captureRegularFile(entryPath);
    let replacementEntry;
    let injected = false;
    const writeText = async (targetPath, contents, options) => {
      if (!injected && targetPath === entryPath) {
        injected = true;
        await rename(parent, displacedParent);
        await mkdir(parent);
        await writeFile(entryPath, replacementBytes);
        replacementEntry = await captureRegularFile(entryPath);
      }
      return atomicWriteText(targetPath, contents, options);
    };

    await assert.rejects(
      applyTrioProjection({
        fixture,
        config,
        legacyOwnershipByPath: legacyOwnershipForConfig(config),
        writeText
      }),
      (error) => error?.code === 'ERR_TRIO_ROLLBACK' && error?.cause?.code === 'ERR_TRIO_PARENT_IDENTITY'
    );

    assert.equal(injected, true);
    assertSameRegularFile(await captureRegularFile(displacedEntry), originalEntry);
    assertSameRegularFile(await captureRegularFile(entryPath), replacementEntry);
    assert.deepEqual(await readFile(entryPath), replacementBytes);
    assert.equal(await readFile(outsideSentinel, 'utf8'), 'outside sentinel bytes\n');
    assert.deepEqual(await readFile(fixture.stateFile), originalState);
    for (const destination of destinations.slice(1)) {
      await assert.rejects(access(destination), /ENOENT/);
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
  assert.deepEqual(await fixtureSnapshot(), before);
});

test('production V1 stays legacy until explicit checkpointed upgrade, then uses the V2 lifecycle', async () => {
  const roots = await stageProductionV1Fixture();
  try {
    const options = { rootDir: roots.rootDir, homeDir: roots.homeDir };
    const stateFile = path.join(roots.rootDir, '.harness', 'state.json');
    const originalState = await readFile(stateFile);
    const originalManifest = await readFile(path.join(roots.rootDir, '.harness', 'projections.json'));
    const codexEntry = path.join(roots.homeDir, '.codex', 'AGENTS.md');
    await mkdir(path.dirname(codexEntry), { recursive: true });
    await writeFile(codexEntry, 'legacy managed destination\n');

    await assert.rejects(install([], options));
    assert.deepEqual(await readFile(stateFile), originalState);

    await install(['--upgrade', '--recovery', path.join(roots.rootDir, 'recovery.json')], options);
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    const destinations = codexDestinations(await realpath(roots.homeDir));
    assert.equal(state.schemaVersion, 2);
    assert.equal(state.runtime, 'trio');
    await assertExactSettledOwnership(state, destinations);
    assert.deepEqual(await readFile(path.join(roots.rootDir, '.harness', 'projections.json')), originalManifest);

    const dryRun = await sync(['--dry-run'], options);
    assert.equal(dryRun.runtime, 'trio');
    await sync(['--check'], options);
    const apply = await sync([], options);
    assert.equal(apply.mode, 'apply');
    assert.equal((await doctor(['--check-only'], options)).runtime, 'trio');
    assert.equal((await verify(['--output=stdout'], options)).runtime, 'trio');
  } finally {
    await rm(roots.sandbox, { recursive: true, force: true });
  }
});

test('production V1 upgrade rejects a hard-linked recovery before state or destination writes', async () => {
  const roots = await stageProductionV1Fixture();
  try {
    const options = { rootDir: roots.rootDir, homeDir: roots.homeDir };
    const stateFile = path.join(roots.rootDir, '.harness', 'state.json');
    const recoveryPath = path.join(roots.rootDir, 'recovery.json');
    const outsideRecovery = path.join(roots.sandbox, 'outside-recovery.json');
    const stateBefore = await readFile(stateFile);
    const recoveryBytes = await readFile(recoveryPath);
    await writeFile(outsideRecovery, recoveryBytes);
    await rm(recoveryPath);
    await link(outsideRecovery, recoveryPath);

    await assert.rejects(
      install(['--upgrade', '--recovery', recoveryPath], options),
      (error) => error?.code === 'ERR_TRIO_PHYSICAL_GATE'
    );
    assert.deepEqual(await readFile(stateFile), stateBefore);
    assert.equal(await readFile(outsideRecovery, 'utf8'), recoveryBytes.toString('utf8'));
    assert.equal((await lstat(recoveryPath)).nlink, 2);
    await assert.rejects(access(path.join(roots.homeDir, '.agents')), /ENOENT/);
  } finally {
    await rm(roots.sandbox, { recursive: true, force: true });
  }
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
    assert.match(await readFile(codexEntry, 'utf8'), /name: trio-v2-entry/);
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
      const pollutedCheck = await runLegacyCheck('legacy');
      assert.equal(pollutedCheck.code, 'ERR_TRIO_RUNTIME_SELECTOR');
      assert.equal(pollutedCheck.output, '');

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
      const publication = await atomicWriteText(targetPath, contents, options);
      if (!injected && targetPath === trioSkill) {
        injected = true;
        postPublish = await captureRegularFile(targetPath);
        const error = new Error('injected post-publish target failure');
        error.code = 'ERR_TEST_POST_TARGET_PUBLISH';
        throw error;
      }
      return publication;
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
      const publication = await atomicWriteText(targetPath, contents, options);
      if (!injected && targetPath === fixture.stateFile) {
        injected = true;
        postPublish = await captureRegularFile(targetPath);
        const error = new Error('injected post-publish state failure');
        error.code = 'ERR_TEST_POST_STATE_PUBLISH';
        throw error;
      }
      return publication;
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

test('production selector pollution rejects help before output', async () => {
  const commands = [
    () => install(['--help']),
    () => sync(['--help']),
    () => doctor(['--help']),
    () => verify(['--help'])
  ];
  for (const selector of ['legacy', 'trio', '']) {
    await withRuntimeSelector(selector, async () => {
      for (const invoke of commands) {
        let error;
        const output = await captureCommandOutput(async () => {
          try {
            await invoke();
          } catch (caught) {
            error = caught;
          }
        });
        assert.equal(error?.code, 'ERR_TRIO_RUNTIME_SELECTOR');
        assert.equal(output, '');
      }
    });
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
    assert.equal(projected.descriptors.length, PROJECTION_SURFACES.length);
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
    assert.equal(projected.descriptors.length, PROJECTION_SURFACES.length * 2);
    assert.equal(projected.descriptors.filter((descriptor) => descriptor.targetId === 'codex').length, PROJECTION_SURFACES.length);
    const codexEntry = projected.descriptors.find((descriptor) =>
      descriptor.targetId === 'codex' && descriptor.surface === 'entry'
    );
    assert.equal(codexEntry.action, 'update');
    assert.equal(codexEntry.identity, migratedCodexEntry.identity);
    assert.deepEqual(
      projected.descriptors
        .filter((descriptor) => descriptor.targetId === 'codex' && descriptor.surface !== 'entry')
        .map((descriptor) => [descriptor.action, descriptor.execution]),
      Array.from({ length: PROJECTION_SURFACES.length - 1 }, () => ['create', 'managed'])
    );
    assert.deepEqual(
      projected.descriptors
        .filter((descriptor) => descriptor.targetId === 'cursor')
        .map((descriptor) => [descriptor.action, descriptor.execution]),
      Array.from({ length: PROJECTION_SURFACES.length }, () => ['create', 'manual'])
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

async function materializeTrioSourceBytes(destinations) {
  return Promise.all(destinations.map(async (destination, index) => {
    await mkdir(path.dirname(destination), { recursive: true });
    const bytes = await readFile(path.join(REPO_ROOT, TRIO_MANAGED_SOURCE_PATHS[index]));
    await writeFile(destination, bytes);
    return bytes;
  }));
}

async function writeTrioStateFile(environment, state) {
  await mkdir(path.dirname(environment.stateFile), { recursive: true });
  await atomicWriteText(environment.stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

async function stageExistingV2UserGlobal(label, { generic = true } = {}) {
  const roots = await createProductionRoots(label);
  const environment = await resolveTrioProductionEnvironment({
    rootDir: roots.rootDir,
    homeDir: roots.homeDir
  });
  const staged = await stageExistingV2UserGlobalAt(roots, environment, { generic });
  return Object.freeze({
    roots,
    environment,
    ...staged,
    options: { rootDir: roots.rootDir, homeDir: roots.homeDir }
  });
}

async function assertTakeoverBackupVerified({ staged, backup, stateBefore }) {
  const manifest = JSON.parse(await readFile(backup.manifestPath, 'utf8'));
  assert.equal(manifest.kind, 'trio-takeover-backup');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.id, path.basename(backup.root));
  assert.deepEqual(manifest.objects.map((object) => object.surface), [...PROJECTION_SURFACES.map((surface) => surface.id), 'state']);
  assert.equal(manifest.objects.length, PROJECTION_SURFACES.length + 1);
  assert.equal(manifest.ownership.source, 'existing-v2-user-global');
  assert.equal(manifest.ownership.manifestRef, null);
  assert.deepEqual(manifest.ownership.entries, stateBefore.ownership.entries);
  assert.equal(manifest.recovery.checkpointRef, 'checkpoint-existing-v2');
  assert.equal(manifest.recovery.rollbackRef, 'rollback-existing-v2');
  assert.equal(typeof manifest.createdAt, 'string');
  assert.equal(typeof manifest.bundleSha256, 'string');

  const bundle = await readFile(backup.bundlePath);
  const expectedBytes = new Map([
    ...staged.owned.map((destination, index) => [
      destination,
      staged.liveBytes.get(destination)
    ]),
    [staged.chiefopsDestination, staged.chiefopsDrifted],
    [staged.environment.stateFile, staged.stateBytes]
  ]);
  let cursor = 0;
  for (const object of manifest.objects) {
    assert.equal(object.offset, cursor);
    const slice = bundle.subarray(object.offset, object.offset + object.length);
    if (!object.exists) {
      assert.equal(expectedBytes.has(object.path), false);
      assert.equal(object.length, 0);
      assert.equal(object.sha256, null);
      assert.equal(object.dev, null);
      assert.equal(object.ino, null);
      assert.equal(object.nlink, null);
      assert.ok(path.isAbsolute(object.parentPath));
      continue;
    }
    assert.equal(sha256(slice), object.sha256.slice('sha256:'.length));
    assert.deepEqual(slice, expectedBytes.get(object.path));
    assert.equal(typeof object.dev, 'string');
    assert.equal(typeof object.ino, 'string');
    assert.equal(object.nlink, '1');
    assert.equal(typeof object.parent.dev, 'string');
    assert.equal(typeof object.parent.ino, 'string');
    cursor = object.offset + object.length;
  }
  assert.equal(cursor, bundle.length);
}

test('production install --takeover-chiefops adopts one unowned global ChiefOps with a verified complete-inventory backup', async () => {
  const staged = await stageExistingV2UserGlobal('takeover-success');
  try {
    const { environment, destinations, owned, options } = staged;
    const stateBefore = JSON.parse(await readFile(environment.stateFile, 'utf8'));
    const outcome = await install(['--takeover-chiefops'], options);

    assert.equal(outcome.mode, 'takeover-chiefops');
    assert.deepEqual([...outcome.writes].sort(), [...destinations].sort());
    assert.match(outcome.backup.ref, /^trio-backup-v1:/u);
    const parsedRollbackRef = parseTrioBackupV1Ref(outcome.backup.ref);
    assert.equal(parsedRollbackRef.manifestPath, outcome.backup.manifestPath);
    assert.equal(parsedRollbackRef.digest, sha256(await readFile(outcome.backup.manifestPath)));
    assert.equal(outcome.backup.manifestPath, path.join(outcome.backup.root, 'manifest.json'));
    assert.equal(
      path.dirname(outcome.backup.root),
      path.join(environment.authorityRoot, '.harness-backup', 'trio-takeover')
    );

    const settled = JSON.parse(await readFile(environment.stateFile, 'utf8'));
    assert.equal(settled.ownership.source, 'existing-v2-user-global');
    assert.equal(settled.ownership.manifestRef, null);
    assert.equal(settled.recovery.checkpointRef, 'checkpoint-existing-v2');
    assert.equal(settled.recovery.rollbackRef, outcome.backup.ref);
    await assertExactSettledOwnership(settled, destinations);
    await assertExactTrioMaterialization(destinations);

    const genericEntry = path.join(environment.homeDir, 'manual', 'copilot', 'entry-policy.md');
    await assert.rejects(access(genericEntry), /ENOENT/);

    await assertTakeoverBackupVerified({ staged, backup: outcome.backup, stateBefore });

    const dryRun = await sync(['--dry-run'], options);
    assertNoManagedConflicts(dryRun, destinations);
    await sync(['--check'], options);
    const doctorReport = await doctor(['--check-only'], options);
    assert.equal(doctorReport.runtime, 'trio');

    assert.deepEqual(
      await Promise.all(owned.map((destination) => readFile(destination))),
      await Promise.all(owned.map((destination) => staged.liveBytes.get(destination)))
    );
  } finally {
    await rm(staged.roots.sandbox, { recursive: true, force: true });
  }
});

async function stageExistingV2UserGlobalAt(roots, environment, { chiefopsPresent = true, generic = false } = {}) {
  const destinations = codexDestinations(environment.homeDir, 'user-global');
  const owned = destinations.slice(0, 5);
  await materializeTrioSourceBytes(owned);
  const chiefopsDestination = destinations[5];
  await mkdir(path.dirname(chiefopsDestination), { recursive: true });
  const chiefopsDrifted = Buffer.from('legacy unowned global ChiefOps content\n', 'utf8');
  if (chiefopsPresent) {
    await writeFile(chiefopsDestination, chiefopsDrifted);
  }

  const targets = [{
    id: 'codex',
    enabled: true,
    paths: [path.join(environment.homeDir, '.codex', 'AGENTS.md')],
    hostKind: 'codex',
    mode: 'managed'
  }];
  if (generic) {
    targets.push({
      id: 'copilot',
      enabled: true,
      paths: [path.join(environment.homeDir, 'manual', 'copilot', 'entry-policy.md')],
      hostKind: 'generic',
      mode: 'manual'
    });
  }
  const ownershipEntries = await Promise.all(owned.map(async (destination) => ({
    targetId: 'codex',
    path: destination,
    identity: contentIdentity(await readFile(destination))
  })));
  const state = parseV2Config({
    schemaVersion: 2,
    runtime: 'trio',
    scope: { kind: 'user-global' },
    targets,
    ownership: {
      source: 'existing-v2-user-global',
      manifestRef: null,
      entries: ownershipEntries
    },
    recovery: {
      checkpointRef: 'checkpoint-existing-v2',
      rollbackRef: 'rollback-existing-v2'
    }
  });
  const stateBytes = Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await writeTrioStateFile(environment, state);
  const liveBytes = new Map(await Promise.all(
    [...destinations.slice(0, SURFACES.length)]
      .filter((destination) => destination !== chiefopsDestination || chiefopsPresent)
      .map(async (destination) => [destination, await readFile(destination)])
  ));
  return Object.freeze({
    roots,
    environment,
    destinations,
    owned,
    chiefopsDestination,
    chiefopsDrifted,
    state,
    stateBytes,
    liveBytes
  });
}

async function runTakeoverRejection(label, setup, expectedCode) {
  const roots = await createProductionRoots(`takeover-reject-${label}`);
  try {
    const options = { rootDir: roots.rootDir, homeDir: roots.homeDir };
    await setup({ roots, options });
    const statePath = path.join(roots.rootDir, '.harness', 'state.json');
    const stateBytes = await readFile(statePath).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    await assert.rejects(
      () => install(['--takeover-chiefops'], options),
      (error) => error?.code === expectedCode,
      label
    );
    if (stateBytes !== null) {
      assert.deepEqual(await readFile(statePath), stateBytes, label);
    }
    await assert.rejects(
      access(path.join(roots.rootDir, '.harness-backup')),
      (error) => error?.code === 'ENOENT',
      label
    );
  } finally {
    await rm(roots.sandbox, { recursive: true, force: true });
  }
}

test('production install --takeover-chiefops rejects ineligible or unsafe states before any write', async () => {
  await runTakeoverRejection('absent', async () => {}, 'ERR_TRIO_TAKEOVER');

  await runTakeoverRejection('v1', async ({ roots }) => {
    const sourceRoot = path.join(FIXTURE_ROOT, 'upgrade-v1-standard');
    await mkdir(path.join(roots.rootDir, '.harness'), { recursive: true });
    await writeFile(
      path.join(roots.rootDir, '.harness', 'state.json'),
      await readFile(path.join(sourceRoot, 'state.json'))
    );
  }, 'ERR_TRIO_UPGRADE_REQUIRED');

  await runTakeoverRejection('workspace-scope', async ({ options }) => {
    await install([], options);
  }, 'ERR_TRIO_TAKEOVER');

  await runTakeoverRejection('both-scope', async ({ roots }) => {
    const environment = await resolveTrioProductionEnvironment({
      rootDir: roots.rootDir,
      homeDir: roots.homeDir
    });
    const state = parseV2Config({
      schemaVersion: 2,
      runtime: 'trio',
      scope: { kind: 'both' },
      targets: [{
        id: 'codex',
        enabled: true,
        paths: [
          path.join(environment.authorityRoot, 'AGENTS.md'),
          path.join(environment.homeDir, '.codex', 'AGENTS.md')
        ],
        hostKind: 'codex',
        mode: 'managed'
      }],
      ownership: { source: 'test', manifestRef: null, entries: [] },
      recovery: { checkpointRef: null, rollbackRef: null }
    });
    await writeTrioStateFile(environment, state);
  }, 'ERR_TRIO_TAKEOVER');

  await runTakeoverRejection('no-codex-target', async ({ roots }) => {
    const environment = await resolveTrioProductionEnvironment({
      rootDir: roots.rootDir,
      homeDir: roots.homeDir
    });
    const state = parseV2Config({
      schemaVersion: 2,
      runtime: 'trio',
      scope: { kind: 'user-global' },
      targets: [{
        id: 'copilot',
        enabled: true,
        paths: [path.join(environment.homeDir, 'manual', 'copilot', 'entry-policy.md')],
        hostKind: 'generic',
        mode: 'manual'
      }],
      ownership: { source: 'test', manifestRef: null, entries: [] },
      recovery: { checkpointRef: null, rollbackRef: null }
    });
    await writeTrioStateFile(environment, state);
  }, 'ERR_TRIO_TAKEOVER');

  await runTakeoverRejection('wrong-entry-path', async ({ roots }) => {
    const environment = await resolveTrioProductionEnvironment({
      rootDir: roots.rootDir,
      homeDir: roots.homeDir
    });
    const state = parseV2Config({
      schemaVersion: 2,
      runtime: 'trio',
      scope: { kind: 'user-global' },
      targets: [{
        id: 'codex',
        enabled: true,
        paths: [path.join(environment.homeDir, 'AGENTS.md')],
        hostKind: 'codex',
        mode: 'managed'
      }],
      ownership: { source: 'test', manifestRef: null, entries: [] },
      recovery: { checkpointRef: null, rollbackRef: null }
    });
    await writeTrioStateFile(environment, state);
  }, 'ERR_TRIO_TAKEOVER');

  await runTakeoverRejection('chiefops-absent', async ({ roots }) => {
    const environment = await resolveTrioProductionEnvironment({
      rootDir: roots.rootDir,
      homeDir: roots.homeDir
    });
    await stageExistingV2UserGlobalAt(roots, environment, { chiefopsPresent: false });
  }, 'ERR_TRIO_TAKEOVER');

  await runTakeoverRejection('chiefops-owned', async ({ roots }) => {
    const environment = await resolveTrioProductionEnvironment({
      rootDir: roots.rootDir,
      homeDir: roots.homeDir
    });
    const staged = await stageExistingV2UserGlobalAt(roots, environment);
    const state = JSON.parse(await readFile(environment.stateFile, 'utf8'));
    state.ownership.entries.push({
      targetId: 'codex',
      path: staged.chiefopsDestination,
      identity: contentIdentity(staged.chiefopsDrifted)
    });
    await writeTrioStateFile(environment, parseV2Config(state));
  }, 'ERR_TRIO_TAKEOVER');

  await runTakeoverRejection('owned-five-mismatch', async ({ roots }) => {
    const environment = await resolveTrioProductionEnvironment({
      rootDir: roots.rootDir,
      homeDir: roots.homeDir
    });
    const staged = await stageExistingV2UserGlobalAt(roots, environment);
    await writeFile(staged.owned[0], 'user-owned drift in the entry surface\n');
  }, 'ERR_TRIO_TAKEOVER');

  await runTakeoverRejection('extra-ownership', async ({ roots }) => {
    const environment = await resolveTrioProductionEnvironment({
      rootDir: roots.rootDir,
      homeDir: roots.homeDir
    });
    const staged = await stageExistingV2UserGlobalAt(roots, environment, { generic: true });
    const state = JSON.parse(await readFile(environment.stateFile, 'utf8'));
    state.ownership.entries.push({
      targetId: 'copilot',
      path: path.join(environment.homeDir, 'manual', 'copilot', 'entry-policy.md'),
      identity: contentIdentity(Buffer.from('generic owned sentinel\n'))
    });
    await writeTrioStateFile(environment, parseV2Config(state));
  }, 'ERR_TRIO_TAKEOVER');

  await runTakeoverRejection('symlinked-owned', async ({ roots }) => {
    const environment = await resolveTrioProductionEnvironment({
      rootDir: roots.rootDir,
      homeDir: roots.homeDir
    });
    const staged = await stageExistingV2UserGlobalAt(roots, environment);
    const outside = path.join(roots.sandbox, 'outside-entry.md');
    await writeFile(outside, 'outside physical sentinel\n');
    await rm(staged.owned[0]);
    await symlink(outside, staged.owned[0]);
  }, 'ERR_TRIO_PHYSICAL_GATE');
});

function takeoverProbePrelude({ installUrl, backupUrl }) {
  return `
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import * as realBackup from ${JSON.stringify(backupUrl)};

const INSTALL_URL = ${JSON.stringify(installUrl)};
const BACKUP_URL = ${JSON.stringify(backupUrl)};

function contentIdentity(bytes) {
  return \`sha256:\${createHash('sha256').update(bytes).digest('hex')}\`;
}

async function stageExistingV2UserGlobal() {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-takeover-probe-'));
  const rootDir = path.join(sandbox, 'authority');
  const homeDir = path.join(sandbox, 'home');
  await Promise.all([mkdir(rootDir, { recursive: true }), mkdir(homeDir, { recursive: true })]);
  const rootReal = await realpath(rootDir);
  const homeReal = await realpath(homeDir);
  const stateFile = path.join(rootDir, '.harness', 'state.json');
  const sourceRoot = ${JSON.stringify(REPO_ROOT)};
  const sources = [
    'harness/trio/templates/entry-policy.md',
    'harness/trio/skill/SKILL.md',
    'harness/trio/capabilities/dev/SKILL.md',
    'harness/trio/capabilities/office/SKILL.md',
    'harness/trio/capabilities/safety/SKILL.md'
  ];
  const entry = path.join(homeReal, '.codex', 'AGENTS.md');
  const owned = [
    entry,
    path.join(homeReal, '.agents', 'skills', 'trio', 'SKILL.md'),
    path.join(homeReal, '.agents', 'skills', 'trio', 'dev', 'SKILL.md'),
    path.join(homeReal, '.agents', 'skills', 'trio', 'office', 'SKILL.md'),
    path.join(homeReal, '.agents', 'skills', 'trio', 'safety', 'SKILL.md')
  ];
  for (const [index, destination] of owned.entries()) {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(path.join(sourceRoot, sources[index])));
  }
  const chiefopsDestination = path.join(homeReal, '.agents', 'skills', 'chiefops', 'SKILL.md');
  await mkdir(path.dirname(chiefopsDestination), { recursive: true });
  const chiefopsDrifted = Buffer.from('legacy unowned global ChiefOps content\\n', 'utf8');
  await writeFile(chiefopsDestination, chiefopsDrifted);
  const destinations = [...owned, chiefopsDestination];
  const ownership = await Promise.all(owned.map(async (destination) => ({
    targetId: 'codex',
    path: destination,
    identity: contentIdentity(await readFile(destination))
  })));
  const state = {
    schemaVersion: 2,
    runtime: 'trio',
    scope: { kind: 'user-global' },
    targets: [{
      id: 'codex',
      enabled: true,
      paths: [entry],
      hostKind: 'codex',
      mode: 'managed'
    }],
    ownership: {
      source: 'existing-v2-user-global',
      manifestRef: null,
      entries: ownership
    },
    recovery: {
      checkpointRef: 'checkpoint-existing-v2',
      rollbackRef: 'rollback-existing-v2'
    }
  };
  const stateBytes = Buffer.from(JSON.stringify(state, null, 2) + '\\n', 'utf8');
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, stateBytes);
  const liveBytes = new Map(await Promise.all(
    destinations.map(async (destination) => [destination, await readFile(destination)])
  ));
  return Object.freeze({
    sandbox,
    rootDir,
    homeDir,
    stateFile,
    stateBytes,
    destinations,
    owned,
    chiefopsDestination,
    liveBytes
  });
}
`;
}

async function runTakeoverFaultProbe(label, source) {
  const root = await mkdtemp(path.join(os.tmpdir(), `trio-v2-takeover-${label}-`));
  const probePath = path.join(root, `${label}.test.mjs`);
  try {
    await writeFile(probePath, source, 'utf8');
    const result = await runNode(
      ['--experimental-test-module-mocks', '--test', probePath],
      { SWF_TRIO_FAULT_PROBE: label }
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    return result;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function takeoverProbeTest({ label, installUrl, backupUrl, inject, assertions }) {
  return `
${takeoverProbePrelude({ installUrl, backupUrl })}
test('${label}', async (t) => {
  const staged = await stageExistingV2UserGlobal();
  try {
    await t.mock.module(BACKUP_URL, {
      namedExports: {
        ...realBackup,
        publishTrioTakeoverBackup: ${inject}
      }
    });
    const { install } = await import(INSTALL_URL);
    ${assertions}
  } finally {
    await rm(staged.sandbox, { recursive: true, force: true });
  }
});
`;
}

test('production install --takeover-chiefops fails closed when the complete-inventory backup cannot be published', async () => {
  const installUrl = new URL('../../harness/installer/commands/install.mjs', import.meta.url).href;
  const backupUrl = new URL('../../harness/installer/lib/trio-takeover-backup.mjs', import.meta.url).href;
  const source = takeoverProbeTest({
    label: 'takeover backup failure fails closed before any write',
    installUrl,
    backupUrl,
    inject: `async () => {
      const error = new Error('injected backup publication failure');
      error.code = 'ERR_TRIO_BACKUP';
      throw error;
    }`,
    assertions: `
    await assert.rejects(
      () => install(['--takeover-chiefops'], { rootDir: staged.rootDir, homeDir: staged.homeDir }),
      (error) => error?.code === 'ERR_TRIO_BACKUP'
    );
    assert.deepEqual(await readFile(staged.stateFile), staged.stateBytes);
    for (const [destination, bytes] of staged.liveBytes) {
      assert.deepEqual(await readFile(destination), bytes);
    }
    await assert.rejects(
      access(path.join(staged.rootDir, '.harness-backup')),
      (error) => error?.code === 'ENOENT'
    );`
  });
  await runTakeoverFaultProbe('backup-failure', source);
});

test('production install --takeover-chiefops rejects a same-content state replacement bound after the backup', async () => {
  const installUrl = new URL('../../harness/installer/commands/install.mjs', import.meta.url).href;
  const backupUrl = new URL('../../harness/installer/lib/trio-takeover-backup.mjs', import.meta.url).href;
  const source = takeoverProbeTest({
    label: 'takeover state race with a same-content inode replacement',
    installUrl,
    backupUrl,
    inject: `async (...args) => {
      const published = await realBackup.publishTrioTakeoverBackup(...args);
      const temporary = staged.stateFile + '.race';
      await writeFile(temporary, await readFile(staged.stateFile));
      await rename(temporary, staged.stateFile);
      return published;
    }`,
    assertions: `
    await assert.rejects(
      () => install(['--takeover-chiefops'], { rootDir: staged.rootDir, homeDir: staged.homeDir }),
      (error) => error?.code === 'ERR_TRIO_STATE_DRIFT'
    );
    assert.deepEqual(await readFile(staged.stateFile), staged.stateBytes);
    for (const [destination, bytes] of staged.liveBytes) {
      assert.deepEqual(await readFile(destination), bytes);
    }
    const entries = await readdir(path.join(staged.rootDir, '.harness-backup', 'trio-takeover'));
    assert.equal(entries.length, 1);`
  });
  await runTakeoverFaultProbe('state-race', source);
});

test('production install --takeover-chiefops compensates an Nth-write same-content inode replacement of the ChiefOps target', async () => {
  const installUrl = new URL('../../harness/installer/commands/install.mjs', import.meta.url).href;
  const backupUrl = new URL('../../harness/installer/lib/trio-takeover-backup.mjs', import.meta.url).href;
  const source = takeoverProbeTest({
    label: 'takeover Nth-write same-content inode replacement compensation',
    installUrl,
    backupUrl,
    inject: `async (...args) => {
      const published = await realBackup.publishTrioTakeoverBackup(...args);
      const temporary = staged.chiefopsDestination + '.race';
      await writeFile(temporary, await readFile(staged.chiefopsDestination));
      await rename(temporary, staged.chiefopsDestination);
      return published;
    }`,
    assertions: `
    await assert.rejects(
      () => install(['--takeover-chiefops'], { rootDir: staged.rootDir, homeDir: staged.homeDir }),
      (error) => error?.code === 'ERR_TRIO_ROLLBACK' && error.cause?.code === 'ERR_TRIO_TARGET_IDENTITY'
    );
    assert.deepEqual(await readFile(staged.stateFile), staged.stateBytes);
    for (const [destination, bytes] of staged.liveBytes) {
      assert.deepEqual(await readFile(destination), bytes);
    }`
  });
  await runTakeoverFaultProbe('target-race', source);
});

test('production install --takeover-chiefops fails closed on a post-lstat read replacement of the state preimage', async () => {
  const installUrl = new URL('../../harness/installer/commands/install.mjs', import.meta.url).href;
  const backupUrl = new URL('../../harness/installer/lib/trio-takeover-backup.mjs', import.meta.url).href;
  // This probe must not pre-load the backup module before the mock is
  // registered: a static import would bind its fs functions to the real module
  // and the capture would never observe the replacement. The shared prelude is
  // reused with only the realBackup import removed.
  const source = `
${takeoverProbePrelude({ installUrl, backupUrl }).replace(/^import \* as realBackup from .*;$/mu, '')}
import * as realFs from 'node:fs/promises';

test('takeover capture race with a post-lstat read replacement', async (t) => {
  const staged = await stageExistingV2UserGlobal();
  try {
    const canonicalStateFile = await realpath(staged.stateFile);
    let replacementIndex = 0;
    await t.mock.module('node:fs/promises', {
      namedExports: {
        ...realFs,
        readFile: async (filePath, ...rest) => {
          const bytes = await realFs.readFile(filePath, ...rest);
          if (String(filePath) === canonicalStateFile) {
            replacementIndex += 1;
            const temporary = canonicalStateFile + '.capture-race-' + replacementIndex;
            await realFs.writeFile(temporary, bytes);
            await realFs.rename(temporary, canonicalStateFile);
          }
          return bytes;
        }
      }
    });
    const { install } = await import(INSTALL_URL);
    await assert.rejects(
      () => install(['--takeover-chiefops'], { rootDir: staged.rootDir, homeDir: staged.homeDir }),
      (error) => error?.code === 'ERR_TRIO_PREIMAGE_DRIFT'
    );
    assert.deepEqual(await realFs.readFile(staged.stateFile), staged.stateBytes);
    for (const [destination, bytes] of staged.liveBytes) {
      assert.deepEqual(await realFs.readFile(destination), bytes);
    }
    await assert.rejects(
      realFs.access(path.join(staged.rootDir, '.harness-backup')),
      (error) => error?.code === 'ENOENT'
    );
  } finally {
    await rm(staged.sandbox, { recursive: true, force: true });
  }
});
`;
  await runTakeoverFaultProbe('capture-race', source);
});

test('production install --takeover-chiefops preserves provenance and later ChiefOps user drift fails closed', async () => {
  const staged = await stageExistingV2UserGlobal('takeover-drift');
  try {
    const { environment, chiefopsDestination, options } = staged;
    const outcome = await install(['--takeover-chiefops'], options);
    const settled = JSON.parse(await readFile(environment.stateFile, 'utf8'));
    assert.equal(settled.ownership.source, 'existing-v2-user-global');
    assert.equal(settled.ownership.manifestRef, null);
    assert.equal(settled.recovery.checkpointRef, 'checkpoint-existing-v2');
    assert.equal(settled.recovery.rollbackRef, outcome.backup.ref);
    await assertExactSettledOwnership(settled, staged.destinations);

    await writeFile(chiefopsDestination, 'user drift after takeover\n');
    const stateBeforeDrift = await readFile(environment.stateFile);
    let caught;
    const output = await captureCommandOutput(async () => {
      try {
        await sync([], options);
      } catch (error) {
        caught = error;
      }
    });
    assert.equal(caught?.code, 'ERR_TRIO_CONFLICT');
    assert.equal(output, '');
    assert.deepEqual(await readFile(environment.stateFile), stateBeforeDrift);
    await assert.rejects(
      () => sync(['--check'], options),
      (error) => error?.code === 'ERR_TRIO_CHECK'
    );
    await assert.rejects(
      () => doctor(['--check-only'], options),
      (error) => error?.code === 'ERR_TRIO_CHECK'
    );
    assert.equal(await readFile(chiefopsDestination, 'utf8'), 'user drift after takeover\n');
  } finally {
    await rm(staged.roots.sandbox, { recursive: true, force: true });
  }
});

test('production install --takeover-chiefops fails closed on a symlinked backup ancestor', async () => {
  const staged = await stageExistingV2UserGlobal('takeover-symlink-ancestor');
  try {
    const { environment, options } = staged;
    const outsideRoot = path.join(staged.roots.sandbox, 'outside-backup-target');
    await mkdir(outsideRoot, { recursive: true });
    for (const relative of ['.harness-backup', path.join('.harness-backup', 'trio-takeover')]) {
      const ancestor = path.join(environment.authorityRoot, relative);
      await mkdir(path.dirname(ancestor), { recursive: true });
      await rm(ancestor, { recursive: true, force: true });
      await symlink(outsideRoot, ancestor);

      await assert.rejects(
        () => install(['--takeover-chiefops'], options),
        (error) => error?.code === 'ERR_TRIO_PHYSICAL_GATE'
      );
      assert.deepEqual(await readFile(environment.stateFile), staged.stateBytes);
      for (const [destination, bytes] of staged.liveBytes) {
        assert.deepEqual(await readFile(destination), bytes);
      }
      assert.equal((await lstat(ancestor)).isSymbolicLink(), true);
      assert.deepEqual(await readdir(outsideRoot), []);
      await rm(ancestor);
    }
  } finally {
    await rm(staged.roots.sandbox, { recursive: true, force: true });
  }
});

test('production install --takeover-chiefops fails at the parser gate on a manual Codex placement with zero writes', async () => {
  const staged = await stageExistingV2UserGlobal('takeover-manual-codex');
  try {
    const { environment, options } = staged;
    // A codex target with mode "manual" is structurally invalid V2 state
    // (hostKind/mode coupling), so the takeover eligibility gate is never
    // reached: the authoritative parsing gate must fail closed before any
    // projection, state, or backup write.
    const state = JSON.parse(await readFile(environment.stateFile, 'utf8'));
    state.targets[0].mode = 'manual';
    const malformedBytes = Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await writeFile(environment.stateFile, malformedBytes);

    await assert.rejects(
      () => install(['--takeover-chiefops'], options),
      (error) => error?.code === 'ERR_TRIO_CONFIG'
    );
    assert.deepEqual(await readFile(environment.stateFile), malformedBytes);
    for (const [destination, bytes] of staged.liveBytes) {
      assert.deepEqual(await readFile(destination), bytes);
    }
    await assert.rejects(
      access(path.join(environment.authorityRoot, '.harness-backup')),
      (error) => error?.code === 'ENOENT'
    );
  } finally {
    await rm(staged.roots.sandbox, { recursive: true, force: true });
  }
});

test('Trio fixture install rejects --takeover-chiefops before any write', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-takeover-fixture-'));
  try {
    await withRuntimeSelector('trio', async () => {
      await assert.rejects(
        install(['--fixture-root', fixtureRoot, '--takeover-chiefops']),
        (error) => error?.code === 'ERR_TRIO_FIXTURE'
      );
    });
    await assert.rejects(access(path.join(fixtureRoot, '.harness')), /ENOENT/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Trio install help advertises the existing-V2 ChiefOps takeover flag', async () => {
  const output = await captureCommandOutput(async () => {
    await install(['--help'], {});
  });
  assert.match(output, /--takeover-chiefops/);
  assert.match(output, /existing schema-v2 user-global state/);
});

test('Trio sync help no longer advertises unavailable takeover or conflict flags', async () => {
  const output = await captureCommandOutput(async () => {
    await sync(['--help'], {});
  });
  assert.match(output, /Usage: .*sync \[--dry-run\] \[--check\]/);
  assert.match(output, /--check/);
  assert.doesNotMatch(output, /--takeover/);
  assert.doesNotMatch(output, /--conflict/);
});

test('old six-surface V2 installs create absent references and settle their ownership', async () => {
  const staged = await stageExistingV2UserGlobal('old-six-reference-upgrade');
  try {
    const state = structuredClone(staged.state);
    state.ownership.entries.push({ targetId: 'codex', path: staged.chiefopsDestination, identity: contentIdentity(staged.chiefopsDrifted) });
    await writeTrioStateFile(staged.environment, state);
    const plan = await prepareTrioProjection({ environment: staged.environment, config: state });
    assert.deepEqual(plan.descriptors.filter((d) => d.supportFor && d.management === 'managed').map((d) => d.action), SUPPORT_SURFACES.map(() => 'create'));
    await install([], staged.options);
    const settled = JSON.parse(await readFile(staged.environment.stateFile, 'utf8'));
    await assertExactSettledOwnership(settled, staged.destinations);
    await assertExactTrioMaterialization(staged.destinations);
    for (const destination of genericDestinations(staged.environment.homeDir, 'copilot')) {
      await assert.rejects(access(destination), /ENOENT/);
    }
  } finally { await rm(staged.roots.sandbox, { recursive: true, force: true }); }
});

test('ChiefOps takeover backs up owned support and absence together in shared reference directories', async () => {
  const staged = await stageExistingV2UserGlobal('mixed-reference-takeover');
  try {
    const state = structuredClone(staged.state);
    // Leave methods absent, but own review: a create precedes an update in the same parent.
    const surface = SUPPORT_SURFACES.find((surface) => surface.id === 'dev/references/review.md');
    const destination = path.join(staged.environment.homeDir, '.agents/skills', surface.relativePath);
    const old = Buffer.from('previous owned reference\n');
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, old);
    state.ownership.entries.push({ targetId: 'codex', path: destination, identity: contentIdentity(old) });
    await writeTrioStateFile(staged.environment, state);
    const result = await install(['--takeover-chiefops'], staged.options);
    await assertExactTrioMaterialization(staged.destinations);
    const manifest = JSON.parse(await readFile(result.backup.manifestPath, 'utf8'));
    const object = manifest.objects.find((object) => object.path === destination);
    const bundle = await readFile(result.backup.bundlePath);
    assert.deepEqual(bundle.subarray(object.offset, object.offset + object.length), old);
    assert.equal(manifest.objects.filter((object) => !object.exists).length, SUPPORT_SURFACES.length - 1);
    assert.equal(manifest.objects.length, PROJECTION_SURFACES.length + 1);
  } finally { await rm(staged.roots.sandbox, { recursive: true, force: true }); }
});

test('ChiefOps takeover refuses an extra unmanaged reference without a backup or target writes', async () => {
  await runTakeoverRejection('unmanaged-support', async ({ roots }) => {
    const environment = await resolveTrioProductionEnvironment({ rootDir: roots.rootDir, homeDir: roots.homeDir });
    await stageExistingV2UserGlobalAt(roots, environment);
    const destination = path.join(environment.homeDir, '.agents/skills', SUPPORT_SURFACES[0].relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, 'user-owned reference\n');
  }, 'ERR_TRIO_TAKEOVER');
});


test('support takeover rollback restores owned reference bytes and removes newly created references', async () => {
  const staged = await stageExistingV2UserGlobal('support-rollback');
  try {
    const state = structuredClone(staged.state);
    const surface = SUPPORT_SURFACES.find((surface) => surface.id === 'dev/references/review.md');
    const destination = path.join(staged.environment.homeDir, '.agents/skills', surface.relativePath);
    const old = Buffer.from('owned support before failed apply\n');
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, old);
    state.ownership.entries.push({ targetId: 'codex', path: destination, identity: contentIdentity(old) });
    await writeTrioStateFile(staged.environment, state);
    const stateBefore = await readFile(staged.environment.stateFile);
    const prepared = await prepareTrioProjection({ environment: staged.environment, config: state });
    const captured = await captureTrioTakeoverPreimages({ environment: staged.environment, descriptors: prepared.descriptors.filter((d) => d.management === 'managed') });
    state.ownership.entries.push({ targetId: 'codex', path: staged.chiefopsDestination, identity: contentIdentity(staged.chiefopsDrifted) });
    await assert.rejects(applyTrioProjection({
      environment: staged.environment, config: state, preimageSnapshots: captured.snapshots,
      beforeWrite: ({ phase }) => { if (phase === 'state') throw new Error('support-rollback-probe'); }
    }), /support-rollback-probe/);
    assert.deepEqual(await readFile(staged.environment.stateFile), stateBefore);
    assert.deepEqual(await readFile(destination), old);
    for (const [target, bytes] of staged.liveBytes) assert.deepEqual(await readFile(target), bytes);
    for (const support of SUPPORT_SURFACES.filter((support) => support !== surface)) {
      await assert.rejects(access(path.join(staged.environment.homeDir, '.agents/skills', support.relativePath)), /ENOENT/);
    }
  } finally { await rm(staged.roots.sandbox, { recursive: true, force: true }); }
});

test('bound absent support refuses a post-backup foreign create and restores earlier publications', async () => {
  const staged = await stageExistingV2UserGlobal('support-create-race');
  try {
    const prepared = await prepareTrioProjection({ environment: staged.environment, config: staged.state });
    const captured = await captureTrioTakeoverPreimages({ environment: staged.environment, descriptors: prepared.descriptors.filter((d) => d.management === 'managed') });
    const state = structuredClone(staged.state);
    state.ownership.entries.push({ targetId: 'codex', path: staged.chiefopsDestination, identity: contentIdentity(staged.chiefopsDrifted) });
    const destination = path.join(staged.environment.homeDir, '.agents/skills', SUPPORT_SURFACES[0].relativePath);
    await assert.rejects(applyTrioProjection({
      environment: staged.environment, config: state, preimageSnapshots: captured.snapshots,
      beforeWrite: async ({ targetPath }) => { if (targetPath === destination) await writeFile(destination, 'foreign reference\n'); }
    }), (error) => error?.code === 'ERR_TRIO_ROLLBACK' || error?.code === 'ERR_TRIO_PREIMAGE_DRIFT');
    assert.equal(await readFile(destination, 'utf8'), 'foreign reference\n');
    assert.deepEqual(await readFile(staged.environment.stateFile), staged.stateBytes);
    for (const [target, bytes] of staged.liveBytes) assert.deepEqual(await readFile(target), bytes);
  } finally { await rm(staged.roots.sandbox, { recursive: true, force: true }); }
});

test('support symlink and owned support content drift fail closed before takeover writes', async () => {
  for (const kind of ['symlink', 'drift']) {
    const staged = await stageExistingV2UserGlobal(`support-${kind}`);
    try {
      const destination = path.join(staged.environment.homeDir, '.agents/skills', SUPPORT_SURFACES[0].relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      if (kind === 'symlink') await symlink(staged.chiefopsDestination, destination);
      else {
        const state = structuredClone(staged.state);
        await writeFile(destination, 'user changed support\n');
        state.ownership.entries.push({ targetId: 'codex', path: destination, identity: contentIdentity('previous owned support\n') });
        await writeTrioStateFile(staged.environment, state);
      }
      const stateBefore = await readFile(staged.environment.stateFile);
      await assert.rejects(install(['--takeover-chiefops'], staged.options), (error) => error?.code === (kind === 'symlink' ? 'ERR_TRIO_PHYSICAL_GATE' : 'ERR_TRIO_TAKEOVER'));
      assert.deepEqual(await readFile(staged.environment.stateFile), stateBefore);
      for (const [target, bytes] of staged.liveBytes) assert.deepEqual(await readFile(target), bytes);
      await assert.rejects(access(path.join(staged.environment.authorityRoot, '.harness-backup')), /ENOENT/);
    } finally { await rm(staged.roots.sandbox, { recursive: true, force: true }); }
  }
});

test('bound absent support preserves a replacement of its transaction-created parent', async () => {
  const staged = await stageExistingV2UserGlobal('support-parent-race');
  try {
    const prepared = await prepareTrioProjection({ environment: staged.environment, config: staged.state });
    const captured = await captureTrioTakeoverPreimages({ environment: staged.environment, descriptors: prepared.descriptors.filter((d) => d.management === 'managed') });
    const state = structuredClone(staged.state);
    state.ownership.entries.push({ targetId: 'codex', path: staged.chiefopsDestination, identity: contentIdentity(staged.chiefopsDrifted) });
    const destination = path.join(staged.environment.homeDir, '.agents/skills', SUPPORT_SURFACES[0].relativePath);
    const parent = path.dirname(destination);
    await assert.rejects(applyTrioProjection({
      environment: staged.environment, config: state, preimageSnapshots: captured.snapshots,
      beforeWrite: async ({ targetPath }) => {
        if (targetPath !== destination) return;
        await rename(parent, parent + '-original');
        await mkdir(parent);
        await writeFile(path.join(parent, 'foreign.md'), 'foreign directory sentinel\n');
      }
    }), (error) => error?.code === 'ERR_TRIO_ROLLBACK');
    await assert.rejects(access(destination), /ENOENT/);
    assert.equal(await readFile(path.join(parent, 'foreign.md'), 'utf8'), 'foreign directory sentinel\n');
    assert.deepEqual(await readFile(staged.environment.stateFile), staged.stateBytes);
    for (const [target, bytes] of staged.liveBytes) assert.deepEqual(await readFile(target), bytes);
  } finally { await rm(staged.roots.sandbox, { recursive: true, force: true }); }
});
