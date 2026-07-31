import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildSyncPlan } from '../../harness/installer/lib/sync-plan.mjs';
import { applySyncPlan } from '../../harness/installer/lib/sync-apply.mjs';
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
    const plan = await buildSyncPlan([], { rootDir: root, homeDir, state });

    await applySyncPlan(plan, {
      rootDir: root,
      homeDir,
      state,
      currentManifest: { schemaVersion: 1, entries: [] },
      findRetiredProjections: async (options) => {
        assert.equal(options.scope, 'user-global');
        assert.deepEqual(options.targets, ['codex']);
        return [retiredTarget];
      }
    });

    await assert.rejects(access(retiredTarget), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});
