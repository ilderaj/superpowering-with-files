// Three-state evidence model (feasibility report decision 8).
//
// Evidence for model/effort/worker identity is classified as exactly one of:
//   authenticated - verifiable Host evidence: authenticated flag, evidenceRef,
//                   and a matching packet digest (when one is expected).
//   host-claimed  - the dsh host records a visible dispatch {SessionId,
//                   provider, declared model} but no authenticated evidence.
//   unknown       - nothing verifiable was recorded.
//
// Invariant: host-claimed evidence must NEVER be written as authenticated.
// Acceptance only recognizes authenticated, or host-claimed plus an explicit
// human confirmation (report decision 8; approval-policy=never mapping is a
// later-slice concern).

import { EVIDENCE_STATES } from './constants.js';

export type EvidenceState = 'authenticated' | 'host-claimed' | 'unknown';

export interface EvidenceInput {
  authenticated?: unknown;
  evidenceRef?: unknown;
  sessionId?: unknown;
  provider?: unknown;
  declaredModel?: unknown;
  actualModel?: unknown;
  actualEffort?: unknown;
  packetDigest?: unknown;
  expectedPacketDigest?: string | null;
}

export interface WorkerEvidenceRecord {
  state: EvidenceState;
  authenticated: boolean;
  evidenceRef: string | null;
  sessionId: string | null;
  provider: string | null;
  declaredModel: string | null;
  actualModel: string | null;
  actualEffort: string | null;
}

function normalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function classifyEvidenceState(input: EvidenceInput = {}): EvidenceState {
  const evidenceRef = normalizedString(input.evidenceRef);
  const authenticatedFlag = input.authenticated === true;
  const digestMatches = input.expectedPacketDigest === null
    || input.expectedPacketDigest === undefined
    || normalizedString(input.packetDigest) === input.expectedPacketDigest;

  // Authenticated requires a verifiable reference; a bare flag is not enough.
  if (authenticatedFlag && evidenceRef !== null && digestMatches) {
    return 'authenticated';
  }
  // A caller claiming authenticated without verifiable evidence fails closed
  // to unknown; it must never degrade into host-claimed (which would mislabel
  // an unverifiable claim as an honest host record).
  if (authenticatedFlag) {
    return 'unknown';
  }

  const hasDispatchRecord = normalizedString(input.sessionId) !== null
    && normalizedString(input.provider) !== null
    && normalizedString(input.declaredModel) !== null;
  return hasDispatchRecord ? 'host-claimed' : 'unknown';
}

export function assertEvidenceState(value: unknown): asserts value is EvidenceState {
  if (typeof value !== 'string' || !EVIDENCE_STATES.includes(value)) {
    throw new Error(`Unknown evidence state: ${String(value)}`);
  }
}

// Builds an evidence record and enforces the invariant that host-claimed is
// never written as authenticated.
export function evidenceRecord(input: EvidenceInput = {}): WorkerEvidenceRecord {
  const state = classifyEvidenceState(input);
  if (state === 'host-claimed' && input.authenticated === true) {
    throw new Error('host-claimed evidence must never be written as authenticated.');
  }
  return {
    state,
    authenticated: state === 'authenticated',
    evidenceRef: normalizedString(input.evidenceRef),
    sessionId: normalizedString(input.sessionId),
    provider: normalizedString(input.provider),
    declaredModel: normalizedString(input.declaredModel),
    actualModel: normalizedString(input.actualModel),
    actualEffort: normalizedString(input.actualEffort)
  };
}

// Acceptance rule (report decision 8): authenticated passes; host-claimed
// passes only with an explicit human confirmation; unknown never passes.
export function evidenceAcceptable(state: EvidenceState, humanConfirmed: unknown): boolean {
  if (state === 'authenticated') return true;
  if (state === 'host-claimed') return humanConfirmed === true;
  return false;
}

// Strict guard: a host-claimed record must not be presented as authenticated
// at any downstream gate. Returns the record unchanged or throws.
export function requireNotHostClaimedAsAuthenticated(record: WorkerEvidenceRecord): WorkerEvidenceRecord {
  if (record.state === 'host-claimed' && record.authenticated === true) {
    throw new Error('host-claimed evidence must never be written as authenticated.');
  }
  return record;
}
