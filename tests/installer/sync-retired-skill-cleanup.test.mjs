import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildSyncPlan } from '../../harness/installer/lib/sync-plan.mjs';
import { applySyncPlan } from '../../harness/installer/lib/sync-apply.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeProjectionManifest } from '../../harness/installer/lib/projection-manifest.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import { writeUserManaged } from '../../harness/installer/lib/user-managed.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

test('global sync prunes an exact retired projection when the legacy manifest is missing', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  const retiredTarget = path.join(homeDir, '.agents/skills/second-opinion-advisory');
  const state = {
    schemaVersion: 1,
    scope: 'user-global',
    projectionMode: 'portable',
    hookMode: 'off',
    deploymentProfile: 'standard',
    policyProfile: 'always-on-core',
    workspacePolicyOverlay: null,
    skillProfile: 'minimal-global',
    targets: { codex: { enabled: true, paths: [] } },
    upstream: {}
  };
  try {
    await mkdir(retiredTarget, { recursive: true });
    await writeFile(path.join(retiredTarget, 'SKILL.md'), '# Exact historical projection supplied by matcher\n');
    const findRetiredProjections = async (options) => {
      assert.equal(options.scope, 'user-global');
      assert.deepEqual(options.targets, ['codex']);
      return [retiredTarget];
    };
    const plan = await buildSyncPlan([], { rootDir: root, homeDir, state, findRetiredProjections });

    await applySyncPlan(plan, {
      rootDir: root,
      homeDir,
      state,
      currentManifest: { schemaVersion: 1, entries: [] },
      findRetiredProjections
    });

    await assert.rejects(access(retiredTarget), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync check reports an exact retired projection without deleting it', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  const retiredTarget = path.join(root, '.agents/skills/second-opinion-advisory');
  const state = {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'portable',
    hookMode: 'off',
    deploymentProfile: 'standard',
    policyProfile: 'always-on-core',
    workspacePolicyOverlay: null,
    skillProfile: 'standard',
    targets: { codex: { enabled: true, paths: [] } },
    upstream: {}
  };
  try {
    await writeState(root, state);
    const cleanPlan = await buildSyncPlan([], { rootDir: root, homeDir, state });
    await writeProjectionManifest(root, cleanPlan.desiredManifest);
    await mkdir(retiredTarget, { recursive: true });
    await writeFile(path.join(retiredTarget, 'SKILL.md'), '# Exact historical projection supplied by matcher\n');

    await assert.rejects(
      sync(['--check'], {
        rootDir: root,
        homeDir,
        state,
        findRetiredProjections: async () => [retiredTarget]
      }),
      /Harness sync check failed: projections are out of sync/
    );
    await access(retiredTarget);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync check preserves an exact retired projection under a user-managed path', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  const retiredTarget = path.join(root, '.agents/skills/second-opinion-advisory');
  const state = {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'portable',
    hookMode: 'off',
    deploymentProfile: 'standard',
    policyProfile: 'always-on-core',
    workspacePolicyOverlay: null,
    skillProfile: 'standard',
    targets: { codex: { enabled: true, paths: [] } },
    upstream: {}
  };
  try {
    await writeState(root, state);
    const cleanPlan = await buildSyncPlan([], { rootDir: root, homeDir, state });
    await writeProjectionManifest(root, cleanPlan.desiredManifest);
    await writeUserManaged(homeDir, { schemaVersion: 1, paths: [retiredTarget] });
    await mkdir(retiredTarget, { recursive: true });
    await writeFile(path.join(retiredTarget, 'SKILL.md'), '# Exact historical projection supplied by matcher\n');

    await assert.doesNotReject(
      sync(['--check'], {
        rootDir: root,
        homeDir,
        state,
        findRetiredProjections: async () => [retiredTarget]
      })
    );
    await access(retiredTarget);
  } finally {
    await removeHarnessFixture(root);
  }
});
