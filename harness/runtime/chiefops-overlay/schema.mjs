import { z } from 'zod';

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

const isoTimestamp = z.string().datetime();

export const SourceProgressRefSchema = z.object({
  file: z.string().min(1),
  blockId: z.string().min(1),
  startLine: z.number().int().positive().nullable(),
  contentHash: z.string().regex(/^sha256:[a-fA-F0-9a-zA-Z_-]+$/),
  observedAt: isoTimestamp
});

export const BindingPacketSchema = z.object({
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
  rollbackPlanRef: z.string().min(1).optional()
}).superRefine((packet, ctx) => {
  if (!packet.bindingToken && !packet.bindingVersion) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bindingToken or bindingVersion is required.' });
  }
  if ((packet.action === 'continue_worker' || packet.action === 'handoff_worker') && !packet.threadId && !packet.sessionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'threadId or sessionId is required for continue/handoff actions.' });
  }
  if ((packet.workType === 'office' || packet.authorityMode === 'source_authority') && (!packet.sourceSet || !packet.systemOfRecord)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sourceSet and systemOfRecord are required for office/source authority work.' });
  }
  if (packet.allowedOps.some((op) => ['write', 'publish', 'send'].includes(op))) {
    const missing = ['publishTarget', 'approvalGate', 'rollbackPlanRef'].filter((field) => !packet[field]);
    if (missing.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${missing.join(', ')} are required for write/publish/send operations.` });
    }
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
  scopeCheck: z.object({
    nonGoalsChecked: z.boolean(),
    violations: z.array(z.string().min(1))
  }).optional()
}).superRefine((receipt, ctx) => {
  if (!receipt.bindingToken && !receipt.bindingVersion) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bindingToken or bindingVersion is required.' });
  }
  if (!receipt.threadId && !receipt.sessionId) {
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
  if (receipt.receiptType === 'done' && receipt.allowedOps.some((op) => ['write', 'publish', 'send'].includes(op)) && !receipt.publishRef && !receipt.blockerReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'publishRef or blockerReason is required for write/publish/send done receipts.' });
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

export function validateBindingPacket(value) {
  return BindingPacketSchema.parse(value);
}

export function validateWorkerReceipt(value) {
  return WorkerReceiptSchema.parse(value);
}
