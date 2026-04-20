import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readHarnessHealth } from '../../harness/installer/lib/health.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import { measureText } from '../../harness/installer/lib/context-budget.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

test('readHarnessHealth reports entry and skill status per target', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.targets.codex.entries[0].status, 'ok');
    assert.equal(
      health.targets.codex.skills.find((skill) => skill.skillName === 'using-superpowers').status,
      'ok'
    );
    assert.equal(
      health.targets.copilot.skills.find((skill) => skill.skillName === 'planning-with-files').status,
      'ok'
    );
    assert.equal(health.problems.length, 0);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth honors minimal-global selection boundaries', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      skillProfile: 'minimal-global',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await mkdir(path.join(root, '.agents/skills/using-git-worktrees'), { recursive: true });
    await writeFile(path.join(root, '.agents/skills/using-git-worktrees/NOT_SELECTED.txt'), 'ignored');
    await rm(path.join(root, '.agents/skills/using-superpowers'), { recursive: true, force: true });

    const health = await readHarnessHealth(root, '/home/user');

    assert.ok(
      !health.targets.codex.skills.some((skill) => skill.skillName === 'using-git-worktrees'),
      'minimal-global should not inspect unselected heavy skills'
    );
    assert.ok(
      health.problems.some((problem) => problem.includes('using-superpowers')),
      'missing allow-listed skill should be reported'
    );
    assert.ok(!health.problems.some((problem) => problem.includes('using-git-worktrees')));
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth includes entry context measurements and warning verdicts', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, 'harness/core/context-budgets.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          budgets: {
            entry: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 100000, lines: 100000, tokens: 100000 }
            },
            hookPayload: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            },
            planningHotContext: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            },
            skillProfile: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            }
          }
        },
        null,
        2
      )}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.context.entries.length, 1);
    assert.equal(health.context.entries[0].target, 'codex');
    assert.equal(health.context.entries[0].path, path.join(root, 'AGENTS.md'));
    assert.ok(health.context.entries[0].measurement.chars > 0);
    assert.ok(health.context.entries[0].measurement.lines > 0);
    assert.equal(health.context.entries[0].evaluation.verdict, 'warning');
    assert.equal(health.context.entries[0].evaluation.checks.length, 3);
    assert.equal(health.context.summary.entries.verdict, 'warning');
    assert.ok(health.context.summary.entries.evaluation);
    assert.ok(health.context.warnings.some((warning) => warning.includes('context entry codex')));
    assert.equal(health.problems.length, 0);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth summarizes entry context by worst target session', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] },
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] },
        'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, 'harness/core/context-budgets.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          budgets: {
            entry: {
              warn: { chars: 100000, lines: 300, tokens: 100000 },
              problem: { chars: 200000, lines: 400, tokens: 200000 }
            },
            hookPayload: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            },
            planningHotContext: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            },
            skillProfile: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            }
          }
        },
        null,
        2
      )}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');
    const crossTargetLines = health.context.entries.reduce(
      (sum, entry) => sum + entry.measurement.lines,
      0
    );

    assert.equal(health.context.entries.length, 4);
    assert.ok(crossTargetLines >= 400);
    assert.equal(health.context.summary.entries.verdict, 'ok');
    assert.equal(health.context.summary.entries.targets.length, 4);
    assert.ok(health.context.summary.entries.lines < crossTargetLines);
    assert.ok(!health.context.warnings.some((warning) => warning.includes('entry summary')));
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth fails when a target session aggregate exceeds the entry budget', async (t) => {
  const root = await createHarnessFixture();
  try {
    const home = path.join(root, 'home');
    await mkdir(home, { recursive: true });
    t.mock.method(os, 'homedir', () => home);

    await writeState(root, {
      schemaVersion: 1,
      scope: 'both',
      projectionMode: 'portable',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, 'harness/core/context-budgets.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          budgets: {
            entry: {
              warn: { chars: 100000, lines: 180, tokens: 100000 },
              problem: { chars: 200000, lines: 220, tokens: 200000 }
            },
            hookPayload: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            },
            planningHotContext: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            },
            skillProfile: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            }
          }
        },
        null,
        2
      )}\n`
    );

    const health = await readHarnessHealth(root, home);
    const summaryProblem = 'context entry summary codex problem';

    assert.equal(health.context.summary.entries.target, 'codex');
    assert.equal(health.context.summary.entries.verdict, 'problem');
    assert.ok(health.context.warnings.some((warning) => warning.includes(summaryProblem)));
    assert.ok(health.problems.some((problem) => problem.includes(summaryProblem)));
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth degrades gracefully when context budgets are malformed', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(path.join(root, 'harness/core/context-budgets.json'), '{\n');

    const health = await readHarnessHealth(root, '/home/user');

    assert.ok(
      health.problems.some((problem) => problem.includes('context-budgets.json is malformed JSON'))
    );
    assert.equal(health.context.entries.length, 1);
    assert.equal(health.context.hooks.length, 0);
    assert.equal(health.context.planning.length, 0);
    assert.equal(health.context.skillProfiles.length, 0);
    assert.equal(health.context.summary.entries.verdict, 'unknown');
    assert.equal(health.context.summary.entries.evaluation, null);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth degrades gracefully when context budgets have an invalid shape', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, 'harness/core/context-budgets.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          budgets: {
            entry: {
              warn: { chars: 1, lines: 1, tokens: 1 }
            },
            hookPayload: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            },
            planningHotContext: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            },
            skillProfile: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
            }
          }
        },
        null,
        2
      )}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');

    assert.ok(
      health.problems.some((problem) => problem.includes('context-budgets.json is invalid'))
    );
    assert.ok(
      health.problems.some((problem) => problem.includes('budgets.entry.problem must be a JSON object'))
    );
    assert.equal(health.context.entries.length, 1);
    assert.equal(health.context.summary.entries.verdict, 'unknown');
    assert.equal(health.context.summary.entries.evaluation, null);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports a problem when the planning-with-files companion-plan patch marker is missing', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    const skillPath = path.join(root, '.agents/skills/planning-with-files/SKILL.md');
    const original = await readFile(skillPath, 'utf8');
    await writeFile(
      skillPath,
      original.replace('## Harness planning-with-files companion-plan patch\n\n', '')
    );

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.codex.skills.find((skill) => skill.skillName === 'planning-with-files');

    assert.equal(planning.status, 'problem');
    assert.match(
      planning.message,
      /Materialized skill is missing the Harness patch marker: Harness planning-with-files companion-plan patch/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth exposes sync timestamps and upstream state', async () => {
  const root = await createHarnessFixture();
  try {
    const upstream = {
      'planning-with-files': {
        candidatePath: '.harness/upstream-candidates/planning-with-files',
        appliedPath: 'harness/upstream/planning-with-files',
        lastFetch: '2026-04-13T01:00:00.000Z',
        lastUpdate: '2026-04-13T02:00:00.000Z'
      }
    };

    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {},
      upstream,
      lastSync: '2026-04-13T00:00:00.000Z',
      lastFetch: '2026-04-13T01:00:00.000Z',
      lastUpdate: '2026-04-13T02:00:00.000Z'
    });

    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.lastSync, '2026-04-13T00:00:00.000Z');
    assert.equal(health.lastFetch, '2026-04-13T01:00:00.000Z');
    assert.equal(health.lastUpdate, '2026-04-13T02:00:00.000Z');
    assert.deepEqual(health.upstream, upstream);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth filters upstream state to public status fields', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {},
      upstream: {
        'planning-with-files': {
          candidatePath: '.harness/upstream-candidates/planning-with-files',
          appliedPath: 'harness/upstream/planning-with-files',
          lastFetch: '2026-04-13T01:00:00.000Z',
          lastUpdate: '2026-04-13T02:00:00.000Z',
          privateToken: 'secret',
          url: 'https://example.invalid/source.git'
        }
      }
    });

    const health = await readHarnessHealth(root, '/home/user');

    assert.deepEqual(health.upstream, {
      'planning-with-files': {
        candidatePath: '.harness/upstream-candidates/planning-with-files',
        appliedPath: 'harness/upstream/planning-with-files',
        lastFetch: '2026-04-13T01:00:00.000Z',
        lastUpdate: '2026-04-13T02:00:00.000Z'
      }
    });
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports hook status without failing unsupported adapters', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] },
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.hookMode, 'on');
    assert.equal(
      health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files').status,
      'ok'
    );
    assert.equal(
      health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'superpowers').status,
      'ok'
    );
    assert.equal(
      health.targets.codex.hooks.find((hook) => hook.parentSkillName === 'superpowers').status,
      'ok'
    );
    assert.equal(health.problems.length, 0);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth measures projected hook runtime scripts', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await rm(path.join(root, 'planning/active'), { recursive: true, force: true });
    await mkdir(path.join(root, 'planning/active/compact-task'), { recursive: true });
    await writeFile(
      path.join(root, 'planning/active/compact-task/task_plan.md'),
      [
        '# Compact Task',
        '',
        '## 任务目标',
        '- Keep projected runtime measurement visible.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');

    await withCwd(root, () => sync([]));

    const projectedScript = path.join(root, '.codex/hooks/session-start');
    const projectedOutput = [
      '#!/usr/bin/env bash',
      `printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"projected runtime marker"}}'`
    ].join('\n');
    await writeFile(projectedScript, projectedOutput);

    const health = await readHarnessHealth(root, '/home/user');
    const superpowersPayload = health.context.hooks.find(
      (hook) => hook.parentSkillName === 'superpowers' && hook.eventName === 'SessionStart'
    );

    assert.equal(superpowersPayload.runtimePath, projectedScript);
    assert.equal(
      superpowersPayload.measurement.chars,
      measureText(
        '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"projected runtime marker"}}\n'
      ).chars
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth records measured hook payloads in context', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await mkdir(path.join(root, 'planning/active/compact-task'), { recursive: true });
    await writeFile(
      path.join(root, 'planning/active/compact-task/task_plan.md'),
      [
        '# Compact Task',
        '',
        '## 任务目标',
        '- Keep hook payload measurements visible.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');

    const superpowersPayload = health.context.hooks.find(
      (hook) => hook.parentSkillName === 'superpowers' && hook.eventName === 'SessionStart'
    );
    const planningPayload = health.context.hooks.find(
      (hook) => hook.parentSkillName === 'planning-with-files' && hook.eventName === 'UserPromptSubmit'
    );

    assert.ok(superpowersPayload);
    assert.ok(planningPayload);
    assert.equal(superpowersPayload.evaluation.verdict, 'ok');
    assert.equal(planningPayload.evaluation.verdict, 'ok');
    assert.ok(health.problems.length === 0);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth records hook payload warning verdicts in context warnings', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await rm(path.join(root, 'planning/active'), { recursive: true, force: true });
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
            hookPayload: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 100000, lines: 100000, tokens: 100000 }
            },
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

    await mkdir(path.join(root, 'planning/active/compact-task'), { recursive: true });
    await writeFile(
      path.join(root, 'planning/active/compact-task/task_plan.md'),
      [
        '# Compact Task',
        '',
        '## 任务目标',
        '- Keep hook payload warnings visible.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');

    assert.ok(
      health.context.warnings.some((warning) =>
        warning.includes('context hook payload codex superpowers SessionStart warning')
      )
    );
    assert.ok(
      health.warnings.some((warning) =>
        warning.includes('context hook payload codex superpowers SessionStart warning')
      )
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth records hook payload problems in both warnings and problems', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await rm(path.join(root, 'planning/active'), { recursive: true, force: true });
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
            hookPayload: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 1, lines: 1, tokens: 1 }
            },
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

    await mkdir(path.join(root, 'planning/active/compact-task'), { recursive: true });
    await writeFile(
      path.join(root, 'planning/active/compact-task/task_plan.md'),
      [
        '# Compact Task',
        '',
        '## 任务目标',
        '- Trigger hook payload problems.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');

    assert.ok(
      health.context.warnings.some((warning) =>
        warning.includes('context hook payload codex superpowers SessionStart problem')
      )
    );
    assert.ok(
      health.problems.some((problem) =>
        problem.includes('context hook payload codex superpowers SessionStart problem')
      )
    );
    assert.equal(
      health.context.hooks.find((hook) => hook.parentSkillName === 'superpowers' && hook.eventName === 'SessionStart').status,
      'problem'
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth records hook payload output validation failures', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await mkdir(path.join(root, 'planning/active/compact-task'), { recursive: true });
    await writeFile(
      path.join(root, 'planning/active/compact-task/task_plan.md'),
      [
        '# Compact Task',
        '',
        '## 任务目标',
        '- Trigger hook payload validation failures.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, '.codex/hooks/session-start'),
      [
        '#!/usr/bin/env bash',
        "printf '%s\\n' 'not-json-output'",
        'exit 0'
      ].join('\n')
    );

    const health = await readHarnessHealth(root, '/home/user');
    const superpowersPayload = health.context.hooks.find(
      (hook) => hook.parentSkillName === 'superpowers' && hook.eventName === 'SessionStart'
    );

    assert.equal(superpowersPayload.status, 'problem');
    assert.match(superpowersPayload.message, /not valid JSON/);
    assert.ok(
      health.problems.some((problem) => problem.includes('Hook payload output is not valid JSON'))
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports a problem when Codex hook config is missing a required event', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, '.codex/hooks.json'),
      `${JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                description: 'Harness-managed planning-with-files hook',
                hooks: [{ type: 'command', command: 'echo ok' }]
              }
            ],
            UserPromptSubmit: [
              {
                description: 'Harness-managed planning-with-files hook',
                hooks: [{ type: 'command', command: 'echo ok' }]
              }
            ]
          }
        },
        null,
        2
      )}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.codex.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'problem');
    assert.match(planning.message, /missing required event Stop/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('Cursor hooks are marked provisional when official hook docs are not cited', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await mkdir(path.join(root, 'planning/active/compact-task'), { recursive: true });
    await writeFile(
      path.join(root, 'planning/active/compact-task/task_plan.md'),
      [
        '# Compact Task',
        '',
        '## 任务目标',
        '- Keep measured hook payloads visible.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'ok');
    assert.equal(planning.evidenceLevel, 'provisional');
    assert.match(planning.message, /official Cursor hook documentation has not been verified/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports a problem when hook config exists without the managed entry', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, '.cursor/hooks.json'),
      `${JSON.stringify({ version: 1, hooks: { stop: [] } }, null, 2)}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'problem');
    assert.match(planning.message, /missing Harness-managed planning-with-files hook/);
    assert.ok(health.problems.some((problem) => problem.includes('planning-with-files')));
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth rejects hook config when marker only appears in a command string', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, '.cursor/hooks.json'),
      `${JSON.stringify(
        {
          version: 1,
          hooks: {
            stop: [
              {
                command: 'echo "Harness-managed planning-with-files hook"',
                description: 'User hook'
              }
            ]
          }
        },
        null,
        2
      )}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'problem');
    assert.match(planning.message, /missing Harness-managed planning-with-files hook/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports malformed JSON hook config as a problem', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(path.join(root, '.cursor/hooks.json'), '{\n');

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'problem');
    assert.equal(planning.message, 'Hook config is malformed JSON.');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth validates Claude Code settings hooks after sync', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets['claude-code'].hooks.find(
      (hook) => hook.parentSkillName === 'planning-with-files'
    );

    assert.equal(planning.status, 'ok');
    assert.equal(health.problems.length, 0);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports Claude shared skill root symlink as unsupported layout', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await rm(path.join(root, '.claude/skills'), { recursive: true, force: true });
    await mkdir(path.join(root, '.claude'), { recursive: true });
    await symlink(path.join(root, '.agents/skills'), path.join(root, '.claude/skills'), 'dir');

    const health = await readHarnessHealth(root, '/home/user');
    const skill = health.targets['claude-code'].skills.find(
      (entry) => entry.skillName === 'using-superpowers'
    );

    assert.equal(skill.status, 'problem');
    assert.match(skill.message, /shared skill root symlinks are not supported/i);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth keeps referenced companion plans out of warnings', async () => {
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
      'Companion plan path: docs/superpowers/plans/feature-plan.md\n'
    );
    await writeFile(path.join(root, 'planning/active/task-a/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/task-a/progress.md'), '# Progress\n');
    await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });
    await writeFile(
      path.join(root, 'docs/superpowers/plans/feature-plan.md'),
      '# Companion plan\n\nActive task path: planning/active/task-a/\n'
    );

    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.problems.length, 0);
    assert.equal(health.warnings.length, 0);
    assert.ok(
      health.planLocations.some(
        (location) =>
          location.type === 'companion-plan' &&
          location.path === 'docs/superpowers/plans/feature-plan.md' &&
          location.referencedBy.includes('planning/active/task-a/task_plan.md') &&
          location.pointsBackTo.includes('planning/active/task-a/')
      )
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth warns when a companion plan does not point back to its active task', async () => {
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
      'Companion plan path: docs/superpowers/plans/feature-plan.md\n'
    );
    await writeFile(path.join(root, 'planning/active/task-a/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/task-a/progress.md'), '# Progress\n');
    await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });
    await writeFile(path.join(root, 'docs/superpowers/plans/feature-plan.md'), '# Companion plan\n');

    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.problems.length, 0);
    assert.ok(
      health.warnings.some((warning) =>
        warning.includes(
          'docs/superpowers/plans/feature-plan.md: Companion plan is referenced by active task planning files but does not point back to planning/active/<task-id>/'
        )
      )
    );
    assert.ok(
      health.planLocations.some(
        (location) =>
          location.type === 'companion-plan-missing-back-reference' &&
          location.path === 'docs/superpowers/plans/feature-plan.md' &&
          location.referencedBy.includes('planning/active/task-a/task_plan.md')
      )
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth warns about orphan companion plans', async () => {
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
    await writeFile(path.join(root, 'planning/active/task-a/task_plan.md'), '# Task plan\n');
    await writeFile(path.join(root, 'planning/active/task-a/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/task-a/progress.md'), '# Progress\n');
    await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });
    await writeFile(path.join(root, 'docs/superpowers/plans/orphan.md'), '# Orphan companion\n');

    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.problems.length, 0);
    assert.ok(
      health.warnings.some((warning) =>
        warning.includes('docs/superpowers/plans/orphan.md: Companion plan is not referenced by any active task planning file')
      )
    );
    assert.ok(
      health.planLocations.some(
        (location) =>
          location.type === 'orphan-companion-plan' &&
          location.path === 'docs/superpowers/plans/orphan.md'
      )
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports unreadable canonical planning paths as problems', async () => {
  const root = await createHarnessFixture();
  const unreadablePath = path.join(root, 'planning/active/task-a/findings.md');

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
    await writeFile(path.join(root, 'planning/active/task-a/task_plan.md'), '# Task plan\n');
    await mkdir(unreadablePath, { recursive: true });
    await writeFile(path.join(root, 'planning/active/task-a/progress.md'), '# Progress\n');
    await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });
    await writeFile(path.join(root, 'docs/superpowers/plans/orphan.md'), '# Orphan companion\n');

    const health = await readHarnessHealth(root, '/home/user');

    assert.ok(
      health.problems.some((problem) =>
        problem.includes('planning/active/task-a/findings.md: Canonical planning file exists but could not be read')
      )
    );
    assert.ok(
      health.problems.some((problem) =>
        problem.includes(
          'docs/superpowers/plans/orphan.md: Companion plan reference status could not be determined because one or more canonical planning files are unreadable.'
        )
      )
    );
    assert.ok(
      !health.warnings.some((warning) => warning.includes('docs/superpowers/plans/orphan.md'))
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth keeps root-level planning files and docs/plans as warnings', async () => {
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

    await mkdir(path.join(root, 'docs/plans'), { recursive: true });
    await writeFile(path.join(root, 'docs/plans/feature-doc.md'), '# Human-facing plan\n');
    await writeFile(path.join(root, 'task_plan.md'), '# Root plan\n');

    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.problems.length, 0);
    assert.ok(
      health.warnings.some((warning) =>
        warning.includes('task_plan.md: task_plan.md is outside planning/active/<task-id>/')
      )
    );
    assert.ok(
      health.warnings.some((warning) =>
        warning.includes('docs/plans: docs/plans contains plan files outside planning/active/<task-id>/')
      )
    );
  } finally {
    await removeHarnessFixture(root);
  }
});
