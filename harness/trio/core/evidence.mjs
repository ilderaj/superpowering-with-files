import { CHECK_STATUSES } from './decision.mjs';

// Deterministic evidence collection. This module observes and records; it never
// judges. A failing command is a fact with an exit code, not a decision, so
// nothing here returns a transition, an outcome or a semantic answer.

export const DEV_EVIDENCE_VERSION = 1;
export const OFFICE_EVIDENCE_VERSION = 1;

// The bounded set of dev surfaces this adapter may observe. An undeclared id is
// rejected so the adapter cannot drift into a general-purpose command runner.
export const DEV_CHECK_IDS = Object.freeze(['tests', 'build', 'lint', 'typecheck']);

// Why an observation reached its status. Frozen so a consumer can branch on a
// reason without parsing prose.
export const OBSERVATION_REASONS = Object.freeze([
  'exit-zero',
  'exit-nonzero',
  'timed-out',
  'signalled',
  'transient-infrastructure',
  'not-run',
  'unreadable'
]);

// Git facts are observed state, not pass/fail judgements: a dirty tree is not a
// failed check, so these never enter the check list.
export const GIT_FACT_FIELDS = Object.freeze(['branch', 'head', 'dirty', 'detached']);
export const GIT_FACT_REASONS = Object.freeze(['observed', 'unreadable']);

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be non-empty text.`);
  }
}

function assertCheckId(id) {
  assertText(id, 'Dev evidence check id');
  if (!DEV_CHECK_IDS.includes(id)) {
    throw new Error(`Unknown dev evidence check id: ${String(id)}. Declared ids are ${DEV_CHECK_IDS.join(', ')}.`);
  }
}

function normalizeRequiredCheckIds(requiredCheckIds, knownIds, label) {
  if (requiredCheckIds === undefined) return [...knownIds];
  if (!Array.isArray(requiredCheckIds)) {
    throw new Error(`${label} must be an array.`);
  }
  const seen = new Set();
  for (const id of requiredCheckIds) {
    assertText(id, `${label} id`);
    if (!knownIds.includes(id)) {
      throw new Error(`Unknown ${label.toLowerCase()} id: ${String(id)}. Declared ids are ${knownIds.join(', ')}.`);
    }
    if (seen.has(id)) throw new Error(`Duplicate ${label.toLowerCase()} id: ${id}.`);
    seen.add(id);
  }
  return [...requiredCheckIds];
}

function requiredIdsFromOptions(options, knownIds, label) {
  if (options === undefined) return normalizeRequiredCheckIds(undefined, knownIds, label);
  if (Array.isArray(options)) return normalizeRequiredCheckIds(options, knownIds, label);
  assertPlainObject(options, `${label} options`);
  return normalizeRequiredCheckIds(options.requiredCheckIds, knownIds, label);
}

function assertResultsWithinScope(results, requiredIds, label, checkId) {
  for (const id of Object.keys(results)) {
    checkId(id);
    if (!requiredIds.includes(id)) {
      throw new Error(`${label} ${id} is outside required ${label.replace(/ check$/, '').toLowerCase()} scope.`);
    }
  }
}

// A command result becomes exactly one observed status. An unstarted, timed-out
// or signalled command is `unknown`: no verdict was reached, so claiming
// `fail` would invent one.
export function classifyObservation(result) {
  if (result === null || result === undefined) {
    return Object.freeze({ status: 'unknown', reason: 'not-run' });
  }
  assertPlainObject(result, 'Command observation');
  if (result.transient === true || result.reason === 'transient-infrastructure') {
    return Object.freeze({ status: 'unknown', reason: 'transient-infrastructure' });
  }
  if (result.timedOut === true) return Object.freeze({ status: 'unknown', reason: 'timed-out' });
  if (result.exitCode === undefined || result.exitCode === null) {
    return Object.freeze({ status: 'unknown', reason: result.signal ? 'signalled' : 'not-run' });
  }
  if (!Number.isSafeInteger(result.exitCode)) {
    return Object.freeze({ status: 'unknown', reason: 'unreadable' });
  }
  if (result.exitCode !== 0 && result.signal) {
    return Object.freeze({ status: 'unknown', reason: 'signalled' });
  }
  return result.exitCode === 0
    ? Object.freeze({ status: 'pass', reason: 'exit-zero' })
    : Object.freeze({ status: 'fail', reason: 'exit-nonzero' });
}

function optionalDuration(value, label) {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be null or a non-negative number.`);
  }
  return value;
}

// One check record. The extra fields carry the raw observation alongside the
// status; the decision contract only requires `id` and `status`.
export function devCheck(id, result) {
  assertCheckId(id);
  const observed = classifyObservation(result);
  if (!CHECK_STATUSES.includes(observed.status)) {
    throw new Error(`Observed status must be one of ${CHECK_STATUSES.join(', ')}.`);
  }
  const record = { id, status: observed.status, reason: observed.reason };
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    if (Number.isSafeInteger(result.exitCode)) record.exitCode = result.exitCode;
    if (typeof result.signal === 'string' && result.signal !== '') record.signal = result.signal;
    if (result.timedOut === true) record.timedOut = true;
    if (result.transient === true) record.transient = true;
    record.durationMs = optionalDuration(result.durationMs, `Dev evidence ${id}.durationMs`);
    if (typeof result.command === 'string' && result.command.trim() !== '') record.command = result.command;
  } else {
    record.durationMs = null;
  }
  return Object.freeze(record);
}

// Every declared check appears exactly once. An unreported check is `unknown`
// with reason `not-run`, never an assumed pass.
export function devChecks(results = {}, options = undefined) {
  assertPlainObject(results, 'Dev evidence results');
  const requiredCheckIds = requiredIdsFromOptions(options, DEV_CHECK_IDS, 'Dev evidence check');
  assertResultsWithinScope(results, requiredCheckIds, 'Dev evidence check', assertCheckId);
  return Object.freeze(requiredCheckIds.map((id) => devCheck(id, results[id] ?? null)));
}

// Git state is reported as facts with no verdict attached.
export function gitFacts(input = null) {
  if (input === null || input === undefined) {
    return Object.freeze({
      branch: null,
      head: null,
      dirty: null,
      detached: null,
      reason: 'unreadable'
    });
  }
  assertPlainObject(input, 'Git facts');
  for (const key of Object.keys(input)) {
    if (!GIT_FACT_FIELDS.includes(key)) {
      throw new Error(`Unknown git fact: ${String(key)}. Declared facts are ${GIT_FACT_FIELDS.join(', ')}.`);
    }
  }
  const branch = input.branch ?? null;
  const head = input.head ?? null;
  if (branch !== null) assertText(branch, 'Git facts branch');
  if (head !== null) assertText(head, 'Git facts head');
  for (const key of ['dirty', 'detached']) {
    if (input[key] !== undefined && input[key] !== null && typeof input[key] !== 'boolean') {
      throw new Error(`Git facts ${key} must be a boolean or null.`);
    }
  }
  return Object.freeze({
    branch,
    head,
    dirty: input.dirty ?? null,
    detached: input.detached ?? null,
    reason: 'observed'
  });
}

// The `evidence.deterministic` value for the verify bundle. It carries observed
// checks and git facts only: no answers, no recommendation, no outcome.
export function devEvidence({ results = {}, git = null, requiredCheckIds = undefined } = {}) {
  assertPlainObject(results, 'Dev evidence results');
  return Object.freeze({ checks: devChecks(results, { requiredCheckIds }), git: gitFacts(git) });
}

// ---------------------------------------------------------------------------
// Office evidence. Same rule as dev: the adapter records what a native check
// observed and never judges quality. The four ids mirror the artifact families
// already named by the office capability, so no artifact check is reimplemented
// here; the native tooling stays the source of the observation.

export const OFFICE_CHECK_IDS = Object.freeze([
  'document_structure',
  'spreadsheet_formulas',
  'presentation_render',
  'pdf_structure'
]);

export const OFFICE_ARTIFACT_KINDS = Object.freeze(['document', 'spreadsheet', 'presentation', 'pdf']);

// Presence, size and digest are facts about a file. Whether the artifact is
// good, complete or on-message is a semantic question this module never asks.
export const ARTIFACT_FACT_FIELDS = Object.freeze(['path', 'kind', 'present', 'bytes', 'sha256']);
export const ARTIFACT_FACT_REASONS = Object.freeze(['observed', 'missing', 'unreadable']);

function assertOfficeCheckId(id) {
  assertText(id, 'Office evidence check id');
  if (!OFFICE_CHECK_IDS.includes(id)) {
    throw new Error(`Unknown office evidence check id: ${String(id)}. Declared ids are ${OFFICE_CHECK_IDS.join(', ')}.`);
  }
}

// One office check record. A formula error, a failed render or a missing
// structure entry is recorded as an observed status; the record states what was
// seen, not what it means for the deliverable.
export function officeCheck(id, result) {
  assertOfficeCheckId(id);
  const observed = classifyObservation(result);
  const record = { id, status: observed.status, reason: observed.reason, durationMs: null };
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    record.durationMs = optionalDuration(result.durationMs, `Office evidence ${id}.durationMs`);
    if (typeof result.command === 'string' && result.command.trim() !== '') record.command = result.command;
    if (Array.isArray(result.errors)) {
      if (result.errors.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
        throw new Error(`Office evidence ${id}.errors must be non-empty text entries.`);
      }
      record.errors = Object.freeze([...result.errors]);
    }
    if (typeof result.coverage === 'string' && result.coverage.trim() !== '') record.coverage = result.coverage;
  }
  return Object.freeze(record);
}

export function officeChecks(results = {}, options = undefined) {
  assertPlainObject(results, 'Office evidence results');
  const requiredCheckIds = requiredIdsFromOptions(options, OFFICE_CHECK_IDS, 'Office evidence check');
  assertResultsWithinScope(results, requiredCheckIds, 'Office evidence check', assertOfficeCheckId);
  return Object.freeze(requiredCheckIds.map((id) => officeCheck(id, results[id] ?? null)));
}

// Artifact facts for the produced files. An absent artifact is `missing`, not a
// failed check: the adapter reports the file state and stops there.
export function artifactFacts(artifacts = []) {
  if (!Array.isArray(artifacts)) throw new Error('Office evidence artifacts must be an array.');
  return Object.freeze(artifacts.map((entry, index) => {
    const label = `Office evidence artifacts[${index}]`;
    assertPlainObject(entry, label);
    for (const key of Object.keys(entry)) {
      if (!ARTIFACT_FACT_FIELDS.includes(key)) {
        throw new Error(`Unknown artifact fact: ${String(key)}. Declared facts are ${ARTIFACT_FACT_FIELDS.join(', ')}.`);
      }
    }
    assertText(entry.path, `${label}.path`);
    if (!OFFICE_ARTIFACT_KINDS.includes(entry.kind)) {
      throw new Error(`${label}.kind must be one of ${OFFICE_ARTIFACT_KINDS.join(', ')}.`);
    }
    const present = entry.present ?? null;
    if (present !== null && typeof present !== 'boolean') {
      throw new Error(`${label}.present must be a boolean or null.`);
    }
    const bytes = entry.bytes ?? null;
    if (bytes !== null && !(Number.isSafeInteger(bytes) && bytes >= 0)) {
      throw new Error(`${label}.bytes must be a non-negative integer or null.`);
    }
    const digest = entry.sha256 ?? null;
    if (digest !== null) assertText(digest, `${label}.sha256`);
    const reason = present === null ? 'unreadable' : (present === true ? 'observed' : 'missing');
    return Object.freeze({ path: entry.path, kind: entry.kind, present, bytes, sha256: digest, reason });
  }));
}

// The `evidence.deterministic` value for an office verify bundle.
export function officeEvidence({ results = {}, artifacts = [], requiredCheckIds = undefined } = {}) {
  assertPlainObject(results, 'Office evidence results');
  return Object.freeze({ checks: officeChecks(results, { requiredCheckIds }), artifacts: artifactFacts(artifacts) });
}

// Run the declared native inspections and record what each one observed. The
// inspector supplies the observation; this adapter never reimplements a
// document, spreadsheet, slide or PDF check.
export async function collectOfficeEvidence({ inspections, inspect, readArtifacts = null } = {}) {
  if (!Array.isArray(inspections) || inspections.length === 0) {
    throw new Error('Office evidence collection requires a non-empty array of declared inspections.');
  }
  if (typeof inspect !== 'function') {
    throw new Error('Office evidence collection requires an inspect function.');
  }
  if (readArtifacts !== null && typeof readArtifacts !== 'function') {
    throw new Error('Office evidence readArtifacts must be a function or null.');
  }
  const seen = new Set();
  const declared = inspections.map((entry, index) => {
    const label = `Office evidence inspections[${index}]`;
    assertPlainObject(entry, label);
    assertOfficeCheckId(entry.id);
    if (seen.has(entry.id)) throw new Error(`Duplicate office evidence check id: ${entry.id}.`);
    seen.add(entry.id);
    assertText(entry.command, `${label}.command`);
    return Object.freeze({ id: entry.id, command: entry.command });
  });
  const results = {};
  for (const entry of declared) {
    const startedAt = Date.now();
    let observation;
    try {
      observation = await inspect(entry.command, { id: entry.id });
    } catch (error) {
      observation = observationFromError(error);
    }
    const durationMs = Date.now() - startedAt;
    results[entry.id] = {
      ...(observation && typeof observation === 'object' && !Array.isArray(observation) ? observation : {}),
      command: entry.command,
      durationMs: observation && typeof observation === 'object' && Number.isFinite(observation.durationMs)
        ? observation.durationMs
        : durationMs
    };
  }
  let artifacts = [];
  if (readArtifacts !== null) {
    try {
      artifacts = (await readArtifacts()) ?? [];
    } catch {
      artifacts = [];
    }
  }
  return officeEvidence({ results, artifacts, requiredCheckIds: declared.map((entry) => entry.id) });
}

function observationFromError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  if (error?.timedOut === true || /timeout|timed.?out/i.test(`${code} ${message}`)) {
    return { timedOut: true };
  }
  if (typeof error?.signal === 'string' && error.signal !== '') {
    return { exitCode: null, signal: error.signal };
  }
  if (Number.isSafeInteger(error?.exitCode)) return { exitCode: error.exitCode };
  if (Number.isSafeInteger(error?.code)) return { exitCode: error.code };
  return null;
}

function normalizeCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error('Dev evidence collection requires a non-empty array of declared commands.');
  }
  const seen = new Set();
  return commands.map((entry, index) => {
    const label = `Dev evidence commands[${index}]`;
    assertPlainObject(entry, label);
    assertCheckId(entry.id);
    if (seen.has(entry.id)) throw new Error(`Duplicate dev evidence check id: ${entry.id}.`);
    seen.add(entry.id);
    assertText(entry.command, `${label}.command`);
    if (entry.args !== undefined) {
      if (!Array.isArray(entry.args) || entry.args.some((arg) => typeof arg !== 'string')) {
        throw new Error(`${label}.args must be an array of text arguments.`);
      }
    }
    return Object.freeze({ id: entry.id, command: entry.command, args: Object.freeze([...(entry.args ?? [])]) });
  });
}

// Run each declared command through the injected runner and record what was
// observed. A runner that throws, times out or is missing is recorded as
// `unknown`; collection never fails because a check did.
export async function collectDevEvidence({ commands, run, readGit = null } = {}) {
  const declared = normalizeCommands(commands);
  if (typeof run !== 'function') {
    throw new Error('Dev evidence collection requires a run function.');
  }
  if (readGit !== null && typeof readGit !== 'function') {
    throw new Error('Dev evidence readGit must be a function or null.');
  }
  const results = {};
  for (const entry of declared) {
    const startedAt = Date.now();
    let observation;
    try {
      observation = await run(entry.command, { id: entry.id, args: entry.args });
    } catch (error) {
      observation = observationFromError(error);
    }
    const durationMs = Date.now() - startedAt;
    results[entry.id] = {
      ...(observation && typeof observation === 'object' && !Array.isArray(observation) ? observation : {}),
      command: [entry.command, ...entry.args].join(' '),
      durationMs: observation && typeof observation === 'object' && Number.isFinite(observation.durationMs)
        ? observation.durationMs
        : durationMs
    };
  }
  let git = null;
  if (readGit !== null) {
    try {
      git = await readGit();
    } catch {
      git = null;
    }
  }
  return devEvidence({ results, git, requiredCheckIds: declared.map((entry) => entry.id) });
}
