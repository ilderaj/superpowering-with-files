// Corleone persona/role resolver for dsh dispatch (visible worker bridge
// repair).
//
// Pure TypeScript port of the Corleone selection surface in
// harness/trio/hosts/codex.mjs so the dsh plugin can resolve the Corleone
// persona from the Assignment Packet capability without importing root
// harness modules. Roster names, tiers, ordinals, selection semantics, and
// fail-closed error texts are kept identical so the packet capability ->
// Corleone role mapping matches the harness selector exactly.

import { EXECUTION_WORK_ROLES, PRIMARY_EXECUTION_REQUIRED } from './constants.js';

export const CORLEONE_ROSTER: Readonly<Record<string, readonly Readonly<{ agentType: string; displayName: string }>[]>> = Object.freeze({
  don: Object.freeze([
    Object.freeze({ agentType: 'don_michael', displayName: 'Don Michael Corleone' })
  ]),
  underboss: Object.freeze([
    Object.freeze({ agentType: 'underboss_sonny', displayName: 'Underboss Sonny Corleone' })
  ]),
  consigliere: Object.freeze([
    Object.freeze({ agentType: 'consigliere_tom', displayName: 'Consigliere Tom Hagen' })
  ]),
  capo: Object.freeze([
    Object.freeze({ agentType: 'capo_clemenza', displayName: 'Capo Peter Clemenza' }),
    Object.freeze({ agentType: 'capo_lampone', displayName: 'Capo Rocco Lampone' })
  ]),
  buttonman: Object.freeze([
    Object.freeze({ agentType: 'buttonman_neri', displayName: 'Button Man Al Neri' }),
    Object.freeze({ agentType: 'buttonman_brasi', displayName: 'Button Man Luca Brasi' })
  ]),
  soldato: Object.freeze([
    Object.freeze({ agentType: 'soldato_cicci', displayName: 'Soldato Willie Cicci' })
  ])
});

const CORLEONE_TIER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  don: 'Don',
  underboss: 'Underboss',
  consigliere: 'Consigliere',
  capo: 'Capo',
  buttonman: 'Button Man',
  soldato: 'Soldato'
});

export interface CorleoneRoleSelection {
  agentType: string;
  displayName: string;
  tier: string;
  ordinal: number;
  /** dsh persona name passed to subagents.start; identical to agentType. */
  persona: string;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function ordinalSuffix(ordinal: number): string {
  const finalTwoDigits = ordinal % 100;
  if (finalTwoDigits >= 11 && finalTwoDigits <= 13) return 'th';
  switch (ordinal % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function selectedCorleoneTier(input: { workRole: string | null; complexity: string | null; primaryExecution: string | null }): string {
  if (input.primaryExecution === PRIMARY_EXECUTION_REQUIRED) {
    if (input.workRole === null || !EXECUTION_WORK_ROLES.includes(input.workRole)) {
      throw new TypeError('Corleone strict selection requires a supported execution workRole.');
    }
    return 'don';
  }
  if (input.workRole === 'searching' || input.workRole === 'researching' || input.workRole === 'exploring') {
    return 'consigliere';
  }
  if (input.workRole === 'repetitive_execution') return 'soldato';
  if (input.workRole === 'coding' || input.workRole === 'executing') {
    if (input.complexity === 'high') return 'buttonman';
    if (input.complexity === 'xhigh') return 'capo';
    if (input.complexity === 'max') return 'underboss';
  }
  throw new TypeError('Corleone role selection requires a supported execution workRole and complexity.');
}

interface CorleoneIdentity {
  agentType: string;
  displayName: string;
  tier: string;
  ordinal: number;
}

function allocateCorleoneCallsign(input: { tier: string; ordinal: number }): CorleoneIdentity {
  if (!Object.hasOwn(CORLEONE_ROSTER, input.tier)) {
    throw new TypeError('Unknown Corleone tier: ' + String(input.tier) + '.');
  }
  if (!Number.isSafeInteger(input.ordinal) || input.ordinal < 1) {
    throw new TypeError('Corleone callsign ordinal must be a positive safe integer.');
  }
  const member = CORLEONE_ROSTER[input.tier]![input.ordinal - 1];
  if (member) {
    return { ...member, tier: input.tier, ordinal: input.ordinal };
  }
  return {
    agentType: input.tier,
    displayName: CORLEONE_TIER_LABELS[input.tier] + ' ' + input.ordinal + ordinalSuffix(input.ordinal),
    tier: input.tier,
    ordinal: input.ordinal
  };
}

/**
 * Resolve the frozen Corleone identity for a dsh dispatch from the packet
 * capability fields (workRole / complexity / primaryExecution / ordinal).
 * Fail-closed: an unsupported capability throws instead of returning an
 * unbound persona, and Don Michael is reserved at ordinal 1.
 */
export function resolveCorleoneRole(capability: unknown): CorleoneRoleSelection {
  const source = objectRecord(capability);
  const workRole = normalizedString(source.workRole);
  const complexity = normalizedString(source.complexity);
  const primaryExecution = normalizedString(source.primaryExecution);
  const tier = selectedCorleoneTier({ workRole, complexity, primaryExecution });
  const declaredOrdinal = source.ordinal;
  // Mirror harness selectCorleoneRole exactly: on the strict visible-worker
  // Don lane an explicitly supplied ordinal (including null) that is not 1
  // always fails closed — explicit null never means "default" there. The
  // tier reservation is checked BEFORE the positive-safe-integer validation,
  // so a non-numeric Don ordinal reports the strict-Don error too.
  if (tier === 'don' && declaredOrdinal !== undefined && declaredOrdinal !== 1) {
    throw new TypeError('Corleone strict selection reserves Don Michael at ordinal 1.');
  }
  // Non-Don tiers (and the Don default) follow the harness 'ordinal ?? 1'
  // semantics: only an ABSENT ordinal defaults to 1; an explicitly supplied
  // ordinal is passed to allocateCorleoneCallsign unchanged so an invalid
  // value fails closed with the callsign error.
  const ordinal: number = (declaredOrdinal ?? 1) as number;
  const identity = allocateCorleoneCallsign({ tier, ordinal });
  return {
    agentType: identity.agentType,
    displayName: identity.displayName,
    tier: identity.tier,
    ordinal: identity.ordinal,
    persona: identity.agentType
  };
}
