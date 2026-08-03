import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrateV1ToV2, parseV2Config } from '../../harness/trio/config.mjs';
import { projectConfig } from '../../harness/trio/projection.mjs';
import { readLegacyTask } from '../../harness/trio/compatibility/legacy-reader.mjs';

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
