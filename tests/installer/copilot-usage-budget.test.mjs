import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, env, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root,
    env: { ...process.env, ...env }
  });
}

async function writeCopilotPlanningFixture(root, taskName = 'compact-task') {
  const taskRoot = path.join(root, 'planning/active', taskName);
  const repeatedPlanBullets = Array.from({ length: 80 }, (_, index) => `- [ ] Follow-up step ${index + 1}.`);
  const repeatedFindings = Array.from(
    { length: 120 },
    (_, index) => `- Finding ${index + 1}: keep repeated prompt recovery compact.`
  );
  const repeatedProgress = Array.from(
    { length: 120 },
    (_, index) => `- Progress ${index + 1}: track prompt recovery churn.`
  );

  await mkdir(taskRoot, { recursive: true });
  await writeFile(
    path.join(taskRoot, 'task_plan.md'),
    [
      '# Compact Task',
      '',
      '## Goal',
      '- Keep Copilot hook payload budget output visible.',
      '',
      '## Current State',
      'Status: active',
      'Archive Eligible: no',
      'Close Reason:',
      '',
      '### Phase 1: Stabilize prompt recovery',
      '- **Status:** in_progress',
      ...repeatedPlanBullets
    ].join('\n')
  );
  await writeFile(path.join(taskRoot, 'findings.md'), ['# Findings', '', ...repeatedFindings].join('\n'));
  await writeFile(
    path.join(taskRoot, 'progress.md'),
    [
      '# Progress',
      '',
      ...repeatedProgress,
      '',
      '## Error Log',
      '| Error | Status |',
      '| --- | --- |',
      '| Repeated prompt budget overflow | open |'
    ].join('\n')
  );
}

async function writeBudgetFixture(root, hookPayload) {
  await writeFile(
    path.join(root, 'harness/core/context-budgets.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        budgets: {
          entry: {
            warn: { chars: 30000, lines: 500, tokens: 7500 },
            problem: { chars: 45000, lines: 750, tokens: 11250 }
          },
          hookPayload,
          planningHotContext: {
            warn: { chars: 16000, lines: 240, tokens: 4000 },
            problem: { chars: 24000, lines: 360, tokens: 6000 }
          },
          skillProfile: {
            warn: { chars: 22000, lines: 320, tokens: 5500 },
            problem: { chars: 32000, lines: 480, tokens: 8000 }
          }
        }
      },
      null,
      2
    )}\n`
  );
}
