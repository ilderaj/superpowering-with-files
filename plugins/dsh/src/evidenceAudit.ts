// Evidence directory audit (Slice 3, plan item 3).
//
// Runnable check over planning/active/<task-id>/evidence/: three-state record
// completeness, the invariant that host-claimed is never written as
// authenticated, and the rule that an unrecorded dispatch is rejected (a
// bare unknown worker record would hide a silent dispatch). Pure over file
// inputs; wired into /swf audit and the hostless CLI script.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EVIDENCE_STATES, assertEvidenceState } from './core/index.js';
import { evidenceDirectory, type EvidenceFile } from './packet.js';

export interface AuditViolation {
  file: string;
  rule: string;
  detail: string;
}

export interface EvidenceAuditResult {
  ok: boolean;
  taskId: string;
  authorityRoot: string;
  files: number;
  violations: AuditViolation[];
  checks: {
    threeState: boolean;
    hostClaimedCompleteness: boolean;
    hostClaimedNeverAuthenticated: boolean;
    unknownNeverAuthenticated: boolean;
    authenticatedRef: boolean;
    unrecordedDispatchRejected: boolean;
  };
}

const RULE_TO_CHECK: Record<string, keyof EvidenceAuditResult['checks']> = {
  invalid_evidence_state: 'threeState',
  unreadable_evidence: 'threeState',
  authenticated_missing_flag: 'authenticatedRef',
  authenticated_missing_ref: 'authenticatedRef',
  host_claimed_incomplete: 'hostClaimedCompleteness',
  host_claimed_as_authenticated: 'hostClaimedNeverAuthenticated',
  unknown_marked_authenticated: 'unknownNeverAuthenticated',
  silent_worker_record: 'unrecordedDispatchRejected'
};

type AnyRecord = Record<string, unknown>;

function hasNonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Rule evaluation over one parsed evidence record (pure, testable). fileName
 * is used only for reporting.
 */
export function auditEvidenceRecord(fileName: string, record: AnyRecord): AuditViolation[] {
  const violations: AuditViolation[] = [];
  const state = record.state;

  // R1: exactly one of the three evidence states.
  if (typeof state !== 'string' || !EVIDENCE_STATES.includes(state)) {
    violations.push({ file: fileName, rule: 'invalid_evidence_state', detail: 'state must be one of ' + EVIDENCE_STATES.join('|') + ', got: ' + String(state) });
    return violations;
  }

  // R2: authenticated requires a verifiable reference AND the authenticated flag.
  if (state === 'authenticated') {
    if (record.authenticated !== true) {
      violations.push({ file: fileName, rule: 'authenticated_missing_flag', detail: 'authenticated state requires authenticated === true' });
    }
    if (!hasNonEmpty(record.evidenceRef)) {
      violations.push({ file: fileName, rule: 'authenticated_missing_ref', detail: 'authenticated state requires a non-empty evidenceRef' });
    }
  }

  // R3: host-claimed is defined by a complete {SessionId, provider, declared model}.
  if (state === 'host-claimed') {
    for (const field of ['sessionId', 'provider', 'declaredModel'] as const) {
      if (!hasNonEmpty(record[field])) {
        violations.push({ file: fileName, rule: 'host_claimed_incomplete', detail: 'host-claimed record must carry a non-empty ' + field });
      }
    }
  }

  // R4: the hard invariant — host-claimed must never be written as authenticated.
  if (state === 'host-claimed' && record.authenticated === true) {
    violations.push({ file: fileName, rule: 'host_claimed_as_authenticated', detail: 'host-claimed evidence must never be written as authenticated' });
  }

  // R5: unknown never claims authenticity.
  if (state === 'unknown' && record.authenticated === true) {
    violations.push({ file: fileName, rule: 'unknown_marked_authenticated', detail: 'unknown evidence must not carry authenticated === true' });
  }

  // R6: an unrecorded dispatch is rejected — a worker-kind record with state
  // unknown must carry an explanation (failure or note). A bare unknown worker
  // record would hide a silent dispatch.
  const kind = typeof record.kind === 'string' ? record.kind : fileName.replace(/\.json$/, '');
  if (kind === 'worker' && state === 'unknown') {
    const extra = (record.extra ?? {}) as AnyRecord;
    const explained = hasNonEmpty(extra.failure) || hasNonEmpty(extra.note);
    if (!explained) {
      violations.push({ file: fileName, rule: 'silent_worker_record', detail: 'worker record with state unknown must carry extra.failure or extra.note (unrecorded dispatch must be rejected)' });
    }
  }

  return violations;
}

export async function auditEvidenceDirectory(authorityRoot: string, taskId: string): Promise<EvidenceAuditResult> {
  const violations: AuditViolation[] = [];
  const directory = evidenceDirectory(authorityRoot, taskId);
  const checks = {
    threeState: true,
    hostClaimedCompleteness: true,
    hostClaimedNeverAuthenticated: true,
    unknownNeverAuthenticated: true,
    authenticatedRef: true,
    unrecordedDispatchRejected: true
  };
  let names: string[] = [];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    // Missing evidence dir is a violation signal: a bound task should have evidence.
    violations.push({ file: '<evidence-dir>', rule: 'evidence_dir_missing', detail: 'no evidence directory at ' + directory });
    return { ok: false, taskId, authorityRoot, files: 0, violations, checks };
  }

  for (const name of names) {
    let parsed: AnyRecord;
    try {
      parsed = JSON.parse(await readFile(join(directory, name), 'utf8')) as AnyRecord;
    } catch (error) {
      violations.push({ file: name, rule: 'unreadable_evidence', detail: (error as Error).message });
      continue;
    }
    const found = auditEvidenceRecord(name, parsed);
    violations.push(...found);
    for (const violation of found) {
      const key = RULE_TO_CHECK[violation.rule];
      if (key !== undefined) checks[key] = false;
    }
  }
  return { ok: violations.length === 0, taskId, authorityRoot, files: names.length, violations, checks };
}
