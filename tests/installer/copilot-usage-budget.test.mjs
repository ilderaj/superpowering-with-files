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

test('doctor reports Copilot hook ledger detail and overlap as recoverable warnings', async () => {
  const root = await createHarnessFixture();
  const home = path.join(root, 'home');
  try {
    await mkdir(home, { recursive: true });
    await writeState(root, {
      schemaVersion: 1,
      scope: 'both',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        copilot: {
          enabled: true,
          paths: [
            path.join(root, '.github/copilot-instructions.md'),
            path.join(home, '.copilot/instructions/harness.instructions.md')
          ]
        }
      },
      upstream: {}
    });

    await mkdir(path.join(root, 'planning/active/compact-task'), { recursive: true });
    await writeFile(
      path.join(root, 'planning/active/compact-task/task_plan.md'),
      [
        '# Compact Task',
        '',
        '## Goal',
        '- Keep Copilot doctor budget output visible.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');

    await harnessCommand(root, { HOME: home }, 'sync');
    const { stdout } = await harnessCommand(root, { HOME: home }, 'doctor', '--check-only');

    assert.match(stdout, /Hook payload detail:/);
    assert.match(stdout, /copilot \/ planning-brief \/ ok \/ \d+ tokens/);
    assert.match(stdout, /Scope overlap verdict: warning/);
    assert.match(stdout, /Harness check passed\./);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('copilot hook payload budget fails when planning-hot exceeds the copilot threshold', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        copilot: {
          enabled: true,
          paths: [path.join(root, '.github/copilot-instructions.md')]
        }
      },
      upstream: {}
    });
    await writeCopilotPlanningFixture(root, 'copilot-budget-problem');
    await writeBudgetFixture(root, {
      warn: { chars: 12000, lines: 160, tokens: 3000 },
      problem: { chars: 18000, lines: 240, tokens: 4500 },
      targets: {
        copilot: {
          warn: { chars: 1200, lines: 24, tokens: 300 },
          problem: { chars: 2000, lines: 40, tokens: 500 }
        }
      }
    });

    await harnessCommand(root, {}, 'sync');
    await harnessCommand(root, {}, 'verify', '--output=.harness/verification-ledger');

    const report = JSON.parse(
      await readFile(path.join(root, '.harness/verification-ledger/latest.json'), 'utf8')
    );

    assert.ok(report.health.context.summary.hooks.approxTokens > 500);
    assert.equal(report.health.context.summary.hooks.target, 'copilot');
    assert.equal(report.health.context.summary.hooks.verdict, 'problem');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('doctor reports the copilot overlap tax only once', async () => {
  const root = await createHarnessFixture();
  const home = path.join(root, 'home');
  try {
    await mkdir(home, { recursive: true });
    await writeState(root, {
      schemaVersion: 1,
      scope: 'both',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        copilot: {
          enabled: true,
          paths: [
            path.join(root, '.github/copilot-instructions.md'),
            path.join(home, '.copilot/instructions/harness.instructions.md')
          ]
        }
      },
      upstream: {}
    });
    await writeCopilotPlanningFixture(root, 'copilot-overlap-tax');

    await harnessCommand(root, { HOME: home }, 'sync');
    const { stdout, stderr } = await harnessCommand(root, { HOME: home }, 'doctor', '--check-only');
    const matches = `${stdout}\n${stderr}`.match(/choose one canonical scope for Copilot/gi) ?? [];

    assert.equal(matches.length, 1);
  } finally {
    await removeHarnessFixture(root);
  }
});
