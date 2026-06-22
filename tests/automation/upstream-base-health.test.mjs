import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyBaseHealth,
  createBaseHealthBlockedError,
  loadBaseHealth
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

test('loadBaseHealth resolves the target sha and classifies matching workflow runs', async () => {
  const calls = [];

  const result = await loadBaseHealth({
    branch: 'dev',
    resolveTargetSha: async ({ branch }) => {
      calls.push(['resolveTargetSha', branch]);
      return 'dddddddddddddddddddddddddddddddddddddddd';
    },
    workflowRunsLoader: async ({ branch }) => {
      calls.push(['workflowRunsLoader', branch]);
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
    ['workflowRunsLoader', 'dev']
  ]);
  assert.deepEqual(result, {
    status: 'healthy',
    failureKind: '',
    reason: '',
    targetSha: 'dddddddddddddddddddddddddddddddddddddddd'
  });
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
