import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
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

test('inspectPlanningDiagnostics warns when dated planning headings are not top-to-bottom chronological', async () => {
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
        '## Session: 2026-06-10 08:00:17 UTC+8',
        '',
        '### Phase 6',
        '- **Status:** in_progress',
        '- **Started:** 2026-06-10 08:00:17 UTC+8'
      ].join('\n')
    );

    const report = await inspectPlanningDiagnostics({ rootDir: root, homeDir: '/home/user' });

    assert.ok(
      report.planLocations.some(
        (location) =>
          location.type === 'planning-chronology-warning' &&
          location.path === 'planning/active/task-a/progress.md' &&
          location.message.includes('top-to-bottom chronological')
      )
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('inspectPlanningDiagnostics warns when a planning heading is later than the file mtime', async () => {
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

    const progressPath = path.join(root, 'planning/active/task-a/progress.md');
    await writeFile(
      progressPath,
      [
        '# Progress',
        '',
        '## Session: 2026-06-26 18:05:00 UTC+8',
        '',
        '### Phase 1',
        '- **Status:** complete',
        '- **Started:** 2026-06-26 18:05:00 UTC+8'
      ].join('\n')
    );
    const mtime = new Date('2026-06-26T08:02:24.000Z');
    await utimes(progressPath, mtime, mtime);

    const report = await inspectPlanningDiagnostics({ rootDir: root, homeDir: '/home/user' });

    assert.ok(
      report.planLocations.some(
        (location) =>
          location.type === 'planning-future-timestamp-warning' &&
          location.path === 'planning/active/task-a/progress.md' &&
          location.message.includes('later than the file mtime')
      )
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('inspectPlanningDiagnostics warns when an ad-hoc memory note filename timestamp is later than the file mtime', async () => {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
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
    await writeFile(path.join(root, 'planning/active/task-a/progress.md'), '# Progress\n');

    const noteDir = path.join(homeDir, '.codex/memories/extensions/ad_hoc/notes');
    await mkdir(noteDir, { recursive: true });
    const notePath = path.join(
      noteDir,
      '2026-06-26T18-05-00-acquiring-licensed-onerway-fi-admission-matrix.md'
    );
    await writeFile(notePath, '# Note\n');
    const mtime = new Date('2026-06-26T08:02:24.000Z');
    await utimes(notePath, mtime, mtime);

    const report = await inspectPlanningDiagnostics({ rootDir: root, homeDir });

    assert.ok(
      report.planLocations.some(
        (location) =>
          location.type === 'ad-hoc-memory-future-timestamp-warning' &&
          location.path ===
            '.codex/memories/extensions/ad_hoc/notes/2026-06-26T18-05-00-acquiring-licensed-onerway-fi-admission-matrix.md' &&
          location.message.includes('later than the file mtime')
      )
    );
  } finally {
    await removeHarnessFixture(root);
  }
});
