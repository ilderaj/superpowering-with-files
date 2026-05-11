import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

async function loadModule() {
  return import('../../scripts/ci/lib/cloud-dev-issue.mjs');
}

async function loadRunnerModule() {
  return import('../../scripts/ci/run-cloud-dev-issue-triage.mjs');
}

async function createTestCwd(testName, t) {
  const baseDir = path.join(
    process.cwd(),
    '.test-artifacts',
    'cloud-dev-issue',
    testName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  );

  await rm(baseDir, { recursive: true, force: true });
  await mkdir(baseDir, { recursive: true });
  t.after(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });
  return baseDir;
}

test('cloud dev issue module keeps labelNames private', async () => {
  const module = await loadModule();

  assert.equal(Object.hasOwn(module, 'labelNames'), false);
});

test('analyzeCloudDevIssue blocks issues without cloud-dev label', async () => {
  const { analyzeCloudDevIssue } = await loadModule();

  const result = analyzeCloudDevIssue({
    issue: { number: 12, title: 'Improve docs', labels: [{ name: 'documentation' }] },
    cloudDevReady: true
  });

  assert.equal(result.shouldComment, false);
  assert.equal(result.shouldPromptCopilot, false);
  assert.equal(result.reason, 'missing_cloud_dev_label');
});

test('analyzeCloudDevIssue builds normalized prompt for labeled planning issue', async () => {
  const { analyzeCloudDevIssue } = await loadModule();

  const result = analyzeCloudDevIssue({
    issue: {
      number: 12,
      title: 'Draft cloud pilot docs',
      labels: [{ name: 'cloud-dev' }, { name: 'agent:plan' }]
    },
    cloudDevReady: true
  });

  assert.equal(result.shouldComment, true);
  assert.equal(result.shouldPromptCopilot, true);
  assert.equal(result.reason, 'ready');
  assert.match(result.commentBody, /@copilot/);
  assert.match(result.commentBody, /Base branch: `cloud-dev`/);
  assert.match(result.commentBody, /Target PR base: `cloud-dev`/);
  assert.match(result.commentBody, /Do not push to `dev` or `main`/);
});

test('analyzeCloudDevIssue skips issue comments without the explicit retry command', async () => {
  const { analyzeCloudDevIssue } = await loadModule();

  const result = analyzeCloudDevIssue({
    eventName: 'issue_comment',
    commentBody: 'please retry this',
    issue: {
      number: 12,
      title: 'Draft cloud pilot docs',
      labels: [{ name: 'cloud-dev' }, { name: 'agent:plan' }]
    },
    cloudDevReady: true
  });

  assert.equal(result.shouldComment, false);
  assert.equal(result.shouldPromptCopilot, false);
  assert.equal(result.reason, 'comment_command_missing');
});

test('analyzeCloudDevIssue only accepts a standalone explicit retry command', async () => {
  const { analyzeCloudDevIssue } = await loadModule();

  for (const commentBody of [
    'please retry /cloud-dev retry now',
    'prefix\n/cloud-dev retry now',
    '/cloud-dev retry now',
    ' /cloud-dev retry please'
  ]) {
    const result = analyzeCloudDevIssue({
      eventName: 'issue_comment',
      commentBody,
      issue: {
        number: 12,
        title: 'Draft cloud pilot docs',
        labels: [{ name: 'cloud-dev' }, { name: 'agent:plan' }]
      },
      cloudDevReady: true
    });

    assert.equal(result.reason, 'comment_command_missing');
  }
});

test('analyzeCloudDevIssue fails fast when a cloud-dev issue is missing required fields', async () => {
  const { analyzeCloudDevIssue } = await loadModule();

  assert.throws(() => analyzeCloudDevIssue({
    issue: {
      number: 12,
      labels: [{ name: 'cloud-dev' }]
    },
    cloudDevReady: true
  }), /Issue title is required/);

  assert.throws(() => analyzeCloudDevIssue({
    issue: {
      title: 'Draft cloud pilot docs',
      labels: [{ name: 'cloud-dev' }]
    },
    cloudDevReady: false
  }), /Issue number is required/);
});

test('analyzeCloudDevIssue allows missing or empty title on not-ready issues with a valid number', async () => {
  const { analyzeCloudDevIssue } = await loadModule();

  for (const issue of [
    { number: 12, labels: [{ name: 'cloud-dev' }] },
    { number: 12, title: '', labels: [{ name: 'cloud-dev' }] }
  ]) {
    const result = analyzeCloudDevIssue({ issue, cloudDevReady: false });

    assert.equal(result.shouldComment, true);
    assert.equal(result.shouldPromptCopilot, false);
    assert.equal(result.reason, 'cloud_dev_not_ready');
    assert.equal(result.commentBody, 'Cloud dev preflight is not ready. The agent task was not started.');
  }
});

test('cloud dev issue triage runner keeps result helpers private', async () => {
  const module = await loadRunnerModule();

  assert.equal(Object.hasOwn(module, 'resultPath'), false);
  assert.equal(Object.hasOwn(module, 'writeResult'), false);
});

test('runCloudDevIssueTriage comments with the normalized copilot prompt for ready labeled issues', async (t) => {
  const { runCloudDevIssueTriage } = await loadRunnerModule();
  const commands = [];
  const cwd = await createTestCwd('ready-result', t);

  const result = await runCloudDevIssueTriage({
    cwd,
    event: {
      issue: {
        number: 34,
        title: 'Draft cloud pilot docs',
        labels: [{ name: 'cloud-dev' }, { name: 'agent:plan' }]
      }
    },
    cloudDevReady: true,
    runCommand: async (command) => {
      commands.push(command);

      if (command.args[0] === 'issue' && command.args[1] === 'view' && command.args.includes('comments')) {
        return { stdout: JSON.stringify({ comments: [] }), stderr: '' };
      }

      return { stdout: '', stderr: '' };
    }
  });
  const writtenResult = JSON.parse(
    await readFile(path.join(cwd, '.harness/cloud-dev-issue-triage-result.json'), 'utf8')
  );

  assert.equal(result.status, 'ready');
  assert.equal(result.issue, 34);
  assert.equal(result.analysis.reason, 'ready');
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].args.slice(0, 4), ['issue', 'comment', '34', '--body']);
  assert.match(commands[0].args[4], /@copilot/);
  assert.match(commands[0].args[4], /Base branch: `cloud-dev`/);
  assert.match(commands[0].args[4], /Target PR base: `cloud-dev`/);
  assert.match(commands[0].args[4], /Do not push to `dev` or `main`/);
  assert.equal(writtenResult.status, 'ready');
});

test('runCloudDevIssueTriage skips duplicate copilot handoff comments for automatic issue events', async (t) => {
  const { runCloudDevIssueTriage } = await loadRunnerModule();
  const commands = [];
  const cwd = await createTestCwd('ready-duplicate-skip-result', t);

  const result = await runCloudDevIssueTriage({
    cwd,
    eventName: 'issues',
    event: {
      issue: {
        number: 55,
        title: 'Draft cloud pilot docs',
        labels: [{ name: 'cloud-dev' }, { name: 'agent:impl' }]
      }
    },
    cloudDevReady: true,
    runCommand: async (command) => {
      commands.push(command);

      if (command.args[0] === 'issue' && command.args[1] === 'view') {
        return {
          stdout: JSON.stringify({
            comments: [
              {
                author: { login: 'github-actions' },
                body: '@copilot please work on this issue in the cloud-dev lane.\n\nIssue: #55 Draft cloud pilot docs\nTask kind: agent:impl\nBase branch: `cloud-dev`\nTarget PR base: `cloud-dev`\nDo not push to `dev` or `main`.\n\nRequired verification:\n- `npm run verify`\n- `./scripts/harness verify --output=.harness/verification`\n- `./scripts/harness doctor --check-only`\n\nOpen a pull request only after the focused work is complete and verified.'
              }
            ]
          }),
          stderr: ''
        };
      }

      return { stdout: '', stderr: '' };
    }
  });
  const writtenResult = JSON.parse(
    await readFile(path.join(cwd, '.harness/cloud-dev-issue-triage-result.json'), 'utf8')
  );

  assert.equal(result.status, 'already_commented');
  assert.equal(result.issue, 55);
  assert.equal(result.analysis.reason, 'already_commented');
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].args, ['issue', 'view', '55', '--json', 'comments']);
  assert.equal(writtenResult.status, 'already_commented');
});

test('runCloudDevIssueTriage ignores issue comments without the explicit retry command', async (t) => {
  const { runCloudDevIssueTriage } = await loadRunnerModule();
  const commands = [];
  const cwd = await createTestCwd('comment-skip-result', t);

  const result = await runCloudDevIssueTriage({
    cwd,
    eventName: 'issue_comment',
    event: {
      issue: {
        number: 38,
        title: 'Draft cloud pilot docs',
        labels: [{ name: 'cloud-dev' }, { name: 'agent:plan' }]
      },
      comment: {
        body: 'please retry this'
      }
    },
    cloudDevReady: true,
    runCommand: async (command) => {
      commands.push(command);
      return { stdout: '', stderr: '' };
    }
  });
  const writtenResult = JSON.parse(
    await readFile(path.join(cwd, '.harness/cloud-dev-issue-triage-result.json'), 'utf8')
  );

  assert.equal(result.status, 'comment_command_missing');
  assert.equal(result.issue, 38);
  assert.equal(result.analysis.reason, 'comment_command_missing');
  assert.equal(commands.length, 0);
  assert.equal(writtenResult.status, 'comment_command_missing');
});

test('runCloudDevIssueTriage comments for explicit retry commands on ready labeled issue comments', async (t) => {
  const { runCloudDevIssueTriage } = await loadRunnerModule();
  const commands = [];
  const cwd = await createTestCwd('comment-retry-result', t);

  const result = await runCloudDevIssueTriage({
    cwd,
    eventName: 'issue_comment',
    event: {
      issue: {
        number: 39,
        title: 'Draft cloud pilot docs',
        labels: [{ name: 'cloud-dev' }, { name: 'agent:plan' }]
      },
      comment: {
        body: 'please retry\n/cloud-dev retry'
      }
    },
    cloudDevReady: true,
    runCommand: async (command) => {
      commands.push(command);

      return { stdout: '', stderr: '' };
    }
  });
  const writtenResult = JSON.parse(
    await readFile(path.join(cwd, '.harness/cloud-dev-issue-triage-result.json'), 'utf8')
  );

  assert.equal(result.status, 'ready');
  assert.equal(result.issue, 39);
  assert.equal(result.analysis.reason, 'ready');
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].args.slice(0, 4), ['issue', 'comment', '39', '--body']);
  assert.match(commands[0].args[4], /@copilot/);
  assert.equal(writtenResult.status, 'ready');
});

test('runCloudDevIssueTriage comments with the not-ready message when cloud dev preflight is disabled', async (t) => {
  const { runCloudDevIssueTriage } = await loadRunnerModule();
  const commands = [];
  const cwd = await createTestCwd('not-ready-result', t);

  const result = await runCloudDevIssueTriage({
    cwd,
    event: {
      issue: {
        number: 36,
        title: 'Draft cloud pilot docs',
        labels: [{ name: 'cloud-dev' }, { name: 'agent:plan' }]
      }
    },
    cloudDevReady: false,
    runCommand: async (command) => {
      commands.push(command);

      if (command.args[0] === 'issue' && command.args[1] === 'view' && command.args.includes('comments')) {
        return { stdout: JSON.stringify({ comments: [] }), stderr: '' };
      }

      return { stdout: '', stderr: '' };
    }
  });
  const writtenResult = JSON.parse(
    await readFile(path.join(cwd, '.harness/cloud-dev-issue-triage-result.json'), 'utf8')
  );

  assert.equal(result.status, 'cloud_dev_not_ready');
  assert.equal(result.issue, 36);
  assert.equal(result.analysis.reason, 'cloud_dev_not_ready');
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].args.slice(0, 4), ['issue', 'comment', '36', '--body']);
  assert.equal(commands[0].args[4], 'Cloud dev preflight is not ready. The agent task was not started.');
  assert.equal(writtenResult.status, 'cloud_dev_not_ready');
});

test('runCloudDevIssueTriage skips comments when the cloud-dev label is absent', async (t) => {
  const { runCloudDevIssueTriage } = await loadRunnerModule();
  const commands = [];
  const cwd = await createTestCwd('missing-label-result', t);

  const result = await runCloudDevIssueTriage({
    cwd,
    event: {
      issue: {
        number: 35,
        title: 'Improve docs',
        labels: [{ name: 'documentation' }]
      }
    },
    cloudDevReady: true,
    runCommand: async (command) => {
      commands.push(command);
      return { stdout: '', stderr: '' };
    }
  });
  const writtenResult = JSON.parse(
    await readFile(path.join(cwd, '.harness/cloud-dev-issue-triage-result.json'), 'utf8')
  );

  assert.equal(result.status, 'missing_cloud_dev_label');
  assert.equal(result.analysis.reason, 'missing_cloud_dev_label');
  assert.equal(commands.length, 0);
  assert.equal(writtenResult.status, 'missing_cloud_dev_label');
});

test('runCloudDevIssueTriage rejects non-integer workflow dispatch issue inputs', async (t) => {
  const { runCloudDevIssueTriage } = await loadRunnerModule();
  const cwd = await createTestCwd('workflow-dispatch-invalid-input', t);

  for (const issue_number of ['44abc', '44.9']) {
    const result = await runCloudDevIssueTriage({
      cwd,
      eventName: 'workflow_dispatch',
      event: {
        inputs: {
          issue_number
        }
      },
      cloudDevReady: true,
      runCommand: async () => ({ stdout: '', stderr: '' })
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.issue, null);
    assert.equal(result.reason, 'issue_lookup_failed');
    assert.match(result.error, /workflow_dispatch issue_number must be a positive integer/);
  }
});

test('runCloudDevIssueTriage writes a failure result when issue commenting fails', async (t) => {
  const { runCloudDevIssueTriage } = await loadRunnerModule();
  const cwd = await createTestCwd('comment-failure-result', t);

  const result = await runCloudDevIssueTriage({
    cwd,
    event: {
      issue: {
        number: 37,
        title: 'Draft cloud pilot docs',
        labels: [{ name: 'cloud-dev' }, { name: 'agent:plan' }]
      }
    },
    cloudDevReady: true,
    runCommand: async (command) => {
      if (command.args[0] === 'issue' && command.args[1] === 'view' && command.args.includes('comments')) {
        return { stdout: JSON.stringify({ comments: [] }), stderr: '' };
      }

      throw new Error('gh issue comment failed');
    }
  });
  const writtenResult = JSON.parse(
    await readFile(path.join(cwd, '.harness/cloud-dev-issue-triage-result.json'), 'utf8')
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.issue, 37);
  assert.equal(result.reason, 'comment_failed');
  assert.equal(result.analysis.reason, 'ready');
  assert.match(result.error, /gh issue comment failed/);
  assert.equal(writtenResult.status, 'failed');
  assert.equal(writtenResult.reason, 'comment_failed');
  assert.equal(writtenResult.analysis.reason, 'ready');
  assert.match(writtenResult.error, /gh issue comment failed/);
});

test('runCloudDevIssueTriage preserves parsed issue number when workflow dispatch lookup fails', async (t) => {
  const { runCloudDevIssueTriage } = await loadRunnerModule();
  const cwd = await createTestCwd('workflow-dispatch-lookup-failure', t);

  const result = await runCloudDevIssueTriage({
    cwd,
    eventName: 'workflow_dispatch',
    event: {
      inputs: {
        issue_number: '44'
      }
    },
    cloudDevReady: true,
    runCommand: async () => {
      throw new Error('gh issue view failed');
    }
  });
  const writtenResult = JSON.parse(
    await readFile(path.join(cwd, '.harness/cloud-dev-issue-triage-result.json'), 'utf8')
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.issue, 44);
  assert.equal(result.reason, 'issue_lookup_failed');
  assert.match(result.error, /gh issue view failed/);
  assert.equal(writtenResult.status, 'failed');
  assert.equal(writtenResult.issue, 44);
  assert.equal(writtenResult.reason, 'issue_lookup_failed');
});

test('runCloudDevIssueTriage resolves workflow dispatch issue inputs before triage', async (t) => {
  const { runCloudDevIssueTriage } = await loadRunnerModule();
  const commands = [];
  const cwd = await createTestCwd('workflow-dispatch-result', t);

  const result = await runCloudDevIssueTriage({
    cwd,
    eventName: 'workflow_dispatch',
    event: {
      inputs: {
        issue_number: '44'
      }
    },
    cloudDevReady: true,
    runCommand: async (command) => {
      commands.push(command);

      if (command.args[0] === 'issue' && command.args[1] === 'view') {
        return {
          stdout: JSON.stringify({
            number: 44,
            title: 'Draft cloud pilot docs',
            labels: [{ name: 'cloud-dev' }, { name: 'agent:plan' }]
          }),
          stderr: ''
        };
      }

      return { stdout: '', stderr: '' };
    }
  });
  const writtenResult = JSON.parse(
    await readFile(path.join(cwd, '.harness/cloud-dev-issue-triage-result.json'), 'utf8')
  );

  assert.equal(result.status, 'ready');
  assert.equal(result.issue, 44);
  assert.equal(result.analysis.reason, 'ready');
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0].args, ['issue', 'view', '44', '--json', 'number,title,labels']);
  assert.deepEqual(commands[1].args.slice(0, 4), ['issue', 'comment', '44', '--body']);
  assert.equal(writtenResult.status, 'ready');
});
