// Offline N01 contracts. This module does not read the clock, persist state,
// call Linear, or decide whether a Host claim actually succeeded.
import { NIGHT_ATTEMPT_LIMIT, NIGHT_BUDGET_MS, selectNightIssue } from './night-queue.mjs';

const PROMOTION_LABELS = Object.freeze(['agent-ready', 'nightly']);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isIdentifier = value => typeof value === 'string' && value.trim() === value && value.length > 0;
const isIsoTimestamp = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return new Date(parsed).toISOString() === value.replace(/(?<=:\d{2})Z$/, '.000Z');
};
const timestampMs = value => isIsoTimestamp(value) ? Date.parse(value) : NaN;
const unique = values => new Set(values).size === values.length;
const copy = value => structuredClone(value);

function baseEvidence(input = {}) {
  input = isRecord(input) ? input : {};
  const configured = isRecord(input.configured) ? input.configured : null;
  const host = isRecord(input.hostEvidence) ? input.hostEvidence : null;
  return {
    runId: isIdentifier(input.runId) ? input.runId : 'unknown',
    configuredModel: isIdentifier(configured?.model) ? configured.model : 'unknown',
    configuredEffort: isIdentifier(configured?.effort) ? configured.effort : 'unknown',
    hostReportedModel: isIdentifier(host?.model) ? host.model : 'unknown',
    hostReportedEffort: isIdentifier(host?.effort) ? host.effort : 'unknown',
    providerActualIdentity: isIdentifier(host?.providerActualIdentity)
      ? host.providerActualIdentity : 'unknown',
    providerIdentityVerified: false,
    evidenceSource: isIdentifier(host?.source) ? host.source : 'unknown',
    evidenceAt: isIsoTimestamp(host?.observedAt) ? host.observedAt : 'unknown',
    selfReportObserved: isRecord(input.selfReport),
  };
}

function evidenceResult(input, verification, reason) {
  return { ...baseEvidence(input), verification, reason };
}

/**
 * Match a requested route against authenticated Host evidence for this run.
 * Model output or a report written by the worker is deliberately never enough.
 */
export function matchModelEvidence(input) {
  if (!isRecord(input) || !isIdentifier(input.runId)) {
    return evidenceResult(input, 'unknown', 'invalid-run');
  }
  if (!isRecord(input.configured) ||
      !isIdentifier(input.configured.model) || !isIdentifier(input.configured.effort)) {
    return evidenceResult(input, 'unknown', 'unresolved-carrier');
  }

  const host = input.hostEvidence;
  if (!isRecord(host)) {
    return evidenceResult(input, 'unknown', input.selfReport ? 'self-report-only' : 'missing-host-evidence');
  }
  if (host.runId !== input.runId) {
    return evidenceResult(input, 'unknown', 'host-evidence-run-mismatch');
  }
  if (host.trusted !== true) {
    return evidenceResult(input, 'unknown', 'host-evidence-untrusted');
  }
  if (!isIdentifier(host.model) || !isIdentifier(host.effort) ||
      !isIdentifier(host.source) || !isIsoTimestamp(host.observedAt)) {
    return evidenceResult(input, 'unknown', 'incomplete-host-evidence');
  }

  if (host.model !== input.configured.model) {
    return evidenceResult(input, 'mismatch', 'model-mismatch');
  }
  if (host.effort !== input.configured.effort) {
    return evidenceResult(input, 'mismatch', 'effort-mismatch');
  }
  return evidenceResult(input, 'matched', 'trusted-host-route-matched');
}

function invalidBudget(reason = 'missing-budget') {
  return {
    ok: false,
    admit: false,
    reason,
    deadlineAt: null,
    elapsedMs: null,
    attemptsUsed: null,
    overrunMs: 0,
    overrunReason: null,
  };
}

/**
 * Evaluate admission and cooperative checkpoint facts for the shared run.
 * `finishedAt` is evidence about a completed step; it never extends the run.
 */
export function evaluateRunBudget(input) {
  if (!isRecord(input) || !isIsoTimestamp(input.startedAt) || !isIsoTimestamp(input.now) ||
      !Array.isArray(input.attemptedIssueIds) ||
      !input.attemptedIssueIds.every(isIdentifier) ||
      !unique(input.attemptedIssueIds)) return invalidBudget();
  const startedMs = timestampMs(input.startedAt);
  const nowMs = timestampMs(input.now);
  if (nowMs < startedMs) return invalidBudget('invalid-budget-clock');
  if (input.finishedAt !== undefined && !isIsoTimestamp(input.finishedAt)) {
    return invalidBudget('invalid-finished-at');
  }
  const finishedMs = input.finishedAt === undefined ? null : timestampMs(input.finishedAt);
  if (finishedMs !== null && (finishedMs < startedMs || finishedMs > nowMs)) return invalidBudget('invalid-finished-at');

  const deadlineMs = startedMs + NIGHT_BUDGET_MS;
  const attemptsUsed = input.attemptedIssueIds.length;
  const elapsedMs = nowMs - startedMs;
  const overrunMs = Math.max(0, (finishedMs ?? nowMs) - deadlineMs);
  const reason = attemptsUsed >= NIGHT_ATTEMPT_LIMIT ? 'attempt-budget'
    : nowMs >= deadlineMs ? 'time-budget' : 'ready';
  return {
    ok: true,
    admit: reason === 'ready',
    reason,
    deadlineAt: new Date(deadlineMs).toISOString(),
    elapsedMs,
    attemptsUsed,
    overrunMs,
    overrunReason: overrunMs > 0 ? 'finished-after-deadline' : null,
  };
}

function scopeKey(context) {
  return isRecord(context) && ['workspace', 'team', 'project'].every(key => isIdentifier(context[key]))
    ? `${context.workspace}/${context.team}/${context.project}` : 'unknown';
}

function compareCandidates(a, b) {
  const priority = (a.priority || 5) - (b.priority || 5);
  if (priority !== 0) return priority;
  const updated = timestampMs(a.updatedAt) - timestampMs(b.updatedAt);
  if (updated !== 0) return updated;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Run the existing selector over multiple scopes while retaining one global
 * budget and attempted ledger. Scope errors become unknown coverage, never an
 * empty project claim.
 */
export function selectAcrossScopes(input) {
  const budget = evaluateRunBudget(input);
  if (!budget.ok) return {
    ok: false, selected: null, reason: budget.reason, budget,
    scopes: [], coverage: [], attemptedIssueIds: copy(input?.attemptedIssueIds ?? []),
  };
  if (!Array.isArray(input.scopes)) {
    return { ok: false, selected: null, reason: 'invalid-scopes', budget, scopes: [], coverage: [],
      attemptedIssueIds: copy(input.attemptedIssueIds) };
  }
  if (!budget.admit) return {
    ok: true, selected: null, reason: budget.reason, budget,
    scopes: [], coverage: [], attemptedIssueIds: copy(input.attemptedIssueIds),
  };

  const winners = [];
  const scopes = [];
  const coverage = [];
  for (const item of input.scopes) {
    if (!isRecord(item) || !isRecord(item.context) || !Array.isArray(item.candidates)) {
      coverage.push({ scope: scopeKey(item?.context), status: 'unknown', reason: 'unreadable-scope' });
      continue;
    }
    const result = selectNightIssue({
      startedAt: input.startedAt,
      now: input.now,
      attemptedIssueIds: input.attemptedIssueIds,
      context: item.context,
      candidates: item.candidates,
    });
    if (!result.ok) {
      coverage.push({ scope: scopeKey(item.context), status: 'unknown', reason: result.error || 'invalid-snapshot' });
      continue;
    }
    const selected = result.nextIssueId === null ? null
      : item.candidates.find(candidate => candidate.id === result.nextIssueId);
    scopes.push({ scope: scopeKey(item.context), reason: result.reason,
      nextIssueId: result.nextIssueId, skipped: result.skipped, remainingIssueIds: result.remainingIssueIds });
    if (selected) winners.push({ scope: item.context, candidate: selected });
  }
  winners.sort((a, b) => compareCandidates(a.candidate, b.candidate));
  const winner = winners[0];
  return {
    ok: true,
    selected: winner ? {
      id: winner.candidate.id,
      uuid: winner.candidate.uuid ?? 'unknown',
      scope: copy(winner.scope),
      candidate: copy(winner.candidate),
    } : null,
    reason: winner ? 'selected' : 'no-eligible-issue',
    budget,
    scopes,
    coverage,
    attemptedIssueIds: copy(input.attemptedIssueIds),
  };
}

export function planExecutionAfterClaim(input = {}) {
  const { issueId, claim } = isRecord(input) ? input : {};
  if (!isIdentifier(issueId) || !isRecord(claim) || claim.ok !== true) {
    return { execute: false, reason: 'claim-failed' };
  }
  if (claim.issueId !== issueId) {
    return { execute: false, reason: 'claim-identity-mismatch' };
  }
  return { execute: true, reason: 'claimed', issueId };
}

function desiredLabels(labels) {
  return [...new Set([...(Array.isArray(labels) ? labels : []), ...PROMOTION_LABELS])];
}

export function planSuccessorPromotion(input = {}) {
  const { successor, prerequisites, authorized, readiness } = isRecord(input) ? input : {};
  if (!isRecord(successor) || !isIdentifier(successor.id) || !Array.isArray(prerequisites)) {
    return { action: 'skip', reason: 'invalid-successor' };
  }
  const mappingVerified = successor.mapped === true || successor.mappingVerified === true ||
    (isRecord(successor.mapping) && successor.mapping.verified === true);
  if (successor.mapped === false || !mappingVerified) return { action: 'skip', reason: 'unmapped-successor' };
  if (!prerequisites.every(dep => isRecord(dep) && isIdentifier(dep.id))) {
    return { action: 'skip', reason: 'invalid-dependencies' };
  }
  if (prerequisites.some(dep => dep.state !== 'done')) {
    return { action: 'skip', reason: 'unmet-dependencies' };
  }
  if (authorized !== true) return { action: 'skip', reason: 'not-authorized' };
  if (readiness !== true) return { action: 'skip', reason: 'not-ready' };

  if (!Array.isArray(successor.labels) || !successor.labels.every(isIdentifier)) {
    return { action: 'skip', reason: 'unreadable-labels' };
  }
  const currentLabels = successor.labels;
  const excludedStates = new Set(['done', 'running', 'review', 'blocked', 'failed', 'waiting_human', 'canceled']);
  if (!['planned', 'ready'].includes(successor.state) || excludedStates.has(successor.state)) {
    return { action: 'skip', reason: 'excluded-state' };
  }
  const excludedLabels = new Set(['blocked', 'waiting-human', 'ready-review', 'agent-running', 'agent-failed']);
  if (currentLabels.some(label => excludedLabels.has(label))) {
    return { action: 'skip', reason: 'excluded-label' };
  }
  const labels = desiredLabels(currentLabels);
  const identity = { id: successor.id };
  if (isIdentifier(successor.uuid)) identity.uuid = successor.uuid;
  const alreadyReady = successor.state === 'ready' &&
    PROMOTION_LABELS.every(label => currentLabels.includes(label));
  if (alreadyReady) return { action: 'no-op', reason: 'already-promoted', desired: {
    ...identity, state: 'ready', status: 'Todo', labels,
  } };
  return {
    action: 'promote',
    reason: 'ready-to-promote',
    desired: { ...identity, state: 'ready', status: 'Todo', labels },
  };
}

function hasDesiredState(observed, desired) {
  return isRecord(observed) && observed.id === desired.id &&
    (desired.uuid === undefined || observed.uuid === desired.uuid) &&
    observed.state === desired.state &&
    (observed.status === undefined || observed.status === desired.status) &&
    Array.isArray(observed.labels) &&
    !observed.labels.some(label => ['blocked', 'waiting-human', 'ready-review', 'agent-running', 'agent-failed'].includes(label)) &&
    desired.labels.every(label => observed.labels.includes(label));
}

export function reconcilePromotion(plan, result) {
  if (!isRecord(plan) || plan.action === 'skip' || plan.action === 'no-op') {
    return { status: 'skipped', retry: false, reason: plan?.reason ?? 'invalid-plan' };
  }
  if (isRecord(result) && hasDesiredState(result.observed, plan.desired)) {
    return { status: 'no-op', retry: false, reason: 'already-promoted-after-readback' };
  }
  if (!isRecord(result) || result.ok !== true) {
    return { status: 'sync-pending', retry: true, reason: result?.error ?? 'promotion-write-failed' };
  }
  return { status: 'readback-mismatch', retry: true, reason: 'promotion-readback-mismatch' };
}
