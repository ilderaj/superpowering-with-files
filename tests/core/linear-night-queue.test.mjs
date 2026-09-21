import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { selectNightIssue } from '../../harness/core/skills/linear-work-control/lib/night-queue.mjs';

const context = { workspace: 'swf', team: 'SUP', project: 'workbench' };
const issue = (id, overrides = {}) => ({
  id, ...context, state: 'ready', labels: ['swf-managed', 'agent-ready', 'nightly'],
  authorized: true, readiness: true, blockedBy: [], priority: 2,
  updatedAt: '2026-09-19T00:00:00Z', ...overrides
});
const snapshot = (overrides = {}) => ({
  startedAt: '2026-09-19T01:00:00Z', now: '2026-09-19T01:01:00Z',
  attemptedIssueIds: [], context, candidates: [issue('A')], ...overrides
});
const cli = (input, args = []) => spawnSync(process.execPath, ['harness/core/skills/linear-work-control/scripts/night-queue.mjs', ...args], {
  cwd: new URL('../..', import.meta.url), input, encoding: 'utf8'
});

test('priority 1..4 precedes 0; oldest update then codepoint ID breaks ties without mutation', () => {
  const candidates = [issue('none', { priority: 0 }), issue('low', { priority: 4 }),
    issue('normal', { priority: 3 }), issue('high'), issue('Z', { priority: 1 }),
    issue('A', { priority: 1 }), issue('new', { priority: 1, updatedAt: '2026-09-19T00:01:00Z' })];
  const input = snapshot({ candidates });
  const original = structuredClone(input);
  const order = [];
  while (input.candidates.length) {
    const result = selectNightIssue(input);
    assert.equal(result.ok, true);
    order.push(result.nextIssueId);
    input.candidates = input.candidates.filter(c => c.id !== result.nextIssueId);
  }
  assert.deepEqual(order, ['A', 'Z', 'new', 'high', 'normal', 'low', 'none']);
  assert.deepEqual(candidates, original.candidates);
});

test('ineligible items cannot block independent eligible work', () => {
  const excluded = [
    ...['blocked', 'waiting_human', 'review', 'running', 'done', 'failed', 'planned', 'canceled'].map(state => ({ state })),
    ...['blocked', 'waiting-human', 'ready-review', 'agent-running', 'agent-failed'].map(label => ({ labels: [...issue('x').labels, label] })),
    { authorized: false }, { readiness: false }, { blockedBy: [{ id: 'dep', state: 'unknown' }] }, { blockedBy: [{ id: 'dep', state: 'review' }] }, { workspace: 'other' },
    { team: 'other' }, { project: 'other' }, { labels: ['agent-ready', 'nightly'] },
    { labels: ['swf-managed', 'nightly'] }, { labels: ['swf-managed', 'agent-ready'] }
  ].map((overrides, i) => issue(`skip-${i}`, { ...overrides, priority: 1 }));
  const result = selectNightIssue(snapshot({ candidates: [...excluded, issue('attempted'), issue('eligible')], attemptedIssueIds: ['attempted'] }));
  assert.equal(result.nextIssueId, 'eligible');
  assert.equal(result.skipped.length, excluded.length + 1);
  assert.deepEqual(result.remainingIssueIds, []);
});

test('shared history allows three attempts across calls, counting failures too', () => {
  const input = snapshot({ candidates: ['A', 'B', 'C', 'D'].map(id => issue(id)) });
  for (const id of ['A', 'B', 'C']) {
    const result = selectNightIssue(input);
    assert.equal(result.nextIssueId, id);
    input.attemptedIssueIds.push(id);
  }
  const result = selectNightIssue(input);
  assert.equal(result.nextIssueId, null);
  assert.equal(result.reason, 'attempt-budget');
  assert.deepEqual(result.remainingIssueIds, ['D']);
});

test('45-minute shared deadline is inclusive and preserves remaining queue', () => {
  assert.equal(selectNightIssue(snapshot({ now: '2026-09-19T01:44:59.999Z' })).nextIssueId, 'A');
  for (const now of ['2026-09-19T01:45:00Z', '2026-09-19T02:00:00Z']) {
    const result = selectNightIssue(snapshot({ now }));
    assert.equal(result.reason, 'time-budget');
    assert.equal(result.nextIssueId, null);
    assert.deepEqual(result.remainingIssueIds, ['A']);
  }
});

test('empty and entirely blocked queues return no eligible issue', () => {
  for (const candidates of [[], [issue('A', { blockedBy: [{ id: 'dep', state: 'review' }] })]]) {
    assert.equal(selectNightIssue(snapshot({ candidates })).reason, 'no-eligible-issue');
  }
});

test('invalid inputs and ambiguous clocks fail closed for the whole snapshot', () => {
  const bad = [null, [], {}, snapshot({ now: 'yesterday' }), snapshot({ now: 0 }),
    snapshot({ now: '2026-09-19T01:01:00' }), snapshot({ now: '2026-02-30T01:01:00Z' }),
    snapshot({ now: '2026-09-19T00:59:59Z' }), snapshot({ startedAt: null }),
    snapshot({ attemptedIssueIds: ['A', 'A'] }), snapshot({ attemptedIssueIds: [null] }),
    snapshot({ context: { ...context, project: '' } }), snapshot({ candidates: null }),
    snapshot({ candidates: [issue('A'), issue('A')] })];
  for (const overrides of [{ priority: -1 }, { priority: 5 }, { priority: '1' },
    { priority: 1.5 }, { updatedAt: 'bad' }, { updatedAt: '2026-09-20T00:00:00Z' },
    { authorized: 'true' }, { blockedBy: undefined }, { readiness: undefined }, { readiness: 'true' }, { blockedBy: [{}] }, { labels: null },
    { state: 'unknown' }, { team: undefined }, { id: '' }]) {
    bad.push(snapshot({ candidates: [issue('good'), issue('bad', overrides)] }));
  }
  for (const input of bad) {
    const result = selectNightIssue(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.equal(result.nextIssueId, null);
    assert.equal(result.reason, 'invalid-input');
  }
});

test('CLI reads stdin JSON, emits selection JSON, and documents caller-owned history', () => {
  const result = cli(JSON.stringify(snapshot()));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).nextIssueId, 'A');
  const help = cli('', ['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /attemptedIssueIds/);
  assert.match(help.stdout, /45/);
});

test('CLI rejects malformed JSON and invalid arguments without selecting', () => {
  for (const [input, args, status] of [['{', [], 1], ['', [], 1], ['{}', ['--wat'], 2], [JSON.stringify(snapshot({ now: 'bad' })), [], 1]]) {
    const result = cli(input, args);
    assert.equal(result.status, status, result.stderr);
    assert.equal(JSON.parse(result.stdout).nextIssueId, null);
  }
});

test('dependencies require actual done and history counts attempts from other scopes', () => {
  assert.equal(selectNightIssue(snapshot({ candidates: [issue('A', { blockedBy: [{ id: 'dep', state: 'done' }] })] })).nextIssueId, 'A');
  const result = selectNightIssue(snapshot({ attemptedIssueIds: ['other-team', 'failed', 'blocked-at-runtime'] }));
  assert.equal(result.reason, 'attempt-budget');
  assert.equal(result.nextIssueId, null);
});
