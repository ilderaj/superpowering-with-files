import { z } from 'zod';
import path from 'node:path';
import { PhaseEnvelopeSchema } from './phase-envelope.mjs';

export const WORK_TYPES = ['coding', 'office', 'release', 'review', 'research'];
export const AUTHORITY_MODES = ['task_authority', 'source_authority', 'release_authority'];
export const ALLOWED_OPS = ['inspect', 'draft', 'propose', 'write', 'publish', 'send'];
export const RECEIPT_TYPES = [
  'binding_verified',
  'binding_mismatch',
  'started',
  'check_in',
  'blocked',
  'done',
  'new_trio_candidate',
  'abandoned',
  'respawn_recommended',
  'manual_handoff_required',
  'handoff_pending',
  'capability_unavailable',
  'resolver_failed'
];
export const CAPABILITY_CLASSES = ['frontier_reasoning', 'balanced_execution', 'economy_mechanical', 'fast_check'];
export const RISK_CLASSES = ['low', 'medium', 'high'];
export const REASONING_DEMANDS = ['light', 'standard', 'deep'];
export const COST_PREFERENCES = ['economy', 'balanced', 'quality_first'];
export const LATENCY_CLASSES = ['interactive', 'standard', 'long_running'];
export const PERMISSION_CLASSES = ['observe', 'workspace', 'egress_gated', 'release'];
export const DELEGATION_POLICIES = ['prohibited', 'worker_discretion', 'encouraged'];
export const MAJOR_PHASES = ['discovery', 'design', 'execute', 'verify', 'reconcile'];
export const RECEIPT_TYPES_REQUIRING_SESSION_HANDLE = ['binding_verified', 'started', 'check_in', 'blocked', 'done', 'new_trio_candidate', 'abandoned'];
export const TASK_CLASSIFICATIONS = ['quick', 'tracked', 'deep_reasoning'];
export const ROUTES = ['visible_worker', 'subagent', 'chief_direct'];
export const ROUTE_DECISION_STATUSES = ['native_control_requested', 'handoff_pending', 'capability_unavailable', 'chief_downgrade'];
export const ROUTE_OUTCOME_STATUSES = ['native_control_verified', 'handoff_pending', 'capability_unavailable', 'chief_downgrade'];

const isoTimestamp = z.string().datetime();
const safeV2Identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const SubagentDispatchSchema = z.object({
  parentBindingId: z.string().min(1), childId: z.string().min(1), model: z.string().min(1), thinking: z.string().min(1),
  capabilityClass: z.enum(CAPABILITY_CLASSES), currentSlice: z.string().min(1), proofTarget: z.string().min(1),
  evidenceSink: z.string().min(1), permissionClass: z.enum(PERMISSION_CLASSES),
  allowedOps: z.array(z.enum(ALLOWED_OPS)).min(1), nonGoals: z.array(z.string().min(1)),
  delegationPolicy: z.enum(DELEGATION_POLICIES), sourceSet: z.array(z.string().min(1)).optional()
}).strict();

export const SubagentReturnSchema = z.object({
  childId: z.string().min(1), contractHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  model: z.string().min(1), thinking: z.string().min(1), status: z.enum(['done', 'blocked']),
  evidenceRefs: z.array(z.string().min(1)), contract: SubagentDispatchSchema
}).strict();

export const SourceProgressRefSchema = z.object({
  file: z.string().min(1),
  blockId: z.string().min(1),
  startLine: z.number().int().positive().nullable(),
  contentHash: z.string().regex(/^sha256:[a-fA-F0-9a-zA-Z_-]+$/),
  observedAt: isoTimestamp
});

export const RouteDecisionSchema = z.object({
  taskClassification: z.enum(TASK_CLASSIFICATIONS),
  requestedRoute: z.enum(ROUTES),
  resolutionStatus: z.enum(ROUTE_DECISION_STATUSES),
  approvedResolvedRoute: z.enum(ROUTES).nullable(),
  downgradeReason: z.string().min(1).optional()
}).strict().superRefine((decision, ctx) => {
  if (decision.resolutionStatus === 'chief_downgrade') {
    if (decision.requestedRoute !== 'visible_worker') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'chief_downgrade requires a visible_worker request.' });
    }
    if (!['subagent', 'chief_direct'].includes(decision.approvedResolvedRoute)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'chief_downgrade requires an approved subagent or chief_direct route.' });
    }
    if (!decision.downgradeReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'chief_downgrade requires a non-empty downgradeReason.' });
    }
  } else {
    if (decision.approvedResolvedRoute !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'non-downgrade route decisions require approvedResolvedRoute to be null.' });
    }
    if (decision.downgradeReason !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'downgradeReason is valid only for chief_downgrade.' });
    }
  }
});

export const RouteOutcomeSchema = z.object({
  taskClassification: z.enum(TASK_CLASSIFICATIONS),
  requestedRoute: z.enum(ROUTES),
  resolvedRoute: z.enum(ROUTES).nullable(),
  resolutionStatus: z.enum(ROUTE_OUTCOME_STATUSES)
}).strict().superRefine((outcome, ctx) => {
  if (outcome.resolutionStatus === 'native_control_verified') {
    if (outcome.resolvedRoute === null || outcome.resolvedRoute !== outcome.requestedRoute) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'native_control_verified requires resolvedRoute to equal requestedRoute.' });
    }
    return;
  }
  if (outcome.resolutionStatus === 'chief_downgrade') {
    if (outcome.requestedRoute !== 'visible_worker' || !['subagent', 'chief_direct'].includes(outcome.resolvedRoute)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'chief_downgrade requires a visible_worker request and a resolved subagent or chief_direct route.' });
    }
    return;
  }
  if (outcome.resolvedRoute !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pending or unavailable route outcomes require resolvedRoute to be null.' });
  }
});

export const DispatchRequestSchema = z.object({
  requestedModel: z.string().min(1),
  reasoningEffort: z.string().min(1),
  speed: z.literal('standard'),
  availabilityStatus: z.enum(['manual_pending', 'capability_unavailable'])
}).strict();

export const DispatchOutcomeSchema = z.object({
  resolvedModel: z.string().min(1).nullable(),
  resolvedReasoningEffort: z.string().min(1).nullable(),
  resolvedSpeed: z.literal('standard').nullable(),
  applicationStatus: z.enum(['manual_pending', 'capability_unavailable'])
}).strict().superRefine((outcome, ctx) => {
  if (outcome.resolvedModel !== null
    || outcome.resolvedReasoningEffort !== null
    || outcome.resolvedSpeed !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dispatch outcomes must keep all actual resolved values null until host application is observed.' });
  }
});

const BindingPacketObject = z.object({
  schemaVersion: z.literal('chiefops.v0b'),
  bindingId: z.string().min(1),
  action: z.enum(['spawn_worker', 'continue_worker', 'respawn_worker', 'handoff_worker']),
  authorityTaskId: z.string().min(1),
  planningRoot: z.string().min(1),
  chiefThreadId: z.string().min(1),
  workerId: z.string().min(1),
  threadId: z.string().min(1).nullable().optional(),
  sessionId: z.string().min(1).nullable().optional(),
  currentSlice: z.string().min(1),
  proofTarget: z.string().min(1),
  evidenceSink: z.string().min(1),
  capabilityClass: z.enum(CAPABILITY_CLASSES),
  riskClass: z.enum(RISK_CLASSES),
  majorPhase: z.enum(MAJOR_PHASES).optional(),
  primaryProof: z.string().min(1).optional(),
  reasoningDemand: z.enum(REASONING_DEMANDS).optional(),
  costPreference: z.enum(COST_PREFERENCES).optional(),
  latencyClass: z.enum(LATENCY_CLASSES).optional(),
  permissionClass: z.enum(PERMISSION_CLASSES).optional(),
  delegationPolicy: z.enum(DELEGATION_POLICIES).optional(),
  routeDecision: RouteDecisionSchema.optional(),
  dispatchRequest: DispatchRequestSchema.optional(),
  dispatchIntentVersion: z.literal('chiefops.dispatch-intent.v1').optional(),
  dispatchDecision: z.object({
    decidedBy: z.string().min(1),
    decidedAt: isoTimestamp,
    inventory: z.object({
      sourceRef: z.string().min(1),
      observedAt: isoTimestamp,
      fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/)
    }),
    preferredModel: z.string().min(1),
    preferredThinking: z.string().min(1),
    applicationStatus: z.literal('manual_pending')
  }).optional(),
  upgradeAdmission: z.object({
    admissionId: z.string().min(1),
    admissionBlockHash: z.string().regex(/^sha256:[a-f0-9]{64}$/)
  }).optional(),
  detailedPlanEligibility: z.object({
    eligibilityId: z.string().min(1),
    eligibilityBlockHash: z.string().regex(/^sha256:[a-f0-9]{64}$/)
  }).strict().optional(),
  subagentDispatches: z.array(SubagentDispatchSchema).optional(),
  workType: z.enum(WORK_TYPES),
  authorityMode: z.enum(AUTHORITY_MODES),
  allowedOps: z.array(z.enum(ALLOWED_OPS)).min(1),
  requiresHumanApproval: z.boolean(),
  createdAt: isoTimestamp,
  bindingToken: z.string().min(1).optional(),
  bindingVersion: z.string().min(1).optional(),
  sourceProgressRef: SourceProgressRefSchema,
  observedAt: isoTimestamp,
  parentTaskId: z.string().min(1).optional(),
  sourceSet: z.array(z.string().min(1)).optional(),
  systemOfRecord: z.string().min(1).optional(),
  publishTarget: z.string().min(1).nullable().optional(),
  approvalGate: z.string().min(1).optional(),
  nonGoals: z.array(z.string().min(1)).optional(),
  upgradeTrigger: z.string().min(1).optional(),
  expectedCheckInBy: isoTimestamp.optional(),
  rollbackPlanRef: z.string().min(1).optional(),
  stopCondition: z.string().min(1).optional(),
  expectedReceipt: z.enum(RECEIPT_TYPES).optional(),
  returnToChiefInstruction: z.string().min(1).optional()
});

function validateBindingPacketInvariants(packet, ctx) {
  if (!path.isAbsolute(packet.planningRoot)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'planningRoot must be an absolute authority root.' });
  }
  if (/[\u0000-\u001f\u007f]/.test(packet.planningRoot)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'planningRoot must not contain control characters.' });
  }
  if (!packet.bindingToken && !packet.bindingVersion) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bindingToken or bindingVersion is required.' });
  }
  if ((packet.action === 'continue_worker' || packet.action === 'handoff_worker') && !packet.threadId && !packet.sessionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'threadId or sessionId is required for continue/handoff actions.' });
  }
  if ((packet.workType === 'office' || packet.authorityMode === 'source_authority') && (!packet.sourceSet?.length || !packet.systemOfRecord)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sourceSet and systemOfRecord are required for office/source authority work.' });
  }
  if (packet.permissionClass === 'observe' && packet.allowedOps.some((op) => ['write', 'publish', 'send'].includes(op))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'observe permission cannot authorize write, publish, or send operations.'
    });
  }
  if (packet.permissionClass === 'workspace' && packet.allowedOps.some((op) => ['publish', 'send'].includes(op))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'workspace permission cannot authorize publish or send operations.'
    });
  }
  if (packet.allowedOps.includes('write')) {
    const missing = ['approvalGate', 'rollbackPlanRef'].filter((field) => !packet[field]);
    if (missing.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${missing.join(', ')} are required for local write operations.` });
    }
  }
  if (packet.allowedOps.some((op) => ['publish', 'send'].includes(op))) {
    const missing = ['publishTarget', 'approvalGate', 'rollbackPlanRef'].filter((field) => !packet[field]);
    if (missing.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${missing.join(', ')} are required for publish/send operations.` });
    }
  }
  if (packet.permissionClass === 'release' &&
      (packet.authorityMode !== 'release_authority' || packet.requiresHumanApproval !== true)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'release permission requires release authority and human approval.'
    });
  }
  if (Boolean(packet.dispatchIntentVersion) !== Boolean(packet.dispatchDecision)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dispatch intent version and decision are required together.' });
  }
  if (packet.dispatchRequest?.availabilityStatus === 'manual_pending') {
    if (!packet.dispatchIntentVersion || !packet.dispatchDecision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'manual_pending dispatch requests require the trusted legacy dispatch selection.' });
    } else if (packet.dispatchRequest.requestedModel !== packet.dispatchDecision.preferredModel
      || packet.dispatchRequest.reasoningEffort !== packet.dispatchDecision.preferredThinking) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dispatch request must match the trusted legacy dispatch selection.' });
    }
  }
  if (packet.dispatchRequest?.availabilityStatus === 'capability_unavailable'
    && (packet.dispatchIntentVersion || packet.dispatchDecision)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'capability_unavailable dispatch requests must omit legacy dispatch selection.' });
  }
  if (packet.dispatchDecision?.decidedBy !== undefined && packet.dispatchDecision.decidedBy !== packet.chiefThreadId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dispatch decision must be authored by the bound Chief thread.' });
  }
  if (packet.dispatchIntentVersion && packet.capabilityClass === 'frontier_reasoning') {
    const validFrontierProfile = packet.riskClass === 'high'
      && packet.reasoningDemand === 'deep'
      && packet.costPreference === 'quality_first'
      && Boolean(packet.upgradeAdmission);
    if (!validFrontierProfile) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'frontier dispatch requires verified admission profile fields.' });
    }
  }
  if (packet.detailedPlanEligibility
      && (!packet.dispatchIntentVersion || packet.capabilityClass !== 'economy_mechanical')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'detailed plan eligibility is valid only for explicit economy dispatch.'
    });
  }
}

export const BindingPacketSchema = BindingPacketObject.superRefine(validateBindingPacketInvariants);

export const V2StablePrefixSchema = BindingPacketObject
  .omit({
    schemaVersion: true,
    bindingId: true,
    sourceProgressRef: true,
    bindingToken: true,
    bindingVersion: true,
    majorPhase: true,
    expectedCheckInBy: true
  })
  .extend({
    schemaVersion: z.literal('chiefops.v2'),
    kind: z.literal('stable_prefix'),
    prefixBindingId: safeV2Identity,
    bindingId: safeV2Identity,
    authorityTaskId: safeV2Identity,
    bindingVersion: z.string().min(1),
    majorPhase: z.enum(MAJOR_PHASES),
    expectedCheckInBy: isoTimestamp,
    phaseEnvelope: PhaseEnvelopeSchema.optional()
  })
  .strict()
  .superRefine((prefix, ctx) => {
    validateBindingPacketInvariants(prefix, ctx);
    if (prefix.routeDecision?.resolutionStatus === 'chief_downgrade') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'V2 stable prefixes cannot carry chief_downgrade route decisions.' });
    }
    if (prefix.bindingId !== prefix.prefixBindingId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'bindingId must equal prefixBindingId for V2 stable prefixes.'
      });
    }
    if (prefix.phaseEnvelope) {
      const matches = prefix.phaseEnvelope.startPhase === prefix.majorPhase
        && prefix.phaseEnvelope.objective === prefix.currentSlice
        && JSON.stringify(prefix.phaseEnvelope.nonGoals) === JSON.stringify(prefix.nonGoals ?? [])
        && prefix.phaseEnvelope.proofTarget === prefix.proofTarget
        && prefix.phaseEnvelope.permissionCeiling === prefix.permissionClass
        && prefix.phaseEnvelope.delegationPolicy === prefix.delegationPolicy;
      if (!matches) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'phaseEnvelope must exactly align with its stable prefix authority fields.'
        });
      }
    }
  });

export const V2ExecutionDeltaSchema = z.object({
  schemaVersion: z.literal('chiefops.v2'),
  kind: z.literal('execution_delta'),
  deltaBindingId: safeV2Identity,
  authorityTaskId: safeV2Identity,
  planningRoot: z.string().min(1),
  bindingVersion: z.string().min(1),
  prefixBindingId: safeV2Identity,
  prefixHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sequence: z.number().int().positive(),
  predecessorDeltaHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
  currentSlice: z.string().min(1),
  majorPhase: z.enum(MAJOR_PHASES),
  expectedCheckInBy: isoTimestamp.optional(),
  observedAt: isoTimestamp,
  createdAt: isoTimestamp
}).strict().superRefine((delta, ctx) => {
  if (!path.isAbsolute(delta.planningRoot)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'planningRoot must be an absolute authority root.' });
  }
  if (/[\u0000-\u001f\u007f]/.test(delta.planningRoot)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'planningRoot must not contain control characters.' });
  }
  if (delta.deltaBindingId !== makeDeltaBindingId({
    prefixBindingId: delta.prefixBindingId,
    sequence: delta.sequence
  })) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'deltaBindingId must match its canonical prefixBindingId and sequence.' });
  }
  if ((delta.sequence === 1) !== (delta.predecessorDeltaHash === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'sequence 1 requires null predecessorDeltaHash and later sequences require one.'
    });
  }
});

export const WorkerReceiptSchema = z.object({
  schemaVersion: z.literal('chiefops.v0b'),
  receiptId: z.string().min(1),
  receiptType: z.enum(RECEIPT_TYPES),
  authorityTaskId: z.string().min(1),
  workerId: z.string().min(1),
  threadId: z.string().min(1).nullable().optional(),
  sessionId: z.string().min(1).nullable().optional(),
  bindingToken: z.string().min(1).optional(),
  bindingVersion: z.string().min(1).optional(),
  currentSlice: z.string().min(1),
  proofTarget: z.string().min(1),
  evidenceSink: z.string().min(1),
  capabilityClass: z.enum(CAPABILITY_CLASSES),
  riskClass: z.enum(RISK_CLASSES),
  majorPhase: z.enum(MAJOR_PHASES).optional(),
  reasoningDemand: z.enum(REASONING_DEMANDS).optional(),
  costPreference: z.enum(COST_PREFERENCES).optional(),
  latencyClass: z.enum(LATENCY_CLASSES).optional(),
  permissionClass: z.enum(PERMISSION_CLASSES).optional(),
  delegationPolicy: z.enum(DELEGATION_POLICIES).optional(),
  workType: z.enum(WORK_TYPES),
  authorityMode: z.enum(AUTHORITY_MODES),
  allowedOps: z.array(z.enum(ALLOWED_OPS)).min(1),
  sourceProgressRef: SourceProgressRefSchema,
  observedAt: isoTimestamp,
  status: z.enum(['bound', 'started', 'blocked', 'done', 'abandoned', 'pending', 'failed']),
  summary: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)),
  nextSuggestedAction: z.string().min(1),
  createdAt: isoTimestamp,
  supersedesReceiptId: z.string().min(1).nullable().optional(),
  sourceRefs: z.array(z.string().min(1)).optional(),
  publishRef: z.string().min(1).optional(),
  blockerReason: z.string().min(1).optional(),
  resolvedModelAtRun: z.string().min(1).optional(),
  resolvedThinkingAtRun: z.string().min(1).optional(),
  modelResolutionReason: z.string().min(1).optional(),
  applicationStatus: z.enum(['manual_pending', 'unverified']).optional(),
  routeOutcome: RouteOutcomeSchema.optional(),
  dispatchOutcome: DispatchOutcomeSchema.optional(),
  subagentReturns: z.array(SubagentReturnSchema).optional(),
  scopeCheck: z.object({
    nonGoalsChecked: z.boolean(),
    violations: z.array(z.string().min(1))
  }).optional()
}).strict().superRefine((receipt, ctx) => {
  if (!receipt.bindingToken && !receipt.bindingVersion) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bindingToken or bindingVersion is required.' });
  }
  if (RECEIPT_TYPES_REQUIRING_SESSION_HANDLE.includes(receipt.receiptType) && !receipt.threadId && !receipt.sessionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'threadId or sessionId is required for worker receipts.' });
  }
  if (receipt.receiptType === 'done') {
    const isOfficeOrSource = receipt.workType === 'office' || receipt.authorityMode === 'source_authority';
    const evidenceMissing = receipt.evidenceRefs.length === 0;
    const sourceRefsMissing = !receipt.sourceRefs || receipt.sourceRefs.length === 0;

    if (evidenceMissing && isOfficeOrSource && sourceRefsMissing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'evidenceRefs and sourceRefs are required for office/source authority done receipts.'
      });
    } else if (evidenceMissing) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'evidenceRefs are required for done receipts.' });
    } else if (isOfficeOrSource && sourceRefsMissing) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sourceRefs are required for office/source authority done receipts.' });
    }
  }
  if (receipt.receiptType === 'done' && receipt.allowedOps.some((op) => ['publish', 'send'].includes(op)) && !receipt.publishRef && !receipt.blockerReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'publishRef or blockerReason is required for write/publish/send done receipts.' });
  }
  if (receipt.routeOutcome
    && ['handoff_pending', 'capability_unavailable'].includes(receipt.routeOutcome.resolutionStatus)
    && receipt.receiptType === 'done') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pending or unavailable route outcomes cannot be done receipts.' });
  }
  if (receipt.dispatchOutcome?.applicationStatus === 'manual_pending') {
    const missing = ['resolvedModelAtRun', 'resolvedThinkingAtRun', 'modelResolutionReason', 'applicationStatus']
      .filter((field) => receipt[field] === undefined || (field === 'applicationStatus' && receipt[field] !== 'manual_pending'));
    if (missing.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `manual_pending dispatch outcomes require legacy selection fields: ${missing.join(', ')}.` });
    }
  }
  if (receipt.dispatchOutcome?.applicationStatus === 'capability_unavailable'
    && ['resolvedModelAtRun', 'resolvedThinkingAtRun', 'modelResolutionReason', 'applicationStatus'].some((field) => receipt[field] !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'capability_unavailable dispatch outcomes must omit legacy selection and application fields.' });
  }
});

function slug(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function safeTimestamp(value) {
  return String(value).replace(/[:.]/g, '-');
}

export function makeBindingId({ authorityTaskId, workerId, currentSlice, createdAt }) {
  return `bind_${slug(authorityTaskId)}_${slug(workerId)}_${slug(currentSlice)}_${safeTimestamp(createdAt)}`;
}

export function makeReceiptId({ authorityTaskId, workerId, receiptType, createdAt }) {
  return `receipt_${slug(authorityTaskId)}_${slug(workerId)}_${slug(receiptType)}_${safeTimestamp(createdAt)}`;
}

export function makeDeltaBindingId({ prefixBindingId, sequence }) {
  return `delta_${prefixBindingId}_${sequence}`;
}

export function validateBindingPacket(value) {
  return BindingPacketSchema.parse(value);
}

export function validateBindingInput(value) {
  if (value?.schemaVersion === 'chiefops.v0b') {
    return validateBindingPacket(value);
  }
  if (value?.schemaVersion === 'chiefops.v2' && value?.kind === 'execution_delta') {
    return V2ExecutionDeltaSchema.parse(value);
  }
  if (value?.schemaVersion === 'chiefops.v2' && value?.kind === 'stable_prefix') {
    return V2StablePrefixSchema.parse(value);
  }
  throw new Error('unsupported ChiefOps binding input schema.');
}

const operatingModelFields = [
  'majorPhase',
  'primaryProof',
  'reasoningDemand',
  'costPreference',
  'latencyClass',
  'permissionClass',
  'delegationPolicy',
  'upgradeTrigger',
  'expectedCheckInBy',
  'stopCondition',
  'expectedReceipt',
  'returnToChiefInstruction'
];

export function validateOperatingModelBindingPacket(value) {
  const packet = validateBindingPacket(value);
  const missing = operatingModelFields.filter((field) => !packet[field]);
  if (!packet.nonGoals?.length) {
    missing.push('nonGoals');
  }
  if (missing.length > 0) {
    throw new Error(`missing operating model fields: ${missing.join(', ')}`);
  }
  return packet;
}

export function validateWorkerReceipt(value) {
  return WorkerReceiptSchema.parse(value);
}

export function validateSubagentDispatch(value) {
  return SubagentDispatchSchema.parse(value);
}

export function validateSubagentReturn(value) {
  return SubagentReturnSchema.parse(value);
}
