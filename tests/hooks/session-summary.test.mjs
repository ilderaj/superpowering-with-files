import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildSessionSummary,
  extractPhases,
  formatDuration
} from '../../harness/core/hooks/planning-with-files/scripts/session-summary.mjs';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('extractPhases reads phase titles and explicit status lines', () => {
  const phases = extractPhases([
    '# Session Summary',
    '',
    '### Phase 1: Parse planning files',
    '- **Status:** complete',
    '',
    '### Phase 2: Render summary',
    '- **Status:** in_progress',
    '',
    '### Phase 3: Ship output',
    '**Status:** in_progress'
  ].join('\n'));

  assert.deepEqual(phases, [
    { title: 'Phase 1: Parse planning files', status: 'complete' },
    { title: 'Phase 2: Render summary', status: 'in_progress' },
    { title: 'Phase 3: Ship output', status: 'in_progress' }
  ]);
});

test('extractPhases falls back to bracketed phase status and returns [] when absent', () => {
  assert.deepEqual(
    extractPhases([
      '### Phase 3 [pending]: Smoke test CLI',
      '',
      '### Phase 4 [complete] Wrap up',
      'Notes'
    ].join('\n')),
    [
      { title: 'Phase 3: Smoke test CLI', status: 'pending' },
      { title: 'Phase 4: Wrap up', status: 'complete' }
    ]
  );

  assert.deepEqual(extractPhases('# No phases here'), []);
});

test('formatDuration reports unavailable, sub-minute, minute, and hour ranges', () => {
  assert.equal(formatDuration(undefined, 10), 'unavailable');
  assert.equal(formatDuration(1000, 1000), 'unavailable');
  assert.equal(formatDuration(1000, 59_000), '<1m');
  assert.equal(formatDuration(1000, 48 * 60_000), '47m');
  assert.equal(formatDuration(1000, 126 * 60_000), '2h 5m');
});

async function createFixture(taskId, files) {
  const root = path.join(process.cwd(), 'tests/hooks/.artifacts', taskId);
  const taskDir = path.join(root, 'planning/active', taskId);
  await rm(root, { recursive: true, force: true });
  await mkdir(taskDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(taskDir, 'task_plan.md'), files.taskPlan),
    writeFile(path.join(taskDir, 'findings.md'), files.findings),
    writeFile(path.join(taskDir, 'progress.md'), files.progress)
  ]);
  return {
    root,
    taskPlanPath: path.join(taskDir, 'task_plan.md'),
    findingsPath: path.join(taskDir, 'findings.md'),
    progressPath: path.join(taskDir, 'progress.md')
  };
}

const summaryFixtures = [
  {
    name: 'buildSessionSummary renders active task summaries with the required contract',
    taskId: 'demo-task',
    sessionStartEpoch: 1_000,
    now: 126 * 60_000,
    files: {
      taskPlan: [
        '# Demo Task',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '### Phase 1: Parse planning files',
        '- **Status:** complete',
        '',
        '### Phase 2: Render summary',
        '- **Status:** in_progress',
        '',
        '### Phase 3 [pending]: Smoke test CLI'
      ].join('\n'),
      findings: [
        '## Findings',
        '- Prefer compact summaries.',
        '- Reuse parser helpers.',
        '- Keep CLI wrapper thin.',
        '- Ignore extra bullets.'
      ].join('\n'),
      progress: [
        '## Progress',
        '- Implemented parser scaffolding.',
        '- Added CLI smoke coverage.',
        '',
        '## Test Results',
        '| Command | Result |',
        '| --- | --- |',
        '| `node --test tests/hooks/session-summary.test.mjs` | pass |',
        '| `node harness/.../render-session-summary.mjs` | fail |',
        '',
        '## Error Log',
        '| Error | Status |',
        '| --- | --- |',
        '| Missing export | resolved |',
        '| Smoke assertion mismatch | open |'
      ].join('\n')
    },
    expected: [
      '[planning-with-files] SESSION SUMMARY',
      'Task: Demo Task (demo-task)',
      'Status: active  Phases: 1/3  Duration: 2h 5m',
      '',
      'Conclusion:',
      '- Added CLI smoke coverage.',
      '',
       'Checklist:',
        '- [x] Phase 1: Parse planning files',
        '- [~] Phase 2: Render summary',
        '- [ ] Phase 3: Smoke test CLI',
      '',
      'Key findings:',
      '- Prefer compact summaries.',
      '- Reuse parser helpers.',
      '- Keep CLI wrapper thin.',
      '',
      'Verification:',
      '- Tests: 1/2',
      '- Errors logged: 2',
      '',
      'Next:',
      '- Phase 3: Smoke test CLI',
      '',
      'Sources: planning/active/demo-task/{task_plan.md,progress.md,findings.md}'
    ].join('\n'),
    assertSummary(summary) {
      assert.equal(summary, this.expected);
      assert.ok(summary.length <= 12_000, 'summary exceeded character budget');
      assert.ok(summary.split('\n').length <= 160, 'summary exceeded line budget');
    }
  },
  {
    name: 'buildSessionSummary prefers close reason when task is closed',
    taskId: 'closed-task',
    sessionStartEpoch: 1_000,
    now: 48 * 60_000,
    files: {
      taskPlan: [
        '# Closed Task',
        '',
        '## Current State',
        'Status: closed',
        'Archive Eligible: no',
        'Close Reason: Session summary shipped and verified.',
        '',
        '### Phase 1: Prepare fixtures',
        '- **Status:** complete',
        '',
        '### Phase 2 [complete]: Ship summary formatter'
      ].join('\n'),
      findings: [
        '## Findings',
        '- Closed tasks should cite the close reason.'
      ].join('\n'),
      progress: [
        '## Progress',
        '- Finalized implementation.',
        '',
        '## Test Results',
        '| Command | Result |',
        '| --- | --- |',
        '| `node --test tests/hooks/session-summary.test.mjs` | pass |',
        '',
        '## Error Log',
        '| Error | Status |',
        '| --- | --- |',
        '| No blocking errors | resolved |'
      ].join('\n')
    },
    expected: [
      '[planning-with-files] SESSION SUMMARY',
      'Task: Closed Task (closed-task)',
      'Status: closed  Phases: 2/2  Duration: 47m',
      '',
      'Conclusion:',
      '- Session summary shipped and verified.',
      '',
      'Checklist:',
      '- [x] Phase 1: Prepare fixtures',
      '- [x] Phase 2: Ship summary formatter',
      '',
      'Key findings:',
      '- Closed tasks should cite the close reason.',
      '',
      'Verification:',
      '- Tests: 1/1',
      '- Errors logged: 1',
      '',
      'Next:',
      '- —',
      '',
      'Sources: planning/active/closed-task/{task_plan.md,progress.md,findings.md}'
    ].join('\n'),
    assertSummary(summary) {
      assert.equal(summary, this.expected);
    }
  },
  {
    name: 'buildSessionSummary reports missing verification records as none recorded',
    taskId: 'no-records-task',
    sessionStartEpoch: 1_000,
    now: 59_000,
    files: {
      taskPlan: [
        '# No Records Task',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no',
        'Close Reason:',
        '',
        '### Phase 1: Gather inputs',
        '- **Status:** in_progress'
      ].join('\n'),
      findings: [
        '## Findings',
        '- Verification can be absent during early execution.'
      ].join('\n'),
      progress: [
        '## Progress',
        '- Gathered initial inputs.'
      ].join('\n')
    },
    expected: [
      '[planning-with-files] SESSION SUMMARY',
      'Task: No Records Task (no-records-task)',
      'Status: active  Phases: 0/1  Duration: <1m',
      '',
      'Conclusion:',
      '- Gathered initial inputs.',
      '',
       'Checklist:',
        '- [~] Phase 1: Gather inputs',
      '',
      'Key findings:',
      '- Verification can be absent during early execution.',
      '',
      'Verification:',
      '- Tests: none recorded',
      '- Errors logged: 0',
      '',
      'Next:',
      '- —',
      '',
      'Sources: planning/active/no-records-task/{task_plan.md,progress.md,findings.md}'
    ].join('\n'),
    assertSummary(summary) {
      assert.equal(summary, this.expected);
    }
  }
];

for (const fixture of summaryFixtures) {
  test(fixture.name, async () => {
    const paths = await createFixture(fixture.taskId, fixture.files);

    try {
      const summary = await buildSessionSummary({
        taskPlanPath: paths.taskPlanPath,
        findingsPath: paths.findingsPath,
        progressPath: paths.progressPath,
        sessionStartEpoch: fixture.sessionStartEpoch,
        now: fixture.now
      });

      fixture.assertSummary(summary);
      assert.doesNotMatch(summary, new RegExp(escapeRegExp(paths.root)));
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });
}
