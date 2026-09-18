// Deterministic helpers for the SWF <-> Linear human-agent control plane.
//
// These functions are the machine-checkable half of the protocol: binding
// validation, the wrong-workspace write guard, runtime-state mapping, and the
// rendering of every human-facing Linear surface. They hold no credentials and
// never call Linear. All Linear mutations stay with the authenticated MCP.

export const BINDING_SCHEMA_VERSION = 1;

export const MANAGED_LABEL = 'swf-managed';
export const EXECUTOR_LABEL = 'executor:codex-local';
export const SCHEDULE_LABEL = 'nightly';

// Canonical SWF runtime states. These are the only states the protocol syncs.
export const RUNTIME_STATES = Object.freeze([
  'planned',
  'ready',
  'running',
  'waiting_human',
  'blocked',
  'review',
  'failed',
  'done',
  'canceled'
]);

// Semantic states use labels; workflow status changes stay on stock Linear
// statuses so the MVP never depends on custom workflow creation.
export const STATE_MAP = Object.freeze({
  planned: { status: 'Backlog', labels: [] },
  ready: { status: 'Todo', labels: ['agent-ready'] },
  running: { status: 'In Progress', labels: ['agent-running'] },
  waiting_human: { status: 'In Progress', labels: ['waiting-human'] },
  blocked: { status: 'In Progress', labels: ['blocked'] },
  review: { status: 'In Progress', labels: ['ready-review'] },
  failed: { status: 'In Progress', labels: ['agent-failed'] },
  done: { status: 'Done', labels: [] },
  canceled: { status: 'Canceled', labels: [] }
});

// Labels the bootstrap must be able to create, in creation order.
export const REQUIRED_LABELS = Object.freeze([
  MANAGED_LABEL,
  EXECUTOR_LABEL,
  'agent-ready',
  'agent-running',
  'waiting-human',
  'blocked',
  'ready-review',
  'agent-failed',
  SCHEDULE_LABEL
]);

// Human intent verbs understood in Linear comments and locally.
export const HUMAN_COMMANDS = Object.freeze([
  'DECISION:',
  'PAUSE',
  'RESUME',
  'CANCEL',
  'REPLAN:',
  'PRIORITY:'
]);

const BINDING_KEYS = Object.freeze([
  'schemaVersion',
  'enabled',
  'workspace',
  'team',
  'project',
  'goalIssue',
  'statusComment',
  'executor',
  'taskMap',
  'sync'
]);

// Credential-shaped key names are rejected at any depth. The check is
// shape-based rather than an exact-name list, so unusual spellings (apiToken,
// LINEAR_API_KEY, bearerToken) cannot slip through. The companion test asserts
// that no documented binding key matches any marker.
const CREDENTIAL_KEY_MARKERS = Object.freeze([
  'apikey',
  'auth',
  'bearer',
  'cookie',
  'credential',
  'jwt',
  'oauth',
  'passphrase',
  'passwd',
  'password',
  'privatekey',
  'secret',
  'session',
  'token'
]);

function normalizeKeyName(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function looksLikeCredentialKey(key) {
  const normalized = normalizeKeyName(key);
  return normalized !== '' && CREDENTIAL_KEY_MARKERS.some((marker) => normalized.includes(marker));
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Any key that looks like a credential is a hard binding error: credentials
// belong to the Host MCP authentication, never to durable task state.
export function findSecretKeys(value, trail = []) {
  const hits = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => hits.push(...findSecretKeys(item, [...trail, String(index)])));
    return hits;
  }
  if (!isPlainObject(value)) {
    return hits;
  }
  for (const [key, child] of Object.entries(value)) {
    if (looksLikeCredentialKey(key)) {
      hits.push([...trail, key].join('.'));
    }
    hits.push(...findSecretKeys(child, [...trail, key]));
  }
  return hits;
}

export function normalizeWorkspaceRef(value) {
  if (!isNonEmptyString(value)) {
    return '';
  }
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^linear\.app\//i, '')
    .replace(/\/+$/, '');
}

// A Linear workspace slug is lowercase by construction, so a binding must
// carry it verbatim. The guard compares case-sensitively: folding case or a
// www. prefix would let a different workspace pass as the bound one.
const BARE_WORKSPACE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function validateBinding(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['binding must be a JSON object'], binding: null };
  }

  for (const key of Object.keys(input)) {
    if (!BINDING_KEYS.includes(key)) {
      errors.push('unknown binding key: ' + key);
    }
  }
  for (const trail of findSecretKeys(input)) {
    errors.push('binding must not store credentials: ' + trail);
  }

  if (input.schemaVersion !== BINDING_SCHEMA_VERSION) {
    errors.push('schemaVersion must be ' + BINDING_SCHEMA_VERSION);
  }
  if (typeof input.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }
  if (!isPlainObject(input.workspace) || !isNonEmptyString(input.workspace.name)) {
    errors.push('workspace.name is required');
  } else if (!BARE_WORKSPACE_SLUG.test(input.workspace.name)) {
    errors.push('workspace.name must be the bare workspace slug: ' + normalizeWorkspaceRef(input.workspace.name));
  }

  for (const field of ['team', 'project', 'goalIssue', 'statusComment']) {
    if (input[field] !== undefined && !isPlainObject(input[field])) {
      errors.push(field + ' must be an object when present');
    }
  }

  if (isPlainObject(input.goalIssue) && input.goalIssue.identifier !== undefined && !isNonEmptyString(input.goalIssue.identifier)) {
    errors.push('goalIssue.identifier must be a non-empty string when present');
  }
  if (isPlainObject(input.statusComment) && input.statusComment.id !== undefined && !isNonEmptyString(input.statusComment.id)) {
    errors.push('statusComment.id must be a non-empty string when present');
  }
  if (input.executor !== undefined && input.executor !== EXECUTOR_LABEL) {
    errors.push('executor must be ' + EXECUTOR_LABEL + ' for the local Codex MVP');
  }

  if (input.taskMap !== undefined) {
    if (!isPlainObject(input.taskMap)) {
      errors.push('taskMap must be an object when present');
    } else {
      for (const [taskId, entry] of Object.entries(input.taskMap)) {
        if (!isNonEmptyString(taskId)) {
          errors.push('taskMap keys must be non-empty task ids');
        }
        if (!isPlainObject(entry)) {
          errors.push('taskMap.' + taskId + ' must be an object');
          continue;
        }
        if (!isNonEmptyString(entry.issueId) && !isNonEmptyString(entry.identifier)) {
          errors.push('taskMap.' + taskId + ' needs issueId or identifier');
        }
        if (entry.state !== undefined && !RUNTIME_STATES.includes(entry.state)) {
          errors.push('taskMap.' + taskId + '.state is not a canonical state: ' + entry.state);
        }
      }
    }
  }

  if (input.sync !== undefined) {
    if (!isPlainObject(input.sync)) {
      errors.push('sync must be an object when present');
    } else if (input.sync.lastResult !== undefined && !['ok', 'failed', 'never'].includes(input.sync.lastResult)) {
      errors.push('sync.lastResult must be ok, failed, or never');
    }
  }

  return { ok: errors.length === 0, errors, binding: errors.length === 0 ? input : null };
}

export function mapState(state, { managed = true, executor = EXECUTOR_LABEL } = {}) {
  if (!RUNTIME_STATES.includes(state)) {
    return { ok: false, error: 'unknown runtime state: ' + state, allowed: RUNTIME_STATES };
  }
  const entry = STATE_MAP[state];
  const labels = [...entry.labels];
  return {
    ok: true,
    state,
    status: entry.status,
    semanticLabels: labels,
    managedLabels: managed ? [MANAGED_LABEL, executor, ...labels] : labels,
    humanActionRequired: state === 'waiting_human' || state === 'blocked',
    issueIsOpen: state !== 'done' && state !== 'canceled'
  };
}

const TICK = String.fromCharCode(96);

// Wrong-workspace protection is a required feature: no Linear write may be
// performed unless the observed authenticated workspace matches the binding.
export function checkWorkspaceGuard({ binding, observedWorkspace, action = 'write' } = {}) {
  const expected = isPlainObject(binding) ? normalizeWorkspaceRef(binding.workspace && binding.workspace.name) : '';
  const observed = normalizeWorkspaceRef(observedWorkspace);

  if (!isPlainObject(binding)) {
    return {
      allowed: false,
      code: 'binding-invalid',
      expected,
      observed,
      reason: 'binding must be a JSON object; validate the binding first'
    };
  }
  if (binding.enabled !== true) {
    return {
      allowed: false,
      code: 'binding-disabled',
      expected,
      observed,
      reason: 'binding.enabled is not true; Linear is not part of this goal'
    };
  }
  // The guard is the only enforcement point for wrong-workspace writes, so it
  // refuses to allow a write on a binding that has not passed validation.
  const validation = validateBinding(binding);
  if (!validation.ok) {
    return {
      allowed: false,
      code: 'binding-invalid',
      expected,
      observed,
      reason: 'binding is invalid (' + validation.errors.join('; ') + '); validate the binding before any Linear write'
    };
  }
  if (!observed) {
    return {
      allowed: false,
      code: 'workspace-unknown',
      expected,
      observed,
      reason: 'the authenticated workspace could not be read; do not write until it can be'
    };
  }
  if (observed !== expected) {
    return {
      allowed: false,
      code: 'workspace-mismatch',
      expected,
      observed,
      reason:
        'authenticated workspace is "' + observed + '", the binding requires "' + expected + '"; ' + action + ' denied'
    };
  }
  return {
    allowed: true,
    code: 'ok',
    expected,
    observed,
    reason: 'authenticated workspace matches the binding: ' + expected
  };
}

function bulletList(values, fallback) {
  const items = (values || []).filter((value) => isNonEmptyString(value));
  if (items.length === 0) {
    return '- ' + fallback;
  }
  return items.map((item) => '- ' + item.trim()).join('\n');
}

function marker({ taskId, kind, timestamp }) {
  return '<!-- swf:' + kind + ' task=' + taskId + ' at=' + timestamp + ' -->';
}

function code(value) {
  return TICK + value + TICK;
}

export function renderCheckpoint(input) {
  const {
    taskId,
    title,
    state,
    progress = {},
    completed = [],
    now = [],
    next = [],
    humanAction = {},
    validation = {},
    timestamp
  } = input;

  const mapped = mapState(state);
  if (!mapped.ok) {
    throw new Error(mapped.error);
  }

  const percent = Number.isFinite(progress.percent) ? progress.percent + '%' : 'unknown';
  const human = humanAction.required === true ? 'YES - ' + (humanAction.question || 'see the blocker comment') : 'no';
  const labelText = mapped.semanticLabels.length > 0 ? ' + ' + mapped.semanticLabels.map(code).join(', ') : '';

  return [
    '### Checkpoint - ' + (title || taskId),
    '',
    '- **State:** ' + code(state) + ' -> Linear ' + code(mapped.status) + labelText,
    '- **Progress:** ' + percent + (isNonEmptyString(progress.note) ? ' - ' + progress.note : ''),
    '- **Completed just now:**\n' + bulletList(completed, 'nothing new since the last checkpoint'),
    '- **Happening now:**\n' + bulletList(now, 'idle between checkpoints'),
    '- **Next:**\n' + bulletList(next, 'to be decided'),
    '- **Human action required:** ' + human,
    '- **Latest validation:** ' +
      (isNonEmptyString(validation.summary) ? validation.summary : 'not run yet') +
      (isNonEmptyString(validation.command) ? ' (' + code(validation.command) + ')' : ''),
    '',
    marker({ taskId, kind: 'checkpoint', timestamp: timestamp || 'unknown-time' })
  ].join('\n');
}

export function renderBlocker(input) {
  const { taskId, context, question, options = [], impact, resumeCondition, timestamp } = input;

  // Options are published straight to the human surface, so a wrong shape must
  // fail loudly instead of rendering a placeholder line nobody notices.
  if (!Array.isArray(options)) {
    throw new Error('blocker options must be an array of { label, detail } objects');
  }
  const renderedOptions =
    options.length > 0
      ? options
          .map((option, index) => {
            if (!isPlainObject(option) || !isNonEmptyString(option.label)) {
              throw new Error(
                'blocker option ' +
                  (index + 1) +
                  ' must be an object with a non-empty label (got ' +
                  (typeof option === 'object' && option !== null ? 'an object without a label' : typeof option) +
                  ')'
              );
            }
            return (index + 1) + '. ' + option.label + (isNonEmptyString(option.detail) ? ' - ' + option.detail : '');
          })
          .join('\n')
      : 'none; the question needs a free-form answer';

  return [
    '### Human input required',
    '',
    '- **Task:** ' + taskId,
    '- **Context:** ' + (context || 'not recorded'),
    '- **Question:** ' + (question || 'not recorded'),
    '- **Options:**\n' + renderedOptions,
    '- **Impact if unanswered:** ' + (impact || 'work on this task stays parked'),
    '- **Resume condition:** ' + (resumeCondition || 'a human answer is recorded in local files'),
    '',
    'Reply in a comment using one of these forms:',
    '',
    '- ' + code('DECISION: <option or free-form answer>') + ' - answers the question above',
    '- ' + code('PAUSE') + ' / ' + code('RESUME') + ' / ' + code('CANCEL') + ' - controls this task',
    '- ' + code('REPLAN: <new scope or constraint>') + ' - requests a plan change',
    '- ' + code('PRIORITY: <urgent|high|normal|low>') + ' - changes ordering in the queue',
    '',
    'The local session consumes this comment into durable files before resuming. Do not rely on chat history.',
    '',
    marker({ taskId, kind: 'blocker', timestamp: timestamp || 'unknown-time' })
  ].join('\n');
}

// Linear Done means validated completion. Anything short of the full gate keeps
// the issue open so an overnight run cannot advertise unverified success.
const COMPLETION_INPUT_KEYS = Object.freeze(['validationState', 'doneWhenSatisfied', 'unresolvedBlockers']);

// The gate is the last line against claiming completion that was never
// verified, so it fails closed: an unreadable input, an unknown key, or a
// wrong type all keep the issue open in review instead of allowing Done.
export function checkCompletionGate(input = {}) {
  const reasons = [];
  if (!isPlainObject(input)) {
    return {
      canMarkDone: false,
      state: 'review',
      reasons: ['completion input must be a JSON object'],
      reason: 'completion gate closed; keep the issue open and stay in review'
    };
  }
  for (const key of Object.keys(input)) {
    if (!COMPLETION_INPUT_KEYS.includes(key)) {
      reasons.push('unknown completion key: ' + key + '; the gate only reads ' + COMPLETION_INPUT_KEYS.join(', '));
    }
  }

  const { validationState, doneWhenSatisfied = false, unresolvedBlockers = 0 } = input;

  if (validationState !== 'passed') {
    const shown = typeof validationState === 'string' ? validationState.slice(0, 40) : typeof validationState;
    reasons.push('validation state is "' + (shown || 'unknown') + '", not "passed"');
  }
  if (typeof doneWhenSatisfied !== 'boolean') {
    reasons.push('doneWhenSatisfied must be a boolean');
  } else if (!doneWhenSatisfied) {
    reasons.push('the goal "done when" conditions are not recorded as satisfied');
  }
  if (!Number.isInteger(unresolvedBlockers) || unresolvedBlockers < 0) {
    reasons.push('unresolvedBlockers must be a non-negative integer');
  } else if (unresolvedBlockers > 0) {
    reasons.push(unresolvedBlockers + ' blocking condition(s) remain unresolved');
  }
  const canMarkDone = reasons.length === 0;
  return {
    canMarkDone,
    state: canMarkDone ? 'done' : 'review',
    reasons,
    reason: canMarkDone
      ? 'validation passed with no unresolved blockers'
      : 'completion gate closed; keep the issue open and stay in review'
  };
}

export function renderCompletion(input) {
  const { taskId, title, changed = [], validation = {}, artifacts = [], followUps = [], timestamp } = input;

  return [
    '### Completed - ' + (title || taskId),
    '',
    '- **What changed:**\n' + bulletList(changed, 'no recorded change'),
    '- **Validation:** ' +
      (validation.summary || 'not recorded') +
      (isNonEmptyString(validation.command) ? ' (' + code(validation.command) + ')' : ''),
    '- **Artifacts:**\n' + bulletList(artifacts, 'none'),
    '- **Remaining follow-ups:**\n' + bulletList(followUps, 'none'),
    '',
    marker({ taskId, kind: 'completion', timestamp: timestamp || 'unknown-time' })
  ].join('\n');
}

// The overnight and morning summaries share one shape so a human can answer
// "what happened while I was away" without opening a chat.
export function renderAttentionSummary({ heading, buckets = {}, timestamp } = {}) {
  const order = ['completed', 'needsReview', 'needsDecision', 'failed', 'running', 'skipped', 'next'];
  const titles = {
    completed: 'Completed',
    needsReview: 'Ready for review',
    needsDecision: 'Needs a decision',
    failed: 'Failed',
    running: 'Still running',
    skipped: 'Skipped',
    next: 'Next work'
  };
  const lines = ['### ' + (heading || 'Overnight summary'), ''];
  for (const key of order) {
    lines.push('- **' + titles[key] + ':**\n' + bulletList(buckets[key], 'none'));
  }
  lines.push('', marker({ taskId: 'summary', kind: 'summary', timestamp: timestamp || 'unknown-time' }));
  return lines.join('\n');
}

// Local-first ordering: a Linear publish is the last step, never the first.
export const CHECKPOINT_SYNC_ORDER = Object.freeze([
  'update local worklog and progress files',
  'update local state and task plan',
  'run or refresh validation when the change is verifiable',
  'persist blockers in local durable files',
  'render the concise human snapshot',
  'publish or update the Linear checkpoint'
]);

export function describeSyncFailure({ error, localStateWritten = true } = {}) {
  return {
    localStateValid: localStateWritten === true,
    retryable: true,
    localStateMustNotBeRolledBack: true,
    message: localStateWritten
      ? 'Linear publish failed (' + (error || 'unknown error') +
        '); local durable state stands and the checkpoint stays queued for retry'
      : 'Linear publish failed (' + (error || 'unknown error') +
        ') before local state was secured; write local state first'
  };
}

// --- Resume brief -----------------------------------------------------------
// A resumed session must reconstruct the picture from files alone. These two
// helpers turn the bound planning files plus the binding into that brief, so no
// step depends on the original chat.

const PLANNING_SECTIONS = Object.freeze({
  goal: '## Goal',
  currentState: '## Current State',
  currentPhase: '## Current Phase',
  recoveryNotes: '## Recovery Notes'
});

export function extractPlanningSections(markdown) {
  const text = typeof markdown === 'string' ? markdown : '';
  const result = {};
  for (const [key, heading] of Object.entries(PLANNING_SECTIONS)) {
    const start = text.indexOf(heading);
    if (start === -1) {
      result[key] = null;
      continue;
    }
    const afterHeading = text.indexOf('\n', start);
    const remainder = afterHeading === -1 ? '' : text.slice(afterHeading + 1);
    const nextHeading = remainder.search(/^## /m);
    result[key] = (nextHeading === -1 ? remainder : remainder.slice(0, nextHeading)).trim();
  }
  return result;
}

function stateLines(currentState) {
  if (!currentState) {
    return ['- status: not recorded'];
  }
  return currentState
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => '- ' + line);
}

// The local blocker ledger is the durable record; Linear is a projection. Once a
// blocker's text is published, the file-name convention alone cannot tell a
// resumed session whether the question is still open, so the ledger carries one
// machine-readable state marker per blocker. Anything that is not explicitly
// resolved/canceled/done counts as open: an unreadable entry must never look
// like an answered question.
// A marker is an HTML comment, optionally decorated as a list item, blockquote,
// or inline code. Any line that mentions the token but does not parse is a
// malformed marker and counts as open: an unreadable blocker must never look
// answered. Ledger prose therefore must not quote the marker token itself.
const BLOCKER_LEDGER_TOKEN = 'swf:blocker-state';
const BLOCKER_LEDGER_RE = /^<!--\s*swf:blocker-state\s+id=(\S+)\s+state=([a-z_]+)\s*-->$/;
// Format and invisible characters survive a copy/paste: the soft hyphen, the
// Mongolian vowel separator, and the whole Unicode "Cf" family (zero-width
// space and joiner, word joiner, BOM). Hyphen variants are folded to "-".
const INVISIBLE_RE = /[\u00ad\u180e]/g;
const FORMAT_RE = /\p{Cf}/gu;
const DASH_RE = /[\u2010-\u2015\u2212]/g;
// Letters that imitate a token letter in another script are folded to the Latin
// letter they look like, so a paste with Cyrillic "o" or Greek "kappa" still
// reads as the token. Only the letters of BLOCKER_LEDGER_TOKEN are covered; any
// other corruption has to fall inside the edit-distance window below.
const CONFUSABLE_MAP = new Map([
  ['\u0455', 's'],
  ['\u0461', 'w'],
  ['\u03c9', 'w'],
  ['\u043e', 'o'],
  ['\u03bf', 'o'],
  ['\u0585', 'o'],
  ['0', 'o'],
  ['\u0441', 'c'],
  ['\u03f2', 'c'],
  ['\u043a', 'k'],
  ['\u03ba', 'k'],
  ['\u0435', 'e'],
  ['\u0451', 'e'],
  ['\u03b5', 'e'],
  ['\u0442', 't'],
  ['\u03c4', 't'],
  ['\u0430', 'a'],
  ['\u03b1', 'a'],
  ['\u0431', 'b'],
  ['\u044c', 'b'],
  ['\u043b', 'l'],
  ['\u0456', 'l'],
  ['\u04cf', 'l'],
  ['1', 'l'],
  ['|', 'l'],
  ['\u0433', 'r']
]);
const TOKEN_SCAN_PREFIX = BLOCKER_LEDGER_TOKEN.slice(0, 9);

function scanForm(line) {
  return line
    .normalize('NFKC')
    .replace(FORMAT_RE, '')
    .replace(INVISIBLE_RE, '')
    .replace(DASH_RE, '-')
    .toLowerCase()
    .replace(/[\s\S]/g, (character) => CONFUSABLE_MAP.get(character) || character);
}

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// The candidate test decides whether a line is marker-like at all; the strict
// parse below still decides the state, and anything marker-like that does not
// parse is reported as unreadable and counts as open.
//
// It catches the corruptions a hand edit or a paste actually produces: case and
// width (NFKC), invisible and format characters, hyphen variants, homoglyph
// letters of the token, a stray space inside the token (the whole line is also
// scanned with whitespace removed, which covers a token split at a line break),
// and any whitespace-delimited spelling within two edits of the token. A
// corruption outside that envelope (for example three arbitrary substitutions)
// can still be dropped, so the ledger convention stands: one well-formed marker
// per blocker, and prose that does not quote the token.
function mentionsMarkerToken(scanned) {
  if (scanned.replace(/\s+/g, '').includes(TOKEN_SCAN_PREFIX)) {
    return true;
  }
  for (const field of scanned.split(/\s+/)) {
    const trimmed = field.replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9]+$/, '');
    if (trimmed === '' || Math.abs(trimmed.length - BLOCKER_LEDGER_TOKEN.length) > 2) {
      continue;
    }
    if (editDistance(trimmed, BLOCKER_LEDGER_TOKEN) <= 2) {
      return true;
    }
  }
  return false;
}

// Markdown decoration around a marker (blockquote, list bullet, ordered-list
// number, task checkbox, emphasis, inline code) is stripped before matching, so
// a hand-written entry parses instead of degrading to "unreadable".
function undecorateMarker(line) {
  let text = line;
  for (let pass = 0; pass < 6; pass += 1) {
    const next = text
      .replace(/^[\s>]+/, '')
      .replace(/^(?:\d+[.)]|[-*+])\s*/, '')
      .replace(/^\[[ xX]\]\s*/, '')
      .replace(/^[*_`]+/, '')
      .replace(/[*_`]+$/, '');
    if (next === text) {
      break;
    }
    text = next;
  }
  return text.trim();
}
const CLOSED_BLOCKER_STATES = Object.freeze(['resolved', 'canceled', 'done']);

export function openBlockersFromLedger(ledgerText) {
  const open = [];
  if (!isNonEmptyString(ledgerText)) {
    return open;
  }
  for (const line of ledgerText.split('\n')) {
    // A lookalike spelling (case, full-width punctuation, an invisible or
    // homoglyph character inside the token) still has to be treated as a
    // marker, so the candidate test normalizes a copy while the parse stays
    // strict on the original line.
    if (!mentionsMarkerToken(scanForm(line))) {
      continue;
    }
    const match = BLOCKER_LEDGER_RE.exec(undecorateMarker(line));
    if (!match) {
      open.push({ id: 'unknown', state: 'unreadable' });
      continue;
    }
    if (!CLOSED_BLOCKER_STATES.includes(match[2])) {
      open.push({ id: match[1], state: match[2] });
    }
  }
  return open;
}

export function renderResumeBrief({
  taskDirLabel,
  bindingValidation,
  guard,
  sections = {},
  taskMap = {},
  pendingCheckpoint = false,
  pendingBlocker = false,
  openBlockerCount = 0,
  blockerSource = 'progress.md',
  findingsText = '',
  progressText = '',
  timestamp
} = {}) {
  const taskEntries = Object.entries(taskMap);
  const recoveryNotes = (sections.recoveryNotes || '')
    .replace(/^[-*]\s+/, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  // progress.md carries the live next step, so it outranks the plan's recovery
  // note; the recovery note still outranks the generic fallback.
  const progressNext = (isNonEmptyString(progressText) ? progressText : '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^next:/i.test(line));
  const nextAction = progressNext || recoveryNotes;
  const findings = (isNonEmptyString(findingsText) ? findingsText : '')
    .split('\n')
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .find((line) => line !== '');
  // A human decision lives in progress.md; a restart has to see it without
  // replaying the conversation that produced it.
  const decisions = (isNonEmptyString(progressText) ? progressText : '')
    .split('\n')
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter((line) => /^(DECISION|REPLAN|PRIORITY):/i.test(line));
  const lines = [
    '### Resume brief - ' + (taskDirLabel || 'unbound task'),
    '',
    '- **Binding:** ' +
      (!bindingValidation
        ? 'none found; treat this task as local-only'
        : bindingValidation.ok
          ? 'valid'
          : 'invalid - ' + bindingValidation.errors.join('; ')),
    '- **Workspace guard:** ' + (guard ? (guard.allowed ? 'ALLOW ' : 'DENY ') + guard.code + ' - ' + guard.reason : 'not checked'),
    '- **Goal:** ' + (sections.goal || 'not recorded'),
    ...stateLines(sections.currentState),
    '- phase: ' + (sections.currentPhase || 'not recorded'),
    '- **Linear tasks:** ' +
      (taskEntries.length === 0
        ? 'none mapped yet'
        : taskEntries.map(([id, entry]) => id + ' -> ' + (entry.identifier || entry.issueId) + ' (' + (entry.state || 'unnamed') + ')').join('; ')),
    '- **Pending checkpoint ready to publish:** ' + (pendingCheckpoint ? 'yes' : 'no'),
    '- **Open blocker:** ' +
      (pendingBlocker
        ? 'yes - read the blocker file before acting'
        : openBlockerCount > 0
          ? 'yes (' + openBlockerCount + ' open in the local ledger) - read ' + blockerSource + ' before acting'
          : 'none'),
    '- **Findings:** ' + (findings || 'not recorded'),
    '- **Human input on record:** ' + (decisions.length > 0 ? decisions.join('; ') : 'none'),
    '- **Next action:** ' + (nextAction || 'read progress.md and task_plan.md before acting'),
    '',
    marker({ taskId: taskDirLabel || 'resume', kind: 'resume-brief', timestamp: timestamp || 'unknown-time' })
  ];
  return lines.join('\n');
}

// --- Human intent parsing ---------------------------------------------------
// A resumed session must be able to turn a human comment into durable local
// state without guessing. This parser is deliberately narrow: known command
// prefixes win, everything else is reported as unrecognized instead of inferred.

function cleanCommandLine(line) {
  return line
    .replace(/^\s*[-*+>]+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+$/, '')
    .trim();
}

export function parseHumanCommands(text) {
  const result = {
    decisions: [],
    replans: [],
    priorities: [],
    control: [],
    unrecognized: []
  };
  if (typeof text !== 'string' || text.trim() === '') {
    return { ...result, recognized: false, resolution: null, resumeAllowed: null };
  }

  let inFence = false;
  for (const rawLine of text.split(/\r?\n/)) {
    if (/^\s*(?:`{3,}|~{3,})/.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const line = cleanCommandLine(rawLine);
    if (line === '') {
      continue;
    }
    const upper = line.toUpperCase();

    if (upper.startsWith('DECISION:')) {
      const value = line.slice('DECISION:'.length).trim();
      if (value === '' || isPlaceholderValue(value)) {
        // An empty or placeholder DECISION is a question or a quoted template,
        // never an answer.
        result.unrecognized.push(line);
        continue;
      }
      result.decisions.push(value);
      continue;
    }
    if (upper.startsWith('REPLAN:')) {
      const value = line.slice('REPLAN:'.length).trim();
      if (value === '' || isPlaceholderValue(value)) {
        result.unrecognized.push(line);
        continue;
      }
      result.replans.push(value);
      continue;
    }
    if (upper.startsWith('PRIORITY:')) {
      const value = line.slice('PRIORITY:'.length).trim().toLowerCase();
      if (value === '' || isPlaceholderValue(value)) {
        result.unrecognized.push(line);
        continue;
      }
      if (!['urgent', 'high', 'normal', 'low'].includes(value)) {
        // An unparseable priority is noise, not a recognized command.
        result.unrecognized.push(line);
        continue;
      }
      result.priorities.push(value);
      continue;
    }
    if (upper === 'PAUSE' || upper === 'RESUME' || upper === 'CANCEL') {
      result.control.push(upper.toLowerCase());
      continue;
    }
    if (upper.startsWith('DECISION') || upper.startsWith('REPLAN') || upper.startsWith('PRIORITY')) {
      result.unrecognized.push(line);
      continue;
    }
    result.unrecognized.push(line);
  }

  const recognized = result.decisions.length + result.replans.length + result.priorities.length + result.control.length > 0;
  const lastControl = result.control[result.control.length - 1] || null;
  return {
    ...result,
    recognized,
    resolution: result.decisions.length > 0 ? result.decisions[result.decisions.length - 1] : null,
    resumeAllowed: result.control.includes('cancel') ? false : lastControl === 'resume' ? true : lastControl === 'pause' ? false : null
  };
}

export function summarizeHumanInput(parsed) {
  if (!parsed || parsed.recognized !== true) {
    return {
      actionable: false,
      resumeConditionMet: false,
      message: 'no recognized human command; do not treat commentary as a decision'
    };
  }
  const notes = [];
  if (parsed.resolution !== null) {
    notes.push('decision: ' + parsed.resolution);
  }
  if (parsed.replans.length > 0) {
    notes.push('replan requested: ' + parsed.replans.join(' | '));
  }
  if (parsed.priorities.length > 0) {
    notes.push('priority: ' + parsed.priorities.join(', '));
  }
  if (parsed.control.length > 0) {
    notes.push('control: ' + parsed.control.join(' -> '));
  }
  const resumeConditionMet = parsed.resumeAllowed !== false && (parsed.resolution !== null || parsed.replans.length > 0 || parsed.resumeAllowed === true);
  return {
    actionable: true,
    resumeConditionMet,
    decision: parsed.resolution,
    replan: parsed.replans.length > 0 ? parsed.replans[parsed.replans.length - 1] : null,
    priority: parsed.priorities.length > 0 ? parsed.priorities[parsed.priorities.length - 1] : null,
    control: parsed.control,
    resumeAllowed: parsed.resumeAllowed,
    message: notes.join('; ')
  };
}

// The published blocker text lists the command forms with placeholders such as
// `<option or free-form answer>`. A human quoting the template back, or a reply
// inside a fenced block, is not an answer.
function isPlaceholderValue(value) {
  return /^<[^<>]*>$/.test(value.trim());
}
