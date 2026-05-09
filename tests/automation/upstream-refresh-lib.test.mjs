import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

const expectedRefreshCommands = [
  { file: 'git', args: ['fetch', 'origin', 'main', 'dev'] },
  { file: 'git', args: ['checkout', '-B', 'automation/upstream-refresh', 'origin/dev'] },
  { file: './scripts/harness', args: ['install', '--scope=workspace', '--targets=all', '--projection=link', '--mode=force'] },
  { file: './scripts/harness', args: ['fetch'] },
  { file: './scripts/harness', args: ['update'] },
  { file: 'npm', args: ['run', 'verify'] },
  { file: './scripts/harness', args: ['worktree-preflight', '--task', 'github-actions-upstream-automation-analysis'] },
  { file: './scripts/harness', args: ['sync', '--dry-run'] },
  { file: './scripts/harness', args: ['sync'] },
  { file: './scripts/harness', args: ['doctor'] }
];

const expectedHumanReadableRefreshCommandChain = [
  'git fetch origin main dev',
  'git checkout -B automation/upstream-refresh origin/dev',
  './scripts/harness install --scope=workspace --targets=all --projection=link --mode=force',
  './scripts/harness fetch',
  './scripts/harness update',
  'npm run verify',
  './scripts/harness worktree-preflight --task github-actions-upstream-automation-analysis',
  './scripts/harness sync --dry-run',
  './scripts/harness sync',
  './scripts/harness doctor'
];

async function loadUpstreamRefreshModule() {
  return import('../../scripts/ci/lib/upstream-refresh.mjs');
}

test('buildRefreshCommandChain returns the fixed upstream refresh command sequence', async () => {
  const { buildRefreshCommandChain } = await loadUpstreamRefreshModule();

  assert.deepEqual(buildRefreshCommandChain(), expectedRefreshCommands);
});

test('formatCommand returns the human-readable upstream refresh command sequence', async () => {
  const { buildRefreshCommandChain, formatCommand } = await loadUpstreamRefreshModule();

  assert.deepEqual(buildRefreshCommandChain().map(formatCommand), expectedHumanReadableRefreshCommandChain);
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

test('runUpstreamRefresh captures eligible files after writing the source head record', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const writtenResults = [];
  let sourceHeadsRecordChanged = false;

  const result = await runUpstreamRefresh({
    cwd: '/tmp/repo',
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
        superpowers: '1111111111111111111111111111111111111111'
      }
    }),
    runRefresh: async () => {
      events.push('runRefresh');
    },
    writeSourceHeads: async (record) => {
      events.push('writeSourceHeads');
      sourceHeadsRecordChanged = true;
      assert.equal(record.sources.superpowers.headSha, '1111111111111111111111111111111111111111');
    },
    captureChanges: async () => {
      events.push('captureChanges');
      return sourceHeadsRecordChanged
        ? [{ path: 'harness/upstream/.source-heads.json', tracked: true }]
        : [];
    },
    filterChanges: filterEligibleChanges,
    writeResult: async (refreshResult) => {
      events.push('writeResult');
      writtenResults.push(refreshResult);
    }
  });

  assert.deepEqual(events, ['runRefresh', 'writeSourceHeads', 'captureChanges', 'writeResult']);
  assert.deepEqual(result.eligibleFiles, ['harness/upstream/.source-heads.json']);
  assert.deepEqual(writtenResults, [result]);
});

test('runUpstreamRefresh writes a failure result and rejects when verification fails', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const writtenResults = [];

  await assert.rejects(
    runUpstreamRefresh({
      cwd: '/tmp/repo',
      probeHeads: async () => ({
        status: 'changes_detected',
        sources: [],
        sourceHeads: {
          superpowers: '2222222222222222222222222222222222222222'
        }
      }),
      runRefresh: async () => {
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
      probeHeads: async () => ({
        status: 'changes_detected',
        sources: [],
        sourceHeads: {}
      }),
      runRefresh: async () => {
        throw new Error('Command failed (1): ./scripts/harness doctor');
      },
      captureChanges: async () => {
        throw new Error('git diff unavailable');
      },
      writeResult: async (refreshResult) => {
        writtenResults.push(refreshResult);
      }
    }),
    /harness doctor/
  );

  assert.equal(writtenResults.length, 1);
  assert.equal(writtenResults[0].status, 'failure');
  assert.deepEqual(writtenResults[0].eligibleFiles, []);
  assert.match(writtenResults[0].blockedReason, /harness doctor/);
  assert.match(writtenResults[0].blockedReason, /Unable to capture changed files after failure: git diff unavailable/);
});

test('runUpstreamRefresh writes a failure result and rejects when refresh hits a git conflict', async () => {
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const writtenResults = [];

  await assert.rejects(
    runUpstreamRefresh({
      cwd: '/tmp/repo',
      probeHeads: async () => ({
        status: 'changes_detected',
        sources: [],
        sourceHeads: {}
      }),
      runRefresh: async () => {
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
});

test('runUpstreamRefresh writes a failure result and rejects on allowlist violations', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();
  const { runUpstreamRefresh } = await import('../../scripts/ci/run-upstream-refresh.mjs');
  const events = [];
  const writtenResults = [];

  await assert.rejects(
    runUpstreamRefresh({
      cwd: '/tmp/repo',
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
      runRefresh: async () => {
        events.push('runRefresh');
      },
      writeSourceHeads: async () => {
        events.push('writeSourceHeads');
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

  assert.deepEqual(events, ['runRefresh', 'writeSourceHeads', 'captureChanges', 'writeResult']);
  assert.equal(writtenResults.length, 1);
  assert.equal(writtenResults[0].status, 'failure');
  assert.deepEqual(writtenResults[0].eligibleFiles, ['harness/upstream/superpowers/SKILL.md']);
  assert.match(writtenResults[0].blockedReason, /allowlist violation/i);
  assert.match(writtenResults[0].blockedReason, /README\.md/);
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
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();

  const result = filterEligibleChanges([
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
  ]);

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
});

test('filterEligibleChanges excludes harness runtime state and unrelated workspace files', async () => {
  const { filterEligibleChanges } = await loadUpstreamRefreshModule();

  const result = filterEligibleChanges([
    { path: '.harness/projections.json', status: 'M', tracked: true },
    { path: '.harness/state.json', status: 'M', tracked: true },
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
