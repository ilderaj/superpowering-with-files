import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyBaseHealth,
  createBaseHealthBlockedError,
  loadBaseHealth,
  loadWorkflowRuns
} from '../../scripts/ci/lib/upstream-base-health.mjs';

test('classifyBaseHealth returns healthy for a successful Repo Verify run on the target sha', () => {
  const result = classifyBaseHealth({
    branch: 'dev',
    targetSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    workflowRuns: [
      {
        name: 'Repo Verify',
        head_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        conclusion: 'success',
        status: 'completed'
      }
    ]
  });

  assert.deepEqual(result, {
    status: 'healthy',
    failureKind: '',
    reason: '',
    targetSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  });
});

test('classifyBaseHealth returns blocked when the target sha has no successful Repo Verify run', () => {
  const result = classifyBaseHealth({
    branch: 'dev',
    targetSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    workflowRuns: [
      {
        name: 'Repo Verify',
        head_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        conclusion: 'failure',
        status: 'completed'
      }
    ]
  });

  assert.deepEqual(result, {
    status: 'blocked',
    failureKind: 'base_unhealthy',
    reason: 'Repo Verify is not green for origin/dev @ bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.',
    targetSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  });
});

test('classifyBaseHealth returns healthy when the same target sha has a failed run and a later successful rerun', () => {
  const result = classifyBaseHealth({
    branch: 'dev',
    targetSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    workflowRuns: [
      {
        name: 'Repo Verify',
        head_sha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        conclusion: 'failure',
        status: 'completed'
      },
      {
        name: 'Repo Verify',
        head_sha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        conclusion: 'success',
        status: 'completed'
      }
    ]
  });

  assert.deepEqual(result, {
    status: 'healthy',
    failureKind: '',
    reason: '',
    targetSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  });
});

test('loadBaseHealth resolves the target sha and classifies matching workflow runs', async () => {
  const calls = [];

  const result = await loadBaseHealth({
    branch: 'dev',
    resolveTargetSha: async ({ branch }) => {
      calls.push(['resolveTargetSha', branch]);
      return 'dddddddddddddddddddddddddddddddddddddddd';
    },
    workflowRunsLoader: async ({ branch, targetSha }) => {
      calls.push(['workflowRunsLoader', branch, targetSha]);
      return [
        {
          name: 'Repo Verify',
          head_sha: 'dddddddddddddddddddddddddddddddddddddddd',
          conclusion: 'success',
          status: 'completed'
        }
      ];
    }
  });

  assert.deepEqual(calls, [
    ['resolveTargetSha', 'dev'],
    ['workflowRunsLoader', 'dev', 'dddddddddddddddddddddddddddddddddddddddd']
  ]);
  assert.deepEqual(result, {
    status: 'healthy',
    failureKind: '',
    reason: '',
    targetSha: 'dddddddddddddddddddddddddddddddddddddddd'
  });
});

test('loadWorkflowRuns narrows the GitHub API query to the target sha', async () => {
  const calls = [];

  const workflowRuns = await loadWorkflowRuns({
    branch: 'dev',
    targetSha: 'ffffffffffffffffffffffffffffffffffffffff',
    repoLoader: async () => 'ilderaj/superpowering-with-files',
    requestJson: async (command) => {
      calls.push(command);
      return {
        workflow_runs: [
          {
            name: 'Repo Verify',
            head_sha: 'ffffffffffffffffffffffffffffffffffffffff',
            conclusion: 'success',
            status: 'completed'
          }
        ]
      };
    }
  });

  assert.deepEqual(calls, [
    {
      file: 'gh',
      args: [
        'api',
        'repos/ilderaj/superpowering-with-files/actions/runs?branch=dev&head_sha=ffffffffffffffffffffffffffffffffffffffff&per_page=100'
      ]
    }
  ]);
  assert.deepEqual(workflowRuns, [
    {
      name: 'Repo Verify',
      head_sha: 'ffffffffffffffffffffffffffffffffffffffff',
      conclusion: 'success',
      status: 'completed'
    }
  ]);
});

test('createBaseHealthBlockedError returns a stable failure kind and message', () => {
  const error = createBaseHealthBlockedError({
    branch: 'dev',
    targetSha: 'cccccccccccccccccccccccccccccccccccccccc',
    reason: 'Repo Verify is not green for origin/dev'
  });

  assert.equal(error.failureKind, 'base_unhealthy');
  assert.equal(error.branch, 'dev');
  assert.equal(error.targetSha, 'cccccccccccccccccccccccccccccccccccccccc');
  assert.match(error.message, /origin\/dev/);
});
