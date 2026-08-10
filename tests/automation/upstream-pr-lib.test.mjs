import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function loadUpstreamPrModule() {
  return import('../../scripts/ci/lib/upstream-pr.mjs');
}

test('buildUpstreamPullRequestPlan uses the fixed upstream refresh PR target', async () => {
  const { baseBranch, branchName, buildUpstreamPullRequestPlan, title } = await loadUpstreamPrModule();

  const plan = buildUpstreamPullRequestPlan({
    eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md']
  });

  assert.equal(plan.shouldCreatePullRequest, true);
  assert.equal(plan.branchName, branchName);
  assert.equal(plan.baseBranch, baseBranch);
  assert.equal(plan.title, title);
  assert.equal(branchName, 'automation/upstream-refresh');
  assert.equal(baseBranch, 'dev');
  assert.equal(title, 'chore: refresh upstream baselines');
});

test('buildUpstreamPullRequestPlan skips PR creation when there are no eligible files', async () => {
  const { buildUpstreamPullRequestPlan } = await loadUpstreamPrModule();

  const plan = buildUpstreamPullRequestPlan({ eligibleFiles: [] });

  assert.equal(plan.shouldCreatePullRequest, false);
  assert.equal(plan.pullRequest, undefined);
});

test('buildPullRequestBody marks automatic review and checks as advisory', async () => {
  const { buildPullRequestBody } = await loadUpstreamPrModule();

  const body = buildPullRequestBody({
    eligibleFiles: [
      'harness/upstream/planning-with-files/SKILL.md',
      'harness/upstream/.source-lock.json'
    ],
    strategySummary: {
      'planning-with-files': {
        strategy: 'latest-release',
        previousVersion: 'v6.0.3',
        nextVersion: 'v6.1.1',
        previousCommitSha: '0000000000000000000000000000000000000000',
        nextCommitSha: '1111111111111111111111111111111111111111',
        fallbackUsed: false
      }
    }
  });

  assert.match(body, /Automatic review and workflow checks are advisory/i);
  assert.match(body, /final human review remains required/i);
  assert.match(body, /No auto-merge is configured/i);
  assert.match(body, /guarded --force-with-lease update is limited to the fixed automation branch/i);
  assert.match(body, /harness\/upstream\/planning-with-files\/SKILL\.md/);
  assert.match(body, /planning-with-files/);
  assert.match(body, /v6\.0\.3/);
  assert.match(body, /v6\.1\.1/);
  assert.match(body, /latest-release/);
});

test('buildUpstreamPullRequestPlan carries resolved lock metadata into the PR body', async () => {
  const { buildUpstreamPullRequestPlan } = await loadUpstreamPrModule();

  const plan = buildUpstreamPullRequestPlan({
    eligibleFiles: ['harness/upstream/.source-lock.json'],
    previousLock: {
      schemaVersion: 2,
      sources: {
        'planning-with-files': {
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
        'planning-with-files': {
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
    strategySummary: {
      'planning-with-files': {
        strategy: 'latest-release',
        previousVersion: 'v6.0.3',
        nextVersion: 'v6.1.1',
        previousCommitSha: '0000000000000000000000000000000000000000',
        nextCommitSha: '1111111111111111111111111111111111111111',
        fallbackUsed: false
      }
    }
  });

  assert.equal(plan.shouldCreatePullRequest, true);
  assert.equal(plan.previousLock.sources['planning-with-files'].resolved.version, 'v6.0.3');
  assert.equal(plan.resolvedLock.sources['planning-with-files'].resolved.version, 'v6.1.1');
  assert.match(plan.body, /harness\/upstream\/\.source-lock\.json/);
  assert.match(plan.body, /1111111111111111111111111111111111111111/);
});

test('buildPullRequestBody truncates oversized eligible file lists', async () => {
  const { buildPullRequestBody, maxEligibleFilesInPullRequestBody } = await loadUpstreamPrModule();
  const eligibleFiles = Array.from({ length: maxEligibleFilesInPullRequestBody + 3 }, (_, index) => `harness/upstream/file-${index + 1}.md`);

  const body = buildPullRequestBody({ eligibleFiles });

  assert.match(body, new RegExp(`Showing the first ${maxEligibleFilesInPullRequestBody} of ${eligibleFiles.length} eligible files\\.`));
  assert.match(body, /Review the PR diff for the complete refreshed file set\./);
  assert.match(body, /- \.\.\. 3 additional files omitted from the PR body\./);
  assert.match(body, /harness\/upstream\/file-1\.md/);
  assert.doesNotMatch(body, /harness\/upstream\/file-53\.md/);
});

test('buildUpstreamPullRequestPlan updates an existing PR on the automation branch without creating a new one', async () => {
  const { buildUpstreamPullRequestPlan } = await loadUpstreamPrModule();

  const plan = buildUpstreamPullRequestPlan({
    eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
    openPullRequests: [{ number: 42, headRefName: 'automation/upstream-refresh', baseRefName: 'dev' }]
  });

  assert.equal(plan.shouldCreatePullRequest, false);
  assert.equal(plan.shouldUpdatePullRequest, true);
  assert.equal(plan.existingPullRequest.number, 42);
  assert.equal(plan.pullRequest, undefined);
});

test('buildUpstreamPullRequestPlan creates a new PR when the automation branch PR targets another base', async () => {
  const { buildUpstreamPullRequestPlan } = await loadUpstreamPrModule();

  const plan = buildUpstreamPullRequestPlan({
    eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
    openPullRequests: [
      {
        number: 42,
        headRefName: 'automation/upstream-refresh',
        baseRefName: 'main'
      }
    ]
  });

  assert.equal(plan.shouldCreatePullRequest, true);
  assert.equal(plan.shouldUpdatePullRequest, false);
  assert.equal(plan.existingPullRequest, undefined);
  assert.equal(plan.pullRequest.base, 'dev');
  assert.equal(plan.pullRequest.head, 'automation/upstream-refresh');
  assert.deepEqual(plan.commands.push.args, ['push', '--set-upstream', 'origin', 'automation/upstream-refresh']);
});

test('buildUpstreamPullRequestPlan uses force-with-lease only for a matched automation PR update', async () => {
  const { buildUpstreamPullRequestPlan } = await loadUpstreamPrModule();

  const updatePlan = buildUpstreamPullRequestPlan({
    eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
    openPullRequests: [{ number: 42, headRefName: 'automation/upstream-refresh', baseRefName: 'dev' }]
  });
  const wrongBasePlan = buildUpstreamPullRequestPlan({
    eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
    openPullRequests: [{ number: 42, headRefName: 'automation/upstream-refresh', baseRefName: 'main' }]
  });

  assert.equal(updatePlan.shouldUpdatePullRequest, true);
  assert.deepEqual(updatePlan.commands.push.args, ['push', '--force-with-lease', 'origin', 'automation/upstream-refresh']);
  assert.equal(wrongBasePlan.shouldCreatePullRequest, true);
  assert.deepEqual(wrongBasePlan.commands.push.args, ['push', '--set-upstream', 'origin', 'automation/upstream-refresh']);
});

test('buildDetectRemoteBranchCommand probes the fixed automation branch on origin', async () => {
  const { buildDetectRemoteBranchCommand } = await loadUpstreamPrModule();

  assert.deepEqual(buildDetectRemoteBranchCommand(), {
    file: 'git',
    args: ['ls-remote', '--heads', 'origin', 'automation/upstream-refresh']
  });
});

test('parseRemoteBranchExists treats non-empty ls-remote output as branch present', async () => {
  const { parseRemoteBranchExists } = await loadUpstreamPrModule();

  assert.equal(parseRemoteBranchExists('abc123\trefs/heads/automation/upstream-refresh\n'), true);
  assert.equal(parseRemoteBranchExists(''), false);
});

test('buildUpstreamPullRequestPlan force-pushes the fixed automation branch when it already exists without an open PR', async () => {
  const { buildUpstreamPullRequestPlan } = await loadUpstreamPrModule();

  const plan = buildUpstreamPullRequestPlan({
    eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
    remoteBranchExists: true
  });

  assert.equal(plan.shouldCreatePullRequest, true);
  assert.equal(plan.shouldUpdatePullRequest, false);
  assert.deepEqual(plan.commands.push.args, ['push', '--force-with-lease', 'origin', 'automation/upstream-refresh']);
});

test('buildListOpenPullRequestsCommand filters by automation head and dev base', async () => {
  const { buildListOpenPullRequestsCommand } = await loadUpstreamPrModule();

  assert.deepEqual(buildListOpenPullRequestsCommand(), {
    file: 'gh',
    args: [
      'pr',
      'list',
      '--head',
      'automation/upstream-refresh',
      '--base',
      'dev',
      '--state',
      'open',
      '--json',
      'number,url,headRefName,baseRefName',
      '--limit',
      '1'
    ]
  });
});

test('buildUpstreamPullRequestPlan creates a new PR only when no automation branch PR is open', async () => {
  const { buildUpstreamPullRequestPlan } = await loadUpstreamPrModule();

  const plan = buildUpstreamPullRequestPlan({
    eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
    openPullRequests: []
  });

  assert.equal(plan.shouldCreatePullRequest, true);
  assert.equal(plan.shouldUpdatePullRequest, false);
  assert.equal(plan.pullRequest.base, 'dev');
  assert.equal(plan.pullRequest.head, 'automation/upstream-refresh');
});

test('buildUpstreamPullRequestPlan creates a new PR when only unrelated PRs are open', async () => {
  const { buildUpstreamPullRequestPlan } = await loadUpstreamPrModule();

  const plan = buildUpstreamPullRequestPlan({
    eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
    openPullRequests: [
      {
        number: 17,
        url: 'https://github.com/ilderaj/superpowering-with-files/pull/17',
        headRefName: 'feature/unrelated-change',
        baseRefName: 'dev'
      }
    ]
  });

  assert.equal(plan.shouldCreatePullRequest, true);
  assert.equal(plan.shouldUpdatePullRequest, false);
  assert.equal(plan.existingPullRequest, undefined);
  assert.equal(plan.pullRequest.base, 'dev');
  assert.equal(plan.pullRequest.head, 'automation/upstream-refresh');
  assert.equal(plan.commands.updatePullRequest, undefined);
  assert.deepEqual(plan.commands.createPullRequest.args.slice(0, 6), [
    'pr',
    'create',
    '--base',
    'dev',
    '--head',
    'automation/upstream-refresh'
  ]);
});

test('runOpenUpstreamPullRequest skips git and gh commands when there are no eligible files', async () => {
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');
  const commands = [];

  const result = await runOpenUpstreamPullRequest({
    cwd: '/tmp/repo',
    readRefreshResult: async () => ({
      status: 'success',
      eligibleFiles: []
    }),
    runCommand: async (command) => {
      commands.push(command);
      return { stdout: '' };
    }
  });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'no_eligible_files');
  assert.deepEqual(commands, []);
});

test('runOpenUpstreamPullRequest rejects and skips git and gh commands when refresh failed', async () => {
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');
  const commands = [];

  await assert.rejects(
    runOpenUpstreamPullRequest({
      cwd: '/tmp/repo',
      readRefreshResult: async () => ({
        status: 'failure',
        eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md']
      }),
      runCommand: async (command) => {
        commands.push(command);
        return { stdout: '' };
      }
    }),
    (error) => {
      assert.equal(error.name, 'UpstreamPullRequestError');
      assert.match(error.message, /Cannot open upstream PR because refresh status is failure/);
      return true;
    }
  );

  assert.deepEqual(commands, []);
});

test('runOpenUpstreamPullRequest rejects and skips git and gh commands when refresh found no changes', async () => {
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');
  const commands = [];

  await assert.rejects(
    runOpenUpstreamPullRequest({
      cwd: '/tmp/repo',
      readRefreshResult: async () => ({
        status: 'no_changes',
        eligibleFiles: []
      }),
      runCommand: async (command) => {
        commands.push(command);
        return { stdout: '' };
      }
    }),
    (error) => {
      assert.equal(error.name, 'UpstreamPullRequestError');
      assert.match(error.message, /Cannot open upstream PR because refresh status is no_changes/);
      return true;
    }
  );

  assert.deepEqual(commands, []);
});

test('runOpenUpstreamPullRequest rejects and skips git and gh commands when refresh status is missing', async () => {
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');
  const commands = [];

  await assert.rejects(
    runOpenUpstreamPullRequest({
      cwd: '/tmp/repo',
      readRefreshResult: async () => ({
        eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md']
      }),
      runCommand: async (command) => {
        commands.push(command);
        return { stdout: '' };
      }
    }),
    (error) => {
      assert.equal(error.name, 'UpstreamPullRequestError');
      assert.match(error.message, /Cannot open upstream PR because refresh status is unknown/);
      return true;
    }
  );

  assert.deepEqual(commands, []);
});

test('runOpenUpstreamPullRequest commits, pushes, and creates a PR when no automation PR is open', async () => {
  const { formatCommand } = await loadUpstreamPrModule();
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');
  const rawCommands = [];
  const commands = [];
  const cwd = path.join(os.tmpdir(), 'upstream-pr-create-test');
  const bodyFilePath = path.join(cwd, '.harness/upstream-pr-body.md');

  const result = await runOpenUpstreamPullRequest({
    cwd,
    readRefreshResult: async () => ({
      status: 'success',
      eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
      sourceHeads: {}
    }),
    runCommand: async (command) => {
      rawCommands.push(command);
      commands.push(formatCommand(command));
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'create') {
        const bodyText = await readFile(bodyFilePath, 'utf8');
        assert.match(bodyText, /Refresh upstream baselines from the configured Harness sources\./);
      }
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'list') {
        return { stdout: '[]' };
      }
      if (command.file === 'git' && command.args[0] === 'ls-remote') {
        return { stdout: '' };
      }
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'create') {
        return { stdout: 'https://github.com/ilderaj/superpowering-with-files/pull/99\n' };
      }
      return { stdout: '' };
    }
  });

  assert.equal(result.status, 'created');
  assert.ok(rawCommands.every((command) => typeof command.file === 'string' && Array.isArray(command.args)));
  assert.deepEqual(commands.slice(0, 4), [
    'git config user.name github-actions[bot]',
    'git config user.email 41898282+github-actions[bot]@users.noreply.github.com',
    'git add -- harness/upstream/planning-with-files/SKILL.md',
    "git commit -m 'chore: refresh upstream baselines'"
  ]);
  assert.ok(commands.includes('gh pr list --head automation/upstream-refresh --base dev --state open --json number,url,headRefName,baseRefName --limit 1'));
  assert.ok(commands.includes('git ls-remote --heads origin automation/upstream-refresh'));
  assert.ok(commands.includes('git push --set-upstream origin automation/upstream-refresh'));
  assert.ok(commands.some((command) => command === "gh pr create --base dev --head automation/upstream-refresh --title 'chore: refresh upstream baselines' --body-file .harness/upstream-pr-body.md"));
  assert.equal(commands.some((command) => command.includes('pr merge')), false);
  assert.equal(existsSync(bodyFilePath), false);
});

test('runOpenUpstreamPullRequest forwards resolved metadata into the final PR body file', async () => {
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');
  const cwd = path.join(os.tmpdir(), 'upstream-pr-metadata-wiring-test');
  const bodyFilePath = path.join(cwd, '.harness/upstream-pr-body.md');

  await runOpenUpstreamPullRequest({
    cwd,
    readRefreshResult: async () => ({
      status: 'success',
      eligibleFiles: ['harness/upstream/.source-lock.json'],
      sourceHeads: {
        'planning-with-files': '1111111111111111111111111111111111111111'
      },
      previousLock: {
        schemaVersion: 2,
        sources: {
          'planning-with-files': {
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
          'planning-with-files': {
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
      strategySummary: {
        'planning-with-files': {
          strategy: 'latest-release',
          previousVersion: 'v6.0.3',
          nextVersion: 'v6.1.1',
          previousCommitSha: '0000000000000000000000000000000000000000',
          nextCommitSha: '1111111111111111111111111111111111111111',
          fallbackUsed: false
        }
      }
    }),
    runCommand: async (command) => {
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'create') {
        const bodyText = await readFile(bodyFilePath, 'utf8');
        assert.match(bodyText, /v6\.0\.3 -> v6\.1\.1/);
        assert.match(bodyText, /0000000000000000000000000000000000000000 -> 1111111111111111111111111111111111111111/);
        return { stdout: 'https://github.com/ilderaj/superpowering-with-files/pull/100\n' };
      }
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'list') {
        return { stdout: '[]' };
      }
      if (command.file === 'git' && command.args[0] === 'ls-remote') {
        return { stdout: '' };
      }
      return { stdout: '' };
    }
  });

  assert.equal(existsSync(bodyFilePath), false);
});

test('runOpenUpstreamPullRequest creates a dev PR instead of updating a same-head PR on another base', async () => {
  const { formatCommand } = await loadUpstreamPrModule();
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');
  const commands = [];

  const result = await runOpenUpstreamPullRequest({
    cwd: '/tmp/repo',
    readRefreshResult: async () => ({
      status: 'success',
      eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
      sourceHeads: {}
    }),
    runCommand: async (command) => {
      commands.push(formatCommand(command));
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'list') {
        return {
          stdout: JSON.stringify([
            {
              number: 42,
              url: 'https://github.com/ilderaj/superpowering-with-files/pull/42',
              headRefName: 'automation/upstream-refresh',
              baseRefName: 'main'
            }
          ])
        };
      }
      if (command.file === 'git' && command.args[0] === 'ls-remote') {
        return { stdout: '' };
      }
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'create') {
        return { stdout: 'https://github.com/ilderaj/superpowering-with-files/pull/99\n' };
      }
      return { stdout: '' };
    }
  });

  assert.equal(result.status, 'created');
  assert.equal(result.pullRequest.url, 'https://github.com/ilderaj/superpowering-with-files/pull/99');
  assert.ok(commands.includes('git push --set-upstream origin automation/upstream-refresh'));
  assert.ok(commands.includes("gh pr create --base dev --head automation/upstream-refresh --title 'chore: refresh upstream baselines' --body-file .harness/upstream-pr-body.md"));
  assert.equal(commands.some((command) => command.startsWith('gh pr edit 42 ')), false);
});

test('runOpenUpstreamPullRequest updates an existing automation PR branch and body without creating a new PR', async () => {
  const { formatCommand } = await loadUpstreamPrModule();
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');
  const commands = [];
  const cwd = path.join(os.tmpdir(), 'upstream-pr-update-test');
  const bodyFilePath = path.join(cwd, '.harness/upstream-pr-body.md');

  const result = await runOpenUpstreamPullRequest({
    cwd,
    readRefreshResult: async () => ({
      status: 'success',
      eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
      sourceHeads: {}
    }),
    runCommand: async (command) => {
      commands.push(formatCommand(command));
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'edit') {
        const bodyText = await readFile(bodyFilePath, 'utf8');
        assert.match(bodyText, /Refresh upstream baselines from the configured Harness sources\./);
      }
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'list') {
        return {
          stdout: JSON.stringify([
            {
              number: 42,
              url: 'https://github.com/ilderaj/superpowering-with-files/pull/42',
              headRefName: 'automation/upstream-refresh',
              baseRefName: 'dev'
            }
          ])
        };
      }
      if (command.file === 'git' && command.args[0] === 'ls-remote') {
        return { stdout: 'abc123\trefs/heads/automation/upstream-refresh\n' };
      }
      return { stdout: '' };
    }
  });

  assert.equal(result.status, 'updated');
  assert.equal(result.pullRequest.number, 42);
  assert.ok(commands.includes('git push --force-with-lease origin automation/upstream-refresh'));
  assert.equal(commands.includes('git push origin automation/upstream-refresh'), false);
  assert.ok(commands.includes('gh pr edit 42 --body-file .harness/upstream-pr-body.md'));
  assert.equal(commands.some((command) => command.startsWith('gh pr create ')), false);
  assert.equal(commands.some((command) => command.includes('pr merge')), false);
  assert.equal(existsSync(bodyFilePath), false);
});

test('runOpenUpstreamPullRequest force-pushes and creates a PR when the automation branch exists remotely without an open PR', async () => {
  const { formatCommand } = await loadUpstreamPrModule();
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');
  const commands = [];

  const result = await runOpenUpstreamPullRequest({
    cwd: '/tmp/repo',
    readRefreshResult: async () => ({
      status: 'success',
      eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md'],
      sourceHeads: {}
    }),
    runCommand: async (command) => {
      commands.push(formatCommand(command));
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'list') {
        return { stdout: '[]' };
      }
      if (command.file === 'git' && command.args[0] === 'ls-remote') {
        return { stdout: 'c0260fe880c2327f0c36d65c6183bd270f5588ea\trefs/heads/automation/upstream-refresh\n' };
      }
      if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'create') {
        return { stdout: 'https://github.com/ilderaj/superpowering-with-files/pull/100\n' };
      }
      return { stdout: '' };
    }
  });

  assert.equal(result.status, 'created');
  assert.equal(result.pullRequest.url, 'https://github.com/ilderaj/superpowering-with-files/pull/100');
  assert.ok(commands.includes('git ls-remote --heads origin automation/upstream-refresh'));
  assert.ok(commands.includes('git push --force-with-lease origin automation/upstream-refresh'));
  assert.equal(commands.includes('git push --set-upstream origin automation/upstream-refresh'), false);
});

test('runOpenUpstreamPullRequest treats git commit failures as terminal errors', async () => {
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');

  await assert.rejects(
    runOpenUpstreamPullRequest({
      cwd: '/tmp/repo',
      readRefreshResult: async () => ({
        status: 'success',
        eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md']
      }),
      runCommand: async (command) => {
        if (command.file === 'git' && command.args[0] === 'commit') {
          throw new Error('nothing to commit');
        }
        return { stdout: '' };
      }
    }),
    /git commit failed: nothing to commit/
  );
});

test('runOpenUpstreamPullRequest treats gh PR creation failures as terminal errors', async () => {
  const { runOpenUpstreamPullRequest } = await import('../../scripts/ci/open-upstream-pr.mjs');

  await assert.rejects(
    runOpenUpstreamPullRequest({
      cwd: '/tmp/repo',
      readRefreshResult: async () => ({
        status: 'success',
        eligibleFiles: ['harness/upstream/planning-with-files/SKILL.md']
      }),
      runCommand: async (command) => {
        if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'list') {
          return { stdout: '[]' };
        }
        if (command.file === 'git' && command.args[0] === 'ls-remote') {
          return { stdout: '' };
        }
        if (command.file === 'gh' && command.args[0] === 'pr' && command.args[1] === 'create') {
          throw new Error('GraphQL: pull request create failed');
        }
        return { stdout: '' };
      }
    }),
    /gh pr create failed: GraphQL: pull request create failed/
  );
});
