import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const expectedRefreshCommands = [
  { file: 'git', args: ['fetch', 'origin', 'main', 'dev'] },
  { file: 'git', args: ['checkout', '-B', 'automation/upstream-refresh', 'origin/dev'] },
  { file: './scripts/harness', args: ['fetch', '--no-state'] },
  { file: './scripts/harness', args: ['update', '--no-state'] },
  { file: 'npm', args: ['run', 'verify:upstream-refresh'] },
  { file: './scripts/harness', args: ['worktree-preflight', '--task', 'github-actions-upstream-automation-analysis'] },
  { file: './scripts/harness', args: ['workspace-skills', 'plan'] },
  { file: './scripts/harness', args: ['workspace-skills', 'sync', '--takeover'] },
  { file: './scripts/harness', args: ['workspace-skills', 'check'] }
];

const expectedPrepareCommands = [
  { file: 'git', args: ['fetch', 'origin', 'main', 'dev'] },
  { file: 'git', args: ['checkout', '-B', 'automation/upstream-refresh', 'origin/dev'] }
];

const expectedValidationPrepareCommands = [
  { file: 'git', args: ['fetch', 'origin', 'main', 'dev'] }
];

const expectedExecutionCommands = [
  { file: './scripts/harness', args: ['fetch', '--no-state'] },
  { file: './scripts/harness', args: ['update', '--no-state'] },
  { file: 'npm', args: ['run', 'verify:upstream-refresh'] },
  { file: './scripts/harness', args: ['worktree-preflight', '--task', 'github-actions-upstream-automation-analysis'] },
  { file: './scripts/harness', args: ['workspace-skills', 'plan'] },
  { file: './scripts/harness', args: ['workspace-skills', 'sync', '--takeover'] },
  { file: './scripts/harness', args: ['workspace-skills', 'check'] }
];

const expectedHumanReadableRefreshCommandChain = [
  'git fetch origin main dev',
  'git checkout -B automation/upstream-refresh origin/dev',
  './scripts/harness fetch --no-state',
  './scripts/harness update --no-state',
  'npm run verify:upstream-refresh',
  './scripts/harness worktree-preflight --task github-actions-upstream-automation-analysis',
  './scripts/harness workspace-skills plan',
  './scripts/harness workspace-skills sync --takeover',
  './scripts/harness workspace-skills check'
];

const verifyUpstreamRefreshScriptPath = path.join(process.cwd(), 'scripts/ci/verify-upstream-refresh.mjs');

async function loadUpstreamRefreshModule() {
  return import('../../scripts/ci/lib/upstream-refresh.mjs');
}

function healthyBaseHealthStub() {
  return {
    status: 'healthy',
    failureKind: '',
    reason: '',
    targetSha: 'origin-dev-sha'
  };
}

test('buildRefreshCommandChain returns the fixed upstream refresh command sequence', async () => {
  const { buildRefreshCommandChain } = await loadUpstreamRefreshModule();

  assert.deepEqual(buildRefreshCommandChain(), expectedRefreshCommands);
});

test('buildRefreshPrepareCommandChain isolates the base-branch preparation sequence', async () => {
  const { buildRefreshPrepareCommandChain } = await loadUpstreamRefreshModule();

  assert.deepEqual(buildRefreshPrepareCommandChain(), expectedPrepareCommands);
});

test('buildRefreshPrepareCommandChain keeps workflow-ref validation runs on the checked-out ref', async () => {
  const { buildRefreshPrepareCommandChain } = await loadUpstreamRefreshModule();

  assert.deepEqual(buildRefreshPrepareCommandChain({ validationMode: true }), expectedValidationPrepareCommands);
});

test('buildRefreshExecutionCommandChain isolates the post-checkout refresh sequence', async () => {
  const { buildRefreshExecutionCommandChain } = await loadUpstreamRefreshModule();

  assert.deepEqual(buildRefreshExecutionCommandChain(), expectedExecutionCommands);
});

test('buildRefreshCommandChain narrows fetch and update to the selected source filter', async () => {
  const { buildRefreshCommandChain } = await loadUpstreamRefreshModule();

  assert.deepEqual(buildRefreshCommandChain({ sourceFilter: 'planning-with-files' }), [
    { file: 'git', args: ['fetch', 'origin', 'main', 'dev'] },
    { file: 'git', args: ['checkout', '-B', 'automation/upstream-refresh', 'origin/dev'] },
    { file: './scripts/harness', args: ['fetch', '--source=planning-with-files', '--no-state'] },
    { file: './scripts/harness', args: ['update', '--source=planning-with-files', '--no-state'] },
    { file: 'npm', args: ['run', 'verify:upstream-refresh'] },
    { file: './scripts/harness', args: ['worktree-preflight', '--task', 'github-actions-upstream-automation-analysis'] },
    { file: './scripts/harness', args: ['workspace-skills', 'plan'] },
    { file: './scripts/harness', args: ['workspace-skills', 'sync', '--takeover'] },
    { file: './scripts/harness', args: ['workspace-skills', 'check'] }
  ]);
});

test('buildRefreshCommandChain omits the origin/dev checkout during workflow-ref validation runs', async () => {
  const { buildRefreshCommandChain } = await loadUpstreamRefreshModule();

  assert.deepEqual(buildRefreshCommandChain({ validationMode: true }), [
    { file: 'git', args: ['fetch', 'origin', 'main', 'dev'] },
    { file: './scripts/harness', args: ['fetch', '--no-state'] },
    { file: './scripts/harness', args: ['update', '--no-state'] },
    { file: 'npm', args: ['run', 'verify:upstream-refresh'] },
    { file: './scripts/harness', args: ['worktree-preflight', '--task', 'github-actions-upstream-automation-analysis'] },
    { file: './scripts/harness', args: ['workspace-skills', 'plan'] },
    { file: './scripts/harness', args: ['workspace-skills', 'sync', '--takeover'] },
    { file: './scripts/harness', args: ['workspace-skills', 'check'] }
  ]);
});

test('formatCommand returns the human-readable upstream refresh command sequence', async () => {
  const { buildRefreshCommandChain, formatCommand } = await loadUpstreamRefreshModule();

  assert.deepEqual(buildRefreshCommandChain().map(formatCommand), expectedHumanReadableRefreshCommandChain);
});

test('runRefreshCommandChain inserts beforeExecution between prepare and execution commands', async () => {
  const { runRefreshCommandChain, formatCommand } = await loadUpstreamRefreshModule();
  const events = [];

  await runRefreshCommandChain({
    cwd: '/tmp/repo',
    beforeExecution: async () => {
      events.push('beforeExecution');
    },
    run: async (command) => {
      events.push(formatCommand(command));
    }
  });

  assert.deepEqual(events, [
    'git fetch origin main dev',
    'git checkout -B automation/upstream-refresh origin/dev',
    'beforeExecution',
    './scripts/harness fetch --no-state',
    './scripts/harness update --no-state',
    'npm run verify:upstream-refresh',
    './scripts/harness worktree-preflight --task github-actions-upstream-automation-analysis',
    './scripts/harness workspace-skills plan',
    './scripts/harness workspace-skills sync --takeover',
    './scripts/harness workspace-skills check'
  ]);
});

test('upstream refresh report includes changed files, affected projections, resync need, and risk', async () => {
  const { buildUpdateCompatibilityReport } = await loadUpstreamRefreshModule();
  const result = buildUpdateCompatibilityReport({
    changedFiles: ['harness/installer/lib/hook-projection.mjs'],
    affectedProjections: ['codex'],
    requiresResync: true,
    riskLevel: 'medium',
    patchDriftWarnings: ['planning patch drift detected']
  });

  assert.equal(Array.isArray(result.changedFiles), true);
  assert.equal(Array.isArray(result.affectedProjections), true);
  assert.equal(typeof result.requiresResync, 'boolean');
  assert.equal(typeof result.riskLevel, 'string');
  assert.equal(Array.isArray(result.focusedChecks), true);
  assert.match(result.focusedChecks.join(' '), /skill-projection|sync-hooks|policy-render/i);
});

test('verify:upstream-refresh runner preserves child test output streaming', async () => {
  const script = await readFile(verifyUpstreamRefreshScriptPath, 'utf8');

  assert.match(script, /await execFileAsync\('node', \['--test', \.\.\.files\], \{[\s\S]*stdio:\s*'inherit'/);
  assert.match(script, /await execFileAsync\('node', \['--test', \.\.\.files\], \{[\s\S]*maxBuffer:\s*1024 \* 1024 \* 8/);
  assert.match(script, /tests\/adapters\/sync-skills\.test\.mjs/);
  assert.match(script, /tests\/adapters\/sync-hooks\.test\.mjs/);
  assert.match(script, /tests\/installer\/policy-render\.test\.mjs/);
});

test('runCommand executes command file and args without a shell', async () => {
  const { runCommand } = await loadUpstreamRefreshModule();
  const calls = [];

  await runCommand({ file: 'node', args: ['--version'] }, {
    cwd: '/tmp/example',
    env: { EXAMPLE: '1' },
    spawnProcess: (file, args, options) => {
      calls.push({ file, args, options });
      const child = new EventEmitter();
      process.nextTick(() => child.emit('close', 0));
      return child;
    }
  });

  assert.deepEqual(calls, [
    {
      file: 'node',
      args: ['--version'],
      options: {
        cwd: '/tmp/example',
        env: { EXAMPLE: '1' },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    }
  ]);
});

test('runCommand captures and forwards stdout and stderr when a command fails', async () => {
  const { runCommand } = await loadUpstreamRefreshModule();
  const forwardedOutput = [];
  const forwardedErrors = [];

  await assert.rejects(
    runCommand({ file: 'git', args: ['merge', 'upstream/main'] }, {
      stdout: {
        write: (chunk) => forwardedOutput.push(String(chunk))
      },
      stderr: {
        write: (chunk) => forwardedErrors.push(String(chunk))
      },
      spawnProcess: () => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();

        process.nextTick(() => {
          child.stdout.emit('data', Buffer.from('Auto-merging docs/maintenance.md\n'));
          child.stderr.emit('data', Buffer.from('CONFLICT (content): Merge conflict in docs/maintenance.md\n'));
          child.emit('close', 1);
        });

        return child;
      }
    }),
    (error) => {
      assert.match(error.message, /Command failed \(1\): git merge upstream\/main/);
      assert.match(error.message, /Auto-merging docs\/maintenance\.md/);
      assert.match(error.message, /CONFLICT \(content\): Merge conflict/);
      assert.equal(error.command, 'git merge upstream/main');
      assert.equal(error.exitCode, 1);
      assert.match(error.stdout, /Auto-merging docs\/maintenance\.md/);
      assert.match(error.stderr, /CONFLICT \(content\): Merge conflict/);
      return true;
    }
  );

  assert.deepEqual(forwardedOutput, ['Auto-merging docs/maintenance.md\n']);
  assert.deepEqual(forwardedErrors, ['CONFLICT (content): Merge conflict in docs/maintenance.md\n']);
});

test('runUpstreamRefresh captures eligible files after writing the authoritative source lock', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const writtenResults = [];
  let sourceLockWritten = false;
  const previousLock = {
    schemaVersion: 2,
    sources: {
      superpowers: {
        strategy: 'latest-release',
        fallbackUsed: false,
        resolved: {
          kind: 'latest-release',
          version: 'v6.0.3',
          ref: 'v6.0.3',
          commitSha: '0000000000000000000000000000000000000000'
        }
      }
    }
  };
  const resolvedLock = {
    schemaVersion: 2,
    sources: {
      superpowers: {
        strategy: 'latest-release',
        fallbackUsed: false,
        resolved: {
          kind: 'latest-release',
          version: 'v6.1.1',
          ref: 'v6.1.1',
          commitSha: '1111111111111111111111111111111111111111'
        }
      }
    }
  };

  const result = await runUpstreamRefresh({
    cwd: '/tmp/repo',
    env: {},
    now: () => new Date('2026-04-30T00:00:00.000Z'),
    probeHeads: async () => ({
      status: 'changes_detected',
      previousLock,
      resolvedLock,
      changedSources: ['superpowers'],
      sourceHeads: {
        superpowers: '1111111111111111111111111111111111111111'
      },
      strategySummary: {
        superpowers: {
          strategy: 'latest-release',
          previousVersion: 'v6.0.3',
          nextVersion: 'v6.1.1',
          previousCommitSha: '0000000000000000000000000000000000000000',
          nextCommitSha: '1111111111111111111111111111111111111111',
          fallbackUsed: false
        }
      }
    }),
    loadBaseHealth: async () => healthyBaseHealthStub(),
    runRefresh: async ({ beforeExecution }) => {
      await beforeExecution?.();
      events.push('runRefresh');
    },
    writeSourceLock: async (record) => {
      events.push(`writeSourceLock:${record.refreshedAt ? 'final' : 'staged'}`);
      sourceLockWritten = true;
      assert.equal(record.sources.superpowers.resolved.version, 'v6.1.1');
    },
    captureChanges: async () => {
      events.push('captureChanges');
      return sourceLockWritten
        ? [{ path: 'harness/upstream/.source-lock.json', tracked: true }]
        : [];
    },
    filterChanges: filterEligibleChanges,
    writeResult: async (refreshResult) => {
      events.push('writeResult');
      writtenResults.push(refreshResult);
    }
  });

  assert.deepEqual(events, ['writeSourceLock:staged', 'runRefresh', 'writeSourceLock:final', 'captureChanges', 'writeResult']);
  assert.deepEqual(result.eligibleFiles, ['harness/upstream/.source-lock.json']);
  assert.equal(result.previousLock.sources.superpowers.resolved.version, 'v6.0.3');
  assert.equal(result.resolvedLock.sources.superpowers.resolved.version, 'v6.1.1');
  assert.equal(result.lockPersistence, 'written');
  assert.equal(result.executionMode, 'base-branch-refresh');
  assert.deepEqual(writtenResults, [result]);
});

test('runUpstreamRefresh skips authoritative source lock persistence for run-scoped overrides', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const writtenResults = [];
  const authoritativeLock = {
    schemaVersion: 2,
    sources: {
      superpowers: {
        strategy: 'latest-release',
        resolved: {
          kind: 'latest-release',
          version: 'v6.0.3',
          ref: 'v6.0.3',
          commitSha: '0000000000000000000000000000000000000000'
        }
      }
    }
  };

  const result = await runUpstreamRefresh({
    cwd: '/tmp/repo',
    env: {},
    loadAuthoritativeLock: async () => authoritativeLock,
    probeHeads: async () => ({
      status: 'changes_detected',
      previousLock: {
        schemaVersion: 2,
        sources: {
          superpowers: {
            strategy: 'latest-release',
            resolved: {
              kind: 'latest-release',
              version: 'v6.0.3',
              ref: 'v6.0.3',
              commitSha: '0000000000000000000000000000000000000000'
            }
          }
        }
      },
      resolvedLock: {
        schemaVersion: 2,
        sources: {
          superpowers: {
            strategy: 'latest-release',
            resolved: {
              kind: 'latest-release',
              version: 'v6.1.1',
              ref: 'v6.1.1',
              commitSha: '1111111111111111111111111111111111111111'
            }
          }
        }
      },
      changedSources: ['superpowers'],
      sourceHeads: {
        superpowers: '1111111111111111111111111111111111111111'
      },
      strategySummary: {
        superpowers: {
          strategy: 'latest-release',
          previousVersion: 'v6.0.3',
          nextVersion: 'v6.1.1',
          previousCommitSha: '0000000000000000000000000000000000000000',
          nextCommitSha: '1111111111111111111111111111111111111111',
          fallbackUsed: false
        }
      }
    }),
    loadBaseHealth: async () => healthyBaseHealthStub(),
    runOverrides: {
      active: true
    },
    runRefresh: async ({ beforeExecution }) => {
      await beforeExecution?.();
      events.push('runRefresh');
    },
    writeSourceLock: async (record) => {
      events.push(`writeSourceLock:${record.sources.superpowers.resolved.version}`);
    },
    captureChanges: async () => {
      events.push('captureChanges');
      return [{ path: 'harness/upstream/superpowers/SKILL.md', tracked: true }];
    },
    filterChanges: filterEligibleChanges,
    writeResult: async (refreshResult) => {
      events.push('writeResult');
      writtenResults.push(refreshResult);
    }
  });

  assert.deepEqual(events, ['writeSourceLock:v6.1.1', 'runRefresh', 'writeSourceLock:v6.0.3', 'captureChanges', 'writeResult']);
  assert.equal(result.lockPersistence, 'skipped_due_to_run_override');
  assert.equal(result.executionMode, 'base-branch-refresh');
  assert.deepEqual(writtenResults, [result]);
});

test('runUpstreamRefresh pre-stages the current resolved lock before the refresh chain and restores steady-state for run-scoped overrides', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const writes = [];
  const authoritativeLock = {
    schemaVersion: 2,
    refreshedAt: '2026-03-01T00:00:00.000Z',
    sources: {
      superpowers: {
        strategy: 'latest-release',
        resolved: {
          kind: 'latest-release',
          version: 'v6.0.3',
          ref: 'v6.0.3',
          commitSha: '0000000000000000000000000000000000000000'
        }
      },
      'planning-with-files': {
        strategy: 'latest-release',
        resolved: {
          kind: 'latest-release',
          version: 'v3.2.0',
          ref: 'v3.2.0',
          commitSha: '2222222222222222222222222222222222222222'
        }
      }
    }
  };

  await runUpstreamRefresh({
    cwd: '/tmp/repo',
    env: {},
    loadAuthoritativeLock: async () => authoritativeLock,
    probeHeads: async () => ({
      status: 'changes_detected',
      previousLock: {
        schemaVersion: 2,
        refreshedAt: '2026-04-01T00:00:00.000Z',
        sources: {
          superpowers: {
            strategy: 'latest-release',
            resolved: {
              kind: 'latest-release',
              version: 'v6.0.3',
              ref: 'v6.0.3',
              commitSha: '0000000000000000000000000000000000000000'
            }
          }
        }
      },
      resolvedLock: {
        schemaVersion: 2,
        sources: {
          superpowers: {
            strategy: 'latest-tag',
            resolved: {
              kind: 'latest-tag',
              version: 'v6.1.1-beta.1',
              ref: 'v6.1.1-beta.1',
              commitSha: '1111111111111111111111111111111111111111'
            }
          }
        }
      },
      changedSources: ['superpowers'],
      sourceHeads: {
        superpowers: '1111111111111111111111111111111111111111'
      },
      strategySummary: {
        superpowers: {
          strategy: 'latest-tag',
          previousVersion: 'v6.0.3',
          nextVersion: 'v6.1.1-beta.1',
          previousCommitSha: '0000000000000000000000000000000000000000',
          nextCommitSha: '1111111111111111111111111111111111111111',
          fallbackUsed: false
        }
      }
    }),
    loadBaseHealth: async () => healthyBaseHealthStub(),
    runOverrides: {
      active: true,
      sourceFilter: 'superpowers'
    },
    runRefresh: async ({ beforeExecution }) => {
      await beforeExecution?.();
      events.push('runRefresh');
    },
    writeSourceLock: async (record) => {
      events.push(`writeSourceLock:${record.sources.superpowers.resolved.version}`);
      writes.push(record);
    },
    captureChanges: async () => {
      events.push('captureChanges');
      return [{ path: 'harness/upstream/superpowers/SKILL.md', tracked: true }];
    },
    filterChanges: filterEligibleChanges,
    writeResult: async () => {
      events.push('writeResult');
    }
  });

  assert.deepEqual(events, [
    'writeSourceLock:v6.1.1-beta.1',
    'runRefresh',
    'writeSourceLock:v6.0.3',
    'captureChanges',
    'writeResult'
  ]);
  assert.equal(writes[0].sources.superpowers.resolved.version, 'v6.1.1-beta.1');
  assert.equal(writes[1].sources.superpowers.resolved.version, 'v6.0.3');
  assert.deepEqual(Object.keys(writes[1].sources).sort(), ['planning-with-files', 'superpowers']);
  assert.equal(writes[1].sources['planning-with-files'].resolved.version, 'v3.2.0');
});

test('runUpstreamRefresh consumes workflow dispatch source overrides and keeps them run-scoped', async () => {
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'upstream-refresh-dispatch-'));
  const eventPath = path.join(tempRoot, 'workflow-dispatch.json');
  const events = [];
  let capturedSources;

  await writeFile(eventPath, JSON.stringify({
    inputs: {
      source_filter: 'planning-with-files',
      strategy_override: 'latest-tag',
      allow_prerelease: 'true',
      create_pr: 'false',
      dry_run: 'true'
    }
  }), 'utf8');

  const result = await runUpstreamRefresh({
    cwd: '/tmp/repo',
    env: {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_EVENT_PATH: eventPath
    },
    loadSourceConfig: async () => ({
      schemaVersion: 2,
      sources: {
        superpowers: {
          name: 'superpowers',
          type: 'git',
          url: 'https://github.com/obra/superpowers',
          resolution: {
            strategy: 'latest-release',
            allowPrerelease: false,
            fallbacks: []
          }
        },
        'planning-with-files': {
          name: 'planning-with-files',
          type: 'git',
          url: 'https://github.com/OthmanAdi/planning-with-files',
          resolution: {
            strategy: 'latest-release',
            allowPrerelease: false,
            fallbacks: []
          }
        }
      }
    }),
    probeHeads: async ({ sources }) => {
      capturedSources = sources;
      return {
        status: 'changes_detected',
        previousLock: {
          schemaVersion: 2,
          sources: {
            'planning-with-files': {
              strategy: 'latest-release',
              resolved: {
                kind: 'latest-release',
                version: 'v3.2.0',
                ref: 'v3.2.0',
                commitSha: '2222222222222222222222222222222222222222'
              }
            }
          }
        },
        resolvedLock: {
          schemaVersion: 2,
          sources: {
            'planning-with-files': {
              strategy: 'latest-tag',
              resolved: {
                kind: 'latest-tag',
                version: 'v3.2.1-beta.1',
                ref: 'v3.2.1-beta.1',
                commitSha: '3333333333333333333333333333333333333333'
              }
            }
          }
        },
        changedSources: ['planning-with-files'],
        sourceHeads: {
          'planning-with-files': '3333333333333333333333333333333333333333'
        },
        strategySummary: {
          'planning-with-files': {
            strategy: 'latest-tag',
            previousVersion: 'v3.2.0',
            nextVersion: 'v3.2.1-beta.1',
            previousCommitSha: '2222222222222222222222222222222222222222',
            nextCommitSha: '3333333333333333333333333333333333333333',
            fallbackUsed: false
          }
        }
      };
    },
    loadBaseHealth: async () => healthyBaseHealthStub(),
    runRefresh: async ({ sourceFilter, beforeExecution }) => {
      await beforeExecution?.();
      events.push('runRefresh');
      assert.equal(sourceFilter, 'planning-with-files');
    },
    writeSourceLock: async () => {
      events.push('writeSourceLock');
    },
    captureChanges: async () => {
      events.push('captureChanges');
      return [{ path: 'harness/upstream/planning-with-files/SKILL.md', tracked: true }];
    },
    filterChanges: (changes) => ({
      eligibleFiles: changes.map((change) => change.path),
      excludedFiles: []
    }),
    writeResult: async () => {
      events.push('writeResult');
    }
  });

  assert.deepEqual(Object.keys(capturedSources.sources), ['planning-with-files']);
  assert.equal(capturedSources.sources['planning-with-files'].resolution.strategy, 'latest-tag');
  assert.equal(capturedSources.sources['planning-with-files'].resolution.allowPrerelease, true);
  assert.deepEqual(events, ['writeSourceLock', 'runRefresh', 'writeSourceLock', 'captureChanges', 'writeResult']);
  assert.equal(result.lockPersistence, 'skipped_due_to_run_override');
  assert.equal(result.executionMode, 'base-branch-refresh');
  assert.deepEqual(result.eligibleFiles, ['harness/upstream/planning-with-files/SKILL.md']);
});

test('runUpstreamRefresh keeps workflow-ref validation runs on the checked-out branch and disables steady-state side effects', async () => {
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'upstream-refresh-validation-mode-'));
  const eventPath = path.join(tempRoot, 'workflow-dispatch.json');
  const events = [];

  await writeFile(eventPath, JSON.stringify({
    inputs: {
      source_filter: 'superpowers',
      validation_mode: 'true',
      create_pr: 'true',
      dry_run: 'false'
    }
  }), 'utf8');

  const result = await runUpstreamRefresh({
    cwd: '/tmp/repo',
    env: {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_EVENT_PATH: eventPath
    },
    loadSourceConfig: async () => ({
      schemaVersion: 2,
      sources: {
        superpowers: {
          name: 'superpowers',
          type: 'git',
          url: 'https://github.com/obra/superpowers',
          resolution: {
            strategy: 'latest-release',
            allowPrerelease: false,
            fallbacks: []
          }
        }
      }
    }),
    loadAuthoritativeLock: async () => ({
      schemaVersion: 2,
      sources: {
        superpowers: {
          strategy: 'latest-release',
          resolved: {
            kind: 'latest-release',
            version: 'v6.0.3',
            ref: 'v6.0.3',
            commitSha: '0000000000000000000000000000000000000000'
          }
        }
      }
    }),
    probeHeads: async () => ({
      status: 'changes_detected',
      previousLock: {
        schemaVersion: 2,
        sources: {
          superpowers: {
            strategy: 'latest-release',
            resolved: {
              kind: 'latest-release',
              version: 'v6.0.3',
              ref: 'v6.0.3',
              commitSha: '0000000000000000000000000000000000000000'
            }
          }
        }
      },
      resolvedLock: {
        schemaVersion: 2,
        sources: {
          superpowers: {
            strategy: 'latest-release',
            resolved: {
              kind: 'latest-release',
              version: 'v6.1.1',
              ref: 'v6.1.1',
              commitSha: '1111111111111111111111111111111111111111'
            }
          }
        }
      },
      changedSources: ['superpowers'],
      sourceHeads: {
        superpowers: '1111111111111111111111111111111111111111'
      },
      strategySummary: {
        superpowers: {
          strategy: 'latest-release',
          previousVersion: 'v6.0.3',
          nextVersion: 'v6.1.1',
          previousCommitSha: '0000000000000000000000000000000000000000',
          nextCommitSha: '1111111111111111111111111111111111111111',
          fallbackUsed: false
        }
      }
    }),
    loadBaseHealth: async () => healthyBaseHealthStub(),
    runRefresh: async ({ sourceFilter, validationMode, beforeExecution }) => {
      await beforeExecution?.();
      events.push(`runRefresh:${sourceFilter}:${validationMode ? 'validation' : 'default'}`);
    },
    writeSourceLock: async (record) => {
      events.push(`writeSourceLock:${record.sources.superpowers.resolved.version}`);
    },
    captureChanges: async () => {
      events.push('captureChanges');
      return [{ path: 'harness/upstream/superpowers/SKILL.md', tracked: true }];
    },
    filterChanges: (changes) => ({
      eligibleFiles: changes.map((change) => change.path),
      excludedFiles: []
    }),
    writeResult: async () => {
      events.push('writeResult');
    }
  });

  assert.deepEqual(events, [
    'writeSourceLock:v6.1.1',
    'runRefresh:superpowers:validation',
    'writeSourceLock:v6.0.3',
    'captureChanges',
    'writeResult'
  ]);
  assert.equal(result.lockPersistence, 'skipped_due_to_run_override');
  assert.equal(result.executionMode, 'workflow-ref-validation');
  assert.deepEqual(result.eligibleFiles, ['harness/upstream/superpowers/SKILL.md']);
});

test('runUpstreamRefresh blocks before the refresh command chain when origin/dev base health is unhealthy', async () => {
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const writtenResults = [];

  await assert.rejects(
    runUpstreamRefresh({
      cwd: '/tmp/repo',
      env: {},
      probeHeads: async () => ({
        status: 'changes_detected',
        sources: [],
        sourceHeads: {
          superpowers: '4444444444444444444444444444444444444444'
        }
      }),
      loadBaseHealth: async ({ cwd, branch }) => {
        events.push(`loadBaseHealth:${cwd}:${branch}`);
        return {
          status: 'blocked',
          failureKind: 'base_unhealthy',
          reason: 'Repo Verify is not green for origin/dev @ 5555555555555555555555555555555555555555.',
          targetSha: '5555555555555555555555555555555555555555'
        };
      },
      runRefresh: async () => {
        events.push('runRefresh');
      },
      writeResult: async (refreshResult) => {
        events.push('writeResult');
        writtenResults.push(refreshResult);
      }
    }),
    /origin\/dev/
  );

  assert.deepEqual(events, [
    'loadBaseHealth:/tmp/repo:dev',
    'writeResult'
  ]);
  assert.equal(writtenResults.length, 1);
  assert.deepEqual(writtenResults[0], {
    status: 'failure',
    executionMode: 'base-branch-refresh',
    baseRef: 'origin/dev',
    branchName: 'automation/upstream-refresh',
    sourceHeads: {
      superpowers: '4444444444444444444444444444444444444444'
    },
    eligibleFiles: [],
    previousLock: {
      sources: {}
    },
    resolvedLock: {
      sources: {}
    },
    changedSources: [],
    strategySummary: {},
    lockPersistence: 'not_written_due_to_failure',
    compatibilityReport: {
      changedFiles: [],
      affectedProjections: [],
      requiresResync: false,
      riskLevel: 'high',
      patchDriftWarnings: [],
      focusedChecks: []
    },
    blockedReason: 'Repo Verify is not green for origin/dev @ 5555555555555555555555555555555555555555.',
    failureKind: 'base_unhealthy'
  });
});

test('runUpstreamRefresh restores repo-local entry files before enforcing the allowlist', async () => {
  const { filterEligibleChanges, listRepoLocalEntryFileChanges } = await loadUpstreamRefreshModule();
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const writtenResults = [];
  let captureCount = 0;

  const result = await runUpstreamRefresh({
    cwd: '/tmp/repo',
    env: {},
    now: () => new Date('2026-04-30T00:00:00.000Z'),
    probeHeads: async () => ({
      status: 'changes_detected',
      sources: [
        {
          name: 'superpowers',
          url: 'https://github.com/obra/superpowers'
        }
      ],
      sourceHeads: {
        superpowers: '1212121212121212121212121212121212121212'
      }
    }),
    loadBaseHealth: async () => healthyBaseHealthStub(),
    runRefresh: async ({ beforeExecution }) => {
      await beforeExecution?.();
      events.push('runRefresh');
    },
    writeSourceLock: async () => {
      events.push('writeSourceLock');
    },
    captureChanges: async () => {
      captureCount += 1;
      events.push(`captureChanges:${captureCount}`);

      if (captureCount === 1) {
        return [
          { path: 'AGENTS.md', tracked: true },
          { path: '.github/copilot-instructions.md', tracked: true },
          { path: 'harness/upstream/superpowers/SKILL.md', tracked: true }
        ];
      }

      return [
        { path: 'harness/upstream/superpowers/SKILL.md', tracked: true }
      ];
    },
    filterChanges: filterEligibleChanges,
    listRepoLocalEntryChanges: listRepoLocalEntryFileChanges,
    restoreRepoLocalEntries: async (changes) => {
      events.push(`restore:${changes.map((change) => `${change.path}:${change.tracked === false ? 'untracked' : 'tracked'}`).join(',')}`);
    },
    writeResult: async (refreshResult) => {
      events.push('writeResult');
      writtenResults.push(refreshResult);
    }
  });

  assert.deepEqual(events, [
    'writeSourceLock',
    'runRefresh',
    'writeSourceLock',
    'captureChanges:1',
    'restore:AGENTS.md:tracked,.github/copilot-instructions.md:tracked',
    'captureChanges:2',
    'writeResult'
  ]);
  assert.deepEqual(result.eligibleFiles, ['harness/upstream/superpowers/SKILL.md']);
  assert.deepEqual(writtenResults, [result]);
});

test('filterEligibleChanges ignores runtime node_modules artifacts before enforcing the allowlist', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();

  const filtered = filterEligibleChanges([
    { path: 'node_modules/.bin/harness', tracked: false },
    { path: 'node_modules/.cache/wrangler/wrangler-account.json', tracked: false },
    { path: 'node_modules/@superpowering-with-files/harness-runtime', tracked: false },
    { path: 'harness/upstream/.source-heads.json', tracked: true }
  ]);

  assert.deepEqual(filtered, {
    eligibleFiles: ['harness/upstream/.source-heads.json'],
    excludedFiles: []
  });
});

test('runUpstreamRefresh removes known transient cache artifacts before final allowlist enforcement', async () => {
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const cleanedPaths = [];
  let captureCount = 0;
  let filterInputPaths = [];

  const result = await runUpstreamRefresh({
    cwd: '/tmp/repo',
    env: {},
    probeHeads: async () => ({
      status: 'changes_detected',
      resolvedLock: {
        schemaVersion: 2,
        sources: {
          superpowers: {
            strategy: 'latest-release',
            resolved: {
              kind: 'latest-release',
              version: 'v6.1.1',
              ref: 'v6.1.1',
              commitSha: '1111111111111111111111111111111111111111'
            }
          }
        }
      },
      sourceHeads: { superpowers: '1111111111111111111111111111111111111111' }
    }),
    loadBaseHealth: async () => healthyBaseHealthStub(),
    runRefresh: async ({ beforeExecution }) => {
      await beforeExecution?.();
      events.push('runRefresh');
    },
    writeSourceLock: async () => {
      events.push('writeSourceLock');
    },
    captureChanges: async () => {
      captureCount += 1;
      events.push(`captureChanges:${captureCount}`);

      if (captureCount === 1) {
        return [
          { path: 'node_modules/.cache/wrangler/wrangler-account.json', tracked: false },
          { path: 'harness/upstream/.source-lock.json', tracked: true }
        ];
      }

      return [
        { path: 'harness/upstream/.source-lock.json', tracked: true }
      ];
    },
    restoreRepoLocalEntries: async () => {},
    cleanupRuntimeArtifacts: async (paths) => {
      events.push(`cleanup:${paths.join(',')}`);
      cleanedPaths.push(...paths);
    },
    filterChanges: (changes) => {
      filterInputPaths = changes.map((change) => change.path);
      events.push(`filter:${filterInputPaths.join(',')}`);
      return {
        eligibleFiles: filterInputPaths,
        excludedFiles: []
      };
    },
    writeResult: async () => {
      events.push('writeResult');
    }
  });

  assert.deepEqual(cleanedPaths, ['node_modules/.cache/wrangler/wrangler-account.json']);
  assert.deepEqual(filterInputPaths, ['harness/upstream/.source-lock.json']);
  assert.deepEqual(result.eligibleFiles, ['harness/upstream/.source-lock.json']);
  assert.deepEqual(events, [
    'writeSourceLock',
    'runRefresh',
    'writeSourceLock',
    'captureChanges:1',
    'cleanup:node_modules/.cache/wrangler/wrangler-account.json',
    'captureChanges:2',
    'filter:harness/upstream/.source-lock.json',
    'writeResult'
  ]);
});

test('runUpstreamRefresh writes a failure result and rejects when verification fails', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const writtenResults = [];

  await assert.rejects(
    runUpstreamRefresh({
      cwd: '/tmp/repo',
      env: {},
      probeHeads: async () => ({
        status: 'changes_detected',
        sources: [],
        sourceHeads: {
          superpowers: '2222222222222222222222222222222222222222'
        }
      }),
      loadBaseHealth: async () => healthyBaseHealthStub(),
      runRefresh: async ({ beforeExecution }) => {
        await beforeExecution?.();
        events.push('runRefresh');
        throw new Error('Command failed (1): npm run verify');
      },
      captureChanges: async () => {
        events.push('captureChanges');
        return [
          { path: 'harness/upstream/superpowers/SKILL.md', tracked: true },
          { path: 'README.md', tracked: true }
        ];
      },
      filterChanges: filterEligibleChanges,
      writeResult: async (refreshResult) => {
        events.push('writeResult');
        writtenResults.push(refreshResult);
      }
    }),
    /npm run verify/
  );

  assert.deepEqual(events, ['runRefresh', 'captureChanges', 'writeResult']);
  assert.equal(writtenResults.length, 1);
  assert.equal(writtenResults[0].status, 'failure');
  assert.match(writtenResults[0].blockedReason, /npm run verify/);
  assert.equal(writtenResults[0].failureKind, 'runtime_failure');
  assert.deepEqual(writtenResults[0].eligibleFiles, ['harness/upstream/superpowers/SKILL.md']);
  assert.match(writtenResults[0].blockedReason, /README\.md/);
  assert.deepEqual(writtenResults[0].sourceHeads, {
    superpowers: '2222222222222222222222222222222222222222'
  });
});

test('runUpstreamRefresh keeps the original failure when changed-file capture fails', async () => {
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const writtenResults = [];

  await assert.rejects(
    runUpstreamRefresh({
      cwd: '/tmp/repo',
      env: {},
      probeHeads: async () => ({
        status: 'changes_detected',
        sources: [],
        sourceHeads: {}
      }),
      loadBaseHealth: async () => healthyBaseHealthStub(),
      runRefresh: async ({ beforeExecution }) => {
        await beforeExecution?.();
        throw new Error('Command failed (1): ./scripts/harness workspace-skills check');
      },
      captureChanges: async () => {
        throw new Error('git diff unavailable');
      },
      writeResult: async (refreshResult) => {
        writtenResults.push(refreshResult);
      }
    }),
    /workspace-skills check/
  );

  assert.equal(writtenResults.length, 1);
  assert.equal(writtenResults[0].status, 'failure');
  assert.deepEqual(writtenResults[0].eligibleFiles, []);
  assert.match(writtenResults[0].blockedReason, /workspace-skills check/);
  assert.match(writtenResults[0].blockedReason, /Unable to capture changed files after failure: git diff unavailable/);
  assert.equal(writtenResults[0].failureKind, 'runtime_failure');
});

test('runUpstreamRefresh writes a failure result and rejects when refresh hits a git conflict', async () => {
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const writtenResults = [];

  await assert.rejects(
    runUpstreamRefresh({
      cwd: '/tmp/repo',
      env: {},
      probeHeads: async () => ({
        status: 'changes_detected',
        sources: [],
        sourceHeads: {}
      }),
      loadBaseHealth: async () => healthyBaseHealthStub(),
      runRefresh: async ({ beforeExecution }) => {
        await beforeExecution?.();
        throw new Error('CONFLICT (content): Merge conflict in harness/upstream/superpowers/SKILL.md');
      },
      writeResult: async (refreshResult) => {
        writtenResults.push(refreshResult);
      }
    }),
    /Merge conflict/
  );

  assert.equal(writtenResults.length, 1);
  assert.equal(writtenResults[0].status, 'failure');
  assert.match(writtenResults[0].blockedReason, /Merge conflict/);
  assert.match(writtenResults[0].blockedReason, /harness\/upstream\/superpowers\/SKILL\.md/);
  assert.equal(writtenResults[0].failureKind, 'runtime_failure');
});

test('runUpstreamRefresh writes a failure result and rejects on allowlist violations', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const writtenResults = [];

  await assert.rejects(
    runUpstreamRefresh({
      cwd: '/tmp/repo',
      env: {},
      now: () => new Date('2026-04-30T00:00:00.000Z'),
      probeHeads: async () => ({
        status: 'changes_detected',
        sources: [
          {
            name: 'superpowers',
            url: 'https://github.com/obra/superpowers'
          }
        ],
        sourceHeads: {
        superpowers: '3333333333333333333333333333333333333333'
      }
    }),
      loadBaseHealth: async () => healthyBaseHealthStub(),
      runRefresh: async ({ beforeExecution }) => {
        await beforeExecution?.();
        events.push('runRefresh');
      },
      writeSourceLock: async () => {
        events.push('writeSourceLock');
      },
      captureChanges: async () => {
        events.push('captureChanges');
        return [
          { path: 'harness/upstream/superpowers/SKILL.md', tracked: true },
          { path: 'README.md', tracked: true }
        ];
      },
      filterChanges: filterEligibleChanges,
      writeResult: async (refreshResult) => {
        events.push('writeResult');
        writtenResults.push(refreshResult);
      }
    }),
    /allowlist violation/i
  );

  assert.deepEqual(events, ['writeSourceLock', 'runRefresh', 'writeSourceLock', 'captureChanges', 'writeSourceLock', 'writeResult']);
  assert.equal(writtenResults.length, 1);
  assert.equal(writtenResults[0].status, 'failure');
  assert.deepEqual(writtenResults[0].eligibleFiles, ['harness/upstream/superpowers/SKILL.md']);
  assert.match(writtenResults[0].blockedReason, /allowlist violation/i);
  assert.match(writtenResults[0].blockedReason, /README\.md/);
  assert.equal(writtenResults[0].failureKind, 'runtime_failure');
});

test('filterEligibleChanges includes tracked and untracked repo-owned upstream files', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();

  const result = filterEligibleChanges([
    { path: 'harness/upstream/superpowers/SKILL.md', status: 'M', tracked: true },
    { path: 'harness/upstream/planning-with-files/new-skill.md', status: '??', tracked: false }
  ]);

  assert.deepEqual(result.eligibleFiles, [
    'harness/upstream/superpowers/SKILL.md',
    'harness/upstream/planning-with-files/new-skill.md'
  ]);
});

test('filterEligibleChanges includes hidden projection roots and excludes repo-local entry files', async () => {
  const { filterEligibleChanges, listRepoLocalEntryFileChanges } = await loadUpstreamRefreshModule();

  const changes = [
    { path: 'docs/maintenance.md', status: 'M', tracked: true },
    { path: 'AGENTS.md', status: 'M', tracked: true },
    { path: 'CLAUDE.md', status: 'M', tracked: true },
    { path: '.agents/skills/planning-with-files/SKILL.md', status: 'M', tracked: true },
    { path: '.claude/skills/superpowers/SKILL.md', status: 'M', tracked: true },
    { path: '.codex/skills/planning-with-files/SKILL.md', status: 'M', tracked: true },
    { path: '.cursor/rules/harness.mdc', status: 'M', tracked: true },
    { path: '.github/copilot-instructions.md', status: 'M', tracked: true },
    { path: '.github/instructions/harness.instructions.md', status: 'M', tracked: true },
    { path: '.github/prompts/review.prompt.md', status: 'M', tracked: true }
  ];
  const result = filterEligibleChanges(changes);

  assert.deepEqual(result.eligibleFiles, [
    'docs/maintenance.md',
    '.agents/skills/planning-with-files/SKILL.md',
    '.claude/skills/superpowers/SKILL.md',
    '.codex/skills/planning-with-files/SKILL.md',
    '.cursor/rules/harness.mdc',
    '.github/instructions/harness.instructions.md',
    '.github/prompts/review.prompt.md'
  ]);
  assert.deepEqual(result.excludedFiles, [
    'AGENTS.md',
    'CLAUDE.md',
    '.github/copilot-instructions.md'
  ]);
  assert.deepEqual(listRepoLocalEntryFileChanges(changes), [
    { path: 'AGENTS.md', status: 'M', tracked: true },
    { path: 'CLAUDE.md', status: 'M', tracked: true },
    { path: '.github/copilot-instructions.md', status: 'M', tracked: true }
  ]);
});

test('filterEligibleChanges excludes harness runtime state and unrelated workspace files', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();

  const result = filterEligibleChanges([
    { path: '.harness/projections.json', status: 'M', tracked: true },
    { path: '.harness/state.json', status: 'M', tracked: true },
    { path: '.harness/workspace-skill-projections.json', status: 'M', tracked: true },
    { path: '.harness/upstream-refresh-result.json', status: 'M', tracked: true },
    { path: 'workspace-notes.md', status: '??', tracked: false },
    { path: 'src/app.js', status: 'M', tracked: true },
    { path: 'README.md', status: 'M', tracked: true },
    { path: 'harness/upstream/superpowers/SKILL.md', status: 'M', tracked: true }
  ]);

  assert.deepEqual(result.eligibleFiles, ['harness/upstream/superpowers/SKILL.md']);
  assert.deepEqual(result.excludedFiles, [
    '.harness/projections.json',
    '.harness/state.json',
    '.harness/workspace-skill-projections.json',
    '.harness/upstream-refresh-result.json',
    'workspace-notes.md',
    'src/app.js',
    'README.md'
  ]);
});

test('filterEligibleChanges ignores generated Python cache files', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();

  const result = filterEligibleChanges([
    { path: 'harness/core/upstream-overlays/planning-with-files/scripts/__pycache__/planning_paths.cpython-312.pyc', tracked: false },
    { path: 'harness/upstream/planning-with-files/scripts/__pycache__/planning_paths.cpython-313.pyc', tracked: false },
    { path: 'harness/upstream/superpowers/SKILL.md', tracked: true },
    { path: 'README.md', tracked: true }
  ]);

  assert.deepEqual(result.eligibleFiles, [
    'harness/upstream/superpowers/SKILL.md'
  ]);
  assert.deepEqual(result.excludedFiles, [
    'README.md'
  ]);
});
