import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { readState, writeState } from '../../../../harness/installer/lib/state.mjs';
import { discoverAuthorityRoot } from '../../../../harness/runtime/authority-root.mjs';
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

async function initGitBoundary(root) {
  await git(root, 'init');
  await git(root, 'config', 'user.name', 'Harness Test');
  await git(root, 'config', 'user.email', 'harness@example.com');
}

async function initGitRepo(root) {
  await initGitBoundary(root);
  await git(root, 'add', '.');
  await git(root, 'commit', '-m', 'Initial fixture');
}

async function createNestedGitLeaf(root, relativePath = 'linked-workspaces/demo') {
  const leafWorkspaceDir = path.join(root, relativePath);
  await mkdir(leafWorkspaceDir, { recursive: true });
  await writeFile(path.join(leafWorkspaceDir, 'README.md'), '# Linked leaf workspace\n', 'utf8');
  await initGitBoundary(leafWorkspaceDir);
  return leafWorkspaceDir;
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

async function writeExecutionReceiptArtifact(root, taskId, unitId, overrides = {}) {
  const receiptDir = path.join(root, '.harness', 'execution', 'receipts', taskId);
  await mkdir(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `2026-06-04T04-00-00.000Z-${unitId}.json`);
  await writeFile(
    receiptPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        taskId,
        unitId,
        actor: 'codex',
        mode: 'inline',
        resultStatus: 'blocked',
        startedAt: '2026-06-04T04:00:00.000Z',
        finishedAt: '2026-06-04T04:05:00.000Z',
        changedFiles: [],
        verificationCommands: [],
        artifactsProduced: [],
        followups: [{ type: 'integration', status: 'open', target: 'progress.md' }],
        syncBackRef: 'progress.md#unit-01',
        ...overrides
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

async function writeFollowupClosureArtifact(root, taskId, unitId, overrides = {}) {
  const closureDir = path.join(root, '.harness', 'execution', 'followup-closures', taskId);
  await mkdir(closureDir, { recursive: true });
  const closurePath = path.join(closureDir, `2026-06-04T10-00-00.000Z-${unitId}.json`);
  await writeFile(
    closurePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        taskId,
        unitId,
        followupId: `${unitId}:integration:progress.md`,
        closureStatus: 'resolved',
        actor: 'codex',
        mode: 'inline',
        closedAt: '2026-06-04T10:00:00.000Z',
        reason: 'reconciliation.md now records the accepted closure path',
        evidenceRef: 'reconciliation.md#followup-closure',
        syncBackRef: 'progress.md#followup-closure',
        ...overrides
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

async function writeTokenAuditFixture(root) {
  const sessionsRoot = path.join(root, 'tmp', 'token-audit-sessions');
  await mkdir(path.join(sessionsRoot, '2026/06/10'), { recursive: true });
  await mkdir(path.join(sessionsRoot, '2026/06/11'), { recursive: true });

  await writeFile(
    path.join(sessionsRoot, '2026/06/10/rollout-main.jsonl'),
    [
      JSON.stringify({
        timestamp: '2026-06-10T01:00:00Z',
        type: 'session_meta',
        payload: {
          id: 'fixture-main',
          timestamp: '2026-06-10T01:00:00Z',
          cwd: '/workspace/SuperpoweringWithFiles',
          source: 'vscode'
        }
      }),
      JSON.stringify({
        timestamp: '2026-06-10T01:01:00Z',
        type: 'turn_context',
        payload: {
          turn_id: 'fixture-main-turn',
          cwd: '/workspace/SuperpoweringWithFiles',
          model: 'gpt-5.4',
          effort: 'medium'
        }
      }),
      JSON.stringify({
        timestamp: '2026-06-10T01:02:00Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: '{"cmd":"sed -n \\"1,200p\\" planning/active/goal-round-start-protocol/task_plan.md"}'
        }
      }),
      JSON.stringify({
        timestamp: '2026-06-10T01:03:00Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 200,
              cached_input_tokens: 100,
              output_tokens: 20,
              total_tokens: 220
            }
          }
        }
      })
    ].join('\n') + '\n',
    'utf8'
  );

  await writeFile(
    path.join(sessionsRoot, '2026/06/11/rollout-subagent.jsonl'),
    [
      JSON.stringify({
        timestamp: '2026-06-11T01:00:00Z',
        type: 'session_meta',
        payload: {
          id: 'fixture-subagent',
          timestamp: '2026-06-11T01:00:00Z',
          cwd: '/workspace/BabyCry',
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: 'fixture-main',
                depth: 1,
                agent_role: 'worker'
              }
            }
          }
        }
      }),
      JSON.stringify({
        timestamp: '2026-06-11T01:01:00Z',
        type: 'turn_context',
        payload: {
          turn_id: 'fixture-subagent-turn',
          cwd: '/workspace/BabyCry',
          model: 'gpt-5.4-mini',
          effort: 'medium'
        }
      }),
      JSON.stringify({
        timestamp: '2026-06-11T01:02:00Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: '{"cmd":"sed -n \\"1,200p\\" planning/active/release-automation-skill-20260613/task_plan.md"}'
        }
      }),
      JSON.stringify({
        timestamp: '2026-06-11T01:03:00Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 150,
              cached_input_tokens: 60,
              output_tokens: 30,
              total_tokens: 180
            }
          }
        }
      })
    ].join('\n') + '\n',
    'utf8'
  );

  return sessionsRoot;
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

  return scenarios;
}

async function buildTrustBoundaryScenarios(root, homeDir, leafDir) {
  const scenarios = [];

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

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function summarizeDryRunReport(report) {
  const hookConfigEntries = report.diff.create.filter((entry) => entry.kind === 'hook-config');
  return {
    targets: report.targets,
    summary: report.summary,
    createKinds: [...new Set(report.diff.create.map((entry) => entry.kind))],
    hookConfigFormats: [...new Set(hookConfigEntries.map((entry) => entry.configFormat))],
    hookConfigTargets: hookConfigEntries.map((entry) => entry.configTarget)
  };
}

async function buildSyncPreviewScenarios(root, homeDir, leafDir) {
  const scenarios = [];

  scenarios.push(
    await executeScenario(
      'sync-dry-run-both-all-targets-from-state',
      'A both-scope all-target dry-run preview stays read-only while exposing the multi-target projection plan',
      async () => {
        await writeState(root, {
          schemaVersion: 1,
          scope: 'both',
          projectionMode: 'link',
          hookMode: 'off',
          policyProfile: 'always-on-core',
          skillProfile: 'minimal-global',
          targets: {
            codex: {
              enabled: true,
              paths: [path.join(root, 'AGENTS.md'), path.join(homeDir, '.codex/AGENTS.md')]
            },
            copilot: {
              enabled: true,
              paths: [
                path.join(root, '.github/copilot-instructions.md'),
                path.join(homeDir, '.copilot/instructions/harness.instructions.md')
              ]
            },
            cursor: {
              enabled: true,
              paths: [path.join(root, '.cursor/rules/harness.mdc')]
            },
            'claude-code': {
              enabled: true,
              paths: [path.join(root, 'CLAUDE.md'), path.join(homeDir, '.claude/CLAUDE.md')]
            }
          },
          upstream: {}
        });

        const stateBefore = await readState(root);
        const result = await harnessCommand(root, homeDir, 'sync', '--dry-run', { cwd: leafDir });
        const stateAfter = await readState(root);
        const report = JSON.parse(result.stdout);

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          dryRunState: {
            lastSyncBefore: stateBefore.lastSync ?? null,
            lastSyncAfter: stateAfter.lastSync ?? null
          },
          dryRunReport: summarizeDryRunReport(report),
          filesystem: {
            copilotEntryExists: await pathExists(path.join(root, '.github/copilot-instructions.md')),
            projectionsManifestExists: await pathExists(path.join(root, '.harness/projections.json'))
          }
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'sync-dry-run-both-copilot-hooks-from-state',
      'A both-scope Copilot dry-run preview exposes hook-config and hook-script work without mutating sync state',
      async () => {
        await writeState(root, {
          schemaVersion: 1,
          scope: 'both',
          projectionMode: 'link',
          hookMode: 'on',
          policyProfile: 'always-on-core',
          skillProfile: 'minimal-global',
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

        const stateBefore = await readState(root);
        const result = await harnessCommand(root, homeDir, 'sync', '--dry-run', { cwd: leafDir });
        const stateAfter = await readState(root);
        const report = JSON.parse(result.stdout);

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          dryRunState: {
            lastSyncBefore: stateBefore.lastSync ?? null,
            lastSyncAfter: stateAfter.lastSync ?? null
          },
          dryRunReport: summarizeDryRunReport(report)
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'sync-dry-run-workspace-claude-hooks-from-state',
      'A workspace Claude Code dry-run preview exposes settings-format hook work without writing projections',
      async () => {
        await writeState(root, {
          schemaVersion: 1,
          scope: 'workspace',
          projectionMode: 'link',
          hookMode: 'on',
          policyProfile: 'always-on-core',
          skillProfile: 'full',
          targets: {
            'claude-code': {
              enabled: true,
              paths: [path.join(root, 'CLAUDE.md')]
            }
          },
          upstream: {}
        });

        const stateBefore = await readState(root);
        const result = await harnessCommand(root, homeDir, 'sync', '--dry-run', { cwd: leafDir });
        const stateAfter = await readState(root);
        const report = JSON.parse(result.stdout);

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          dryRunState: {
            lastSyncBefore: stateBefore.lastSync ?? null,
            lastSyncAfter: stateAfter.lastSync ?? null
          },
          dryRunReport: summarizeDryRunReport(report),
          filesystem: {
            claudeEntryExists: await pathExists(path.join(root, 'CLAUDE.md'))
          }
        };
      }
    )
  );

  return scenarios;
}

async function buildReportingScenarios(root, homeDir, leafDir) {
  const scenarios = [];

  scenarios.push(
    await executeExpectedFailureScenario(
      'sync-check-out-of-sync-from-leaf',
      'Sync check fails loudly from a nested leaf while keeping the workspace read-only when projections drift',
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

        await harnessCommand(root, homeDir, 'sync', '--check', { cwd: leafDir });
      },
      async () => ({
        filesystem: {
          entryExists: await pathExists(path.join(root, 'AGENTS.md')),
          projectionsManifestExists: await pathExists(path.join(root, '.harness/projections.json'))
        }
      })
    )
  );

  scenarios.push(
    await executeScenario(
      'summary-task-route-line-with-multiple-active-tasks',
      'Summary renders the requested task route line even when multiple active tasks exist under planning/active',
      async () => {
        await writePlanningTask(root, 'demo-task', {
          taskPlan: [
            '# Demo Task',
            '',
            '## Goal',
            '- Keep the route line visible on the summary surface.',
            '',
            '## Current State',
            'Status: active',
            'Archive Eligible: no',
            'Close Reason:',
            'Reconcile: open',
            '',
            '## Routing Decision',
            '- Selected Route: tracked-lean',
            '- Route Reason: durable task without deep reasoning',
            '- Promotion Trigger: none',
            '- Route Evidence Surface: planning + summary'
          ].join('\n'),
          findings: '# Findings\n- Keep the route visible.\n',
          progress: '# Progress\n- Added routing record.\n'
        });

        const result = await harnessCommand(root, homeDir, 'summary', '--task', 'demo-task', {
          cwd: leafDir
        });

        return {
          stdout: result.stdout,
          stderr: result.stderr
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'token-audit-weekly-summary',
      'Token audit renders a stable weekly summary from a seeded sessions root',
      async () => {
        const sessionsRoot = await writeTokenAuditFixture(root);
        const result = await harnessCommand(
          root,
          homeDir,
          'token-audit',
          `--sessions-root=${sessionsRoot}`,
          '--date-from=2026-06-07T00:00:00Z',
          '--date-to=2026-06-14T23:59:59Z',
          { cwd: leafDir }
        );

        return {
          stdout: result.stdout,
          stderr: result.stderr
        };
      }
    )
  );

  return scenarios;
}

async function buildExecutionLifecycleScenarios(root, homeDir, leafDir) {
  const scenarios = [];

  scenarios.push(
    await executeScenario(
      'active-summary-blocked-execution-open-followup',
      'Active summary surfaces blocked execution receipts and open followups on the live governance surface',
      async () => {
        await writePlanningTask(root, 'task-execution-blocked', {
          taskPlan: [
            '# Task Execution Blocked',
            '',
            '## Current State',
            'Status: active',
            'Archive Eligible: no',
            'Close Reason:',
            '',
            '## Execution Contract',
            '',
            '### Unit: unit-01',
            '- Kind: implementation',
            '- Status: blocked',
            '- Scope:',
            '  - Do: keep execution receipts visible in active-summary.',
            '  - Not do: let receipt status replace reconciliation authority.',
            '- Owner Mode: inline',
            '- Allowed Ops:',
            '  - Files: harness/**',
            '  - Commands: node --test',
            '- Dependencies:',
            '  - None.',
            '- Verification Plan:',
            '  - node --test tests/installer/active-summary-command.test.mjs',
            '- Return Artifacts:',
            '  - receipt',
            '- Integration Target:',
            '  - progress.md',
            '- Exit Criteria:',
            '  - Active summary reflects execution receipt state.'
          ].join('\n'),
          findings: '# Findings\n',
          progress: '# Progress\n'
        });
        await writeExecutionReceiptArtifact(root, 'task-execution-blocked', 'unit-01');

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
      'active-summary-failed-execution-unit',
      'Active summary surfaces failed execution units distinctly from blocked ones on the live governance surface',
      async () => {
        await writePlanningTask(root, 'task-execution-failed', {
          taskPlan: [
            '# Task Execution Failed',
            '',
            '## Current State',
            'Status: active',
            'Archive Eligible: no',
            'Close Reason:',
            '',
            '## Execution Contract',
            '',
            '### Unit: unit-01',
            '- Kind: verification',
            '- Status: blocked',
            '- Scope:',
            '  - Do: expose failed receipt state on active-summary.',
            '  - Not do: hide failed units behind generic warnings.',
            '- Owner Mode: inline',
            '- Allowed Ops:',
            '  - Files: tests/**',
            '  - Commands: node --test',
            '- Dependencies:',
            '  - None.',
            '- Verification Plan:',
            '  - node --test tests/installer/active-summary-command.test.mjs',
            '- Return Artifacts:',
            '  - receipt',
            '- Integration Target:',
            '  - findings.md',
            '- Exit Criteria:',
            '  - Active summary reflects failed execution state.'
          ].join('\n'),
          findings: '# Findings\n',
          progress: '# Progress\n'
        });
        await writeExecutionReceiptArtifact(root, 'task-execution-failed', 'unit-01', {
          resultStatus: 'failed',
          followups: []
        });

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
      'active-summary-resolved-followup-closure',
      'Active summary suppresses open-followup anomalies once closure evidence resolves the execution followup',
      async () => {
        await writePlanningTask(root, 'task-followup-resolved', {
          taskPlan: [
            '# Task Follow-Up Resolved',
            '',
            '## Current State',
            'Status: active',
            'Archive Eligible: no',
            'Close Reason:',
            '',
            '## Execution Contract',
            '',
            '### Unit: unit-01',
            '- Kind: integration',
            '- Status: done',
            '- Scope:',
            '  - Do: surface closure-aware execution signals.',
            '  - Not do: redefine reconciliation authority.',
            '- Owner Mode: inline',
            '- Allowed Ops:',
            '  - Files: planning/**',
            '  - Commands: node --test',
            '- Dependencies:',
            '  - goal-3-receipts',
            '- Verification Plan:',
            '  - node --test tests/installer/active-summary-command.test.mjs',
            '- Return Artifacts:',
            '  - receipt',
            '- Integration Target:',
            '  - reconciliation.md',
            '- Exit Criteria:',
            '  - active-summary no longer reports open followups for resolved closures.'
          ].join('\n'),
          findings: '# Findings\n',
          progress: '# Progress\n'
        });
        await writeExecutionReceiptArtifact(root, 'task-followup-resolved', 'unit-01', {
          resultStatus: 'done_with_evidence'
        });
        await writeFollowupClosureArtifact(root, 'task-followup-resolved', 'unit-01');

        const result = await harnessCommand(root, homeDir, 'active-summary', '--json', { cwd: leafDir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          report: JSON.parse(result.stdout)
        };
      }
    )
  );

  return scenarios;
}

async function buildCompanionReconciliationScenarios(root, homeDir, leafDir) {
  const scenarios = [];

  scenarios.push(
    await executeScenario(
      'active-summary-archive-ready-companion-blocker',
      'Active summary keeps archive-ready tasks blocked when companion lifecycle state drifts out of sync',
      async () => {
        await writePlanningTask(root, 'task-ready', {
          taskPlan: [
            '# Task Ready',
            '',
            '## Current State',
            'Status: closed',
            'Archive Eligible: yes',
            'Close Reason: done',
            '',
            '### Phase 1: Audit',
            '- **Status:** complete'
          ].join('\n'),
          findings: '# Findings\n',
          progress: '# Progress\n',
          reconciliation: [
            '# Reconciliation: task-ready',
            '',
            '## Archive Readiness',
            'Ready, reason: fixture is reconciled.'
          ].join('\n')
        });

        await writePlanningTask(root, 'task-blocked', {
          taskPlan: [
            '# Task Blocked',
            '',
            '## Current State',
            'Status: closed',
            'Archive Eligible: yes',
            'Close Reason: done',
            '',
            '## Companion Plan',
            '- Companion plan: `docs/superpowers/plans/task-blocked.md`',
            '- Companion summary: audit results',
            '- Sync-back status: closed at 2026-05-06T09:00:00: done',
            '',
            '### Phase 1: Audit',
            '- **Status:** complete'
          ].join('\n'),
          findings: '# Findings\n',
          progress: '# Progress\n'
        });

        await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });
        await writeFile(
          path.join(root, 'docs/superpowers/plans/task-blocked.md'),
          [
            '# Task Blocked Companion',
            '',
            'Active task path: `planning/active/task-blocked/`',
            'Lifecycle state: active',
            'Sync-back status: closed at 2026-05-06T09:00:00: done'
          ].join('\n'),
          'utf8'
        );

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
      'active-summary-active-companion-drift-warning',
      'Active summary surfaces companion drift for active tasks before archive readiness is even in play',
      async () => {
        await writePlanningTask(root, 'task-active-drift', {
          taskPlan: [
            '# Task Active Drift',
            '',
            '## Current State',
            'Status: active',
            'Archive Eligible: no',
            'Close Reason:',
            '',
            '## Companion Plan',
            '- Companion plan: `docs/superpowers/plans/task-active-drift.md`',
            '- Companion summary: strategic notes are in flight',
            '- Sync-back status: active at 2026-06-04T10:00:00: initial draft',
            '',
            '### Phase 1: Audit',
            '- **Status:** complete'
          ].join('\n'),
          findings: '# Findings\n',
          progress: '# Progress\n'
        });

        await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });
        await writeFile(
          path.join(root, 'docs/superpowers/plans/task-active-drift.md'),
          [
            '# Task Active Drift Companion',
            '',
            'Lifecycle state: active',
            'Sync-back status: active at 2026-06-04T10:00:00: initial draft'
          ].join('\n'),
          'utf8'
        );

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
      'active-summary-placeholder-reconciliation-open',
      'Active summary keeps blank and placeholder reconciliation artifacts open instead of marking them archive-ready',
      async () => {
        await writePlanningTask(root, 'blank-artifact', {
          taskPlan: [
            '# Blank Artifact',
            '',
            '## Current State',
            'Status: closed',
            'Archive Eligible: yes',
            'Close Reason:',
            '',
            '### Phase 1: Audit',
            '- **Status:** complete'
          ].join('\n'),
          findings: '# Findings\n',
          progress: '# Progress\n',
          reconciliation: ''
        });

        await writePlanningTask(root, 'template-artifact', {
          taskPlan: [
            '# Template Artifact',
            '',
            '## Current State',
            'Status: closed',
            'Archive Eligible: yes',
            'Close Reason:',
            '',
            '### Phase 1: Audit',
            '- **Status:** complete'
          ].join('\n'),
          findings: '# Findings\n',
          progress: '# Progress\n',
          reconciliation: [
            '# Reconciliation: template-artifact',
            '',
            '## Archive Readiness',
            '- [Ready / Not ready, with reason.]'
          ].join('\n')
        });

        await writePlanningTask(root, 'placeholder-progress', {
          taskPlan: [
            '# Placeholder Progress',
            '',
            '## Current State',
            'Status: closed',
            'Archive Eligible: yes',
            'Close Reason:',
            '',
            '### Phase 1: Audit',
            '- **Status:** complete'
          ].join('\n'),
          findings: '# Findings\n',
          progress: '# Progress\n\n## Reconciliation\n- Ready / Not ready, with reason.\n'
        });

        const result = await harnessCommand(root, homeDir, 'active-summary', '--json', { cwd: leafDir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          report: JSON.parse(result.stdout)
        };
      }
    )
  );

  return scenarios;
}

async function buildWorkspaceLinkScenarios(root, homeDir) {
  const scenarios = [];

  scenarios.push(
    await executeScenario(
      'workspace-link-restores-parent-status-across-git-boundary',
      'Workspace-link restores parent status visibility for a nested leaf workspace that would otherwise stop at its own git boundary',
      async () => {
        await harnessCommand(root, homeDir, 'install', '--scope=workspace', '--targets=codex');
        await harnessCommand(root, homeDir, 'sync');

        const linkedLeafDir = await createNestedGitLeaf(root, 'linked-workspaces/status-leaf');
        const authorityBefore = await discoverAuthorityRoot(linkedLeafDir);
        let beforeFailure = null;
        try {
          await harnessCommand(root, homeDir, 'status', { cwd: linkedLeafDir });
        } catch (error) {
          beforeFailure = serializeError(error);
        }

        await harnessCommand(root, homeDir, 'workspace-link', `--root=${root}`, { cwd: linkedLeafDir });

        const authorityAfter = await discoverAuthorityRoot(linkedLeafDir);
        const afterStatus = JSON.parse((await harnessCommand(root, homeDir, 'status', { cwd: linkedLeafDir })).stdout);

        return {
          stdout: JSON.stringify(afterStatus, null, 2),
          stderr: '',
          authority: {
            beforeSource: authorityBefore.source,
            afterSource: authorityAfter.source
          },
          status: {
            beforeFailed: Boolean(beforeFailure),
            beforeFailureMessage: beforeFailure?.message ?? '',
            afterCodexEntryCount: afterStatus.targets?.codex?.entries?.length ?? 0,
            afterCodexEntryPath: afterStatus.targets?.codex?.entries?.[0]?.path ?? ''
          }
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'workspace-link-rewrites-bogus-override-and-restores-summary',
      'Workspace-link rewrites a bogus override and restores summary access to parent planning from a nested git leaf',
      async () => {
        const linkedLeafDir = await createNestedGitLeaf(root, 'linked-workspaces/summary-leaf');
        await mkdir(path.join(linkedLeafDir, '.harness'), { recursive: true });
        await writeFile(
          path.join(linkedLeafDir, '.harness/authority-root.json'),
          `${JSON.stringify({ schemaVersion: 1, authorityRoot: '../bogus' }, null, 2)}\n`,
          'utf8'
        );

        await harnessCommand(root, homeDir, 'workspace-link', `--root=${root}`, { cwd: linkedLeafDir });

        const authority = await discoverAuthorityRoot(linkedLeafDir);
        const override = JSON.parse(
          await readFile(path.join(linkedLeafDir, '.harness/authority-root.json'), 'utf8')
        );
        const result = await harnessCommand(root, homeDir, 'summary', { cwd: linkedLeafDir });

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          authority: {
            source: authority.source,
            overrideRoot: override.authorityRoot
          },
          summary: result.stdout
        };
      }
    )
  );

  scenarios.push(
    await executeScenario(
      'workspace-link-routes-install-and-sync-back-to-parent-authority-root',
      'Workspace-link lets install and sync from a nested git leaf mutate only the parent authority root',
      async () => {
        const linkedLeafDir = await createNestedGitLeaf(root, 'linked-workspaces/install-leaf');
        await harnessCommand(root, homeDir, 'workspace-link', `--root=${root}`, { cwd: linkedLeafDir });
        await harnessCommand(root, homeDir, 'install', '--scope=workspace', '--targets=cursor', {
          cwd: linkedLeafDir
        });
        await harnessCommand(root, homeDir, 'sync', { cwd: linkedLeafDir });

        const authority = await discoverAuthorityRoot(linkedLeafDir);
        const state = await readState(root);
        const verifyResult = await harnessCommand(root, homeDir, 'verify', { cwd: linkedLeafDir });

        return {
          stdout: verifyResult.stdout,
          stderr: verifyResult.stderr,
          authority: {
            source: authority.source
          },
          state: {
            scope: state.scope,
            targets: Object.keys(state.targets),
            leafStateExists: await pathExists(path.join(linkedLeafDir, '.harness/state.json')),
            cursorRuleRootExists: await pathExists(path.join(root, '.cursor/rules/harness.mdc')),
            cursorRuleLeafExists: await pathExists(path.join(linkedLeafDir, '.cursor/rules/harness.mdc'))
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

async function executeExpectedFailureScenario(id, title, fn, buildDetails) {
  try {
    await fn();
    const details = buildDetails ? await buildDetails() : {};
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
      ...details,
      stdout: '',
      stderr: ''
    };
  } catch (error) {
    const details = buildDetails ? await buildDetails(error) : {};
    return {
      id,
      title,
      pass: true,
      expectedFailure: true,
      error: serializeError(error),
      ...details,
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
                : variant === 'sync-preview'
                  ? await buildSyncPreviewScenarios(root, homeDir, leafDir)
                  : variant === 'reporting'
                  ? await buildReportingScenarios(root, homeDir, leafDir)
                    : variant === 'execution-lifecycle'
                      ? await buildExecutionLifecycleScenarios(root, homeDir, leafDir)
                      : variant === 'workspace-link'
                        ? await buildWorkspaceLinkScenarios(root, homeDir)
                      : variant === 'companion-reconciliation'
                        ? await buildCompanionReconciliationScenarios(root, homeDir, leafDir)
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
