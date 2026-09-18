import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CHECKPOINT_SYNC_ORDER,
  EXECUTOR_LABEL,
  MANAGED_LABEL,
  REQUIRED_LABELS,
  RUNTIME_STATES,
  STATE_MAP,
  checkCompletionGate,
  checkWorkspaceGuard,
  describeSyncFailure,
  extractPlanningSections,
  looksLikeCredentialKey,
  mapState,
  openBlockersFromLedger,
  parseHumanCommands,
  normalizeWorkspaceRef,
  renderAttentionSummary,
  renderBlocker,
  renderCheckpoint,
  renderCompletion,
  renderResumeBrief,
  summarizeHumanInput,
  validateBinding
} from '../../harness/core/skills/linear-work-control/lib/linear-work-control.mjs';

const skillRoot = path.join(process.cwd(), 'harness/core/skills/linear-work-control');
const fixture = async (name) => JSON.parse(await readFile(path.join(skillRoot, 'fixtures', name), 'utf8'));

test('linear-work-control ships the files its skill entry links to', async () => {
  for (const relativePath of [
    'SKILL.md',
    'reference.md',
    'templates.md',
    'automation-workflows.md',
    'lib/linear-work-control.mjs',
    'scripts/linear-work-control.mjs'
  ]) {
    await access(path.join(skillRoot, relativePath));
  }
});

test('binding validation accepts a valid enabled and a valid disabled binding', async () => {
  const enabled = await fixture('binding-enabled.json');
  assert.deepEqual(validateBinding(enabled), { ok: true, errors: [], binding: enabled });

  const disabled = await fixture('binding-disabled.json');
  assert.equal(validateBinding(disabled).ok, true);
});

test('binding validation rejects credentials, unknown keys, non-slug workspaces, and non-canonical states', async () => {
  const secret = validateBinding(await fixture('binding-secret.json'));
  assert.equal(secret.ok, false);
  assert.ok(
    secret.errors.some((error) => error.includes('must not store credentials: sync.apiKey')),
    'an API key shaped field must be rejected wherever it appears'
  );

  const unknownKey = validateBinding(await fixture('binding-unknown-key.json'));
  assert.equal(unknownKey.ok, false);
  assert.ok(unknownKey.errors.includes('unknown binding key: dashboardUrl'));

  const notBare = validateBinding(await fixture('binding-not-bare-workspace.json'));
  assert.equal(notBare.ok, false);
  assert.ok(notBare.errors.some((error) => error.includes('bare workspace slug')));

  const badState = validateBinding(await fixture('binding-bad-state.json'));
  assert.equal(badState.ok, false);
  assert.ok(badState.errors.some((error) => error.includes('state is not a canonical state: in_progress')));
});

test('workspace guard denies writes to any workspace other than the bound one', async () => {
  const binding = await fixture('binding-enabled.json');

  const mismatch = checkWorkspaceGuard({ binding, observedWorkspace: 'loffi' });
  assert.equal(mismatch.allowed, false);
  assert.equal(mismatch.code, 'workspace-mismatch');
  assert.match(mismatch.reason, /write denied/);

  const match = checkWorkspaceGuard({ binding, observedWorkspace: 'https://linear.app/superpoweringwithfiles/' });
  assert.equal(match.allowed, true);
  assert.equal(match.code, 'ok');

  const unknown = checkWorkspaceGuard({ binding, observedWorkspace: '' });
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.code, 'workspace-unknown');

  const disabled = checkWorkspaceGuard({ binding: { enabled: false, workspace: { name: 'superpoweringwithfiles' } }, observedWorkspace: 'superpoweringwithfiles' });
  assert.equal(disabled.allowed, false);
  assert.equal(disabled.code, 'binding-disabled');

  const invalid = checkWorkspaceGuard({ binding: { enabled: true, workspace: {} }, observedWorkspace: 'superpoweringwithfiles' });
  assert.equal(invalid.allowed, false);
  assert.equal(invalid.code, 'binding-invalid');
});

test('workspace references normalize a URL or trailing slash but never fold case', () => {
  assert.equal(normalizeWorkspaceRef(' https://linear.app/superpoweringwithfiles/ '), 'superpoweringwithfiles');
  assert.equal(normalizeWorkspaceRef('superpoweringwithfiles'), 'superpoweringwithfiles');
  assert.equal(normalizeWorkspaceRef('SuperpoweringWithFiles'), 'SuperpoweringWithFiles');
  assert.equal(normalizeWorkspaceRef(''), '');
});

test('every canonical runtime state maps onto a stock Linear status plus semantic labels', () => {
  const expected = {
    planned: ['Backlog', []],
    ready: ['Todo', ['agent-ready']],
    running: ['In Progress', ['agent-running']],
    waiting_human: ['In Progress', ['waiting-human']],
    blocked: ['In Progress', ['blocked']],
    review: ['In Progress', ['ready-review']],
    failed: ['In Progress', ['agent-failed']],
    done: ['Done', []],
    canceled: ['Canceled', []]
  };

  assert.deepEqual(RUNTIME_STATES.slice().sort(), Object.keys(expected).sort());
  assert.deepEqual(Object.keys(STATE_MAP).sort(), Object.keys(expected).sort());

  for (const [state, [status, labels]] of Object.entries(expected)) {
    const mapped = mapState(state);
    assert.equal(mapped.ok, true, state);
    assert.equal(mapped.status, status, state);
    assert.deepEqual(mapped.semanticLabels, labels, state);
    assert.deepEqual(mapped.managedLabels.slice(0, 2), [MANAGED_LABEL, EXECUTOR_LABEL], state);
    assert.equal(mapped.humanActionRequired, state === 'waiting_human' || state === 'blocked', state);
    assert.equal(mapped.issueIsOpen, state !== 'done' && state !== 'canceled', state);
  }

  const unknown = mapState('in_progress');
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /unknown runtime state/);

  assert.deepEqual(REQUIRED_LABELS.slice(0, 2), [MANAGED_LABEL, EXECUTOR_LABEL]);
  assert.ok(REQUIRED_LABELS.includes('nightly'));
});

test('the checkpoint renderer answers every question a human needs and names the Linear projection', async () => {
  const rendered = renderCheckpoint(await fixture('checkpoint.json'));

  for (const field of [
    '- **State:**',
    '- **Progress:**',
    '- **Completed just now:**',
    '- **Happening now:**',
    '- **Next:**',
    '- **Human action required:**',
    '- **Latest validation:**'
  ]) {
    assert.ok(rendered.includes(field), 'missing ' + field);
  }
  assert.match(rendered, /\`running\` -> Linear \`In Progress\` \+ \`agent-running\`/);
  assert.match(rendered, /<!-- swf:checkpoint task=swf-linear-control-plane-mvp-20260917 at=2026-09-17 21:20:00 UTC\+8 -->/);
  assert.ok(rendered.length < 1200, 'a checkpoint must stay scannable');
});

test('the blocker renderer publishes an answerable question with the command forms', async () => {
  const rendered = renderBlocker(await fixture('blocker.json'));

  for (const field of ['**Context:**', '**Question:**', '**Options:**', '**Impact if unanswered:**', '**Resume condition:**']) {
    assert.ok(rendered.includes(field), 'missing ' + field);
  }
  for (const command of ['DECISION:', 'PAUSE', 'RESUME', 'CANCEL', 'REPLAN:', 'PRIORITY:']) {
    assert.ok(rendered.includes(command), 'missing command ' + command);
  }
  assert.match(rendered, /<!-- swf:blocker task=swf-linear-control-plane-mvp-20260917/);
});

test('the blocker renderer refuses malformed options instead of publishing placeholder text', () => {
  const base = { taskId: 'x', question: 'Proceed?', timestamp: 't' };

  assert.throws(() => renderBlocker({ ...base, options: ['Re-authenticate'] }), /must be an object with a non-empty label/);
  assert.throws(() => renderBlocker({ ...base, options: [{ detail: 'no label' }] }), /must be an object with a non-empty label/);
  assert.throws(() => renderBlocker({ ...base, options: { label: 'not an array' } }), /must be an array/);

  const rendered = renderBlocker({ ...base, options: [{ label: 'Re-authenticate', detail: 'then it runs unchanged' }] });
  assert.ok(rendered.includes('1. Re-authenticate - then it runs unchanged'), rendered);
  assert.ok(!rendered.includes('option -'), 'a published blocker must never carry the placeholder option line');

  const bare = renderBlocker({ ...base, options: [{ label: 'Proceed' }] });
  assert.ok(bare.includes('1. Proceed'), bare);
});

test('completion is gated on validation, done-when conditions, and unresolved blockers', () => {
  const blocked = checkCompletionGate({ validationState: 'passed', doneWhenSatisfied: true, unresolvedBlockers: 1 });
  assert.equal(blocked.canMarkDone, false);
  assert.equal(blocked.state, 'review');
  assert.match(blocked.reasons.join(' '), /blocking condition/);

  const unvalidated = checkCompletionGate({ validationState: 'partial', doneWhenSatisfied: true });
  assert.equal(unvalidated.canMarkDone, false);
  assert.match(unvalidated.reasons.join(' '), /not "passed"/);

  const notDoneWhen = checkCompletionGate({ validationState: 'passed' });
  assert.equal(notDoneWhen.canMarkDone, false);
  assert.match(notDoneWhen.reasons.join(' '), /done when/);

  const allowed = checkCompletionGate({ validationState: 'passed', doneWhenSatisfied: true });
  assert.deepEqual(allowed.canMarkDone, true);
  assert.equal(allowed.state, 'done');
});

test('completion and summary renderers keep artifacts and the human buckets visible', async () => {
  const completed = renderCompletion(await fixture('completion.json'));
  for (const field of ['- **What changed:**', '- **Validation:**', '- **Artifacts:**', '- **Remaining follow-ups:**']) {
    assert.ok(completed.includes(field), 'missing ' + field);
  }
  assert.match(completed, /<!-- swf:completion task=/);

  const summary = renderAttentionSummary({
    heading: 'Overnight summary',
    buckets: { needsDecision: ['SWF-2 - choose option A or B'], failed: ['SWF-3 - test runner missing'] },
    timestamp: '2026-09-18 07:00:00 UTC+8'
  });
  for (const title of ['Completed:', 'Ready for review:', 'Needs a decision:', 'Failed:', 'Still running:', 'Skipped:', 'Next work:']) {
    assert.ok(summary.includes(title), 'missing bucket ' + title);
  }
  assert.ok(summary.includes('SWF-2 - choose option A or B'));
  assert.match(summary, /<!-- swf:summary task=summary/);
});

test('the sync order keeps local durable state first and the Linear publish last', () => {
  assert.equal(CHECKPOINT_SYNC_ORDER.length, 6);
  assert.match(CHECKPOINT_SYNC_ORDER[0], /local/);
  assert.match(CHECKPOINT_SYNC_ORDER[CHECKPOINT_SYNC_ORDER.length - 1], /Linear/);
});

test('a failed Linear publish never invalidates local state and stays retryable', () => {
  const afterLocalWrite = describeSyncFailure({ error: 'network unavailable' });
  assert.equal(afterLocalWrite.localStateValid, true);
  assert.equal(afterLocalWrite.retryable, true);
  assert.equal(afterLocalWrite.localStateMustNotBeRolledBack, true);
  assert.match(afterLocalWrite.message, /local durable state stands/);

  const beforeLocalWrite = describeSyncFailure({ error: 'network unavailable', localStateWritten: false });
  assert.equal(beforeLocalWrite.localStateValid, false);
  assert.match(beforeLocalWrite.message, /write local state first/);
});

test('planning sections are extracted so a restarted session can rebuild the picture', () => {
  const markdown = [
    '# Task Plan: example',
    '',
    '## Goal',
    'Ship the thing.',
    '',
    '## Current State',
    'Status: active',
    'Archive Eligible: no',
    'Reconcile: open',
    '',
    '## Current Phase',
    'Phase 2',
    '',
    '## Recovery Notes',
    'Resume at Phase 2 after the workspace check.',
    ''
  ].join('\n');

  const sections = extractPlanningSections(markdown);
  assert.equal(sections.goal, 'Ship the thing.');
  assert.match(sections.currentState, /Status: active/);
  assert.equal(sections.currentPhase, 'Phase 2');
  assert.match(sections.recoveryNotes, /Resume at Phase 2/);

  const empty = extractPlanningSections('');
  assert.equal(empty.goal, null);
  assert.equal(empty.currentPhase, null);
});

test('the resume brief reconstructs state, mapping, checkpoint, and blocker from files alone', () => {
  const brief = renderResumeBrief({
    taskDirLabel: 'planning/active/example',
    bindingValidation: { ok: true, errors: [] },
    guard: { allowed: false, code: 'workspace-mismatch', reason: 'authenticated workspace is "wrong"' },
    sections: {
      goal: 'Ship the thing.',
      currentState: 'Status: active',
      currentPhase: 'Phase 2',
      recoveryNotes: 'Resume at Phase 2.'
    },
    taskMap: { 'task-a': { identifier: 'SWF-2', state: 'waiting_human' } },
    pendingCheckpoint: true,
    pendingBlocker: true,
    timestamp: '2026-09-18 07:00:00 UTC+8'
  });

  assert.match(brief, /\*\*Binding:\*\* valid/);
  assert.match(brief, /\*\*Workspace guard:\*\* DENY workspace-mismatch/);
  assert.match(brief, /task-a -> SWF-2 \(waiting_human\)/);
  assert.match(brief, /\*\*Pending checkpoint ready to publish:\*\* yes/);
  assert.match(brief, /\*\*Open blocker:\*\* yes/);
  assert.match(brief, /Resume at Phase 2\./);
  assert.match(brief, /<!-- swf:resume-brief task=planning\/active\/example at=2026-09-18 07:00:00 UTC\+8 -->/);

  const unbound = renderResumeBrief({ taskDirLabel: 'planning/active/plain', timestamp: 't' });
  assert.match(unbound, /none found; treat this task as local-only/);
  assert.match(unbound, /\*\*Linear tasks:\*\* none mapped yet/);
});

test('a published blocker stays open in the ledger until its state is closed', () => {
  const ledger = [
    'Prose that does not quote the marker token is ignored.',
    '<!-- swf:blocker-state id=B1 state=resolved -->',
    '<!-- swf:blocker-state id=B2 state=waiting_human -->',
    '<!-- swf:blocker-state id=B3 state=blocked -->',
    '<!-- swf:blocker-state id=B4 -->',
    '- <!-- swf:blocker-state id=B5 state=blocked -->',
    '1. <!-- swf:blocker-state id=B6 state=blocked -->',
    '- [ ] <!-- swf:blocker-state id=B7 state=resolved -->',
    '**<!-- swf:blocker-state id=B8 state=waiting_human -->**',
    '> - <!-- swf:blocker-state id=B9 state=blocked -->',
    '-<!-- swf:blocker-state id=B11 state=blocked -->',
    'Marker: <!-- swf:blocker-state id=B10 state=open -->'
  ].join('\n');

  assert.deepEqual(
    openBlockersFromLedger(ledger).map((entry) => entry.id),
    ['B2', 'B3', 'unknown', 'B5', 'B6', 'B8', 'B9', 'B11', 'unknown'],
    'list, ordered-list, checkbox, emphasis, and blockquote decorations parse; malformed markers and quoted tokens fail closed'
  );
  assert.deepEqual(openBlockersFromLedger('the ledger holds one open blocker'), []);
  assert.deepEqual(openBlockersFromLedger(''), []);

  const brief = renderResumeBrief({
    taskDirLabel: 'planning/active/example',
    bindingValidation: { ok: true, errors: [] },
    sections: {},
    pendingBlocker: false,
    openBlockerCount: 1,
    timestamp: 't'
  });
  assert.match(brief, /\*\*Open blocker:\*\* yes \(1 open in the local ledger\)/);
  assert.doesNotMatch(brief, /\*\*Open blocker:\*\* none/);
});

test('a marker lookalike spelling is counted as an unreadable open blocker, never dropped', () => {
  // Every spelling below is what a hand edit or a paste actually produces; each
  // one must count as an unreadable open blocker rather than disappear.
  const spellings = [
    '<!-- SWF:BLOCKER-STATE id=B1 state=resolved -->',
    '<!-- swf:\u200bblocker-state id=B2 state=blocked -->',
    '<!-- swf:blocker-state\uff1aid=B3 state=waiting_human -->',
    '<!-- swf:bl\u043ecker-state id=B4 state=blocked -->',
    '<!-- swf:blocker\u00ad-state id=B5 state=resolved -->',
    '<!-- swf:blocker\u2013state id=B6 state=blocked -->',
    '<!-- swf: blocker-state id=B7 state=open -->',
    '<!-- swf\u00a0:blocker-state id=B8 state=open -->',
    '<!-- swf:blocker-\tstate id=B9 state=open -->',
    '<!-- swf:bl\u043e\u0441ker-st\u0430te id=B10 state=open -->',
    '<!-- swf:blocker-'
  ];
  for (const line of spellings) {
    assert.deepEqual(openBlockersFromLedger(line), [{ id: 'unknown', state: 'unreadable' }], line);
  }

  assert.deepEqual(
    openBlockersFromLedger('state id=B11 state=open -->'),
    [],
    'the tail of a line-broken marker is not a marker on its own'
  );
});

test('human commands are parsed deterministically and prose is never treated as a decision', () => {
  const parsed = parseHumanCommands('Looks good overall.\n**DECISION:** B\n- PRIORITY: high\n');
  const summary = summarizeHumanInput(parsed);
  assert.equal(parsed.recognized, true);
  assert.deepEqual(parsed.decisions, ['B']);
  assert.deepEqual(parsed.priorities, ['high']);
  assert.deepEqual(parsed.unrecognized, ['Looks good overall.']);
  assert.equal(summary.actionable, true);
  assert.equal(summary.decision, 'B');
  assert.equal(summary.resumeConditionMet, true);

  const proseOnly = summarizeHumanInput(parseHumanCommands('this is fine, keep going'));
  assert.equal(proseOnly.actionable, false);
  assert.equal(proseOnly.resumeConditionMet, false);
  assert.match(proseOnly.message, /no recognized human command/);

  const paused = summarizeHumanInput(parseHumanCommands('PAUSE'));
  assert.equal(paused.actionable, true);
  assert.equal(paused.resumeAllowed, false);
  assert.equal(paused.resumeConditionMet, false);

  const resumed = summarizeHumanInput(parseHumanCommands('PAUSE\nRESUME'));
  assert.equal(resumed.resumeAllowed, true);
  assert.equal(resumed.resumeConditionMet, true);

  const canceled = summarizeHumanInput(parseHumanCommands('CANCEL'));
  assert.equal(canceled.resumeAllowed, false);

  const replan = summarizeHumanInput(parseHumanCommands('REPLAN: reduce scope to the local protocol'));
  assert.equal(replan.actionable, true);
  assert.equal(replan.resumeConditionMet, true);
  assert.match(replan.replan, /reduce scope/);

  const empty = summarizeHumanInput(parseHumanCommands(''));
  assert.equal(empty.actionable, false);
  assert.deepEqual(parseHumanCommands(null).control, []);
});

const CLI_PATH = path.join(skillRoot, 'scripts', 'linear-work-control.mjs');

function runCli(args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], { cwd: process.cwd() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input === undefined ? '' : input);
  });
}

test('credential-shaped keys are rejected in any spelling and no documented key is a false positive', () => {
  for (const key of ['apiToken', 'api_token', 'linearApiKey', 'LINEAR_API_KEY', 'authToken', 'bearerToken', 'secretKey', 'refresh_token', 'client_secret', 'privateKey', 'jwt', 'cookie', 'sessionId', 'webhookSecret', 'secureToken', 'passphrase']) {
    assert.equal(looksLikeCredentialKey(key), true, key);
  }
  for (const key of ['schemaVersion', 'enabled', 'workspace', 'name', 'url', 'team', 'project', 'goalIssue', 'statusComment', 'executor', 'taskMap', 'sync', 'id', 'identifier', 'state', 'issueId', 'commentId', 'label', 'title', 'updatedAt', 'lastCheckpointAt', 'lastResult', 'lastError', 'pendingRetry']) {
    assert.equal(looksLikeCredentialKey(key), false, key);
  }

  const nested = validateBinding({
    schemaVersion: 1,
    enabled: true,
    workspace: { name: 'superpoweringwithfiles' },
    sync: { apiToken: 'placeholder-value' }
  });
  assert.equal(nested.ok, false);
  assert.match(nested.errors.join('\n'), /must not store credentials: sync\.apiToken/);
  assert.equal(JSON.stringify(nested).includes('placeholder-value'), false);
});

test('the guard refuses to allow a write on any binding that fails validation', async () => {
  const observed = 'superpoweringwithfiles';
  const rejected = [
    { schemaVersion: 2, enabled: true, workspace: { name: observed } },
    { schemaVersion: 1, enabled: true, workspace: { name: observed }, dashboardUrl: 'https://example.test' },
    { schemaVersion: 1, enabled: true, workspace: { name: observed }, executor: 'executor:other' },
    { schemaVersion: 1, enabled: true, workspace: { name: observed }, taskMap: { 'task-1': { issueId: 'abc', state: 'in_progress' } } }
  ];
  for (const binding of rejected) {
    const result = checkWorkspaceGuard({ binding, observedWorkspace: observed });
    assert.equal(result.allowed, false, JSON.stringify(binding));
    assert.equal(result.code, 'binding-invalid', JSON.stringify(binding));
  }

  const notBare = await fixture('binding-not-bare-workspace.json');
  assert.equal(checkWorkspaceGuard({ binding: notBare, observedWorkspace: observed }).code, 'binding-invalid');

  const valid = await fixture('binding-enabled.json');
  assert.equal(checkWorkspaceGuard({ binding: valid, observedWorkspace: observed }).allowed, true);
});

test('the workspace comparison stays exact so a lookalike workspace cannot pass the guard', async () => {
  const binding = await fixture('binding-enabled.json');
  for (const observed of ['www.superpoweringwithfiles', 'SuperpoweringWithFiles', 'superpoweringwithfiles-evil', 'https://linear.app/loffi']) {
    const result = checkWorkspaceGuard({ binding, observedWorkspace: observed });
    assert.equal(result.allowed, false, observed);
    assert.equal(result.code, 'workspace-mismatch', observed);
  }
});

test('the completion gate fails closed on wrong types and on keys it does not read', () => {
  assert.equal(checkCompletionGate({ validationState: 'passed', doneWhenSatisfied: true, unresolvedBlockers: 0 }).canMarkDone, true);

  for (const input of [
    { validationState: 'passed', doneWhenSatisfied: 'false' },
    { validationState: 'passed', doneWhenSatisfied: true, unresolvedBlockers: 'two' },
    { validationState: 'passed', doneWhenSatisfied: true, unresolvedBlockers: '2 blockers remain' },
    { validationState: 'passed', doneWhenSatisfied: true, unresolvedBlockers: -1 },
    { validationState: 'passed', doneWhenSatisfied: true, blockers: ['waiting on a human decision'] },
    { validationState: 'passed', doneWhenSatisfied: true, unresolvedBlockers: 1 },
    { validationState: 'not_run', doneWhenSatisfied: true, unresolvedBlockers: 0 },
    { validationState: 'passed', doneWhenSatisfied: false, unresolvedBlockers: 0 }
  ]) {
    const result = checkCompletionGate(input);
    assert.equal(result.canMarkDone, false, JSON.stringify(input));
    assert.equal(result.state, 'review', JSON.stringify(input));
    assert.ok(result.reasons.length > 0, JSON.stringify(input));
  }

  assert.equal(checkCompletionGate(null).canMarkDone, false);
});

test('an empty human command is not an answer', () => {
  for (const text of ['DECISION:', 'REPLAN:', 'PRIORITY:']) {
    const summary = summarizeHumanInput(parseHumanCommands(text));
    assert.equal(summary.actionable, false, text);
    assert.equal(summary.resumeConditionMet, false, text);
  }
});

test('quoting the published template back is not an answer', () => {
  // These are the literal forms printed inside every published blocker.
  for (const text of [
    'DECISION: <option or free-form answer>',
    'REPLAN: <new scope or constraint>',
    'PRIORITY: <urgent|high|normal|low>'
  ]) {
    const summary = summarizeHumanInput(parseHumanCommands(text));
    assert.equal(summary.actionable, false, 'placeholder must not be actionable: ' + text);
    assert.equal(summary.resumeConditionMet, false, 'placeholder must not open the gate: ' + text);
  }

  const fenced = summarizeHumanInput(parseHumanCommands('```\nDECISION: B\n```'));
  assert.equal(fenced.actionable, false, 'a fenced quote is an example, not a decision');

  const noise = summarizeHumanInput(parseHumanCommands('PRIORITY: whenever'));
  assert.equal(noise.actionable, false, 'an unparseable priority is not a recognized command');

  const real = summarizeHumanInput(parseHumanCommands('DECISION: option 2, keep them paused'));
  assert.equal(real.actionable, true);
  assert.equal(real.resumeConditionMet, true);
});

test('the CLI turns the guard, the completion gate, and human input into exit codes a wrapper can trust', async () => {
  const binding = path.join(skillRoot, 'fixtures', 'binding-enabled.json');

  const allowed = await runCli(['guard', '--binding', binding, '--observed-workspace', 'superpoweringwithfiles']);
  assert.equal(allowed.code, 0);
  assert.ok(allowed.stdout.startsWith('ALLOW ok:'), allowed.stdout);

  const mismatched = await runCli(['guard', '--binding', binding, '--observed-workspace', 'loffi']);
  assert.equal(mismatched.code, 1);
  assert.ok(mismatched.stdout.startsWith('DENY workspace-mismatch:'), mismatched.stdout);

  const unknown = await runCli(['guard', '--binding', binding]);
  assert.equal(unknown.code, 1);
  assert.ok(unknown.stdout.startsWith('DENY workspace-unknown:'), unknown.stdout);

  const missing = await runCli(['guard', '--binding', path.join(skillRoot, 'fixtures', 'no-such-binding.json')]);
  assert.equal(missing.code, 1);
  assert.ok(missing.stdout.startsWith('DENY binding-invalid: cannot read the binding file'), missing.stdout);
  assert.ok(!missing.stdout.includes('at Object.'), 'an unreadable binding must not print a stack trace');

  const open = await runCli(['completion-gate', '--input', '-'], {
    input: JSON.stringify({ validationState: 'passed', doneWhenSatisfied: true, unresolvedBlockers: 0 })
  });
  assert.equal(open.code, 0);
  assert.ok(open.stdout.startsWith('DONE ALLOWED:'), open.stdout);

  const closed = await runCli(['completion-gate', '--input', '-'], {
    input: JSON.stringify({ validationState: 'passed', doneWhenSatisfied: true, unresolvedBlockers: 2 })
  });
  assert.equal(closed.code, 1);
  assert.ok(closed.stdout.startsWith('DONE BLOCKED:'), closed.stdout);

  const prose = await runCli(['parse-human-input', '-'], { input: 'this looks fine, keep going' });
  assert.equal(prose.code, 1);
  assert.ok(prose.stdout.startsWith('NOT ACTIONABLE:'), prose.stdout);

  const decision = await runCli(['parse-human-input', '-'], { input: 'DECISION: rebind to the connected workspace' });
  assert.equal(decision.code, 0);
  assert.ok(decision.stdout.startsWith('ACTIONABLE: decision: rebind'), decision.stdout);
});

test('the guard answers on stdout for missing, corrupt, directory, and --json bindings', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lwc-guard-'));
  try {
    const corrupt = path.join(dir, 'corrupt.json');
    await writeFile(corrupt, '{ "schemaVersion": 1, ');

    const parsed = await runCli(['guard', '--binding', corrupt, '--observed-workspace', 'superpoweringwithfiles']);
    assert.equal(parsed.code, 1);
    assert.ok(parsed.stdout.startsWith('DENY binding-invalid: cannot parse'), parsed.stdout);
    assert.ok(!parsed.stdout.includes('at Object.'), 'a corrupt binding must not print a stack trace');

    const directory = await runCli(['guard', '--binding', dir, '--observed-workspace', 'superpoweringwithfiles']);
    assert.equal(directory.code, 1);
    assert.ok(directory.stdout.startsWith('DENY binding-invalid: cannot read'), directory.stdout);

    const asJson = await runCli([
      'guard',
      '--binding',
      corrupt,
      '--observed-workspace',
      'superpoweringwithfiles',
      '--json'
    ]);
    assert.equal(asJson.code, 1);
    const payload = JSON.parse(asJson.stdout);
    assert.equal(payload.allowed, false);
    assert.equal(payload.code, 'binding-invalid');
    assert.match(payload.reason, /cannot parse/);

    const jsonMismatch = await runCli([
      'guard',
      '--binding',
      path.join(skillRoot, 'fixtures', 'binding-enabled.json'),
      '--observed-workspace',
      'loffi',
      '--json'
    ]);
    assert.equal(jsonMismatch.code, 1);
    assert.equal(JSON.parse(jsonMismatch.stdout).code, 'workspace-mismatch');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the CLI diagnoses unreadable input instead of throwing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lwc-unreadable-'));
  try {
    const missing = await runCli(['parse-human-input', '--file', path.join(dir, 'no-such-comment.md')]);
    assert.equal(missing.code, 1);
    assert.ok(missing.stderr.includes('error: cannot read'), missing.stderr);
    assert.ok(!missing.stderr.includes('at async'), 'an unreadable comment file must not print a stack trace');

    // A planning file that cannot be read must not take the whole brief down.
    await mkdir(path.join(dir, 'task_plan.md'));
    const brief = await runCli(['resume-brief', '--dir', dir]);
    assert.equal(brief.code, 0);
    assert.ok(brief.stdout.includes('**Goal:** not recorded'), brief.stdout);
    assert.ok(brief.stdout.includes('none found; treat this task as local-only'), brief.stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('usage mistakes and an unreadable binding end in one-line diagnostics', async () => {
  const noDir = await runCli(['resume-brief']);
  assert.equal(noDir.code, 2);
  assert.ok(noDir.stderr.startsWith('error: resume-brief needs --dir'), noDir.stderr);
  assert.ok(noDir.stderr.includes('usage: resume-brief --dir'), noDir.stderr);
  assert.ok(!noDir.stderr.includes('at async'), 'a usage mistake must not print a stack trace');

  const noKind = await runCli(['render', '--input', path.join(skillRoot, 'fixtures', 'checkpoint.json')]);
  assert.equal(noKind.code, 2);
  assert.ok(noKind.stderr.startsWith('error: render needs --kind'), noKind.stderr);

  const noKindNoInput = await runCli(['render']);
  assert.equal(noKindNoInput.code, 2, 'the kind check must run before reading stdin');
  assert.ok(noKindNoInput.stderr.startsWith('error: render needs --kind'), noKindNoInput.stderr);

  const missingDir = await runCli(['resume-brief', '--dir', path.join(tmpdir(), 'lwc-no-such-dir-' + process.pid)]);
  assert.equal(missingDir.code, 2, 'a mistyped --dir must fail loudly, not print an empty brief');
  assert.ok(missingDir.stderr.startsWith('error: the task dir does not exist'), missingDir.stderr);

  const fileAsDir = await runCli(['resume-brief', '--dir', path.join(skillRoot, 'fixtures', 'checkpoint.json')]);
  assert.equal(fileAsDir.code, 2, 'a file passed as --dir must fail loudly too');
  assert.ok(fileAsDir.stderr.startsWith('error: the task dir is not a directory'), fileAsDir.stderr);

  const valueless = await runCli(['guard', '--binding', '--observed-workspace', 'superpoweringwithfiles']);
  assert.equal(valueless.code, 1);
  assert.ok(
    valueless.stdout.startsWith('DENY binding-invalid: the --binding flag needs a binding file path'),
    valueless.stdout
  );

  const fromStdin = await runCli(['guard', '--binding', '-', '--observed-workspace', 'superpoweringwithfiles'], {
    input: JSON.stringify(await fixture('binding-enabled.json'))
  });
  assert.equal(fromStdin.code, 0);
  assert.ok(fromStdin.stdout.startsWith('ALLOW ok:'), fromStdin.stdout);

  const dir = await mkdtemp(path.join(tmpdir(), 'lwc-binding-dir-'));
  try {
    await mkdir(path.join(dir, 'linear.json'));
    const unreadable = await runCli(['resume-brief', '--dir', dir]);
    assert.equal(unreadable.code, 1);
    assert.ok(unreadable.stdout.includes('**Binding:** invalid - linear.json could not be read'), unreadable.stdout);
    assert.ok(unreadable.stdout.includes('**Goal:** not recorded'), unreadable.stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('resume-brief rebuilds a task picture from a directory and mirrors the guard in its exit code', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lwc-brief-'));
  try {
    await writeFile(
      path.join(dir, 'task_plan.md'),
      ['## Goal', 'Ship the human-agent control plane', '', '## Current State', 'Status: active', '', '## Current Phase', 'Phase 2', '', '## Recovery Notes', '- resume from the bootstrap plan'].join('\n')
    );
    await writeFile(path.join(dir, 'linear.json'), JSON.stringify({ schemaVersion: 1, enabled: true, workspace: { name: 'superpoweringwithfiles' } }, null, 2));
    await writeFile(path.join(dir, 'linear-pending-checkpoint.md'), 'pending');

    const ready = await runCli(['resume-brief', '--dir', dir, '--observed-workspace', 'superpoweringwithfiles']);
    assert.equal(ready.code, 0);
    assert.ok(ready.stdout.includes('Ship the human-agent control plane'), ready.stdout);
    assert.ok(ready.stdout.includes('**Pending checkpoint ready to publish:** yes'), ready.stdout);
    assert.ok(ready.stdout.includes('**Next action:** resume from the bootstrap plan'), ready.stdout);

    const denied = await runCli(['resume-brief', '--dir', dir, '--observed-workspace', 'loffi']);
    assert.equal(denied.code, 1);
    assert.ok(denied.stdout.includes('DENY workspace-mismatch'), denied.stdout);

    await writeFile(path.join(dir, 'linear.json'), JSON.stringify({ schemaVersion: 2, enabled: true, workspace: { name: 'superpoweringwithfiles' } }, null, 2));
    const invalid = await runCli(['resume-brief', '--dir', dir]);
    assert.equal(invalid.code, 1);
    assert.ok(invalid.stdout.includes('**Binding:** invalid'), invalid.stdout);

    await mkdir(path.join(dir, 'no-binding'));
    const localOnly = await runCli(['resume-brief', '--dir', path.join(dir, 'no-binding')]);
    assert.equal(localOnly.code, 0);
    assert.ok(localOnly.stdout.includes('none found; treat this task as local-only'), localOnly.stdout);

    await writeFile(path.join(dir, 'linear.json'), '{ "schemaVersion": 1,');
    const corrupt = await runCli(['resume-brief', '--dir', dir, '--observed-workspace', 'superpoweringwithfiles']);
    assert.equal(corrupt.code, 1);
    assert.ok(corrupt.stdout.includes('**Binding:** invalid - linear.json is not valid JSON'), corrupt.stdout);
    assert.ok(!corrupt.stdout.includes('SyntaxError'), 'a corrupt binding must not surface a stack trace');
    assert.ok(corrupt.stdout.includes('**Workspace guard:** not checked'), corrupt.stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function migrationFixture(t, location = 'active') {
  const repo = await mkdtemp(path.join(tmpdir(), 'lwc-migration-'));
  t.after(() => rm(repo, { recursive: true, force: true }));
  const dir = path.join(repo, 'planning', location, 'example');
  const metadata = path.join(repo, 'reports', 'linear', 'example');
  await mkdir(dir, { recursive: true });
  await mkdir(metadata, { recursive: true });
  await writeFile(path.join(dir, 'task_plan.md'), '## Goal\nValidate current artifact\n');
  await writeFile(path.join(dir, 'findings.md'), 'Evidence: browser coverage is bounded');
  await writeFile(path.join(dir, 'progress.md'), 'Next: inspect mobile\n<!-- swf:blocker-state id=B1 state=waiting_human -->');
  const binding = { schemaVersion: 1, enabled: true, workspace: { name: 'external-workspace' } };
  return { repo, dir, metadata, binding };
}

test('migration: external binding reconstructs all three authority files for active and archive tasks', async (t) => {
  for (const location of ['active', 'archive']) {
    const { dir, metadata, binding } = await migrationFixture(t, location);
    await writeFile(path.join(metadata, 'linear.json'), JSON.stringify(binding));
    const result = await runCli(['resume-brief', '--dir', dir, '--observed-workspace', 'external-workspace']);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /ALLOW ok/);
    assert.match(result.stdout, /Evidence: browser coverage is bounded/);
    assert.match(result.stdout, /Next: inspect mobile/);
    assert.match(result.stdout, /1 open in the local ledger/);
    assert.match(result.stdout, /read progress.md/);
    assert.deepEqual((await readdir(dir)).sort(), ['findings.md', 'progress.md', 'task_plan.md']);
  }
});

test('migration: preferred binding fails closed and only absence permits legacy fallback', async (t) => {
  const { dir, metadata, binding } = await migrationFixture(t);
  await writeFile(path.join(dir, 'linear.json'), JSON.stringify(binding));
  const preferred = path.join(metadata, 'linear.json');
  for (const malformed of ['{', JSON.stringify({ schemaVersion: 99 })]) {
    await writeFile(preferred, malformed);
    const result = await runCli(['resume-brief', '--dir', dir]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /Binding:\*\* invalid/);
  }
  await rm(preferred);
  await mkdir(preferred);
  assert.equal((await runCli(['resume-brief', '--dir', dir])).code, 1);
  await rm(preferred, { recursive: true });
  await symlink(path.join(metadata, 'missing'), preferred);
  assert.equal((await runCli(['resume-brief', '--dir', dir])).code, 1);
  await rm(preferred);
  await writeFile(path.join(dir, 'blockers.md'), '<!-- swf:blocker-state id=legacy state=open -->');
  const legacy = await runCli(['resume-brief', '--dir', dir, '--observed-workspace', 'external-workspace']);
  assert.equal(legacy.code, 0);
  assert.match(legacy.stdout, /2 open in the local ledger/);
  await writeFile(preferred, JSON.stringify({ ...binding, workspace: { name: 'preferred' } }));
  assert.match((await runCli(['resume-brief', '--dir', dir, '--observed-workspace', 'preferred'])).stdout, /ALLOW ok/);
  const override = await runCli(['resume-brief', '--dir', dir, '--binding', path.join(dir, 'linear.json'), '--observed-workspace', 'external-workspace']);
  assert.equal(override.code, 0);
  assert.equal((await runCli(['resume-brief', '--dir', dir, '--binding', path.join(dir, 'missing')])).code, 1);
});

test('migration: blocker decision survives restart in progress without a fourth authority file', async (t) => {
  const { dir, metadata, binding } = await migrationFixture(t);
  await writeFile(path.join(metadata, 'linear.json'), JSON.stringify(binding));
  await writeFile(path.join(dir, 'progress.md'), 'DECISION: use the mobile viewport\n<!-- swf:blocker-state id=B1 state=resolved -->\nNext: run bounded validation');
  const result = await runCli(['resume-brief', '--dir', dir]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Open blocker:\*\* none/);
  assert.match(result.stdout, /DECISION: use the mobile viewport/);
  assert.match(result.stdout, /Next: run bounded validation/);
  assert.deepEqual((await readdir(dir)).sort(), ['findings.md', 'progress.md', 'task_plan.md']);
});
