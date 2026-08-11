export { resolveHostOperation as resolveCodexHostOperation } from '../core/routing.mjs';
import { adjudicatePermission, packetDigestOf } from '../core/routing.mjs';

export const APPROVAL_POLICY_KINDS = Object.freeze(['never', 'on-request']);

function normalizedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const SWF_EXECUTOR_BASE = Object.freeze({
  name: 'swf_executor',
  model: 'opencode-go/deepseek-v4-flash',
  fallbackModel: null,
  description: 'SWF execution worker: executes an already accepted SWF plan without redesigning scope, architecture, interfaces, or acceptance criteria.',
  nicknameCandidates: ['SWF Executor'],
  instructions: [
    'You are the swf_executor execution worker. You execute an already accepted SWF plan',
    'and do not redesign its scope, architecture, interfaces, or acceptance criteria.',
    'Return blocked when a material decision is missing or when the pinned execution',
    'model is unavailable. Any nested delegation must use the swf_executor role again.'
  ].join(' ')
});

const SWF_EXECUTOR_EFFORTS = Object.freeze(['high', 'xhigh', 'max']);

export const SWF_EXECUTOR_PROFILES = Object.freeze(
  Object.fromEntries(SWF_EXECUTOR_EFFORTS.map((effort) => [
    effort,
    Object.freeze({ ...SWF_EXECUTOR_BASE, modelReasoningEffort: effort })
  ]))
);

export const SWF_EXECUTOR_ROLE = SWF_EXECUTOR_PROFILES.xhigh;

export function resolveSwfExecutorProfile(effort = 'xhigh') {
  if (typeof effort !== 'string' || !Object.hasOwn(SWF_EXECUTOR_PROFILES, effort)) {
    throw new TypeError(`Unsupported swf_executor profile effort: ${String(effort)}; use high, xhigh, or max.`);
  }
  return SWF_EXECUTOR_PROFILES[effort];
}

export function renderSwfExecutorAgentEntry(configFilePath, effort = 'xhigh') {
  if (typeof configFilePath !== 'string' || configFilePath.length === 0) {
    throw new TypeError('swf_executor agent entry requires a role config file path.');
  }
  const role = resolveSwfExecutorProfile(effort);
  return [
    `[agents.${role.name}]`,
    `description = "${role.description}"`,
    `config_file = "${configFilePath}"`
  ].join('\n') + '\n';
}

export function renderSwfExecutorRoleFile(effort = 'xhigh') {
  const role = resolveSwfExecutorProfile(effort);
  return [
    `name = "${role.name}"`,
    `description = "${role.description}"`,
    `nickname_candidates = [${role.nicknameCandidates.map((name) => `"${name}"`).join(', ')}]`,
    `model = "${role.model}"`,
    `model_reasoning_effort = "${role.modelReasoningEffort}"`,
    `developer_instructions = "${role.instructions}"`
  ].join('\n') + '\n';
}

export const ADAPTER_VOCABULARY = Object.freeze(['codex', 'claude_code', 'pi']);

export function adapterStatus(adapter) {
  if (adapter === 'codex') return 'implemented';
  if (adapter === 'claude_code' || adapter === 'pi') return 'unimplemented';
  throw new Error(`Unknown Host adapter: ${String(adapter)}`);
}

export function renderCodexHandoffRequest({ operation, packet, packetDigest, effort = 'xhigh' }) {
  if (typeof operation !== 'string' || operation.length === 0) {
    throw new TypeError('Codex handoff request requires a lifecycle operation.');
  }
  if (!packet || typeof packet !== 'object') {
    throw new TypeError('Codex handoff request requires an immutable Assignment Packet.');
  }
  if (typeof packetDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(packetDigest)) {
    throw new TypeError('Codex handoff request requires a stable packet digest.');
  }
  return {
    provider: 'codex',
    role: 'swf_executor',
    profile: resolveSwfExecutorProfile(effort),
    operation,
    packet,
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
  } else if (requestedApprovalPolicy !== null
    && actualApprovalPolicy.policy !== requestedApprovalPolicy) {
    outcome = {
      kind: 'manual_pending',
      executed: false,
      writes: [],
      blocker: 'worker_approval_policy_unbound',
      resumeCondition: 'Provide authenticated Host evidence binding the exact packet digest to a per-worker approval policy before claiming approval-free execution; Full Access is a sandbox mode, not approval_policy=never.'
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
