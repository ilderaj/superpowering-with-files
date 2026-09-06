export { resolveHostOperation as resolveCodexHostOperation } from '../core/routing.mjs';
import {
  adjudicatePermission,
  freezeAssignmentPacket,
  HOST_OPERATIONS,
  packetDigestOf,
  resolveAssignmentPacketModelPolicy,
  validateModelEffort,
  recommendedEffortOf
} from '../core/routing.mjs';

export const APPROVAL_POLICY_KINDS = Object.freeze(['never', 'on-request']);

function normalizedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export const CORLEONE_ROSTER = Object.freeze({
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

export const CORLEONE_AGENT_TYPES = Object.freeze([
  ...Object.values(CORLEONE_ROSTER).flat().map(({ agentType }) => agentType),
  ...Object.keys(CORLEONE_ROSTER)
]);

const CORLEONE_TIER_LABELS = Object.freeze({
  don: 'Don',
  underboss: 'Underboss',
  consigliere: 'Consigliere',
  capo: 'Capo',
  buttonman: 'Button Man',
  soldato: 'Soldato'
});

const CORLEONE_EXECUTION_WORK_ROLES = Object.freeze([
  'executing',
  'searching',
  'researching',
  'coding',
  'exploring',
  'repetitive_execution'
]);

function ordinalSuffix(ordinal) {
  const finalTwoDigits = ordinal % 100;
  if (finalTwoDigits >= 11 && finalTwoDigits <= 13) return 'th';
  switch (ordinal % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function selectedCorleoneTier({ workRole, complexity, primaryExecution }) {
  if (primaryExecution === 'visible_worker_required') {
    if (!CORLEONE_EXECUTION_WORK_ROLES.includes(workRole)) {
      throw new TypeError('Corleone strict selection requires a supported execution workRole.');
    }
    return 'don';
  }
  if (['searching', 'researching', 'exploring'].includes(workRole)) return 'consigliere';
  if (workRole === 'repetitive_execution') return 'soldato';
  if (['coding', 'executing'].includes(workRole)) {
    if (complexity === 'high') return 'buttonman';
    if (complexity === 'xhigh') return 'capo';
    if (complexity === 'max') return 'underboss';
  }
  throw new TypeError('Corleone role selection requires a supported execution workRole and complexity.');
}

export function allocateCorleoneCallsign(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Corleone callsign input must be an object.');
  }
  const tier = normalizedString(input.tier);
  const ordinal = input.ordinal ?? 1;
  if (tier === null || !Object.hasOwn(CORLEONE_ROSTER, tier)) {
    throw new TypeError(`Unknown Corleone tier: ${String(input.tier)}.`);
  }
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new TypeError('Corleone callsign ordinal must be a positive safe integer.');
  }
  const member = CORLEONE_ROSTER[tier][ordinal - 1];
  if (member) return { ...member, tier, ordinal };
  return {
    agentType: tier,
    displayName: `${CORLEONE_TIER_LABELS[tier]} ${ordinal}${ordinalSuffix(ordinal)}`,
    tier,
    ordinal
  };
}

function frozenCorleoneIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Corleone workerIdentity must be an object.');
  }
  const expected = allocateCorleoneCallsign({ tier: value.tier, ordinal: value.ordinal });
  if (value.agentType !== expected.agentType || value.displayName !== expected.displayName) {
    throw new TypeError('Corleone workerIdentity does not match its frozen callsign.');
  }
  return expected;
}

export function selectCorleoneRole(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Corleone role selection input must be an object.');
  }
  const tier = selectedCorleoneTier(input);
  if (input.workerIdentity !== undefined) {
    const identity = frozenCorleoneIdentity(input.workerIdentity);
    if (identity.tier !== tier) {
      throw new TypeError(`Corleone frozen workerIdentity tier ${identity.tier} does not match packet-selected tier ${tier}.`);
    }
    if (tier === 'don' && identity.ordinal !== 1) {
      throw new TypeError('Corleone strict selection reserves Don Michael at ordinal 1.');
    }
    return identity;
  }
  if (tier === 'don' && input.ordinal !== undefined && input.ordinal !== 1) {
    throw new TypeError('Corleone strict selection reserves Don Michael at ordinal 1.');
  }
  return allocateCorleoneCallsign({ tier, ordinal: input.ordinal ?? 1 });
}


const CORLEONE_DEFAULT_EFFORTS = Object.freeze({
  don: 'xhigh',
  underboss: 'max',
  consigliere: 'xhigh',
  capo: 'xhigh',
  buttonman: 'high',
  soldato: 'high'
});

function corleoneProfileIdentity(agentType) {
  const normalizedAgentType = normalizedString(agentType);
  for (const [tier, members] of Object.entries(CORLEONE_ROSTER)) {
    const member = members.find((candidate) => candidate.agentType === normalizedAgentType);
    if (member) return { ...member, tier };
  }
  if (normalizedAgentType !== null && Object.hasOwn(CORLEONE_TIER_LABELS, normalizedAgentType)) {
    return {
      agentType: normalizedAgentType,
      displayName: CORLEONE_TIER_LABELS[normalizedAgentType],
      tier: normalizedAgentType
    };
  }
  throw new TypeError(`Unknown Corleone agent type: ${String(agentType)}.`);
}

function corleoneInstructions(identity) {
  const roleSpecific = {
    don: 'You are the highest-level visible execution candidate for one frozen slice.',
    underboss: 'You lead one bounded complex execution slice and return evidence to the Chief.',
    consigliere: 'You perform bounded research, review, and evidence synthesis; source writes require an explicit envelope.',
    capo: 'You execute one bounded multi-file implementation slice with a fixed path envelope.',
    buttonman: 'You execute one narrow implementation or verification slice with a fixed path envelope.',
    soldato: 'You perform repetitive verification or evidence collection; source writes require an explicit envelope.'
  };
  return [
    `You are ${identity.displayName}.`,
    roleSpecific[identity.tier],
    'Execute an already accepted plan and do not redesign scope, architecture, interfaces, or acceptance criteria.',
    'Return blocked when a material decision is missing or the requested execution model is unavailable.',
    'Your title grants no permissions, acceptance authority, model claim, or human-gate bypass.',
    'Any local child work must remain within the exact assignment packet and Host-provided envelope.'
  ].join(' ');
}

export function resolveCorleoneProfile(agentType, effort, model = 'opencode-go/deepseek-v4-flash') {
  const identity = corleoneProfileIdentity(agentType);
  const effectiveEffort = effort ?? recommendedEffortOf(model) ?? CORLEONE_DEFAULT_EFFORTS[identity.tier];
  try {
    validateModelEffort(model, effectiveEffort, { isChild: true });
  } catch (error) {
    throw new TypeError(`Unsupported Corleone profile: ${error.message}`);
  }
  return Object.freeze({
    name: identity.agentType,
    model,
    fallbackModel: null,
    description: `${identity.displayName}: bounded Corleone execution identity.`,
    nicknameCandidates: [identity.displayName],
    instructions: corleoneInstructions(identity),
    modelReasoningEffort: effectiveEffort
  });
}

export function renderCorleoneAgentEntry(agentType, configFilePath, effort, model) {
  if (typeof configFilePath !== 'string' || configFilePath.length === 0) {
    throw new TypeError('Corleone agent entry requires a role config file path.');
  }
  const role = resolveCorleoneProfile(agentType, effort, model);
  return [
    `[agents.${role.name}]`,
    `description = "${role.description}"`,
    `config_file = "${configFilePath}"`
  ].join('\n') + '\n';
}

export function renderCorleoneRoleFile(agentType, effort, model) {
  const role = resolveCorleoneProfile(agentType, effort, model);
  return [
    `name = "${role.name}"`,
    `description = "${role.description}"`,
    `nickname_candidates = [${role.nicknameCandidates.map((name) => `"${name}"`).join(', ')}]`,
    `model = "${role.model}"`,
    `model_reasoning_effort = "${role.modelReasoningEffort}"`,
    `developer_instructions = "${role.instructions}"`
  ].join('\n') + '\n';
}

/**
 * Optional model-inheriting Codex role configuration for flexible collaboration.
 * Omitting model/provider/effort keys leaves selection to the caller and Host;
 * the persona supplies identity and bounded instructions only. This renderer
 * performs no installation and makes no claim about actual Host execution.
 * renderCorleoneRoleFile / renderCorleoneRosterConfig remain the explicit
 * fixed-profile legacy compatibility path; adoption must choose this renderer.
 */
export function renderInheritedCorleoneRoleFile(agentType) {
  const identity = corleoneProfileIdentity(agentType);
  const instructions = [
    `You are ${identity.displayName}.`,
    'Follow the current assignment and authorized scope; do not widen paths, permissions, or acceptance criteria.',
    'Use the model and effort selected by the caller or inherited from the Host; your callsign does not select either.',
    'Use bounded parallel helpers when permitted by the user and Host; keep each child scope a proper subset and avoid conflicting writes.',
    'When the assignment requires visible_worker_required, preserve that topology and return blocked if the compliant visible worker is unavailable; otherwise use the supported collaboration path selected for the assignment.',
    'Honor applicable Host controls and human gates; your title grants no permissions or acceptance authority.',
    'Report results, verification, and limits; actual model and effort remain unknown unless authenticated Host evidence establishes them.'
  ].join(' ');
  return [
    `name = ${JSON.stringify(identity.agentType)}`,
    `description = ${JSON.stringify(`${identity.displayName}: bounded Corleone collaboration identity.`)}`,
    `nickname_candidates = [${JSON.stringify(identity.displayName)}]`,
    `developer_instructions = ${JSON.stringify(instructions)}`
  ].join('\n') + '\n';
}

export function renderCorleoneRosterConfig(configDirectory, effort, model) {
  if (typeof configDirectory !== 'string' || configDirectory.length === 0) {
    throw new TypeError('Corleone roster config requires a config directory.');
  }
  const directory = configDirectory.replace(/\/$/u, '');
  return Object.freeze(CORLEONE_AGENT_TYPES.map((agentType) => {
    const identity = corleoneProfileIdentity(agentType);
    const configFilePath = `${directory}/${agentType}.toml`;
    return Object.freeze({
      ...identity,
      configFilePath,
      agentEntry: renderCorleoneAgentEntry(agentType, configFilePath, effort, model),
      roleFile: renderCorleoneRoleFile(agentType, effort, model)
    });
  }));
}

export const ADAPTER_VOCABULARY = Object.freeze(['codex', 'claude_code', 'pi']);

export function adapterStatus(adapter) {
  if (adapter === 'codex') return 'implemented';
  if (adapter === 'claude_code' || adapter === 'pi') return 'unimplemented';
  throw new Error(`Unknown Host adapter: ${String(adapter)}`);
}

export function renderCodexHandoffRequest({
  operation,
  packet,
  packetDigest,
  effort,
  workerIdentity,
  ordinal = 1
}) {
  if (!HOST_OPERATIONS.includes(operation)) {
    throw new TypeError('Codex handoff request requires a supported lifecycle operation.');
  }
  if (!packet || typeof packet !== 'object') {
    throw new TypeError('Codex handoff request requires an immutable Assignment Packet.');
  }
  const assignmentPacket = freezeAssignmentPacket(packet);
  if (typeof packetDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(packetDigest)) {
    throw new TypeError('Codex handoff request requires a stable packet digest.');
  }
  const expectedPacketDigest = packetDigestOf(assignmentPacket);
  if (packetDigest !== expectedPacketDigest) {
    throw new Error('Codex handoff packet digest must match the immutable Assignment Packet.');
  }
  const capability = assignmentPacket.capability;
  const modelPolicy = resolveAssignmentPacketModelPolicy(assignmentPacket);
  if (effort !== undefined) validateModelEffort(modelPolicy.requestedModel, effort, { isChild: true });
  const outerEffort = effort ?? null;
  if (outerEffort !== null && outerEffort !== modelPolicy.requestedEffort) {
    throw new Error(`Outer requested effort ${outerEffort} conflicts with the validated packet policy ${modelPolicy.requestedEffort}.`);
  }
  if (operation === 'spawn' && workerIdentity !== undefined) {
    throw new TypeError('Codex spawn selects its Corleone workerIdentity from the Assignment Packet; frozen workerIdentity is only valid for a non-spawn lifecycle operation.');
  }
  if (operation !== 'spawn' && workerIdentity === undefined) {
    throw new TypeError('Non-spawn Codex handoff requires the frozen workerIdentity from the original spawn.');
  }
  const identity = selectCorleoneRole({
    workerIdentity: operation === 'spawn' ? undefined : workerIdentity,
    workRole: capability?.workRole,
    complexity: capability?.complexity,
    primaryExecution: capability?.primaryExecution,
    ordinal
  });
  return {
    provider: 'codex',
    role: identity.agentType,
    workerIdentity: identity,
    profile: resolveCorleoneProfile(identity.agentType, modelPolicy.requestedEffort, modelPolicy.requestedModel),
    operation,
    packet: assignmentPacket,
    packetDigest,
    executed: false
  };
}

function normalizeApprovalPolicy(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !APPROVAL_POLICY_KINDS.includes(value)) {
    throw new Error(`${label} must be never or on-request.`);
  }
  return value;
}

function approvalPolicyActual(hostObservation, packetDigest) {
  const authenticated = hostObservation.authenticated === true
    && normalizedString(hostObservation.evidenceRef) !== null
    && (packetDigest === null || hostObservation.packetDigest === packetDigest);
  if (!authenticated) {
    return { authenticated: false, evidenceRef: null, policy: 'unknown' };
  }
  const policy = normalizedString(hostObservation.actualApprovalPolicy);
  return {
    authenticated: true,
    evidenceRef: normalizedString(hostObservation.evidenceRef),
    policy: policy !== null && APPROVAL_POLICY_KINDS.includes(policy) ? policy : 'unknown'
  };
}

export function resolveCodexPermissionIntent(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Codex permission intent input must be an object.');
  }
  const observation = input.hostObservation !== null
    && typeof input.hostObservation === 'object'
    && !Array.isArray(input.hostObservation)
    ? input.hostObservation
    : {};
  const verdict = adjudicatePermission({
    assignmentPacket: input.assignmentPacket,
    targetPaths: input.targetPaths,
    permissionIntent: input.permissionIntent,
    approval: input.approval,
    hostObservation: observation,
    generatedTargets: input.generatedTargets
  });
  const requestedApprovalPolicy = normalizeApprovalPolicy(input.approvalPolicy, 'approvalPolicy');
  const actualApprovalPolicy = approvalPolicyActual(observation, packetDigestOf(input.assignmentPacket));
  const rawReviewer = observation.actualReviewer;
  const reviewer = typeof rawReviewer === 'string' && rawReviewer.trim() !== ''
    ? rawReviewer.trim()
    : 'unknown';
  const actual = {
    authenticated: verdict.actual.authenticated,
    evidenceRef: verdict.actual.evidenceRef,
    sandbox: verdict.actual.sandbox,
    writableRoots: Array.isArray(verdict.actual.writableRoots)
      ? [...verdict.actual.writableRoots]
      : verdict.actual.writableRoots,
    reviewer,
    approvalPolicy: actualApprovalPolicy.policy
  };
  const bound = actual.authenticated === true
    && actual.sandbox !== 'unknown'
    && actual.writableRoots !== 'unknown'
    && actual.reviewer !== 'unknown';
  const expression = {
    provider: 'codex',
    sandboxMode: verdict.requested.sandboxMode,
    writableRoots: [...verdict.requested.writableRoots],
    requestedApprovalPolicy,
    applied: false
  };
  let outcome;
  if (verdict.stage === 'scope') {
    outcome = {
      kind: 'blocked',
      stage: 'scope',
      reason: verdict.reason,
      executed: false,
      writes: []
    };
  } else if (requestedApprovalPolicy === null
    || actualApprovalPolicy.policy !== requestedApprovalPolicy) {
    outcome = {
      kind: 'manual_pending',
      executed: false,
      writes: [],
      blocker: 'worker_approval_policy_unbound',
      resumeCondition: 'Declare an explicit requested approval policy (never | on-request) and provide authenticated Host evidence binding the exact packet digest to the actual per-worker approval policy before any permission claim; Full Access is a sandbox mode, not approval_policy=never.'
    };
  } else if (!bound) {
    outcome = {
      kind: 'manual_pending',
      executed: false,
      writes: [],
      blocker: verdict.reason ?? 'permission_actual_unbound',
      resumeCondition: 'Provide authenticated Host evidence binding the exact packet digest with actual sandbox, writable roots, and reviewer state before any permission claim.'
    };
  } else {
    outcome = {
      kind: 'codex_permission_expression',
      decision: verdict.verdict,
      stage: verdict.stage,
      reason: verdict.reason,
      applied: false
    };
  }
  return {
    provider: 'codex',
    requested: {
      ...verdict.requested,
      approvalPolicy: requestedApprovalPolicy
    },
    expression,
    actual,
    outcome
  };
}
