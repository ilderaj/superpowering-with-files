import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSyncPlan } from '../../harness/installer/lib/sync-plan.mjs';
import { renderSyncReport } from '../../harness/installer/lib/sync-report.mjs';

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

test('renderSyncReport preserves legacy sync report keys and adds detail buckets', () => {
  const report = renderSyncReport(
    {
      state: { scope: 'workspace' },
      currentManifest: { entries: [] },
      plan: { targets: ['codex'] },
      diff: { create: [], update: [], stale: [], unchanged: [] },
      summary: { create: 0, update: 0, stale: 0, unchanged: 0 }
    },
    {
      mode: 'dry-run',
      warnings: ['hook payload budget exceeded for planning-with-files on codex'],
      details: { projections: ['codex'], hooks: ['planning-with-files'] }
    }
  );

  assert.equal(report.summary.create, 0);
  assert.equal(Array.isArray(report.warnings), true);
  assert.equal(report.details.mode, 'dry-run');
});
