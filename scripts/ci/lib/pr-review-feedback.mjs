const RESULT_SCHEMA = 'swf/pr-review-feedback-result';
const VERSION = 1;
const VERDICTS = new Set([
  'real',
  'already_fixed',
  'stale',
  'false_positive',
  'needs_user_decision',
  'resolved'
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function error(code, reason, field) {
  return { code, reason, field };
}

function rejectedResult(errors, lifecycleReason = 'rejected_binding') {
  return {
    schema: RESULT_SCHEMA,
    version: VERSION,
    status: 'rejected',
    readOnly: true,
    errors,
    observations: [],
    actions: [],
    mergeExecuted: false,
    lifecycle: { decision: 'stop', reason: lifecycleReason }
  };
}

function pageNodes(page) {
  if (Array.isArray(page)) return page;
  if (Array.isArray(page?.nodes)) return page.nodes;
  if (Array.isArray(page?.items)) return page.items;
  return [];
}

function pageList(pages) {
  if (Array.isArray(pages)) return pages;
  return pages == null ? [] : [pages];
}

function nodeKey(node, fallback) {
  if (!isRecord(node)) return `anonymous:${fallback}`;
  for (const field of ['id', 'databaseId', 'name', 'context', 'key']) {
    if (node[field] !== undefined && node[field] !== null) return String(node[field]);
  }
  return `anonymous:${fallback}`;
}

function mergeNode(existing, incoming, key) {
  if (!existing) return { ...incoming, __key: key };
  return { ...existing, ...incoming, __key: key };
}

function flattenUnique(pages) {
  const nodes = new Map();
  for (const page of pageList(pages)) {
    for (const [index, node] of pageNodes(page).entries()) {
      const key = nodeKey(node, `${nodes.size}:${index}`);
      nodes.set(key, mergeNode(nodes.get(key), node, key));
    }
  }
  return [...nodes.values()].map(({ __key, ...node }) => node);
}

function normalizeComments(thread) {
  const comments = thread?.comments;
  if (Array.isArray(comments)) return flattenUnique([comments]);
  return flattenUnique([comments?.nodes ?? comments?.items ?? []]);
}

function normalizeThreads(pages) {
  const threads = new Map();
  for (const page of pageList(pages)) {
    for (const [index, thread] of pageNodes(page).entries()) {
      const key = nodeKey(thread, `${threads.size}:${index}`);
      const existing = threads.get(key);
      const comments = [
        ...normalizeComments(existing ?? {}),
        ...normalizeComments(thread)
      ];
      threads.set(key, {
        ...(existing ?? {}),
        ...thread,
        comments: flattenUnique([comments])
      });
    }
  }
  return [...threads.values()];
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizedStoredSnapshot(value) {
  if (!isRecord(value)) return null;
  const snapshot = isRecord(value.normalizedSnapshot) ? value.normalizedSnapshot : value;
  return normalizePrReviewSnapshot({
    pullRequest: snapshot.pullRequest ?? {},
    reviewThreadPages: [snapshot.reviewThreads ?? snapshot.reviewThreadPages ?? []],
    reviewPages: [snapshot.reviews ?? snapshot.reviewPages ?? []],
    checkPages: [snapshot.checks ?? snapshot.checkPages ?? []]
  });
}

export function normalizePrReviewSnapshot({
  pullRequest = {},
  reviewThreadPages = [],
  reviewPages = [],
  checkPages = []
} = {}) {
  return {
    pullRequest: { ...pullRequest },
    reviewThreads: normalizeThreads(reviewThreadPages),
    reviews: flattenUnique(reviewPages),
    checks: flattenUnique(checkPages)
  };
}

export function validatePrBinding(binding) {
  const errors = [];
  if (!isRecord(binding)) return [error('missing_binding', 'A complete PR binding is required.', 'binding')];

  if (!text(binding.repository) || !/^[^/\s]+\/[^/\s]+$/u.test(binding.repository)) {
    errors.push(error('missing_repository', 'Repository must be in owner/name form.', 'repository'));
  }
  if (!Number.isInteger(binding.number) || binding.number < 1) {
    errors.push(error('missing_number', 'A positive PR number is required.', 'number'));
  }
  const expectedUrl = text(binding.repository) && Number.isInteger(binding.number)
    ? `https://github.com/${binding.repository}/pull/${binding.number}`
    : null;
  if (!text(binding.url)) {
    errors.push(error('missing_url', 'A PR URL is required.', 'url'));
  } else if (expectedUrl && binding.url !== expectedUrl) {
    errors.push(error('url_mismatch', 'PR URL must match the bound repository and number.', 'url'));
  }
  if (!text(binding.baseRef)) errors.push(error('missing_base_ref', 'A base ref is required.', 'baseRef'));
  if (!text(binding.baseSha)) errors.push(error('missing_base_sha', 'A base SHA is required.', 'baseSha'));
  if (!text(binding.headSha)) errors.push(error('missing_head_sha', 'A head SHA is required.', 'headSha'));
  if (!text(binding.specReference)) {
    errors.push(error('missing_spec_reference', 'A fixed specification reference is required.', 'specReference'));
  }
  if (!Array.isArray(binding.requiredChecks)
    || binding.requiredChecks.length === 0
    || binding.requiredChecks.some((name) => !text(name))) {
    errors.push(error('invalid_required_checks', 'At least one non-empty required check name is required.', 'requiredChecks'));
  }
  if (binding.humanReviewPolicy !== 'current_head_human_approved_required') {
    errors.push(error('invalid_human_review_policy', 'A current-head human APPROVED review is required.', 'humanReviewPolicy'));
  }
  if (binding.mergeabilityPolicy !== 'current_head_mergeable_required') {
    errors.push(error('invalid_mergeability_policy', 'The current PR head must be mergeable.', 'mergeabilityPolicy'));
  }
  if (binding.severityPolicy !== 'critical_major_repair_minor_follow_up') {
    errors.push(error('invalid_severity_policy', 'Critical/Major must repair and Minor must follow up.', 'severityPolicy'));
  }
  if (binding.repairPushPolicy !== 'disabled') {
    errors.push(error('repair_push_policy_not_disabled', 'Repair pushes must remain disabled.', 'repairPushPolicy'));
  }
  if (binding.threadWritePolicy !== 'read_only') {
    errors.push(error('write_policy_not_read_only', 'Thread writes must remain read-only.', 'threadWritePolicy'));
  }
  if (binding.followUpIssuePolicy !== 'draft_only') {
    errors.push(error('issue_policy_not_draft_only', 'Follow-up issues must remain draft-only.', 'followUpIssuePolicy'));
  }
  if (!['disabled', 'enabled'].includes(binding.autoMergePolicy)) {
    errors.push(error('invalid_auto_merge_policy', 'Auto-merge policy must be disabled or enabled.', 'autoMergePolicy'));
  }
  return errors;
}

export function observationKey({
  repository,
  number,
  headSha,
  threadId,
  commentId,
  updatedAt,
  verdict
} = {}) {
  const threadOrComment = [threadId, commentId].filter((value) => value !== undefined && value !== null).join(':');
  return [repository, number, headSha, threadOrComment, updatedAt, verdict].map((value) => String(value ?? '')).join('|');
}

export function routeForSeverity(value) {
  const severity = String(value ?? 'informational').toLowerCase();
  if (severity === 'critical' || severity === 'major') return 'repair_required';
  if (severity === 'minor') return 'follow_up';
  return 'awaiting_human';
}

function classifyThread(thread) {
  if (thread?.isResolved === true || thread?.resolved === true) return 'resolved';
  if (thread?.isOutdated === true || thread?.outdated === true) return 'stale';
  const explicit = String(thread?.classification ?? thread?.verdict ?? '').toLowerCase().replaceAll('-', '_');
  return VERDICTS.has(explicit) ? explicit : 'real';
}

function structuredSeverity(value) {
  const severity = String(value ?? '').toLowerCase();
  return ['critical', 'major', 'minor', 'informational', 'uncertain'].includes(severity)
    ? severity
    : null;
}

function markerSeverity(value) {
  const marker = String(value ?? '').match(/\bP([012])\b/iu)?.[1];
  return { 0: 'critical', 1: 'major', 2: 'minor' }[marker] ?? null;
}

function threadSeverity(thread, comment) {
  for (const value of [comment?.severity, thread?.severity]) {
    const severity = structuredSeverity(value);
    if (severity) return severity;
  }
  return markerSeverity([comment?.body, thread?.body].filter(text).join('\n')) ?? 'informational';
}

function entryUpdatedAt(thread, comment) {
  return comment?.updatedAt ?? comment?.createdAt ?? thread?.updatedAt ?? thread?.createdAt ?? '';
}

function currentHeadForCheck(check) {
  return check?.headSha ?? check?.commitOid ?? check?.oid ?? check?.commit?.oid ?? null;
}

function checkPassed(check, headSha) {
  const checkHead = currentHeadForCheck(check);
  if (checkHead && checkHead !== headSha) return false;
  const status = String(check?.status ?? '').toUpperCase();
  const conclusion = String(check?.conclusion ?? check?.state ?? '').toUpperCase();
  return conclusion === 'SUCCESS' || conclusion === 'PASSED' || (status === 'COMPLETED' && conclusion === 'SUCCESS');
}

function approvalIsCurrent(review, headSha) {
  const reviewHead = review?.headSha ?? review?.commitOid ?? review?.commit?.oid ?? null;
  return String(review?.state ?? '').toUpperCase() === 'APPROVED'
    && reviewHead === headSha
    && review?.author?.__typename === 'User';
}

function isTerminalPullRequest(pullRequest) {
  return ['CLOSED', 'MERGED'].includes(String(pullRequest?.state ?? '').toUpperCase());
}

function pullRequestBindingErrors(binding, pullRequest) {
  const errors = [];
  if (!isRecord(pullRequest) || Object.keys(pullRequest).length === 0) {
    return [error('missing_pull_request', 'A complete current PR snapshot is required.', 'pullRequest')];
  }
  if (pullRequest.number === undefined || pullRequest.number === null) {
    errors.push(error('missing_pr_number', 'Observed PR number is required.', 'pullRequest.number'));
  } else if (Number(pullRequest.number) !== binding.number) {
    errors.push(error('pr_number_mismatch', 'Observed PR number does not match the bound PR.', 'pullRequest.number'));
  }
  if (!text(pullRequest.baseRefName)) {
    errors.push(error('missing_base_ref', 'Observed base ref is required.', 'pullRequest.baseRefName'));
  } else if (pullRequest.baseRefName !== binding.baseRef) {
    errors.push(error('base_ref_mismatch', 'Observed base ref does not match the bound PR.', 'pullRequest.baseRefName'));
  }
  if (!text(pullRequest.baseRefOid)) {
    errors.push(error('missing_base_sha', 'Observed base SHA is required.', 'pullRequest.baseRefOid'));
  } else if (pullRequest.baseRefOid !== binding.baseSha) {
    errors.push(error('base_sha_mismatch', 'Observed base SHA does not match the bound PR.', 'pullRequest.baseRefOid'));
  }
  if (!text(pullRequest.headRefOid)) {
    errors.push(error('missing_head_sha', 'Observed head SHA is required.', 'pullRequest.headRefOid'));
  } else if (pullRequest.headRefOid !== binding.headSha) {
    errors.push(error('head_mismatch', 'Head-specific evidence is invalid for the bound PR head.', 'pullRequest.headRefOid'));
  }
  if (!text(pullRequest.state)) {
    errors.push(error('missing_pr_state', 'Observed PR state is required.', 'pullRequest.state'));
  } else if (isTerminalPullRequest(pullRequest)) {
    errors.push(error('terminal_pr', 'The observed PR is terminal.', 'pullRequest.state'));
  } else if (String(pullRequest.state).toUpperCase() !== 'OPEN') {
    errors.push(error('pr_not_open', 'The bound PR must remain open for observation.', 'pullRequest.state'));
  }
  return errors;
}

function observationFor(binding, thread, comment) {
  const verdict = classifyThread(thread);
  const severity = threadSeverity(thread, comment);
  const updatedAt = entryUpdatedAt(thread, comment);
  const threadId = thread?.id ?? thread?.databaseId ?? '';
  const commentId = comment?.databaseId ?? comment?.id ?? '';
  const actionable = verdict === 'real' || verdict === 'needs_user_decision';
  return {
    key: observationKey({ ...binding, threadId, commentId, updatedAt, verdict }),
    repository: binding.repository,
    number: binding.number,
    headSha: binding.headSha,
    threadId: String(threadId),
    commentId: String(commentId),
    updatedAt,
    verdict,
    severity,
    route: actionable ? routeForSeverity(severity) : 'none',
    body: comment?.body ?? thread?.body ?? '',
    path: comment?.path ?? thread?.path ?? null,
    line: comment?.line ?? thread?.line ?? null
  };
}

function summarizeStatus(observations, { pullRequest, reviews, checks, requiredChecks, binding }) {
  const actionable = observations.filter((entry) => entry.route !== 'none');
  if (actionable.some((entry) => entry.route === 'repair_required')) return 'repair_required';
  if (actionable.some((entry) => entry.route === 'follow_up')) return 'follow_up';

  const currentApprover = String(pullRequest?.reviewDecision ?? '').toUpperCase() === 'APPROVED'
    && reviews.some((review) => approvalIsCurrent(review, binding.headSha));
  const required = requiredChecks.length > 0
    ? requiredChecks.every((name) => checks.some((check) => check.name === name && checkPassed(check, binding.headSha)))
    : checks.length > 0 && checks.every((check) => checkPassed(check, binding.headSha));
  const mergeable = String(pullRequest?.mergeable ?? '').toUpperCase() === 'MERGEABLE'
    || String(pullRequest?.mergeStateStatus ?? '').toUpperCase() === 'CLEAN';
  const readyForConditionalNativeStatus = binding.autoMergePolicy === 'enabled'
    && currentApprover
    && required
    && mergeable
    && !actionable.some((entry) => entry.route === 'awaiting_human');
  return readyForConditionalNativeStatus ? 'eligible_for_native_auto_merge' : 'awaiting_human';
}

function pendingMachineState({ pullRequest, checks, requiredChecks, headSha }) {
  if (['CHANGES_REQUESTED', 'REVIEW_REQUIRED'].includes(String(pullRequest?.reviewDecision ?? '').toUpperCase())) {
    return false;
  }
  return requiredChecks.some((name) => checks.some((check) => {
    if (check.name !== name || currentHeadForCheck(check) && currentHeadForCheck(check) !== headSha) return false;
    const status = String(check?.status ?? '').toUpperCase();
    const conclusion = String(check?.conclusion ?? check?.state ?? '').toUpperCase();
    return ['QUEUED', 'IN_PROGRESS', 'PENDING', 'WAITING', 'EXPECTED'].includes(status)
      || ['QUEUED', 'IN_PROGRESS', 'PENDING', 'WAITING', 'EXPECTED'].includes(conclusion);
  }));
}

function lifecycleFor({ status, pullRequest, checks, requiredChecks, binding }) {
  if (isTerminalPullRequest(pullRequest)) {
    return { decision: 'stop', reason: 'terminal_pr' };
  }
  if (status === 'repair_required') {
    return { decision: 'stop', reason: 'repair_required' };
  }
  if (status === 'follow_up') {
    return {
      decision: 'stop',
      reason: 'deferred_follow_up_recording',
      deduplicateIssuesBeforeStop: true
    };
  }
  if (status === 'eligible_for_native_auto_merge') {
    return {
      decision: 'stop',
      reason: 'landing_eligibility',
      exactCurrentHead: true,
      humanGateRequired: true
    };
  }
  if (status === 'awaiting_human' && pendingMachineState({
    pullRequest,
    checks,
    requiredChecks,
    headSha: binding.headSha
  })) {
    return {
      decision: 'continue',
      reason: 'bounded_pending_machine',
      bounded: true,
      maxAdditionalObservations: 1
    };
  }
  if (status === 'awaiting_human') {
    return { decision: 'stop', reason: 'awaiting_human_gate', humanGateRequired: true };
  }
  return { decision: 'stop', reason: 'rejected_binding' };
}

export function reducePrReviewFeedback({
  binding,
  pullRequest = {},
  reviewThreads = [],
  reviews = [],
  checks = [],
  requiredChecks = [],
  previousObservations = [],
  previousSnapshot
} = {}) {
  const bindingErrors = validatePrBinding(binding);
  if (bindingErrors.length > 0) {
    return rejectedResult(bindingErrors);
  }

  const snapshot = normalizePrReviewSnapshot({
    pullRequest,
    reviewThreadPages: [reviewThreads],
    reviewPages: [reviews],
    checkPages: [checks]
  });
  const snapshotErrors = pullRequestBindingErrors(binding, snapshot.pullRequest);
  if (snapshotErrors.length > 0) {
    const lifecycleReason = snapshotErrors.some((entry) => entry.code === 'terminal_pr')
      ? 'terminal_pr'
      : snapshotErrors.some((entry) => entry.code === 'head_mismatch')
        ? 'stale_binding'
        : 'rejected_binding';
    return rejectedResult(snapshotErrors, lifecycleReason);
  }

  const observations = [];
  for (const thread of snapshot.reviewThreads) {
    const comments = thread.comments.length > 0 ? thread.comments : [null];
    for (const comment of comments) observations.push(observationFor(binding, thread, comment));
  }
  const uniqueObservations = [...new Map(observations.map((entry) => [entry.key, entry])).values()];
  const previousKeys = new Set(previousObservations.map((entry) => entry.key));
  const newObservations = uniqueObservations.filter((entry) => !previousKeys.has(entry.key));
  const invalidatedObservationKeys = previousObservations
    .filter((entry) => entry.headSha !== binding.headSha)
    .map((entry) => entry.key)
    .filter(Boolean);
  const effectiveRequiredChecks = requiredChecks.length > 0 ? requiredChecks : binding.requiredChecks;
  const normalizedPreviousSnapshot = previousSnapshot === undefined
    ? null
    : normalizedStoredSnapshot(previousSnapshot);
  const snapshotFingerprint = stableValue(snapshot);
  const snapshotChanged = previousSnapshot !== undefined
    && snapshotFingerprint !== stableValue(normalizedPreviousSnapshot);
  const status = summarizeStatus(uniqueObservations, {
    pullRequest: snapshot.pullRequest,
    reviews: snapshot.reviews,
    checks: snapshot.checks,
    requiredChecks: effectiveRequiredChecks,
    binding
  });
  const lifecycle = lifecycleFor({
    status,
    pullRequest: snapshot.pullRequest,
    checks: snapshot.checks,
    requiredChecks: effectiveRequiredChecks,
    binding
  });

  return {
    schema: RESULT_SCHEMA,
    version: VERSION,
    status,
    readOnly: true,
    binding,
    currentHead: binding.headSha,
    observations: uniqueObservations,
    newObservations,
    newObservationCount: newObservations.length,
    invalidatedObservationKeys,
    quiet: previousSnapshot !== undefined
      && newObservations.length === 0
      && invalidatedObservationKeys.length === 0
      && !snapshotChanged,
    actions: [],
    mergeExecuted: false,
    lifecycle,
    normalizedSnapshot: snapshot,
    snapshotFingerprint,
    snapshot: {
      pullRequest: snapshot.pullRequest,
      reviewCount: snapshot.reviews.length,
      threadCount: snapshot.reviewThreads.length,
      checkCount: snapshot.checks.length
    }
  };
}
