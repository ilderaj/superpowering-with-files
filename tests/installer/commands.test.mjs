import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readState, writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root
  });
}

function harnessCommandWithEnv(root, env, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root,
    env: { ...process.env, ...env }
  });
}

test('harness --help prints top-level usage', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, '--help');
    assert.match(stdout, /Usage: \.\/scripts\/harness <command>/);
    assert.match(stdout, /checkpoint  Create a safety checkpoint/);
    assert.match(
      stdout,
      /checkpoint-push  Verify, record review evidence, commit, and push a recovery branch/
    );
    assert.match(
      stdout,
      /worktree-name  Suggest a canonical worktree label and branch name for the active task/
    );
    assert.match(stdout, /verify   Print or write verification reports/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync --help prints usage without executing sync', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, 'sync', '--help');
    assert.match(stdout, /Usage: \.\/scripts\/harness sync/);
    await assert.rejects(access(path.join(root, '.harness/projections.json')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('verify --help prints usage without writing reports', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, 'verify', '--help');
    assert.match(stdout, /Usage: \.\/scripts\/harness verify/);
    await assert.rejects(access(path.join(root, 'reports/verification/latest.md')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('adopt-global --help describes explicit skills profile precedence', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, 'adopt-global', '--help');
    assert.match(stdout, /Usage: \.\/scripts\/harness adopt-global/);
    assert.match(stdout, /--skills-profile=<name>\s+Override the skills profile; explicit values always win\./);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('install stores the selected entry and skills profiles in state', async () => {
  const root = await createHarnessFixture();
  try {
    await harnessCommand(
      root,
      'install',
      '--scope=workspace',
      '--targets=codex',
      '--profile=safety',
      '--skills-profile=minimal-global'
    );

    const state = await readState(root);
    assert.equal(state.policyProfile, 'safety');
    assert.equal(state.skillProfile, 'minimal-global');
    assert.equal(state.scope, 'workspace');
    assert.equal(state.targets.codex.enabled, true);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('install defaults Copilot-only installs to copilot-default skills profile', async () => {
  const root = await createHarnessFixture();
  try {
    await harnessCommand(root, 'install', '--scope=workspace', '--targets=copilot');

    const state = await readState(root);
    assert.equal(state.skillProfile, 'copilot-default');
    assert.equal(state.targets.copilot.enabled, true);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('install lets an explicit Copilot skills profile override win over the default', async () => {
  const root = await createHarnessFixture();
  try {
    await harnessCommand(
      root,
      'install',
      '--scope=workspace',
      '--targets=copilot',
      '--skills-profile=minimal-global'
    );

    const state = await readState(root);
    assert.equal(state.skillProfile, 'minimal-global');
    assert.equal(state.targets.copilot.enabled, true);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('install rejects an unknown skills profile', async () => {
  const root = await createHarnessFixture();
  try {
    await assert.rejects(
      harnessCommand(root, 'install', '--scope=workspace', '--targets=codex', '--skills-profile=unknown'),
      /Invalid skills profile/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('install rejects safety profiles outside workspace scope', async () => {
  const root = await createHarnessFixture();
  try {
    await assert.rejects(
      harnessCommand(root, 'install', '--scope=user-global', '--targets=all', '--profile=safety'),
      /Safety profiles are workspace-only/
    );
    await assert.rejects(
      harnessCommand(root, 'install', '--scope=both', '--targets=all', '--profile=cloud-safe'),
      /Safety profiles are workspace-only/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync uses the stored entry profile when rendering entries', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      policyProfile: 'safety',
      skillProfile: 'full',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await harnessCommand(root, 'sync');
    const entry = await readFile(path.join(root, 'AGENTS.md'), 'utf8');

    assert.match(entry, /# Safety Policy/);
    assert.match(entry, /Never run agents from HOME/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync keeps always-on-core state while rendering a thinner Copilot entry', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      policyProfile: 'always-on-core',
      skillProfile: 'full',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await harnessCommand(root, 'sync');
    const entry = await readFile(path.join(root, '.github/copilot-instructions.md'), 'utf8');
    const state = await readState(root);

    assert.equal(state.policyProfile, 'always-on-core');
    assert.match(entry, /Task Classification/);
    assert.doesNotMatch(entry, /When Superpowers Is Allowed/);
    assert.doesNotMatch(entry, /When Superpowers Is Not Allowed/);
    assert.doesNotMatch(entry, /Tool Preferences/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync --dry-run prints diff without writing files or state', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    const { stdout } = await harnessCommand(root, 'sync', '--dry-run');
    const state = await readState(root);

    assert.match(stdout, /"mode": "dry-run"/);
    assert.match(stdout, /"create":/);
    assert.equal(state.lastSync, undefined);
    await assert.rejects(access(path.join(root, 'AGENTS.md')), /ENOENT/);
    await assert.rejects(access(path.join(root, '.harness/projections.json')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync --check exits non-zero when projections are out of sync and does not write files', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await assert.rejects(
      harnessCommand(root, 'sync', '--check'),
      /Harness sync check failed: projections are out of sync/
    );
    await assert.rejects(access(path.join(root, 'AGENTS.md')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('verify prints to stdout by default without writing reports', async () => {
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

    const { stdout } = await harnessCommand(root, 'verify');
    assert.match(stdout, /# Harness Verification Report/);
    assert.match(stdout, /Context entry verdict:/);
    assert.match(stdout, /Hook payload verdict:/);
    assert.match(stdout, /Planning hot context verdict:/);
    assert.match(stdout, /Skill profile verdict:/);
    await assert.rejects(access(path.join(root, 'reports/verification/latest.md')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('verify renders overlap and per-target hook ledger rows when Copilot is enabled', async () => {
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
        '- Keep Copilot verification ledger output visible.',
        '',
        '## Current State',
        'Status: active',
        'Archive Eligible: no'
      ].join('\n')
    );
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');

    await harnessCommandWithEnv(root, { HOME: home }, 'sync');
    const { stdout } = await harnessCommandWithEnv(root, { HOME: home }, 'verify');

    assert.match(stdout, /Hook payload verdict:/);
    assert.match(stdout, /Hook payload target: copilot/);
    assert.match(stdout, /Hook payload detail:/);
    assert.match(stdout, /copilot \/ planning-hot \/ (?:ok|problem) \/ \d+ tokens/);
    assert.match(stdout, /Scope overlap verdict: warning/);
    assert.match(stdout, /Scope overlap detail: copilot -> workspace \+ user-global/);
    assert.match(stdout, /Recommended action: choose one canonical scope for Copilot/i);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('verify --output writes report files only to the requested directory', async () => {
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

    await harnessCommand(root, 'verify', '--output=.harness/custom-verification');

    const markdown = await readFile(path.join(root, '.harness/custom-verification/latest.md'), 'utf8');
    const report = JSON.parse(
      await readFile(path.join(root, '.harness/custom-verification/latest.json'), 'utf8')
    );

    assert.match(markdown, /Context entry verdict:/);
    assert.match(markdown, /Hook payload verdict:/);
    assert.match(markdown, /Planning hot context verdict:/);
    assert.match(markdown, /Skill profile verdict:/);
    assert.equal(report.health.context.summary.entries.verdict, 'ok');
    assert.equal(report.health.context.summary.hooks.verdict, 'ok');
    assert.equal(report.health.context.summary.planning.verdict, 'ok');
    assert.equal(report.health.context.summary.skillProfiles.verdict, 'ok');
    assert.equal(report.health.context.entries.length, 0);
    assert.ok(Array.isArray(report.health.context.warnings));
    await assert.rejects(access(path.join(root, 'reports/verification/latest.md')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('verify tolerates malformed context budgets and records a problem', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await harnessCommand(root, 'sync');
    await writeFile(path.join(root, 'harness/core/context-budgets.json'), '{\n');

    await harnessCommand(root, 'verify', '--output=.harness/broken-verification');

    const report = JSON.parse(
      await readFile(path.join(root, '.harness/broken-verification/latest.json'), 'utf8')
    );
    const markdown = await readFile(path.join(root, '.harness/broken-verification/latest.md'), 'utf8');

    assert.match(markdown, /Context entries:/);
    assert.ok(
      report.health.problems.some((problem) => problem.includes('context-budgets.json is malformed JSON'))
    );
    assert.equal(report.health.context.summary.entries.verdict, 'unknown');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('verify tolerates structurally invalid context budgets and records a problem', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await harnessCommand(root, 'sync');
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

    await harnessCommand(root, 'verify', '--output=.harness/invalid-shape-verification');

    const report = JSON.parse(
      await readFile(path.join(root, '.harness/invalid-shape-verification/latest.json'), 'utf8')
    );

    assert.ok(
      report.health.problems.some((problem) => problem.includes('context-budgets.json is invalid'))
    );
    assert.equal(report.health.context.summary.entries.verdict, 'unknown');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('doctor prints a budget problem only once', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await harnessCommand(root, 'sync');
    await writeFile(
      path.join(root, 'harness/core/context-budgets.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          budgets: {
            entry: {
              warn: { chars: 1, lines: 1, tokens: 1 },
              problem: { chars: 2, lines: 2, tokens: 2 }
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

    let error;
    try {
      await harnessCommand(root, 'doctor', '--check-only');
      assert.fail('doctor should exit non-zero when a budget problem is present');
    } catch (caught) {
      error = caught;
    }

    assert.match(error.stderr, /context entry codex .*problem:/);
    assert.equal((error.stderr.match(/context entry codex .*problem:/g) ?? []).length, 1);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('doctor prints context warnings without failing the installation', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await harnessCommand(root, 'sync');
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

    const { stdout, stderr } = await harnessCommand(root, 'doctor', '--check-only');
    assert.match(stderr, /context entry codex/i);
    assert.match(stdout, /Harness check passed\./);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('doctor prints safety checks for safety profile installs', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'safety',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await harnessCommand(root, 'sync');
    const { stdout } = await harnessCommand(root, 'doctor', '--check-only');

    assert.match(stdout, /Safety checks:/);
    assert.match(stdout, /checkpointExecutable: ok/);
    assert.match(stdout, /riskAssessmentTemplatePatched: ok/);
    assert.match(stdout, /Harness check passed\./);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('doctor prints overlap governance guidance without failing a recoverable Copilot overlap', async () => {
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

    await harnessCommandWithEnv(root, { HOME: home }, 'sync');
    const { stdout, stderr } = await harnessCommandWithEnv(root, { HOME: home }, 'doctor', '--check-only');

    assert.match(stdout, /Scope overlap verdict: warning/);
    assert.match(stdout, /Scope overlap detail: copilot -> workspace \+ user-global/);
    assert.match(stdout, /Recommended action: choose one canonical scope for Copilot/i);
    assert.match(stderr, /scope overlap copilot/i);
    assert.match(stdout, /Harness check passed\./);
  } finally {
    await removeHarnessFixture(root);
  }
});
