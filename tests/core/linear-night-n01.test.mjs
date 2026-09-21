import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRunBudget,
  matchModelEvidence,
  planExecutionAfterClaim,
  planSuccessorPromotion,
  reconcilePromotion,
  selectAcrossScopes,
} from '../../harness/core/skills/linear-work-control/lib/night-n01.mjs';

const context = { workspace: 'swf', team: 'SUP', project: 'workbench' };
const candidate = (id, overrides = {}) => ({
  id,
  uuid: `${id}-uuid`,
  ...context,
  state: 'ready',
  labels: ['swf-managed', 'agent-ready', 'nightly'],
  authorized: true,
  readiness: true,
  blockedBy: [],
  priority: 2,
  updatedAt: '2026-09-21T00:00:00Z',
  ...overrides,
});

const configured = { model: 'main/gpt-5.6-luna', effort: 'high' };
const hostEvidence = {
  trusted: true,
  runId: 'run-1',
  model: configured.model,
  effort: configured.effort,
  source: 'host:run-1',
  observedAt: '2026-09-21T01:00:02.000Z',
};

test('C2 accepts only run-bound trusted Host evidence and keeps provider identity separate', () => {
  const result = matchModelEvidence({ runId: 'run-1', configured, hostEvidence });
  assert.equal(result.verification, 'matched');
  assert.equal(result.hostReportedModel, configured.model);
  assert.equal(result.hostReportedEffort, configured.effort);
  assert.equal(result.providerActualIdentity, 'unknown');
  assert.equal(result.providerIdentityVerified, false);
});

test('C2 treats model self-report, missing Host evidence, and another run as unknown', () => {
  for (const input of [
    { runId: 'run-1', configured, selfReport: { model: configured.model, effort: 'high' } },
    { runId: 'run-1', configured, hostEvidence: { ...hostEvidence, runId: 'run-2' } },
    { runId: 'run-1', configured, hostEvidence: { ...hostEvidence, trusted: false } },
  ]) {
    const result = matchModelEvidence(input);
    assert.equal(result.verification, 'unknown');
  }
  assert.equal(matchModelEvidence(null).verification, 'unknown');
});

test('C3 compares the actual passed configuration exactly, including aliases and effort', () => {
  const alias = matchModelEvidence({
    runId: 'run-1',
    configured: { model: 'opencode-go/deepseek-v4.1-flash', effort: 'high' },
    hostEvidence: { ...hostEvidence, model: 'opencode-go/deepseek-flash' },
  });
  const effort = matchModelEvidence({
    runId: 'run-1',
    configured,
    hostEvidence: { ...hostEvidence, effort: 'medium' },
  });
  const heartbeat = matchModelEvidence({
    runId: 'run-1',
    configured: null,
    selfReport: { model: 'opencode-go/deepseek-v4.1-flash', effort: 'high' },
  });
  assert.equal(alias.verification, 'mismatch');
  assert.equal(alias.reason, 'model-mismatch');
  assert.equal(effort.verification, 'mismatch');
  assert.equal(effort.reason, 'effort-mismatch');
  assert.equal(heartbeat.verification, 'unknown');
  assert.equal(heartbeat.reason, 'unresolved-carrier');
});

test('C1 stops admission at the shared deadline and records cooperative overrun', () => {
  const before = evaluateRunBudget({
    startedAt: '2026-09-21T01:00:00.000Z',
    now: '2026-09-21T01:44:59.999Z',
    attemptedIssueIds: ['SUP-15'],
  });
  const atDeadline = evaluateRunBudget({
    startedAt: '2026-09-21T01:00:00.000Z',
    now: '2026-09-21T01:45:00.000Z',
    attemptedIssueIds: ['SUP-15'],
  });
  const overrun = evaluateRunBudget({
    startedAt: '2026-09-21T01:00:00.000Z',
    now: '2026-09-21T01:46:05.000Z',
    finishedAt: '2026-09-21T01:46:05.000Z',
    attemptedIssueIds: ['SUP-15'],
  });
  const missing = evaluateRunBudget({ attemptedIssueIds: [] });
  assert.equal(before.admit, true);
  assert.equal(atDeadline.reason, 'time-budget');
  assert.equal(atDeadline.admit, false);
  assert.equal(overrun.overrunMs, 65_000);
  assert.equal(overrun.overrunReason, 'finished-after-deadline');
  assert.equal(missing.reason, 'missing-budget');
});

test('recovery selects across scopes with one attempted ledger and reports invalid coverage', () => {
  const result = selectAcrossScopes({
    startedAt: '2026-09-21T01:00:00.000Z',
    now: '2026-09-21T01:01:00.000Z',
    attemptedIssueIds: ['already-attempted'],
    scopes: [
      { context, candidates: [candidate('SUP-47', { priority: 2 })] },
      { context: { ...context, project: 'other' }, candidates: null },
      { context, candidates: [candidate('already-attempted')] },
    ],
  });
  assert.equal(result.selected.id, 'SUP-47');
  assert.equal(result.selected.uuid, 'SUP-47-uuid');
  assert.equal(result.attemptedIssueIds.includes('already-attempted'), true);
  assert.equal(result.coverage.some(item => item.status === 'unknown'), true);
  assert.equal(result.scopes.some(item => item.skipped.some(skip => skip.reason === 'already-attempted')), true);
});

test('claim failure prevents execution and does not turn a failed claim into work', () => {
  assert.deepEqual(planExecutionAfterClaim({ issueId: 'SUP-47', claim: { ok: false, error: 'conflict' } }), {
    execute: false,
    reason: 'claim-failed',
  });
  assert.deepEqual(planExecutionAfterClaim({ issueId: 'SUP-47', claim: { ok: true, issueId: 'SUP-48' } }), {
    execute: false,
    reason: 'claim-identity-mismatch',
  });
  assert.deepEqual(planExecutionAfterClaim({ issueId: 'SUP-47', claim: { ok: true, issueId: 'SUP-47' } }), {
    execute: true,
    reason: 'claimed',
    issueId: 'SUP-47',
  });
  assert.equal(planExecutionAfterClaim(null).execute, false);
});

test('promotion is label-independent, blocks unknown dependencies, and recovers after partial failure', () => {
  const plan = planSuccessorPromotion({
    successor: candidate('SUP-48', { labels: ['swf-managed'], state: 'planned', mapped: true }),
    prerequisites: [{ id: 'SUP-47', state: 'done' }],
    authorized: true,
    readiness: true,
  });
  const unknown = planSuccessorPromotion({
    successor: candidate('SUP-49', { labels: ['swf-managed'], state: 'planned', mapped: true }),
    prerequisites: [{ id: 'SUP-47', state: 'unknown' }],
    authorized: true,
    readiness: true,
  });
  const observed = { ...plan.desired, state: 'ready' };
  const failed = reconcilePromotion(plan, { ok: false, error: 'readback-unavailable' });
  const recovered = reconcilePromotion(plan, { ok: false, observed });
  const wrongIdentity = reconcilePromotion(plan, {
    ok: true,
    observed: { ...observed, id: 'SUP-49' },
  });
  assert.equal(plan.action, 'promote');
  assert.deepEqual(plan.desired.labels, ['swf-managed', 'agent-ready', 'nightly']);
  assert.equal(unknown.action, 'skip');
  assert.equal(unknown.reason, 'unmet-dependencies');
  assert.equal(failed.status, 'sync-pending');
  assert.equal(failed.retry, true);
  assert.equal(recovered.status, 'no-op');
  assert.equal(recovered.retry, false);
  assert.equal(wrongIdentity.status, 'readback-mismatch');
});

test('promotion repairs missing labels, requires explicit mapping, and excludes attention states', () => {
  const repair = planSuccessorPromotion({
    successor: candidate('SUP-50', { labels: ['swf-managed'], state: 'ready', mapped: true }),
    prerequisites: [], authorized: true, readiness: true,
  });
  const implicitMapping = planSuccessorPromotion({
    successor: candidate('SUP-51', { state: 'planned' }),
    prerequisites: [], authorized: true, readiness: true,
  });
  const verifiedMapping = planSuccessorPromotion({
    successor: candidate('SUP-52', { state: 'planned', mappingVerified: true }),
    prerequisites: [], authorized: true, readiness: true,
  });
  const excluded = ['done', 'running', 'review', 'blocked', 'failed', 'waiting_human', 'canceled']
    .map((state, index) => planSuccessorPromotion({
      successor: candidate(`SUP-5${3 + index}`, { state, mapped: true }),
      prerequisites: [], authorized: true, readiness: true,
    }));
  const excludedLabels = ['blocked', 'waiting-human', 'ready-review', 'agent-running', 'agent-failed']
    .map((label, index) => planSuccessorPromotion({
      successor: candidate(`SUP-6${index}`, { mapped: true, labels: ['swf-managed', label] }),
      prerequisites: [], authorized: true, readiness: true,
    }));
  assert.equal(repair.action, 'promote');
  assert.equal(implicitMapping.reason, 'unmapped-successor');
  assert.equal(verifiedMapping.action, 'promote');
  assert.ok(excluded.every(result => result.reason === 'excluded-state'));
  assert.ok(excludedLabels.every(result => result.reason === 'excluded-label'));
});

test('unreadable promotion labels and conflicting mapping never permit promotion', () => {
  const input = { successor: candidate('SUP-48', { state: 'planned', mapped: true, labels: null }), prerequisites: [], authorized: true, readiness: true };
  assert.equal(planSuccessorPromotion(input).action, 'skip');
  assert.equal(planSuccessorPromotion({ ...input, successor: candidate('SUP-48', { mapped: false, mappingVerified: true }) }).action, 'skip');
});

test('promotion readback with new running ownership is not successful recovery', () => {
  const plan = planSuccessorPromotion({ successor: candidate('SUP-48', { state: 'planned', mapped: true }), prerequisites: [], authorized: true, readiness: true });
  assert.equal(reconcilePromotion(plan, { ok: true, observed: { ...plan.desired, labels: [...plan.desired.labels, 'agent-running'] } }).retry, true);
});

test('a finish timestamp beyond observation time cannot reopen admission', () => {
  assert.equal(evaluateRunBudget({ startedAt: '2026-09-21T01:00:00Z', now: '2026-09-21T01:44:00Z', finishedAt: '2026-09-21T01:46:00Z', attemptedIssueIds: [] }).admit, false);
});
