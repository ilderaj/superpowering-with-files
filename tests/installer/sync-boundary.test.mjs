import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { buildSyncPlan } from '../../harness/installer/lib/sync-plan.mjs';

test('buildSyncPlan returns a stable plan object with operations and report payload', async () => {
  const plan = await buildSyncPlan(['--dry-run'], {
    rootDir: '/tmp/project',
    homeDir: '/tmp/home',
    state: {
      scope: 'workspace',
      projectionMode: 'link',
      targets: {}
    }
  });

  assert.equal(Array.isArray(plan.operations), true);
  assert.equal(typeof plan.report, 'object');
  assert.equal(plan.report.mode, 'dry-run');
});

test('public commands retain no unreachable V1 implementation or legacy sync report dependency', async () => {
  const forbiddenByCommand = {
    'install.mjs': 'installLegacy',
    'sync.mjs': 'syncLegacy',
    'doctor.mjs': 'doctorLegacy',
    'verify.mjs': 'verifyLegacy'
  };

  for (const [file, identifier] of Object.entries(forbiddenByCommand)) {
    const source = await readFile(path.join(process.cwd(), 'harness/installer/commands', file), 'utf8');
    assert.doesNotMatch(source, new RegExp(`\\b${identifier}\\b`));
  }

  const syncSource = await readFile(
    path.join(process.cwd(), 'harness/installer/commands/sync.mjs'),
    'utf8'
  );
  assert.doesNotMatch(syncSource, /sync-report\.mjs/);
  await assert.rejects(
    access(path.join(process.cwd(), 'harness/installer/lib/sync-report.mjs')),
    /ENOENT/
  );
});
