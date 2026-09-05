import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizePrReviewSnapshot,
  observationKey,
  reducePrReviewFeedback,
  routeForSeverity,
  validatePrBinding
} from '../../scripts/ci/lib/pr-review-feedback.mjs';
import { runPrReviewObservation } from '../../scripts/ci/run-pr-review-observation.mjs';

const binding = {
  repository: 'ilderaj/superpowering-with-files',
  number: 168,
  url: 'https://github.com/ilderaj/superpowering-with-files/pull/168',
  baseRef: 'dev',
  baseSha: 'b2517846d7c5c92a88b1cba451b59bb5de4b0d00',
  headSha: 'a31334e39c48f3b280e8110ed33ab53d22212aa2',
  specReference: 'docs/coding-harness-implementation-plan.md#wave-6-pr-feedback-loop-and-conditional-native-auto-merge',
  threadWritePolicy: 'read_only',
  followUpIssuePolicy: 'draft_only',
  requiredChecks: ['repo-verify'],
  humanReviewPolicy: 'current_head_human_approved_required',
  mergeabilityPolicy: 'current_head_mergeable_required',
  severityPolicy: 'critical_major_repair_minor_follow_up',
  repairPushPolicy: 'disabled',
  autoMergePolicy: 'disabled'
};

const pullRequest = {
  number: 168,
  state: 'OPEN',
  baseRefName: 'dev',
  baseRefOid: binding.baseSha,
  headRefName: 'codex/coding-harness-impl-wave6-20260904',
  headRefOid: binding.headSha,
  reviewDecision: 'REVIEW_REQUIRED',
  mergeable: 'CONFLICTING',
  mergeStateStatus: 'BLOCKED'
};

test('validatePrBinding requires the exact read-only PR identity and policy fields', () => {
  assert.deepEqual(validatePrBinding(binding), []);

  for (const field of ['repository', 'number', 'url', 'baseRef', 'baseSha', 'headSha', 'specReference']) {
    const incomplete = { ...binding };
    delete incomplete[field];
    assert.ok(
      validatePrBinding(incomplete).some((entry) => entry.field === field),
      `missing ${field} must be rejected`
    );
  }

  assert.ok(validatePrBinding({ ...binding, threadWritePolicy: 'reply' }).some((entry) => entry.code === 'write_policy_not_read_only'));
  assert.ok(validatePrBinding({ ...binding, followUpIssuePolicy: 'create' }).some((entry) => entry.code === 'issue_policy_not_draft_only'));
});

test('validatePrBinding requires every material feedback policy field', () => {
  for (const field of ['requiredChecks', 'humanReviewPolicy', 'mergeabilityPolicy', 'severityPolicy', 'repairPushPolicy']) {
    const incomplete = { ...binding };
    delete incomplete[field];
    assert.ok(
      validatePrBinding(incomplete).some((entry) => entry.field === field),
      `missing ${field} must be rejected`
    );
  }

  for (const requiredChecks of [[], [''], ['repo-verify', '']]) {
    assert.ok(
      validatePrBinding({ ...binding, requiredChecks }).some((entry) => entry.field === 'requiredChecks'),
      `invalid requiredChecks ${JSON.stringify(requiredChecks)} must be rejected`
    );
  }
  for (const [field, value] of [
    ['humanReviewPolicy', 'any_approval'],
    ['mergeabilityPolicy', 'best_effort'],
    ['severityPolicy', 'all_follow_up'],
    ['repairPushPolicy', 'enabled']
  ]) {
    assert.ok(validatePrBinding({ ...binding, [field]: value }).some((entry) => entry.field === field));
  }
});

test('normalizePrReviewSnapshot flattens paginated connections and deduplicates nodes', () => {
  const normalized = normalizePrReviewSnapshot({
    pullRequest,
    reviewThreadPages: [
      {
        nodes: [{
          id: 'thread-1',
          isResolved: false,
          isOutdated: false,
          comments: {
            nodes: [{ databaseId: 11, body: 'needs a test', updatedAt: '2026-09-04T10:00:00Z' }]
          }
        }],
        pageInfo: { hasNextPage: true, endCursor: 'thread-cursor' }
      },
      {
        nodes: [{
          id: 'thread-1',
          isResolved: false,
          isOutdated: false,
          comments: {
            nodes: [{ databaseId: 11, body: 'needs a test', updatedAt: '2026-09-04T10:00:00Z' }]
          }
        }, {
          id: 'thread-2',
          isResolved: true,
          isOutdated: false,
          comments: { nodes: [] }
        }],
        pageInfo: { hasNextPage: false, endCursor: null }
      }
    ],
    reviewPages: [{
      nodes: [{ id: 'review-1', state: 'APPROVED', commitOid: binding.headSha }],
      pageInfo: { hasNextPage: false, endCursor: null }
    }],
    checkPages: [
      { nodes: [{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }], pageInfo: { hasNextPage: true } },
      { nodes: [{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }, { name: 'lint', conclusion: 'SUCCESS', headSha: binding.headSha }], pageInfo: { hasNextPage: false } }
    ]
  });

  assert.equal(normalized.reviewThreads.length, 2);
  assert.equal(normalized.reviewThreads[0].comments.length, 1);
  assert.equal(normalized.reviews.length, 1);
  assert.deepEqual(normalized.checks.map((entry) => entry.name), ['repo-verify', 'lint']);
});

test('observationKey is stable and head-specific', () => {
  const entry = { threadId: 'thread-1', commentId: '11', updatedAt: '2026-09-04T10:00:00Z', verdict: 'real' };
  assert.equal(observationKey({ ...binding, ...entry }), observationKey({ ...binding, ...entry }));
  assert.notEqual(
    observationKey({ ...binding, ...entry }),
    observationKey({ ...binding, headSha: 'new-head', ...entry })
  );
});

test('reducePrReviewFeedback deduplicates repeated observations and invalidates old heads', () => {
  const thread = {
    id: 'thread-1',
    isResolved: false,
    isOutdated: false,
    severity: 'major',
    classification: 'real',
    comments: [{ databaseId: 11, body: 'current issue', updatedAt: '2026-09-04T10:00:00Z' }]
  };
  const first = reducePrReviewFeedback({ binding, pullRequest, reviewThreads: [thread], reviews: [], checks: [] });
  const repeated = reducePrReviewFeedback({
    binding,
    pullRequest,
    reviewThreads: [thread],
    reviews: [],
    checks: [],
    previousObservations: first.observations
  });
  assert.equal(first.status, 'repair_required');
  assert.equal(repeated.newObservationCount, 0);
  assert.equal(repeated.observations.length, 1);

  const moved = reducePrReviewFeedback({
    binding: { ...binding, headSha: 'new-head' },
    pullRequest: { ...pullRequest, headRefOid: 'new-head' },
    reviewThreads: [thread],
    reviews: [],
    checks: [],
    previousObservations: first.observations
  });
  assert.deepEqual(moved.invalidatedObservationKeys, [first.observations[0].key]);
});

test('effective current review decision gates historical approval', () => {
  for (const reviewDecision of ['CHANGES_REQUESTED', 'REVIEW_REQUIRED']) {
    const result = reducePrReviewFeedback({
      binding: { ...binding, autoMergePolicy: 'enabled' },
      pullRequest: {
        ...pullRequest,
        reviewDecision,
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'CLEAN'
      },
      reviewThreads: [],
      reviews: [{
        id: `historical-${reviewDecision}`,
        state: 'APPROVED',
        commitOid: binding.headSha,
        submittedAt: '2026-09-01T00:00:00Z'
      }],
      checks: [{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }],
      requiredChecks: ['repo-verify']
    });

    assert.equal(result.status, 'awaiting_human');
    assert.equal(result.lifecycle.decision, 'stop');
    assert.equal(result.lifecycle.reason, 'awaiting_human_gate');
  }
});

test('only a current-head User approval can satisfy native landing eligibility', () => {
  for (const author of [
    { __typename: 'User', login: 'human-reviewer' },
    { __typename: 'Bot', login: 'automation-bot' },
    undefined
  ]) {
    const result = reducePrReviewFeedback({
      binding: { ...binding, autoMergePolicy: 'enabled' },
      pullRequest: {
        ...pullRequest,
        reviewDecision: 'APPROVED',
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'CLEAN'
      },
      reviews: [{
        id: `approval-${author?.__typename ?? 'missing'}`,
        state: 'APPROVED',
        commitOid: binding.headSha,
        author
      }],
      checks: [{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }],
      requiredChecks: ['repo-verify']
    });

    if (author?.__typename === 'User') {
      assert.equal(result.status, 'eligible_for_native_auto_merge');
      assert.equal(result.lifecycle.reason, 'landing_eligibility');
    } else {
      assert.equal(result.status, 'awaiting_human');
      assert.equal(result.lifecycle.reason, 'awaiting_human_gate');
    }
  }
});

test('quietness compares the complete normalized PR, check, review, and thread snapshot', () => {
  const stablePullRequest = { ...pullRequest, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' };
  const stableThread = {
    id: 'resolved-thread',
    isResolved: true,
    comments: [{ databaseId: 1, body: 'resolved', updatedAt: '2026-09-05T00:00:00Z' }]
  };
  const stableReview = { id: 'review', state: 'COMMENTED', commitOid: binding.headSha };
  const stableCheck = { name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha };
  const previousSnapshot = normalizePrReviewSnapshot({
    pullRequest: stablePullRequest,
    reviewThreadPages: [[stableThread]],
    reviewPages: [[stableReview]],
    checkPages: [[stableCheck]]
  });
  const first = reducePrReviewFeedback({
    binding,
    pullRequest: stablePullRequest,
    reviewThreads: [stableThread],
    reviews: [stableReview],
    checks: [stableCheck]
  });
  const unchanged = reducePrReviewFeedback({
    binding,
    pullRequest: stablePullRequest,
    reviewThreads: [stableThread],
    reviews: [stableReview],
    checks: [stableCheck],
    previousObservations: first.observations,
    previousSnapshot
  });
  assert.equal(unchanged.quiet, true);

  for (const changed of [
    { pullRequest: { ...stablePullRequest, mergeStateStatus: 'BLOCKED' }, reviewThreads: [stableThread], reviews: [stableReview], checks: [stableCheck] },
    { pullRequest: stablePullRequest, reviewThreads: [stableThread], reviews: [stableReview], checks: [{ ...stableCheck, conclusion: 'FAILURE' }] },
    { pullRequest: stablePullRequest, reviewThreads: [stableThread], reviews: [{ ...stableReview, state: 'APPROVED' }], checks: [stableCheck] },
    { pullRequest: stablePullRequest, reviewThreads: [{ ...stableThread, comments: [{ ...stableThread.comments[0], body: 'changed' }] }], reviews: [stableReview], checks: [stableCheck] }
  ]) {
    const result = reducePrReviewFeedback({
      binding,
      ...changed,
      previousObservations: first.observations,
      previousSnapshot
    });
    assert.equal(result.quiet, false);
  }
});

test('stable complete snapshots with zero thread observations become quiet only with prior state', () => {
  const stablePullRequest = { ...pullRequest, mergeStateStatus: 'BLOCKED' };
  const previousSnapshot = normalizePrReviewSnapshot({
    pullRequest: stablePullRequest,
    reviewThreadPages: [[]],
    reviewPages: [[{ id: 'review', state: 'COMMENTED', commitOid: binding.headSha }]],
    checkPages: [[{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }]]
  });
  const first = reducePrReviewFeedback({
    binding,
    pullRequest: stablePullRequest,
    reviewThreads: [],
    reviews: [{ id: 'review', state: 'COMMENTED', commitOid: binding.headSha }],
    checks: [{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }]
  });
  assert.deepEqual(first.observations, []);

  const unchanged = reducePrReviewFeedback({
    binding,
    pullRequest: stablePullRequest,
    reviewThreads: [],
    reviews: [{ id: 'review', state: 'COMMENTED', commitOid: binding.headSha }],
    checks: [{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }],
    previousObservations: [],
    previousSnapshot
  });
  assert.equal(unchanged.quiet, true);

  const firstWithoutSnapshot = reducePrReviewFeedback({
    binding,
    pullRequest: stablePullRequest,
    reviewThreads: [],
    reviews: [{ id: 'review', state: 'COMMENTED', commitOid: binding.headSha }],
    checks: [{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }],
    previousObservations: []
  });
  assert.equal(firstWithoutSnapshot.quiet, false);
});

test('reducer classifies resolved, stale, already-fixed, false-positive, and user-decision threads', () => {
  const result = reducePrReviewFeedback({
    binding,
    pullRequest,
    reviewThreads: [
      { id: 'resolved', isResolved: true, comments: [{ databaseId: 1, updatedAt: '2026-09-04T10:00:00Z' }] },
      { id: 'stale', isOutdated: true, comments: [{ databaseId: 2, updatedAt: '2026-09-04T10:00:00Z' }] },
      { id: 'fixed', classification: 'already_fixed', comments: [{ databaseId: 3, updatedAt: '2026-09-04T10:00:00Z' }] },
      { id: 'false', classification: 'false_positive', comments: [{ databaseId: 4, updatedAt: '2026-09-04T10:00:00Z' }] },
      { id: 'decision', classification: 'needs_user_decision', comments: [{ databaseId: 5, updatedAt: '2026-09-04T10:00:00Z' }] }
    ],
    reviews: [],
    checks: []
  });

  assert.deepEqual(
    result.observations.map((entry) => entry.verdict),
    ['resolved', 'stale', 'already_fixed', 'false_positive', 'needs_user_decision']
  );
  assert.equal(result.status, 'awaiting_human');
});

test('reducer emits a fail-closed monitor lifecycle decision', () => {
  const common = { binding, pullRequest, reviewThreads: [], reviews: [], checks: [] };
  const routes = [
    {
      name: 'repair',
      input: { reviewThreads: [{ id: 'major', severity: 'major', comments: [{ databaseId: 1 }] }] },
      reason: 'repair_required',
      decision: 'stop'
    },
    {
      name: 'follow-up',
      input: { reviewThreads: [{ id: 'minor', severity: 'minor', comments: [{ databaseId: 2 }] }] },
      reason: 'deferred_follow_up_recording',
      decision: 'stop'
    },
    {
      name: 'human',
      input: {},
      reason: 'awaiting_human_gate',
      decision: 'stop'
    },
    {
      name: 'landing',
      input: {
        binding: { ...binding, autoMergePolicy: 'enabled' },
        pullRequest: { ...pullRequest, reviewDecision: 'APPROVED', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' },
        reviews: [{ id: 'current-approval', state: 'APPROVED', commitOid: binding.headSha, author: { __typename: 'User', login: 'human-reviewer' } }],
        checks: [{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }],
        requiredChecks: ['repo-verify']
      },
      reason: 'landing_eligibility',
      decision: 'stop'
    },
    {
      name: 'pending-machine',
      input: {
        pullRequest: { ...pullRequest, reviewDecision: 'APPROVED' },
        checks: [{ name: 'repo-verify', status: 'IN_PROGRESS', headSha: binding.headSha }]
      },
      reason: 'bounded_pending_machine',
      decision: 'continue'
    },
    {
      name: 'terminal',
      input: { pullRequest: { ...pullRequest, state: 'CLOSED' } },
      reason: 'terminal_pr',
      decision: 'stop'
    }
  ];

  for (const route of routes) {
    const result = reducePrReviewFeedback({ ...common, ...route.input });
    assert.equal(result.lifecycle.decision, route.decision, route.name);
    assert.equal(result.lifecycle.reason, route.reason, route.name);
    assert.deepEqual(result.actions, [], route.name);
    if (route.name === 'follow-up') assert.equal(result.lifecycle.deduplicateIssuesBeforeStop, true);
    if (route.name === 'landing') {
      assert.equal(result.lifecycle.exactCurrentHead, true);
      assert.equal(result.lifecycle.humanGateRequired, true);
    }
    if (route.name === 'pending-machine') assert.equal(result.lifecycle.bounded, true);
  }

  const stale = reducePrReviewFeedback({
    ...common,
    binding: { ...binding, headSha: 'new-head' },
    pullRequest: { ...pullRequest }
  });
  assert.equal(stale.lifecycle.reason, 'stale_binding');

  const rejected = reducePrReviewFeedback({
    ...common,
    pullRequest: { ...pullRequest, baseRefName: 'other' }
  });
  assert.equal(rejected.lifecycle.reason, 'rejected_binding');
});

test('reducer routes a realistic P2-badged review comment as a Minor follow-up', () => {
  const result = reducePrReviewFeedback({
    binding,
    pullRequest,
    reviewThreads: [{
      id: 'p2-thread',
      isResolved: false,
      isOutdated: false,
      comments: [{
        databaseId: 3938716561,
        updatedAt: '2026-09-05T00:09:27Z',
        body: '**<sub><sub>![P2 Badge](https://img.shields.io/badge/P2-yellow?style=flat)</sub></sub>  Recover locks left by terminated writers**'
      }]
    }],
    reviews: [],
    checks: []
  });

  assert.equal(result.observations[0].severity, 'minor');
  assert.equal(result.observations[0].route, 'follow_up');
  assert.equal(result.status, 'follow_up');
  assert.deepEqual(result.actions, []);

  const structured = reducePrReviewFeedback({
    binding,
    pullRequest,
    reviewThreads: [{
      id: 'structured-major',
      severity: 'major',
      comments: [{ databaseId: 2, body: 'P2 suggestion', updatedAt: '2026-09-05T00:09:27Z' }]
    }],
    reviews: [],
    checks: []
  });
  assert.equal(structured.observations[0].severity, 'major');
  assert.equal(structured.status, 'repair_required');

  for (const [marker, severity, route] of [['P0', 'critical', 'repair_required'], ['P1', 'major', 'repair_required']]) {
    const marked = reducePrReviewFeedback({
      binding,
      pullRequest,
      reviewThreads: [{ id: `marker-${marker}`, comments: [{ databaseId: marker, body: `Review marker ${marker}` }] }],
      reviews: [],
      checks: []
    });
    assert.equal(marked.observations[0].severity, severity);
    assert.equal(marked.status, route);
  }

  const arbitraryNumber = reducePrReviewFeedback({
    binding,
    pullRequest,
    reviewThreads: [{ id: 'arbitrary-number', comments: [{ databaseId: 3, body: 'This affects 20 files and priority 2 only.' }] }],
    reviews: [],
    checks: []
  });
  assert.equal(arbitraryNumber.observations[0].severity, 'informational');
  assert.equal(arbitraryNumber.status, 'awaiting_human');
});

test('severity routes preserve critical and major repair blockers and minor follow-ups', () => {
  assert.equal(routeForSeverity('critical'), 'repair_required');
  assert.equal(routeForSeverity('Major'), 'repair_required');
  assert.equal(routeForSeverity('minor'), 'follow_up');
  assert.equal(routeForSeverity('informational'), 'awaiting_human');

  for (const [severity, expected] of [['critical', 'repair_required'], ['major', 'repair_required'], ['minor', 'follow_up']]) {
    const result = reducePrReviewFeedback({
      binding,
      pullRequest,
      reviewThreads: [{ id: severity, severity, classification: 'real', comments: [{ databaseId: severity, updatedAt: '2026-09-04T10:00:00Z' }] }],
      reviews: [],
      checks: []
    });
    assert.equal(result.status, expected);
  }
});

test('current-head mismatch rejects head-specific evidence', () => {
  const result = reducePrReviewFeedback({
    binding,
    pullRequest: { ...pullRequest, headRefOid: 'different-head' },
    reviewThreads: [],
    reviews: [],
    checks: []
  });
  assert.equal(result.status, 'rejected');
  assert.ok(result.errors.some((entry) => entry.code === 'head_mismatch'));
});

test('native auto-merge is only a conditional status and never an executed action', () => {
  const result = reducePrReviewFeedback({
    binding: { ...binding, autoMergePolicy: 'enabled' },
    pullRequest: { ...pullRequest, reviewDecision: 'APPROVED', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' },
    reviewThreads: [],
    reviews: [{ id: 'approval', state: 'APPROVED', commitOid: binding.headSha, author: { __typename: 'User', login: 'human-reviewer' } }],
    checks: [{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }],
    requiredChecks: ['repo-verify']
  });
  assert.equal(result.status, 'eligible_for_native_auto_merge');
  assert.equal(result.mergeExecuted, false);
  assert.deepEqual(result.actions, []);

  const disabled = reducePrReviewFeedback({
    binding,
    pullRequest: { ...pullRequest, reviewDecision: 'APPROVED', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' },
    reviewThreads: [],
    reviews: [{ id: 'approval', state: 'APPROVED', commitOid: binding.headSha, author: { __typename: 'User', login: 'human-reviewer' } }],
    checks: [{ name: 'repo-verify', conclusion: 'SUCCESS', headSha: binding.headSha }],
    requiredChecks: ['repo-verify']
  });
  assert.equal(disabled.status, 'awaiting_human');
});

test('runner rejects absent binding or credentials without calling GitHub', async () => {
  const calls = [];
  const runCommand = async (...args) => {
    calls.push(args);
    if (args[1]?.[0] === 'auth') return { stdout: '', stderr: 'not logged in', exitCode: 1 };
    return { stdout: '{}', stderr: '', exitCode: 0 };
  };
  const missingBinding = await runPrReviewObservation({ input: {}, env: { GH_TOKEN: 'test' }, runCommand });
  assert.equal(missingBinding.status, 'rejected');
  assert.equal(missingBinding.errors[0].code, 'missing_binding');
  assert.deepEqual(missingBinding.lifecycle, { decision: 'stop', reason: 'rejected_binding' });
  const missingCredentials = await runPrReviewObservation({ input: binding, env: {}, runCommand });
  assert.equal(missingCredentials.status, 'rejected');
  assert.equal(missingCredentials.errors[0].code, 'credentials_missing');
  assert.deepEqual(missingCredentials.lifecycle, { decision: 'stop', reason: 'rejected_observation' });
  assert.deepEqual(calls, [['gh', ['auth', 'status', '--hostname', 'github.com']]]);
});

test('runner accepts a successful local gh auth status without exported token fields', async () => {
  const calls = [];
  const runCommand = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === 'auth') return { stdout: 'authenticated\n', stderr: '', exitCode: 0 };
    if (args[0] === 'pr') return { stdout: JSON.stringify(pullRequest), stderr: '', exitCode: 0 };
    return {
      stdout: JSON.stringify({ data: { repository: { pullRequest: {
        reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        reviews: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        checks: []
      } } } }),
      stderr: '',
      exitCode: 0
    };
  };

  const result = await runPrReviewObservation({ input: binding, env: {}, runCommand });
  assert.equal(result.status, 'awaiting_human');
  assert.deepEqual(calls[0], {
    command: 'gh',
    args: ['auth', 'status', '--hostname', 'github.com']
  });
});

test('runner gathers only read-only gh PR and GraphQL snapshots and reduces them', async () => {
  const calls = [];
  const runCommand = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === 'pr') return { stdout: JSON.stringify(pullRequest), stderr: '', exitCode: 0 };
    return {
      stdout: JSON.stringify({ data: { repository: { pullRequest: {
        reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        reviews: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        checks: []
      } } } }),
      stderr: '',
      exitCode: 0
    };
  };
  const result = await runPrReviewObservation({ input: binding, env: { GH_TOKEN: 'test' }, runCommand });
  assert.equal(result.schema, 'swf/pr-review-feedback-result');
  assert.equal(result.status, 'awaiting_human');
  assert.ok(calls.length >= 2);
  assert.ok(calls.every(({ command }) => command === 'gh'));
  assert.ok(calls.every(({ args }) => !args.includes('merge') && !args.includes('push')));
  const graphQlQuery = calls.find(({ args }) => args[0] === 'api').args.find((value) => value.startsWith('query='));
  assert.match(graphQlQuery, /author\{login __typename\}/);
});

test('runner addresses the bound PR with a numeric selector and explicit repository', async () => {
  const calls = [];
  const runCommand = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === 'pr') return { stdout: JSON.stringify(pullRequest), stderr: '', exitCode: 0 };
    return {
      stdout: JSON.stringify({ data: { repository: { pullRequest: {
        reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        reviews: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        checks: []
      } } } }),
      stderr: '',
      exitCode: 0
    };
  };

  await runPrReviewObservation({ input: binding, env: {}, runCommand });
  assert.deepEqual(calls[1].args, [
    'pr',
    'view',
    '168',
    '--repo',
    'ilderaj/superpowering-with-files',
    '--json',
    'number,state,baseRefName,baseRefOid,headRefName,headRefOid,reviewDecision,mergeable,mergeStateStatus'
  ]);
});

test('runner normalizes nested status checks and paginates review and check connections', async () => {
  const calls = [];
  const runCommand = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === 'pr') return { stdout: JSON.stringify(pullRequest), stderr: '', exitCode: 0 };
    const secondPage = args.includes('threadCursor=thread-2');
    const graphQlPullRequest = secondPage ? {
      reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      reviews: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      commits: { nodes: [{ commit: {
        oid: binding.headSha,
        statusCheckRollup: {
          contexts: {
            nodes: [{ __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      } }] }
    } : {
      reviewThreads: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'thread-2' } },
      reviews: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      commits: { nodes: [{ commit: {
        oid: binding.headSha,
        statusCheckRollup: {
          contexts: {
            nodes: [{ __typename: 'CheckRun', name: 'repo-verify', status: 'COMPLETED', conclusion: 'SUCCESS' }],
            pageInfo: { hasNextPage: true, endCursor: 'check-2' }
          }
        }
      } }] }
    };
    return {
      stdout: JSON.stringify({ data: { repository: { pullRequest: graphQlPullRequest } } }),
      stderr: '',
      exitCode: 0
    };
  };

  const result = await runPrReviewObservation({ input: binding, env: { GH_TOKEN: 'test' }, runCommand });
  assert.equal(result.status, 'awaiting_human');
  assert.equal(result.snapshot.checkCount, 2);
  assert.equal(calls.length, 4);
  assert.ok(calls[3].args.includes('threadCursor=thread-2'));
  assert.ok(calls[3].args.includes('checkCursor=check-2'));
});

test('runner keeps exhausted top-level cursors independent and monotonic', async () => {
  const calls = [];
  const runCommand = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === 'auth') return { stdout: '', stderr: '', exitCode: 0 };
    if (args[0] === 'pr') return { stdout: JSON.stringify(pullRequest), stderr: '', exitCode: 0 };
    const threadCursor = args.find((value) => value.startsWith('threadCursor='));
    const reviewCursor = args.find((value) => value.startsWith('reviewCursor='));
    const graphQlPullRequest = !threadCursor ? {
      reviewThreads: { nodes: [{ id: 'thread-1', isResolved: true, comments: { nodes: [] } }], pageInfo: { hasNextPage: true, endCursor: 'thread-2' } },
      reviews: { nodes: [{ id: 'review-1', state: 'COMMENTED' }], pageInfo: { hasNextPage: true, endCursor: 'review-2' } },
      commits: { nodes: [{ commit: { oid: binding.headSha, statusCheckRollup: { contexts: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } }] }
    } : reviewCursor ? {
      reviewThreads: { nodes: [{ id: 'thread-2', isResolved: true, comments: { nodes: [] } }], pageInfo: { hasNextPage: true, endCursor: 'thread-3' } },
      reviews: { nodes: [{ id: 'review-2', state: 'COMMENTED' }], pageInfo: { hasNextPage: false, endCursor: null } },
      commits: { nodes: [{ commit: { oid: binding.headSha, statusCheckRollup: { contexts: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } }] }
    } : {
      reviewThreads: { nodes: [{ id: 'thread-3', isResolved: true, comments: { nodes: [] } }], pageInfo: { hasNextPage: false, endCursor: null } },
      reviews: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      commits: { nodes: [{ commit: { oid: binding.headSha, statusCheckRollup: { contexts: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } }] }
    };
    return { stdout: JSON.stringify({ data: { repository: { pullRequest: graphQlPullRequest } } }), stderr: '', exitCode: 0 };
  };

  const result = await runPrReviewObservation({ input: binding, env: {}, runCommand });
  const graphQlCalls = calls.filter(({ args }) => args[0] === 'api');
  assert.equal(result.snapshot.threadCount, 3);
  assert.equal(graphQlCalls.length, 3);
  assert.ok(graphQlCalls[1].args.includes('threadCursor=thread-2'));
  assert.ok(graphQlCalls[1].args.includes('reviewCursor=review-2'));
  assert.ok(graphQlCalls[2].args.includes('threadCursor=thread-3'));
  assert.ok(!graphQlCalls[2].args.includes('reviewCursor=review-2'));
  assert.ok(graphQlCalls[2].args.includes('includeThreads=true'));
  assert.ok(graphQlCalls[2].args.includes('includeReviews=false'));
  assert.ok(graphQlCalls[2].args.includes('includeChecks=false'));
});

test('runner paginates each review-thread comment connection independently', async () => {
  const calls = [];
  const runCommand = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === 'auth') return { stdout: '', stderr: '', exitCode: 0 };
    if (args[0] === 'pr') return { stdout: JSON.stringify(pullRequest), stderr: '', exitCode: 0 };
    if (args.includes('threadId=thread-comments')) {
      const secondPage = args.includes('commentCursor=comment-2');
      const comments = secondPage
        ? { nodes: [{ databaseId: 2, body: 'second comment', updatedAt: '2026-09-05T00:00:02Z' }], pageInfo: { hasNextPage: false, endCursor: null } }
        : { nodes: [{ databaseId: 1, body: 'first comment', updatedAt: '2026-09-05T00:00:01Z' }], pageInfo: { hasNextPage: true, endCursor: 'comment-2' } };
      return { stdout: JSON.stringify({ data: { node: { comments } } }), stderr: '', exitCode: 0 };
    }
    return { stdout: JSON.stringify({ data: { repository: { pullRequest: {
      reviewThreads: { nodes: [{ id: 'thread-comments', isResolved: false, isOutdated: false }], pageInfo: { hasNextPage: false, endCursor: null } },
      reviews: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      commits: { nodes: [{ commit: { oid: binding.headSha, statusCheckRollup: { contexts: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } }] }
    } } } }), stderr: '', exitCode: 0 };
  };

  const result = await runPrReviewObservation({ input: binding, env: {}, runCommand });
  assert.deepEqual(result.observations.map((entry) => entry.commentId), ['1', '2']);
  assert.deepEqual(result.observations.map((entry) => entry.body), ['first comment', 'second comment']);
  const commentCalls = calls.filter(({ args }) => args.includes('threadId=thread-comments'));
  assert.equal(commentCalls.length, 2);
  assert.ok(commentCalls[1].args.includes('commentCursor=comment-2'));
});

test('pure reducer and observer contain no direct mutation executor', async () => {
  const moduleSource = await readFile('scripts/ci/lib/pr-review-feedback.mjs', 'utf8');
  const runnerSource = await readFile('scripts/ci/run-pr-review-observation.mjs', 'utf8');
  for (const source of [moduleSource, runnerSource]) {
    assert.doesNotMatch(source, /gh\s+(pr\s+)?(merge|comment|review|close|edit|label)/i);
    assert.doesNotMatch(source, /git\s+(merge|push|commit)/i);
    assert.doesNotMatch(source, /createReview|addComment|resolveReviewThread|enableAutoMerge/i);
    assert.doesNotMatch(source, /-X\s+(POST|PATCH|PUT|DELETE)/i);
  }
});
