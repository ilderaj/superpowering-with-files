import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { readState, writeState } from '../../../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../../../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, homeDir, ...args) {
  const maybeOptions = args.at(-1);
  const options =
    maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions) ? args.pop() : {};

  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      HOME: homeDir
    }
  });
}

async function git(root, ...args) {
  return execFileAsync('git', args, { cwd: root });
}

async function initGitRepo(root) {
  await git(root, 'init');
  await git(root, 'config', 'user.name', 'Harness Test');
  await git(root, 'config', 'user.email', 'harness@example.com');
  await git(root, 'add', '.');
  await git(root, 'commit', '-m', 'Initial fixture');
}

async function writePlanningTask(
  root,
  taskId,
  {
    taskPlan = [
      '# Workflow Task',
      '',
      '## Goal',
      '- Replay the main user-visible workflow families on a fresh fixture.',
      '',
      '## Current State',
      'Status: active',
      'Archive Eligible: no',
      'Close Reason:',
      '',
      '### Phase 1: Workspace workflow replay',
      '- **Status:** in_progress'
    ].join('\n'),
    findings = '# Findings\n',
    progress = '# Progress\n',
    reconciliation
  } = {}
) {
  const taskDir = path.join(root, 'planning/active', taskId);
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'task_plan.md'), taskPlan, 'utf8');
  await writeFile(path.join(taskDir, 'findings.md'), findings, 'utf8');
  await writeFile(path.join(taskDir, 'progress.md'), progress, 'utf8');

  if (reconciliation !== undefined) {
    await writeFile(path.join(taskDir, 'reconciliation.md'), reconciliation, 'utf8');
  }
}

async function writeWorkflowTask(root) {
  await writePlanningTask(root, 'workflow-task');
}

async function seedCompactTask(root) {
  await writePlanningTask(root, 'compact-task', {
    taskPlan: '# Compact Task\n\n## Current State\nStatus: active\nArchive Eligible: no\n'
  });
}

async function seedLifecycleOpenTask(root) {
  await writePlanningTask(root, 'workflow-task', {
    taskPlan: [
      '# Workflow Task',
      '',
      '## Goal',
      '- Replay lifecycle-sensitive status surfaces on a fresh fixture.',
      '',
      '## Current State',
      'Status: closed',
      'Archive Eligible: yes',
      'Close Reason: implementation landed',
      'Reconcile: open',
      '',
      '### Phase 1: Lifecycle replay',
      '- **Status:** complete'
    ].join('\n'),
    progress: [
      '# Progress',
      '',
      '## Reconciliation',
      '- Ready / Not ready, with reason.'
    ].join('\n')
  });
}

function collectAdoptionStatePaths(root, homeDir, target) {
  if (target === 'copilot') {
    return [
      path.join(root, '.github/copilot-instructions.md'),
      path.join(homeDir, '.copilot/instructions/harness.instructions.md')
    ];
  }

  return [path.join(root, 'AGENTS.md'), path.join(homeDir, '.codex/AGENTS.md')];
}

async function seedUserGlobalState(root, homeDir, target = 'codex') {
  await writeState(root, {
    schemaVersion: 1,
    scope: 'user-global',
    projectionMode: 'link',
    hookMode: 'off',
    policyProfile: 'always-on-core',
    skillProfile: 'full',
    targets: {
      [target]: {
        enabled: true,
        paths: collectAdoptionStatePaths(root, homeDir, target)
      }
    },
    upstream: {}
  });
}

async function buildLifecycleScenarios(root, homeDir, leafDir) {
  const scenarios = [];

  scenarios.push(
    await executeScenario(
      'active-summary-reconciliation-open',
      'Active summary keeps archive-eligible tasks with open reconciliation signals marked as not ready',
      async () => {
        await seedLifecycleOpenTask(root);
        const result = await harnessCommand(root, homeDir, 'active-summary', '--json', { cwd: leafDir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          report: JSON.parse(result.stdout)
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'adoption-status-state-mismatch',
      'Adoption status surfaces user-global drift when install state mutates after adoption',
      async () => {
        await seedUserGlobalState(root, homeDir, 'codex');
        await harnessCommand(root, homeDir, 'adopt-global', '--targets=codex', { cwd: leafDir });

        const state = await readState(root);
        await writeState(root, {
          ...state,
          policyProfile: 'tracked-task-extended',
          workspacePolicyOverlay: null,
          skillProfile: 'full'
        });

        const result = await harnessCommand(root, homeDir, 'adoption-status', { cwd: leafDir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          status: JSON.parse(result.stdout)
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'adoption-status-copilot-overlap',
      'Adoption status reports workspace Copilot overlap after a user-global adoption drifts into both scope',
      async () => {
        await seedUserGlobalState(root, homeDir, 'copilot');
        await harnessCommand(root, homeDir, 'adopt-global', '--targets=copilot', { cwd: leafDir });

        const state = await readState(root);
        await writeState(root, {
          ...state,
          scope: 'both',
          targets: {
            copilot: {
              enabled: true,
              paths: collectAdoptionStatePaths(root, homeDir, 'copilot')
            }
          }
        });

        await harnessCommand(root, homeDir, 'sync', { cwd: leafDir });
        const result = await harnessCommand(root, homeDir, 'adoption-status', { cwd: leafDir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          status: JSON.parse(result.stdout)
        };
      }
    )
  );

  return scenarios;
}

async function buildTrustBoundaryScenarios(root, homeDir, leafDir) {
  const scenarios = [];

  scenarios.push(
    await executeScenario(
      'adoption-status-claude-code-runtime-reason',
      'Adoption status keeps Claude Code runtime evidence as a non-failing in-sync reason',
      async () => {
        await seedCompactTask(root);
        await harnessCommand(root, homeDir, 'adopt-global', '--targets=claude-code', '--hooks=on', {
          cwd: leafDir
        });

        const result = await harnessCommand(root, homeDir, 'adoption-status', { cwd: leafDir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          status: JSON.parse(result.stdout)
        };
      }
    )
  );

  scenarios.push(
    await executeExpectedFailureScenario(
      'install-rejects-user-global-safety-profile',
      'Install rejects workspace-only safety profiles on a user-global install request',
      async () => {
        await harnessCommand(
          root,
          homeDir,
          'install',
          '--scope=user-global',
          '--targets=all',
          '--profile=safety',
          { cwd: leafDir }
        );
      }
    )
  );

  scenarios.push(
    await executeExpectedFailureScenario(
      'workspace-link-rejects-external-authority-root',
      'Workspace-link rejects authority roots that are outside the current leaf workspace ancestry',
      async () => {
        const externalRoot = await createHarnessFixture();
        try {
          await harnessCommand(root, homeDir, 'workspace-link', `--root=${externalRoot}`, { cwd: leafDir });
        } finally {
          await removeHarnessFixture(externalRoot);
        }
      }
    )
  );

  return scenarios;
}

async function buildMixedScopeScenarios(root, homeDir, leafDir) {
  const scenarios = [];

  scenarios.push(
    await executeScenario(
      'workspace-install-cursor-from-leaf',
      'Workspace Cursor install from a leaf directory projects the native rule path and stays verifiable',
      async () => {
        await harnessCommand(root, homeDir, 'install', '--scope=workspace', '--targets=cursor', {
          cwd: leafDir
        });
        await harnessCommand(root, homeDir, 'sync', { cwd: leafDir });

        const state = await readState(root);
        const verifyResult = await harnessCommand(root, homeDir, 'verify', { cwd: leafDir });

        return {
          stdout: verifyResult.stdout,
          stderr: verifyResult.stderr,
          state: {
            scope: state.scope,
            targets: Object.keys(state.targets),
            cursorRulePath: state.targets.cursor?.paths?.[0] ?? ''
          },
          verificationReport: {
            markdown: verifyResult.stdout
          }
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'verify-copilot-overlap-after-real-both-install',
      'A real both-scope Copilot install still surfaces overlap guidance in verify output',
      async () => {
        await harnessCommand(root, homeDir, 'install', '--scope=both', '--targets=copilot', '--hooks=on', {
          cwd: leafDir
        });
        const verifyResult = await harnessCommand(root, homeDir, 'verify', { cwd: leafDir });

        return {
          stdout: verifyResult.stdout,
          stderr: verifyResult.stderr,
          verificationReport: {
            markdown: verifyResult.stdout
          }
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'install-both-codex-defaults-minimal-global',
      'A both-scope Codex install keeps the minimal-global default and stays verifiable',
      async () => {
        await harnessCommand(root, homeDir, 'install', '--scope=both', '--targets=codex', { cwd: leafDir });
        const state = await readState(root);
        const verifyResult = await harnessCommand(root, homeDir, 'verify', { cwd: leafDir });

        return {
          stdout: verifyResult.stdout,
          stderr: verifyResult.stderr,
          state: {
            scope: state.scope,
            skillProfile: state.skillProfile
          },
          verificationReport: {
            markdown: verifyResult.stdout
          }
        };
      }
    )
  );

  return scenarios;
}

async function buildAdditionalTargetScenarios(root, homeDir, leafDir) {
  const scenarios = [];

  scenarios.push(
    await executeScenario(
      'workspace-install-copilot-default-profile',
      'A Copilot-only workspace install keeps the target-specific default profile and stays verifiable',
      async () => {
        await harnessCommand(root, homeDir, 'install', '--scope=workspace', '--targets=copilot', {
          cwd: leafDir
        });
        const state = await readState(root);
        const verifyResult = await harnessCommand(root, homeDir, 'verify', { cwd: leafDir });

        return {
          stdout: verifyResult.stdout,
          stderr: verifyResult.stderr,
          state: {
            scope: state.scope,
            skillProfile: state.skillProfile,
            targets: Object.keys(state.targets)
          },
          verificationReport: {
            markdown: verifyResult.stdout
          }
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'workspace-install-claude-code-with-hooks',
      'A Claude Code workspace install can enable hooks and still produce a coherent verification surface',
      async () => {
        await harnessCommand(
          root,
          homeDir,
          'install',
          '--scope=workspace',
          '--targets=claude-code',
          '--hooks=on',
          { cwd: leafDir }
        );
        const state = await readState(root);
        const verifyResult = await harnessCommand(root, homeDir, 'verify', { cwd: leafDir });

        return {
          stdout: verifyResult.stdout,
          stderr: verifyResult.stderr,
          state: {
            scope: state.scope,
            hookMode: state.hookMode,
            targets: Object.keys(state.targets),
            entryPath: state.targets['claude-code']?.paths?.[0] ?? ''
          },
          verificationReport: {
            markdown: verifyResult.stdout
          }
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'install-both-all-targets',
      'A both-scope all-target install keeps the multi-target state explainable on the verify surface',
      async () => {
        await harnessCommand(root, homeDir, 'install', '--scope=both', '--targets=all', { cwd: leafDir });
        const state = await readState(root);
        await harnessCommand(
          root,
          homeDir,
          'verify',
          '--output=.harness/workflow-acceptance/additional-targets',
          { cwd: leafDir }
        );

        const markdown = await readFile(
          path.join(root, '.harness/workflow-acceptance/additional-targets/latest.md'),
          'utf8'
        );
        const report = JSON.parse(
          await readFile(
            path.join(root, '.harness/workflow-acceptance/additional-targets/latest.json'),
            'utf8'
          )
        );

        return {
          stdout: markdown,
          stderr: '',
          state: {
            scope: state.scope,
            skillProfile: state.skillProfile,
            targets: Object.keys(state.targets)
          },
          verificationReport: {
            markdown,
            selectedTargets: report.checks.selectedTargets
          }
        };
      }
    )
  );

  return scenarios;
}

function serializeError(error) {
  return {
    message: error?.message ?? String(error),
    stdout: typeof error?.stdout === 'string' ? error.stdout : '',
    stderr: typeof error?.stderr === 'string' ? error.stderr : ''
  };
}

async function executeScenario(id, title, fn) {
  try {
    const result = await fn();
    return {
      id,
      title,
      pass: true,
      ...result
    };
  } catch (error) {
    return {
      id,
      title,
      pass: false,
      error: serializeError(error),
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : ''
    };
  }
}

async function executeExpectedFailureScenario(id, title, fn) {
  try {
    await fn();
    return {
      id,
      title,
      pass: false,
      expectedFailure: true,
      error: {
        message: 'Scenario unexpectedly succeeded.',
        stdout: '',
        stderr: ''
      },
      stdout: '',
      stderr: ''
    };
  } catch (error) {
    return {
      id,
      title,
      pass: true,
      expectedFailure: true,
      error: serializeError(error),
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : ''
    };
  }
}

async function buildHappyPathScenarios(root, homeDir, leafDir) {
  const scenarios = [];

  scenarios.push(
    await executeScenario(
      'workspace-install-from-leaf',
      'Workspace install resolves the authority root from a leaf directory',
      async () => {
        const result = await harnessCommand(
          root,
          homeDir,
          'install',
          '--scope=workspace',
          '--targets=codex',
          { cwd: leafDir }
        );
        const state = await readState(root);
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          state: {
            scope: state.scope,
            targets: Object.keys(state.targets)
          }
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'sync-dry-run',
      'Sync dry-run exposes a projection diff without mutating sync state',
      async () => {
        const stateBefore = await readState(root);
        const result = await harnessCommand(root, homeDir, 'sync', '--dry-run', { cwd: leafDir });
        const stateAfter = await readState(root);
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          syncState: {
            lastSyncBefore: stateBefore.lastSync ?? null,
            lastSyncAfter: stateAfter.lastSync ?? null
          }
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'verify-report',
      'Verify writes a user-facing report under an explicit output directory',
      async () => {
        await harnessCommand(
          root,
          homeDir,
          'verify',
          '--output=.harness/workflow-acceptance/verification',
          { cwd: leafDir }
        );

        const markdown = await readFile(
          path.join(root, '.harness/workflow-acceptance/verification/latest.md'),
          'utf8'
        );
        const report = JSON.parse(
          await readFile(path.join(root, '.harness/workflow-acceptance/verification/latest.json'), 'utf8')
        );

        return {
          stdout: markdown,
          stderr: '',
          verificationReport: {
            markdown,
            healthProblems: report.health.problems.length,
            selectedTargets: report.checks.selectedTargets
          }
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'doctor-check-only',
      'Doctor check-only passes on the healthy projected fixture',
      async () => {
        const result = await harnessCommand(root, homeDir, 'doctor', '--check-only', { cwd: leafDir });
        return {
          stdout: result.stdout,
          stderr: result.stderr
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'active-summary-json',
      'Active summary reports the live workflow task from a leaf directory',
      async () => {
        const result = await harnessCommand(root, homeDir, 'active-summary', '--json', { cwd: leafDir });
        const report = JSON.parse(result.stdout);
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          report
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'adopt-global-status',
      'Adopt-global bootstraps a user-global target and adoption-status reports in_sync',
      async () => {
        await writeState(root, {
          schemaVersion: 1,
          scope: 'user-global',
          projectionMode: 'link',
          hookMode: 'off',
          policyProfile: 'always-on-core',
          skillProfile: 'full',
          targets: {},
          upstream: {}
        });

        await harnessCommand(root, homeDir, 'adopt-global', '--targets=codex', { cwd: leafDir });
        const statusResult = await harnessCommand(root, homeDir, 'adoption-status', { cwd: leafDir });
        return {
          stdout: statusResult.stdout,
          stderr: statusResult.stderr,
          status: JSON.parse(statusResult.stdout)
        };
      }
    )
  );

  return scenarios;
}

async function buildDegradedScenarios(root, homeDir, leafDir) {
  const scenarios = [];

  scenarios.push(
    await executeScenario(
      'verify-copilot-overlap-warning',
      'Verify surfaces overlap guidance and ledger detail for a both-scope Copilot install',
      async () => {
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
                path.join(homeDir, '.copilot/instructions/harness.instructions.md')
              ]
            }
          },
          upstream: {}
        });

        await writeWorkflowTask(root);
        await harnessCommand(root, homeDir, 'sync', { cwd: leafDir });
        const result = await harnessCommand(root, homeDir, 'verify', { cwd: leafDir });

        return {
          stdout: result.stdout,
          stderr: result.stderr
        };
      }
    )
  );

  scenarios.push(
    await executeExpectedFailureScenario(
      'doctor-personal-path-problem',
      'Doctor fails loudly when projected entry content contains a personal path',
      async () => {
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

        await harnessCommand(root, homeDir, 'sync', { cwd: leafDir });
        await writeFile(path.join(root, 'AGENTS.md'), '\n/Users/replay-sensitive/private-project\n', {
          flag: 'a'
        });
        await harnessCommand(root, homeDir, 'doctor', '--check-only', { cwd: leafDir });
      }
    )
  );

  scenarios.push(
    await executeExpectedFailureScenario(
      'adopt-global-rejects-workspace-state',
      'Adopt-global rejects an existing workspace/both install state to avoid workspace mutation',
      async () => {
        await writeState(root, {
          schemaVersion: 1,
          scope: 'both',
          projectionMode: 'link',
          hookMode: 'off',
          policyProfile: 'always-on-core',
          skillProfile: 'full',
          targets: {
            codex: {
              enabled: true,
              paths: [path.join(root, 'AGENTS.md'), path.join(homeDir, '.codex/AGENTS.md')]
            }
          },
          upstream: {}
        });

        await harnessCommand(root, homeDir, 'adopt-global', { cwd: leafDir });
      }
    )
  );

  return scenarios;
}

export async function runRepoWorkflowAcceptanceReplay(options = {}) {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  const leafDir = path.join(root, 'packages/demo');
  const variant = options.variant ?? 'happy-path';

  try {
    await mkdir(homeDir, { recursive: true });
    await mkdir(leafDir, { recursive: true });
    await initGitRepo(root);
    await writeWorkflowTask(root);

    const scenarios =
      variant === 'degraded'
        ? await buildDegradedScenarios(root, homeDir, leafDir)
        : variant === 'lifecycle'
          ? await buildLifecycleScenarios(root, homeDir, leafDir)
          : variant === 'trust-boundary'
            ? await buildTrustBoundaryScenarios(root, homeDir, leafDir)
            : variant === 'mixed-scope'
              ? await buildMixedScopeScenarios(root, homeDir, leafDir)
              : variant === 'additional-targets'
                ? await buildAdditionalTargetScenarios(root, homeDir, leafDir)
                : await buildHappyPathScenarios(root, homeDir, leafDir);

    const passed = scenarios.filter((scenario) => scenario.pass).length;
    return {
      variant,
      summary: {
        scenarioCount: scenarios.length,
        passed,
        failed: scenarios.length - passed
      },
      scenarios
    };
  } finally {
    await removeHarnessFixture(root);
  }
}

export function formatRepoWorkflowAcceptanceReport(report) {
  const lines = [
    `Repo workflow acceptance replay: ${report.summary.passed}/${report.summary.scenarioCount} scenarios passed`,
    `Failures: ${report.summary.failed}`,
    ''
  ];

  for (const scenario of report.scenarios) {
    lines.push(`${scenario.pass ? 'PASS' : 'FAIL'} ${scenario.id} | ${scenario.title}`);
    if (!scenario.pass && scenario.error) {
      lines.push(`- ${scenario.error.message}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
