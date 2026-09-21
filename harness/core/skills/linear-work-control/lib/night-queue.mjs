// Pure snapshot selection. No clock reads, persistence, locks, or Linear calls.
import { MANAGED_LABEL, SCHEDULE_LABEL, RUNTIME_STATES } from './linear-work-control.mjs';

const scopeKeys = ['workspace', 'team', 'project'];
const excludedLabels = ['blocked', 'waiting-human', 'ready-review', 'agent-running', 'agent-failed'];
export const NIGHT_ATTEMPT_LIMIT = 3;
export const NIGHT_BUDGET_MS = 45 * 60 * 1000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && value.trim() === value && value.length > 0;
const scope = value => record(value) && scopeKeys.every(key => identifier(value[key]));
const unique = values => new Set(values).size === values.length;

// Require UTC ISO timestamps; round-trip validation rejects normalized invalid
// dates (e.g. February 30) and avoids local timezone or Date.parse heuristics.
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return NaN;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return NaN;
  return new Date(ms).toISOString() === value.replace(/(?<=:\d{2})Z$/, '.000Z') ? ms : NaN;
}

function invalid(error) {
  return { ok: false, nextIssueId: null, reason: 'invalid-input', error, skipped: [], remainingIssueIds: [] };
}

export function selectNightIssue(input) {
  if (!record(input) || !scope(input.context) || !Array.isArray(input.candidates) ||
      !Array.isArray(input.attemptedIssueIds) || !input.attemptedIssueIds.every(identifier) ||
      !unique(input.attemptedIssueIds)) return invalid('Invalid context, candidates, or attemptedIssueIds');
  const start = timestamp(input.startedAt);
  const now = timestamp(input.now);
  if (!Number.isFinite(start) || !Number.isFinite(now) || now < start) return invalid('Invalid or reversed run timestamps');
  for (const c of input.candidates) {
    if (!scope(c) || !identifier(c.id) || !RUNTIME_STATES.includes(c.state) ||
        typeof c.authorized !== 'boolean' || typeof c.readiness !== 'boolean' ||
        !Array.isArray(c.labels) || !c.labels.every(identifier) ||
        !Number.isInteger(c.priority) || c.priority < 0 || c.priority > 4 ||
        !Number.isFinite(timestamp(c.updatedAt)) || timestamp(c.updatedAt) > now ||
        !Array.isArray(c.blockedBy) || !c.blockedBy.every(dep => record(dep) &&
          identifier(dep.id) && dep.id !== c.id && [...RUNTIME_STATES, 'unknown'].includes(dep.state)) ||
        !unique(c.blockedBy.map(dep => dep.id))) return invalid('Malformed candidate');
  }
  if (!unique(input.candidates.map(c => c.id))) return invalid('Duplicate candidate IDs');

  const skipped = [];
  const eligible = [];
  for (const c of input.candidates) {
    const reason = scopeKeys.some(key => c[key] !== input.context[key]) ? 'wrong-scope'
      : input.attemptedIssueIds.includes(c.id) ? 'already-attempted'
      : !c.authorized ? 'not-authorized'
      : !c.readiness ? 'not-ready'
      : c.state !== 'ready' || excludedLabels.some(label => c.labels.includes(label)) ? 'excluded-state'
      : ![MANAGED_LABEL, 'agent-ready', SCHEDULE_LABEL].every(label => c.labels.includes(label)) ? 'missing-labels'
      : c.blockedBy.some(dep => dep.state !== 'done') ? 'unmet-dependencies' : null;
    if (reason) skipped.push({ id: c.id, reason });
    else eligible.push(c);
  }
  const compareId = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  eligible.sort((a, b) => (a.priority || 5) - (b.priority || 5) ||
    timestamp(a.updatedAt) - timestamp(b.updatedAt) || compareId(a.id, b.id));
  skipped.sort((a, b) => compareId(a.id, b.id));
  const elapsedMs = now - start;
  const reason = input.attemptedIssueIds.length >= NIGHT_ATTEMPT_LIMIT ? 'attempt-budget'
    : elapsedMs >= NIGHT_BUDGET_MS ? 'time-budget'
    : eligible.length === 0 ? 'no-eligible-issue' : 'selected';
  const nextIssueId = reason === 'selected' ? eligible.shift().id : null;
  return { ok: true, nextIssueId, reason, elapsedMs,
    attemptsUsed: input.attemptedIssueIds.length, skipped, remainingIssueIds: eligible.map(c => c.id) };
}
