import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
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

async function createNestedGitLeaf(root, relativePath = 'packages/demo') {
  const leafDir = path.join(root, relativePath);
  await mkdir(leafDir, { recursive: true });
  await writeFile(path.join(leafDir, 'README.md'), '# Nested leaf\n', 'utf8');
  await git(leafDir, 'init');
  await git(leafDir, 'config', 'user.name', 'Harness Test');
  await git(leafDir, 'config', 'user.email', 'harness@example.com');
  return leafDir;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalText(targetPath) {
  try {
    return {
      exists: true,
      bytes: await readFile(targetPath, 'utf8')
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { exists: false, bytes: null };
    }
    throw error;
  }
}

async function snapshotTrioFiles(root) {
  return {
    state: await readOptionalText(path.join(root, '.harness', 'state.json')),
    entry: await readOptionalText(path.join(root, 'AGENTS.md')),
    trio: await readOptionalText(path.join(root, '.agents', 'skills', 'trio', 'SKILL.md')),
    dev: await readOptionalText(path.join(root, '.agents', 'skills', 'trio', 'dev', 'SKILL.md')),
    office: await readOptionalText(path.join(root, '.agents', 'skills', 'trio', 'office', 'SKILL.md')),
    safety: await readOptionalText(path.join(root, '.agents', 'skills', 'trio', 'safety', 'SKILL.md'))
  };
}

function snapshotsMatch(before, after) {
  return JSON.stringify(before) === JSON.stringify(after);
}

function serializeError(error) {
  return {
    message: error?.message ?? String(error),
    stdout: typeof error?.stdout === 'string' ? error.stdout : '',
    stderr: typeof error?.stderr === 'string' ? error.stderr : ''
  };
}

function hasExpectedError(error, expectedMessage) {
  return error.stderr.trim() === expectedMessage;
}

function describeV2State(state) {
  return {
    schemaVersion: state.schemaVersion,
    runtime: state.runtime,
    scope: state.scope?.kind,
    targets: state.targets.map((target) => target.id),
    entryPath: state.targets[0]?.paths?.[0] ?? ''
  };
}

async function installFreshV2(root, homeDir, leafDir) {
  const result = await harnessCommand(root, homeDir, 'install', { cwd: leafDir });
  return {
    install: JSON.parse(result.stdout),
    state: describeV2State(await readState(root))
  };
}

async function seedV1State(root) {
  await writeState(root, {
    schemaVersion: 1,
    scope: 'workspace',
    targets: {},
    upstream: {}
  });
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

async function executeExpectedFailureWithSnapshot(
  id,
  title,
  { setup, run, expectedMessage, snapshot }
) {
  await setup?.();
  const before = snapshot ? await snapshot() : null;
  try {
    await run();
    const after = snapshot ? await snapshot() : null;
    return {
      id,
      title,
      pass: false,
      expectedFailure: true,
      noWrite: snapshotsMatch(before, after),
      error: {
        message: 'Scenario unexpectedly succeeded.',
        stdout: '',
        stderr: ''
      }
    };
  } catch (caught) {
    const error = serializeError(caught);
    const after = snapshot ? await snapshot() : null;
    const errorMatches = hasExpectedError(error, expectedMessage);
    const noWrite = snapshotsMatch(before, after);
    return {
      id,
      title,
      pass: errorMatches && noWrite,
      expectedFailure: true,
      noWrite,
      errorMatches,
      expectedMessage,
      error,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }
}

async function buildFreshInstallScenario(root, homeDir, leafDir) {
  return [
    await executeScenario(
      'fresh-v2-install-from-leaf',
      'A parameter-free install from a nested leaf creates the V2 workspace Codex state',
      async () => {
        const installed = await installFreshV2(root, homeDir, leafDir);
        return {
          stdout: JSON.stringify(installed.install),
          state: installed.state,
          filesystem: {
            rootEntryExists: await pathExists(path.join(root, 'AGENTS.md')),
            leafEntryExists: await pathExists(path.join(leafDir, 'AGENTS.md'))
          }
        };
      }
    )
  ];
}

async function buildFreshReinstallScenario(root, homeDir, leafDir) {
  return [
    await executeScenario(
      'fresh-v2-reinstall-preserves-single-codex-shape',
      'A V2 reinstall from a leaf keeps the single workspace Codex state',
      async () => {
        await installFreshV2(root, homeDir, leafDir);
        const result = await harnessCommand(root, homeDir, 'install', { cwd: leafDir });
        return {
          stdout: result.stdout,
          install: JSON.parse(result.stdout),
          state: describeV2State(await readState(root))
        };
      }
    )
  ];
}

async function buildDryRunScenario(root, homeDir, leafDir) {
  return [
    await executeScenario(
      'fresh-v2-sync-dry-run-no-write',
      'Sync dry-run reports V2 state without changing state or the managed entry',
      async () => {
        await installFreshV2(root, homeDir, leafDir);
        const before = await snapshotTrioFiles(root);
        const result = await harnessCommand(root, homeDir, 'sync', '--dry-run', { cwd: leafDir });
        const after = await snapshotTrioFiles(root);
        return {
          stdout: result.stdout,
          dryRun: JSON.parse(result.stdout),
          noWrite: snapshotsMatch(before, after)
        };
      }
    )
  ];
}

async function buildVerifyScenario(root, homeDir, leafDir, outputArgument) {
  return [
    await executeScenario(
      outputArgument ? 'fresh-v2-verify-stdout' : 'fresh-v2-verify',
      outputArgument
        ? 'Verify accepts stdout output and remains read-only on a fresh V2 install'
        : 'Verify reports a healthy fresh V2 install from a nested leaf',
      async () => {
        await installFreshV2(root, homeDir, leafDir);
        const before = await snapshotTrioFiles(root);
        const args = outputArgument ? ['verify', outputArgument] : ['verify'];
        const result = await harnessCommand(root, homeDir, ...args, { cwd: leafDir });
        const after = await snapshotTrioFiles(root);
        return {
          stdout: result.stdout,
          report: JSON.parse(result.stdout),
          noWrite: snapshotsMatch(before, after)
        };
      }
    )
  ];
}

async function buildDoctorScenario(root, homeDir, leafDir) {
  return [
    await executeScenario(
      'fresh-v2-doctor-check-only',
      'Doctor check-only succeeds without changing a healthy V2 state or entry',
      async () => {
        await installFreshV2(root, homeDir, leafDir);
        const before = await snapshotTrioFiles(root);
        const result = await harnessCommand(root, homeDir, 'doctor', '--check-only', { cwd: leafDir });
        const after = await snapshotTrioFiles(root);
        return {
          stdout: result.stdout,
          report: JSON.parse(result.stdout),
          noWrite: snapshotsMatch(before, after)
        };
      }
    )
  ];
}

async function buildV1RejectionScenarios(root, homeDir, leafDir) {
  const commands = [
    {
      id: 'v1-install-requires-upgrade-recovery',
      args: ['install'],
      expectedMessage: 'Persisted schema-v1 state requires exactly --upgrade and one non-empty --recovery value.'
    },
    {
      id: 'v1-sync-requires-upgrade-recovery',
      args: ['sync', '--dry-run'],
      expectedMessage: 'Persisted schema-v1 state requires install --upgrade with recovery evidence.'
    },
    {
      id: 'v1-verify-requires-upgrade-recovery',
      args: ['verify'],
      expectedMessage: 'Persisted schema-v1 state requires install --upgrade with recovery evidence.'
    },
    {
      id: 'v1-doctor-requires-upgrade-recovery',
      args: ['doctor', '--check-only'],
      expectedMessage: 'Persisted schema-v1 state requires install --upgrade with recovery evidence.'
    }
  ];

  const scenarios = [];
  for (const command of commands) {
    scenarios.push(
      await executeExpectedFailureWithSnapshot(
        command.id,
        'Persisted V1 state is rejected without changing state or the missing managed entry',
        {
          setup: () => seedV1State(root),
          run: () => harnessCommand(root, homeDir, ...command.args, { cwd: leafDir }),
          expectedMessage: command.expectedMessage,
          snapshot: () => snapshotTrioFiles(root)
        }
      )
    );
  }
  return scenarios;
}

async function buildRemovedOptionRejectionScenarios(root, homeDir, leafDir) {
  const options = [
    '--scope=workspace',
    '--targets=codex',
    '--profile=safety',
    '--hooks=on'
  ];
  const scenarios = [];
  for (const option of options) {
    scenarios.push(
      await executeExpectedFailureWithSnapshot(
        'install-rejects-' + option.slice(2).replaceAll('=', '-'),
        'Removed install option is rejected before a V2 state or projection is created',
        {
          run: () => harnessCommand(root, homeDir, 'install', option, { cwd: leafDir }),
          expectedMessage: 'Unsupported or duplicate Trio argument: ' + option.split('=')[0] + '.',
          snapshot: () => snapshotTrioFiles(root)
        }
      )
    );
  }
  return scenarios;
}

async function buildDriftCheckScenario(root, homeDir, leafDir) {
  return [
    await executeExpectedFailureWithSnapshot(
      'fresh-v2-sync-check-drift-no-write',
      'Sync check rejects a drifted V2 entry without repairing or rewriting it',
      {
        setup: async () => {
          await installFreshV2(root, homeDir, leafDir);
          await writeFile(path.join(root, 'AGENTS.md'), '\n<!-- drift -->\n', { flag: 'a' });
        },
        run: () => harnessCommand(root, homeDir, 'sync', '--check', { cwd: leafDir }),
        expectedMessage: 'Trio projection verification failed: managed state is missing, drifted, or unowned.',
        snapshot: () => snapshotTrioFiles(root)
      }
    )
  ];
}

async function buildIncompatibleSyncScenario(root, homeDir, leafDir) {
  return [
    await executeExpectedFailureWithSnapshot(
      'fresh-v2-sync-rejects-dry-run-check-combination-no-write',
      'Sync rejects incompatible V2 read-only flags without changing state or the entry',
      {
        setup: () => installFreshV2(root, homeDir, leafDir),
        run: () => harnessCommand(root, homeDir, 'sync', '--dry-run', '--check', { cwd: leafDir }),
        expectedMessage: 'Trio --dry-run and --check cannot be combined.',
        snapshot: () => snapshotTrioFiles(root)
      }
    )
  ];
}

async function buildWorkspaceLinkScenario(root, homeDir) {
  return [
    await executeScenario(
      'workspace-link-routes-v2-install-sync-and-verify-to-parent',
      'A linked nested leaf routes V2 install, sync dry-run, and verify only to its parent authority root',
      async () => {
        const linkedLeafDir = await createNestedGitLeaf(root, 'linked-workspaces/v2-leaf');
        await harnessCommand(root, homeDir, 'workspace-link', '--root=' + root, { cwd: linkedLeafDir });
        await installFreshV2(root, homeDir, linkedLeafDir);
        const sync = await harnessCommand(root, homeDir, 'sync', '--dry-run', { cwd: linkedLeafDir });
        const verify = await harnessCommand(root, homeDir, 'verify', { cwd: linkedLeafDir });
        return {
          stdout: verify.stdout,
          sync: JSON.parse(sync.stdout),
          report: JSON.parse(verify.stdout),
          state: describeV2State(await readState(root)),
          filesystem: {
            rootStateExists: await pathExists(path.join(root, '.harness', 'state.json')),
            rootEntryExists: await pathExists(path.join(root, 'AGENTS.md')),
            leafStateExists: await pathExists(path.join(linkedLeafDir, '.harness', 'state.json')),
            leafEntryExists: await pathExists(path.join(linkedLeafDir, 'AGENTS.md')),
            leafAuthorityLinkExists: await pathExists(
              path.join(linkedLeafDir, '.harness', 'authority-root.json')
            )
          }
        };
      }
    )
  ];
}

const BUILDERS = {
  'fresh-install': buildFreshInstallScenario,
  'fresh-reinstall': buildFreshReinstallScenario,
  'sync-dry-run': buildDryRunScenario,
  verify: (root, homeDir, leafDir) => buildVerifyScenario(root, homeDir, leafDir),
  'verify-stdout': (root, homeDir, leafDir) => buildVerifyScenario(root, homeDir, leafDir, '--output=stdout'),
  doctor: buildDoctorScenario,
  'v1-rejection': buildV1RejectionScenarios,
  'removed-options': buildRemovedOptionRejectionScenarios,
  'drift-check': buildDriftCheckScenario,
  'incompatible-sync': buildIncompatibleSyncScenario,
  'workspace-link': buildWorkspaceLinkScenario
};

export async function runRepoWorkflowAcceptanceReplay(options = {}) {
  const root = await createHarnessFixture();
  const homeDir = path.join(root, 'home');
  const leafDir = path.join(root, 'packages', 'demo');
  const variant = options.variant ?? 'fresh-install';

  try {
    await mkdir(homeDir, { recursive: true });
    await mkdir(leafDir, { recursive: true });
    await initGitRepo(root);

    const builder = BUILDERS[variant];
    if (!builder) {
      throw new Error('Unsupported repo workflow replay variant: ' + variant);
    }
    const scenarios = await builder(root, homeDir, leafDir);
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
    'Repo workflow acceptance replay: ' + report.summary.passed + '/' + report.summary.scenarioCount + ' scenarios passed',
    'Failures: ' + report.summary.failed,
    ''
  ];

  for (const scenario of report.scenarios) {
    lines.push((scenario.pass ? 'PASS ' : 'FAIL ') + scenario.id + ' | ' + scenario.title);
    if (!scenario.pass && scenario.error) {
      lines.push('- ' + scenario.error.message);
    }
  }

  return lines.join('\n') + '\n';
}
