// SWF Trio v2 decision-core constants.
//
// Ported from harness/trio/core/routing.mjs (HEAD 275345d) and
// harness/trio/core/read.mjs; values are frozen copies of the current
// baseline so the dsh plugin cannot drift from the harness decision surface.
// The three-state evidence constants (EVIDENCE_STATES) and the session mode
// constants (SESSION_MODES) are additions mandated by the accepted feasibility
// report (reports/audit/2026-08-15-dsh-plugin-feasibility.md, decision 8 and
// decision 12).

export const ROUTE_KINDS = Object.freeze(['quick', 'tracked']) as readonly string[];

export const ASSIGNMENT_PACKET_FIELDS = Object.freeze([
  'authority',
  'currentSlice',
  'nonGoals',
  'proof',
  'capability',
  'allowedOperations',
  'deadline',
  'expectedReturn'
]) as readonly string[];

export const WORK_ROLE_KINDS = Object.freeze([
  'chief',
  'thinking',
  'planning',
  'orchestrating',
  'high_density_judgment',
  'executing',
  'searching',
  'researching',
  'coding',
  'exploring',
  'repetitive_execution'
]) as readonly string[];

export const CHIEF_WORK_ROLES = Object.freeze([
  'chief',
  'thinking',
  'planning',
  'orchestrating',
  'high_density_judgment'
]) as readonly string[];

export const EXECUTION_WORK_ROLES = Object.freeze([
  'executing',
  'searching',
  'researching',
  'coding',
  'exploring',
  'repetitive_execution'
]) as readonly string[];

export const COMPLEXITY_KINDS = Object.freeze(['high', 'xhigh', 'max']) as readonly string[];
export const FLASH_EXECUTION_MODEL = 'opencode-go/deepseek-v4-flash';
export const CHIEF_REQUESTED_MODELS = Object.freeze(['gpt-5.6-sol', 'gpt-5.6-terra']) as readonly string[];
export const CHIEF_REQUESTED_EFFORTS = Object.freeze(['max', 'ultra']) as readonly string[];

export const COMPLEXITY_SIGNALS = Object.freeze({
  high: Object.freeze(['bounded', 'routine']),
  xhigh: Object.freeze(['multiFile', 'verificationHeavy', 'research', 'iterative']),
  max: Object.freeze(['longRunning', 'repeatedRepair', 'broadIntegration', 'highComplexity'])
}) as Readonly<Record<string, ReadonlyArray<string>>>;

export const EFFORT_RANK = Object.freeze({ high: 1, xhigh: 2, max: 3 }) as Readonly<Record<string, number>>;

export const GOAL_CONTRACT_FIELDS = Object.freeze([
  'objective',
  'successCriteria',
  'stopConditions',
  'expectedEvidence',
  'maxIterations',
  'milestoneCheckIn',
  'returnCondition'
]) as readonly string[];

// BINDING_FILES mirrors routing.mjs: [packet key, file name] pairs.
export const BINDING_FILES = Object.freeze([
  ['taskPlan', 'task_plan.md'],
  ['findings', 'findings.md'],
  ['progress', 'progress.md']
]) as ReadonlyArray<readonly [string, string]>;

export const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;

export const HOST_OPERATIONS = Object.freeze([
  'spawn',
  'continue',
  'status',
  'interrupt',
  'collect'
]) as readonly string[];

export const PRIMARY_EXECUTION_KINDS = Object.freeze([
  'default',
  'visible_worker_required'
]) as readonly string[];
export const PRIMARY_EXECUTION_REQUIRED = 'visible_worker_required';

export const CHILD_DELEGATION_KINDS = Object.freeze([
  'prohibited',
  'worker_discretion',
  'encouraged'
]) as readonly string[];

export const EXECUTION_MODE_KINDS = Object.freeze([
  'bounded_slice',
  'worker_self_goal'
]) as readonly string[];

export const HOST_ROUTE_KINDS = Object.freeze([
  'visible_worker',
  'native_subagent',
  'manual_pending'
]) as readonly string[];

export const ROUTE_EVIDENCE_FIELDS = Object.freeze([
  'routeKind',
  'requestedModel',
  'requestedEffort',
  'actualModel',
  'actualEffort',
  'workerId',
  'capabilityEvidence',
  'permissionEnvelope',
  'pathEnvelope',
  'fallbackReason',
  'status'
]) as readonly string[];

export const HOST_WORKER_STATUSES = new Set([
  'planned',
  'observed',
  'idle',
  'executing',
  'awaiting_approval',
  'candidate_done',
  'stopped',
  'blocked'
]);

export const SANDBOX_MODE_KINDS = Object.freeze(['bounded', 'full_access']) as readonly string[];
export const APPROVAL_KINDS = Object.freeze(['user', 'auto_review']) as readonly string[];
export const PERMISSION_STAGES = Object.freeze(['scope', 'sandbox', 'approval']) as readonly string[];
export const DEFAULT_GENERATED_TARGETS = Object.freeze(['.agents', 'AGENTS.md', '.codex/AGENTS.md']) as readonly string[];

// read.mjs surface
export const TRIO_FILE_NAMES = Object.freeze(['task_plan.md', 'findings.md', 'progress.md']) as readonly string[];
export const TRIO_FILE_KEYS = Object.freeze({
  'task_plan.md': 'taskPlan',
  'findings.md': 'findings',
  'progress.md': 'progress'
}) as Readonly<Record<string, string>>;
export const TRIO_FILE_KEY_NAMES = Object.freeze(['taskPlan', 'findings', 'progress']) as readonly string[];

export const TERMINAL_STATUSES = new Set([
  'accepted',
  'archived',
  'cancelled',
  'canceled',
  'closed',
  'complete',
  'completed',
  'done'
]);

// Feasibility-report additions (decision 8 and decision 12).
export const EVIDENCE_STATES = Object.freeze(['authenticated', 'host-claimed', 'unknown']) as readonly string[];
export const SESSION_MODES = Object.freeze(['swf', 'passthrough']) as readonly string[];
