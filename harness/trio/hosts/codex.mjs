export { resolveHostOperation as resolveCodexHostOperation } from '../core/routing.mjs';
import { adjudicatePermission, packetDigestOf } from '../core/routing.mjs';

export const APPROVAL_POLICY_KINDS = Object.freeze(['never', 'on-request']);

function normalizedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export const ADAPTER_VOCABULARY = Object.freeze(['codex', 'claude_code', 'pi']);

export function adapterStatus(adapter) {
  if (adapter === 'codex') return 'implemented';
  if (adapter === 'claude_code' || adapter === 'pi') return 'unimplemented';
  throw new Error(`Unknown Host adapter: ${String(adapter)}`);
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
