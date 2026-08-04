import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readState, statePath, writeState } from '../../harness/installer/lib/state.mjs';
import { install } from '../../harness/installer/commands/install.mjs';
import { acquireTrioPublicationLock } from '../../harness/trio/core/store.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function harnessCommand(root, ...args) {
  const maybeOptions = args.at(-1);
  const options =
    maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions) ? args.pop() : {};

  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: options.cwd ?? root
  });
}

function harnessCommandWithEnv(root, env, ...args) {
  return execFileAsync('node', [path.join(root, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd: root,
    env: { ...process.env, ...env }
  });
}

async function writePersistedState(root, state) {
  const file = statePath(root);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function createLegacyV1HarnessFixture(options) {
  const root = await createHarnessFixture(options);
  await writeState(root, {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    hookMode: 'off',
    targets: {},
    upstream: {}
  });
  return root;
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

  return path.relative(root, sessionsRoot);
}

test('harness --help prints top-level usage', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, '--help');
    assert.match(stdout, /Usage: \.\/scripts\/harness <command>/);
    const commandBlock = stdout.split('Commands:\n')[1];
    assert.ok(commandBlock, 'help must include a Commands section');
    const commandLines = commandBlock
      .trimEnd()
      .split('\n')
      .filter(Boolean);
    assert.equal(commandLines.length, 7);
    const commandNames = commandLines.map((line) => line.trim().split(/\s+/)[0]);
    assert.deepEqual(commandNames, [
      'install',
      'sync',
      'doctor',
      'trio',
      'verify',
      'checkpoint',
      'token-audit'
    ]);
    assert.doesNotMatch(commandBlock, /workspace-skills|checkpoint-push|status/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness public dispatcher exposes Trio quick routing without creating planning state', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(
      root,
      'trio',
      'next',
      '--root',
      root,
      '--class',
      'quick',
      '--dry-run'
    );
    const report = JSON.parse(stdout);

    assert.equal(report.command, 'next');
    assert.equal(report.action, 'execute-inline');
    assert.equal(report.readOnly, true);
    assert.equal(report.createTrio, false);
    assert.deepEqual(report.writes, []);
    await assert.rejects(access(path.join(root, 'planning')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness public dispatcher rejects the retired command', async () => {
  const root = await createHarnessFixture();
  try {
    for (const command of ['mcp-approve', 'status']) {
      await assert.rejects(harnessCommand(root, command), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, new RegExp(`Unknown command: ${command}`));
        return true;
      });
    }
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness public dispatcher rejects retired codex-model-default', async () => {
  const root = await createHarnessFixture();
  try {
    await assert.rejects(harnessCommand(root, 'codex-model-default'), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Unknown command: codex-model-default/);
      return true;
    });
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness public dispatcher rejects retired link-personal', async () => {
  const root = await createHarnessFixture();
  try {
    await assert.rejects(harnessCommand(root, 'link-personal'), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Unknown command: link-personal/);
      return true;
    });
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

test('install --help prints usage without writing state', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, 'install', '--help');
    assert.match(stdout, /Usage: .* install/);
    await assert.rejects(access(path.join(root, '.harness/state.json')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('harness public dispatcher rejects retired legacy commands', async () => {
  const root = await createHarnessFixture();
  try {
    for (const command of ['mcp-approve', 'status', 'workspace-skills']) {
      await assert.rejects(harnessCommand(root, command), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, new RegExp(`Unknown command: ${command}`));
        return true;
      });
    }
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace-skills source control plane is physically retired', async () => {
  const retiredPaths = [
    'harness/installer/commands/workspace-skills.mjs',
    'harness/workspace-skill-profile.json',
    'tests/installer/workspace-skills.test.mjs'
  ];
  const presentRetiredPaths = [];
  for (const relativePath of retiredPaths) {
    try {
      await access(path.join(process.cwd(), relativePath));
      presentRetiredPaths.push(relativePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const verifierSource = await readFile(path.join(process.cwd(), 'scripts/ci/verify-upstream-refresh.mjs'), 'utf8');

  assert.deepEqual(
    {
      presentRetiredPaths,
      verifierSelectsRetiredTest: verifierSource.includes('tests/installer/workspace-skills.test.mjs')
    },
    { presentRetiredPaths: [], verifierSelectsRetiredTest: false }
  );
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

test('token-audit --help prints usage', async () => {
  const root = await createHarnessFixture();
  try {
    const { stdout } = await harnessCommand(root, 'token-audit', '--help');
    assert.match(stdout, /Usage: \.\/scripts\/harness token-audit/);
    assert.match(stdout, /--sessions-root <path>/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('token-audit prints a weekly token summary to stdout', async () => {
  const root = await createHarnessFixture();
  try {
    const sessionsRoot = await writeTokenAuditFixture(root);
    const { stdout } = await harnessCommand(
      root,
      'token-audit',
      `--sessions-root=${sessionsRoot}`,
      '--date-from=2026-06-07T00:00:00Z',
      '--date-to=2026-06-14T23:59:59Z'
    );
    assert.match(stdout, /# Weekly token audit/);
    assert.match(stdout, /Total tokens: 400/);
    assert.match(stdout, /Cached input tokens: 160/);
    assert.match(stdout, /Fresh proxy: 240/);
    assert.match(stdout, /Main vs subagent:/);
    assert.match(stdout, /Model mix:/);
    assert.match(stdout, /Top task-family hints:/);
    assert.match(stdout, /goal-round-start-protocol \(heuristic\)/);
    assert.match(stdout, /release-automation-skill \(heuristic\)/);
    assert.match(stdout, /SuperpoweringWithFiles \(\/workspace\/SuperpoweringWithFiles\)/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('token-audit rejects invalid explicit audit windows', async () => {
  const root = await createHarnessFixture();
  try {
    await assert.rejects(
      harnessCommand(root, 'token-audit', '--date-from=not-a-date'),
      /Invalid date-from: not-a-date/
    );

    await assert.rejects(
      harnessCommand(
        root,
        'token-audit',
        '--date-from=2026-06-14T23:59:59Z',
        '--date-to=2026-06-07T00:00:00Z'
      ),
      /Invalid audit window/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('persisted V1 public commands require upgrade and leave the authority root unchanged', async () => {
  const commands = [
    ['install'],
    ['sync'],
    ['doctor', '--check-only'],
    ['verify', '--output=.harness/v1-report']
  ];

  for (const args of commands) {
    const root = await createLegacyV1HarnessFixture();
    try {
      const before = await readFile(statePath(root), 'utf8');
      await assert.rejects(
        harnessCommand(root, ...args),
        (error) => error?.code === 1 && /requires install --upgrade|requires exactly --upgrade/.test(`${error.stderr}\n${error.stdout}`)
      );
      assert.equal(await readFile(statePath(root), 'utf8'), before);
      await assert.rejects(access(path.join(root, '.harness/v1-report/latest.json')), /ENOENT/);
    } finally {
      await removeHarnessFixture(root);
    }
  }
});

test('persisted V1 install rejects malformed upgrade arguments before publication locking', async () => {
  const malformed = [
    [], ['--upgrade'], ['--upgrade', '--upgrade'], ['--upgrade=value'], ['--recovery', 'receipt'],
    ['--upgrade', '--recovery'], ['--upgrade', '--recovery='], ['--upgrade', '--recovery', 'receipt', '--recovery', 'again'],
    ['--upgrade', '--recovery', '--value'], ['--upgrade', '--recovery', 'receipt', '--extra'],
    ['--upgrade', '--upgrade', '--recovery', 'receipt']
  ];
  const root = await createLegacyV1HarnessFixture();
  try {
    const held = await acquireTrioPublicationLock(root);
    try {
      for (const args of malformed) {
        await assert.rejects(() => install(args, { rootDir: root }), (error) => error?.code === 'ERR_TRIO_UPGRADE_REQUIRED');
      }
      await assert.rejects(
        () => install(['--upgrade', '--recovery', 'receipt'], { rootDir: root }),
        (error) => error?.code === 'ERR_TRIO_LOCK_TIMEOUT'
      );
      await assert.rejects(
        () => install(['--recovery=receipt', '--upgrade'], { rootDir: root }),
        (error) => error?.code === 'ERR_TRIO_LOCK_TIMEOUT'
      );
    } finally {
      await held.release();
    }
  } finally {
    await removeHarnessFixture(root);
  }
});





for (const command of ['plugin', 'adopt-global', 'adoption-status']) {
  test(`harness public dispatcher rejects retired ${command}`, async () => {
    const root = await createHarnessFixture();
    try {
      await assert.rejects(harnessCommand(root, command), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, new RegExp(`Unknown command: ${command}`));
        return true;
      });
    } finally {
      await removeHarnessFixture(root);
    }
  });
}
