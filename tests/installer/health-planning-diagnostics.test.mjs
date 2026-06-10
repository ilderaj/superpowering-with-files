import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';
import { inspectPlanningDiagnostics } from '../../harness/installer/lib/health-planning-diagnostics.mjs';

test('inspectPlanningDiagnostics reports companion drift and malformed execution contracts', async () => {
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

    await mkdir(path.join(root, 'planning/active/task-a'), { recursive: true });
    await writeFile(
      path.join(root, 'planning/active/task-a/task_plan.md'),
      [
        '# Task A',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '## Companion Plan',
        '- Companion plan: `docs/superpowers/plans/task-a.md`',
        '- Companion summary: lifecycle notes',
        '- Sync-back status: active draft',
        '',
        '## Execution Contract',
        '### Unit: unit-01',
        '- Kind: implementation'
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/task-a/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/task-a/progress.md'), '# Progress\n');
    await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });
    await writeFile(
      path.join(root, 'docs/superpowers/plans/task-a.md'),
      '# Companion plan\n\nLifecycle state: active\nSync-back status: active draft\n'
    );

    const report = await inspectPlanningDiagnostics({ rootDir: root, homeDir: '/home/user' });

    assert.equal(report.activeTaskState.activeTaskCount, 1);
    assert.ok(
      report.planLocations.some(
        (location) =>
          location.type === 'companion-sync-warning' &&
          location.path === 'planning/active/task-a/task_plan.md' &&
          location.message.includes('Companion plan is missing Active task path')
      )
    );
    assert.ok(
      report.planLocations.some(
        (location) =>
          location.type === 'execution-contract-warning' &&
          location.path === 'planning/active/task-a/task_plan.md' &&
          location.message.includes('Execution contract needs attention')
      )
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('inspectPlanningDiagnostics warns when an active task mixes midnight placeholders with real UTC+8 timestamps', async () => {
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

    await mkdir(path.join(root, 'planning/active/task-a'), { recursive: true });
    await writeFile(
      path.join(root, 'planning/active/task-a/task_plan.md'),
      [
        '# Task A',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:'
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/task-a/findings.md'), '# Findings\n');
    await writeFile(
      path.join(root, 'planning/active/task-a/progress.md'),
      [
        '# Progress',
        '',
        '## Session: 2026-06-10 16:35:00 UTC+8',
        '',
        '### Phase 5',
        '- **Status:** complete',
        '- **Started:** 2026-06-10 16:35:00 UTC+8',
        '',
        '## Session: 2026-06-10 00:00:00 UTC+8',
        '',
        '### Phase 6',
        '- **Status:** in_progress',
        '- **Started:** 2026-06-10 00:00:00 UTC+8'
      ].join('\n')
    );

    const report = await inspectPlanningDiagnostics({ rootDir: root, homeDir: '/home/user' });

    assert.ok(
      report.planLocations.some(
        (location) =>
          location.type === 'planning-timestamp-warning' &&
          location.path === 'planning/active/task-a/progress.md' &&
          location.message.includes('00:00:00 UTC+8')
      )
    );
  } finally {
    await removeHarnessFixture(root);
  }
});
