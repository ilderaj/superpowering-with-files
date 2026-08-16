// SWF Trio v2 decision core, ported from harness/trio/core/routing.mjs
// (HEAD 275345d) to pure TypeScript. No dsh runtime import, no side effects.
// Behavior and error messages are kept verbatim so golden/parity tests can
// compare this module against the harness baseline.

import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  APPROVAL_KINDS,
  ASSIGNMENT_PACKET_FIELDS,
  BINDING_FILES,
  CHIEF_REQUESTED_EFFORTS,
  CHIEF_REQUESTED_MODELS,
  CHIEF_WORK_ROLES,
  CHILD_DELEGATION_KINDS,
  COMPLEXITY_KINDS,
  COMPLEXITY_SIGNALS,
  DEFAULT_GENERATED_TARGETS,
  EFFORT_RANK,
  EXECUTION_MODE_KINDS,
  EXECUTION_WORK_ROLES,
  FLASH_EXECUTION_MODEL,
  GOAL_CONTRACT_FIELDS,
  HOST_OPERATIONS,
  HOST_ROUTE_KINDS,
  HOST_WORKER_STATUSES,
  PRIMARY_EXECUTION_KINDS,
  PRIMARY_EXECUTION_REQUIRED,
  ROUTE_EVIDENCE_FIELDS,
  SANDBOX_MODE_KINDS,
  SHA256_PATTERN,
  WORK_ROLE_KINDS
} from './constants.js';
import { assertAuthorityBinding } from './binding.js';

export type Input = Record<string, unknown>;

export interface Envelope {
  permissions: string[];
  mutablePaths: string[];
  operations: string[];
  externalEffects: string[];
}

export interface LaneObservation {
  routeKind: string;
  workerId: string | null;
  status: string;
  released: boolean;
  mutablePaths: string[];
  taskId: string | null;
  currentSlice: string | null;
  packetDigest: string | null;
}

export type RouteEvidence = Record<string, unknown>;
export type OperationDescriptor = Record<string, unknown>;

function objectRecord(value: unknown): Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hasTrackedSignal(input: Input): boolean {
  return [
    input.multiplePhases,
    input.requiresResearch,
    input.research,
    input.comparison,
    input.requiresSubagents,
    input.subagents,
    input.worktree,
    input.crossSession,
    input.durableResearch,
    input.durableDecisions,
    input.requiresRecovery,
    input.tracked
  ].some(Boolean)
    || (Array.isArray(input.phases) && input.phases.length > 1)
    || (Number.isInteger(input.phases) && (input.phases as number) > 1);
}

export function classifyWorkRole(input: Input = {}): string | null {
  const workRole = input.workRole;
  if (workRole === undefined) return null;
  if (typeof workRole !== 'string' || !WORK_ROLE_KINDS.includes(workRole)) {
    throw new Error(`Unknown work role: ${String(workRole)}`);
  }
  return workRole;
}

export function classifyComplexity(input: Input = {}): string | null {
  if (input.complexity !== undefined) {
    if (typeof input.complexity !== 'string' || !COMPLEXITY_KINDS.includes(input.complexity)) {
      throw new Error(`Unknown complexity: ${String(input.complexity)}`);
    }
    return input.complexity;
  }
  const matched = Object.keys(COMPLEXITY_SIGNALS).filter((complexity) =>
    COMPLEXITY_SIGNALS[complexity].some((key) => input[key] === true));
  if (matched.length === 1) return matched[0];
  if (matched.length === 0) return null;
  throw new Error('Ambiguous complexity signals are a blocker for execution work; no implicit model escalation.');
}

function normalizeOverride(override: unknown): { reason: string; provenance: string } | null {
  if (override === undefined) return null;
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    throw new Error('Human override requires a structured reason and provenance.');
  }
  const source = override as Record<string, unknown>;
  const reason = normalizedString(source.reason);
  const provenance = normalizedString(source.provenance);
  if (!reason || !provenance) {
    throw new Error('Human override requires a structured reason and provenance.');
  }
  return { reason, provenance };
}

function requestedProviderOf(model: string): string {
  return model.includes('/') ? model.split('/')[0] : 'gpt-5.6';
}

function topologyOf(input: Input): Record<string, unknown> | null {
  const topology: Record<string, unknown> = {};
  if (input.primaryExecution !== undefined) topology.primaryExecution = input.primaryExecution;
  if (input.executionMode !== undefined) topology.executionMode = input.executionMode;
  return Object.keys(topology).length > 0 ? topology : null;
}

function resolveEconomicPolicy(input: Input, taskClass: string): Record<string, unknown> {
  const workRole = classifyWorkRole(input);
  const override = normalizeOverride(input.override);
  const complexity = classifyComplexity(input);
  let requestedModel: string;
  let requestedEffort: string;
  let resolvedComplexity: string | null = null;

  if (EXECUTION_WORK_ROLES.includes(workRole as string)) {
    if (override) {
      throw new Error('A human override may only classify a Chief/high-density slice; execution roles never upgrade model or effort.');
    }
    if (complexity === null) {
      throw new Error('Unknown complexity is a blocker for execution work; no implicit model escalation.');
    }
    resolvedComplexity = complexity;
    requestedModel = FLASH_EXECUTION_MODEL;
    requestedEffort = complexity;
    const callerModel = normalizedString(input.requestedModel);
    const callerEffort = normalizedString(input.requestedEffort);
    if (callerModel !== null && callerModel !== requestedModel) {
      throw new Error(`Execution work role ${workRole} may only request ${requestedModel}; caller supplied ${callerModel}.`);
    }
    if (callerEffort !== null && callerEffort !== requestedEffort) {
      throw new Error(`Execution work role ${workRole} with complexity ${complexity} requests effort ${requestedEffort}; caller supplied ${callerEffort}.`);
    }
  } else if (CHIEF_WORK_ROLES.includes(workRole as string)) {
    if (complexity !== null) {
      throw new Error(`Complexity is execution-scoped and cannot classify Chief work role ${workRole}.`);
    }
    const callerModel = normalizedString(input.requestedModel);
    const callerEffort = normalizedString(input.requestedEffort);
    requestedModel = callerModel ?? 'gpt-5.6-sol';
    if (!CHIEF_REQUESTED_MODELS.includes(requestedModel)) {
      throw new Error(`Chief work role ${workRole} may request only gpt-5.6-sol or gpt-5.6-terra; got ${requestedModel}.`);
    }
    requestedEffort = callerEffort ?? 'max';
    if (!CHIEF_REQUESTED_EFFORTS.includes(requestedEffort)) {
      throw new Error(`Chief work role ${workRole} may request only max or ultra effort; got ${requestedEffort}.`);
    }
  } else {
    throw new Error(`Unknown work role: ${String(input.workRole)}`);
  }

  if (input.isChild === true && requestedEffort === 'ultra') {
    throw new Error('Child model requests may not use ultra effort.');
  }

  const authenticatedEvidence = input.evidence
    && objectRecord(input.evidence).authenticated === true
    ? objectRecord(input.evidence)
    : null;
  const actualModel = normalizedString(authenticatedEvidence?.actualModel) ?? 'unknown';
  const actualEffort = normalizedString(authenticatedEvidence?.actualEffort) ?? 'unknown';

  return {
    taskClass,
    route: taskClass,
    workRole,
    complexity: resolvedComplexity,
    requestedProvider: requestedProviderOf(requestedModel),
    requestedModel,
    requestedEffort,
    topology: topologyOf(input),
    override,
    actualModel,
    actualEffort,
    actualObserved: actualModel !== 'unknown' || actualEffort !== 'unknown'
  };
}

export function classifyTask(input: Input = {}): string {
  const explicit = input.taskClass ?? input.classification ?? input.route;
  if (explicit === 'quick') return 'quick';
  if (explicit === 'tracked' || explicit === 'deep-reasoning') return 'tracked';
  return hasTrackedSignal(input) ? 'tracked' : 'quick';
}

export function routeTask(input: Input = {}): Record<string, unknown> {
  const taskClass = classifyTask(input);
  return {
    taskClass,
    route: taskClass,
    createTrio: taskClass === 'tracked',
    reason: taskClass === 'tracked'
      ? 'durable or multi-phase work uses the tracked route'
      : 'single-stage work stays inline without Trio creation'
  };
}

export function resolveModelEffort(input: Input = {}): Record<string, unknown> {
  const taskClass = classifyTask(input);
  if (classifyWorkRole(input) === null) {
    throw new Error('A requested model decision requires a declared workRole; no unclassified model may be requested.');
  }
  return resolveEconomicPolicy(input, taskClass);
}

function assertNonEmptyStringArray(values: unknown, label: string): void {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must be a non-empty array of non-empty strings.`);
  }
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
      throw new Error(`${label} must be a non-empty array of non-empty strings.`);
    }
  }
}

function assertGoalContract(goalContract: unknown): void {
  if (!goalContract || typeof goalContract !== 'object' || Array.isArray(goalContract)) {
    throw new Error('worker_self_goal requires a complete nested goal contract.');
  }
  const source = goalContract as Record<string, unknown>;
  const keys = Object.keys(source);
  if (keys.length !== GOAL_CONTRACT_FIELDS.length
    || keys.some((key) => !GOAL_CONTRACT_FIELDS.includes(key))
    || GOAL_CONTRACT_FIELDS.some((key) => !Object.hasOwn(source, key))) {
    throw new Error('Goal contract must have the exact closed shape: objective, successCriteria, stopConditions, expectedEvidence, maxIterations, milestoneCheckIn, returnCondition.');
  }
  if (typeof source.objective !== 'string' || source.objective.trim() === '') {
    throw new Error('Goal contract objective must be non-empty text.');
  }
  assertNonEmptyStringArray(source.successCriteria, 'Goal contract successCriteria');
  assertNonEmptyStringArray(source.stopConditions, 'Goal contract stopConditions');
  assertNonEmptyStringArray(source.expectedEvidence, 'Goal contract expectedEvidence');
  if (!Number.isSafeInteger(source.maxIterations)
    || (source.maxIterations as number) < 1
    || (source.maxIterations as number) > 100) {
    throw new Error('Goal contract maxIterations must be a positive safe integer not exceeding 100.');
  }
  if (typeof source.milestoneCheckIn !== 'string' || source.milestoneCheckIn.trim() === '') {
    throw new Error('Goal contract milestoneCheckIn must be non-empty text.');
  }
  if (typeof source.returnCondition !== 'string' || source.returnCondition.trim() === '') {
    throw new Error('Goal contract returnCondition must be non-empty text.');
  }
}

function assertCapabilityPolicy(capability: unknown): void {
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
    throw new Error('Assignment packet capability must be an object.');
  }
  const source = capability as Record<string, unknown>;
  const workRole = classifyWorkRole(source);
  if (workRole === null) {
    throw new Error('Assignment packet capability requires a declared workRole; no unclassified model may be requested.');
  }
  const complexity = classifyComplexity(source);
  if (EXECUTION_WORK_ROLES.includes(workRole)) {
    if (complexity === null) {
      throw new Error(`Execution work role ${workRole} requires exactly one valid complexity; no implicit model escalation.`);
    }
  } else if (complexity !== null) {
    throw new Error(`Complexity is execution-scoped and cannot classify Chief work role ${workRole}.`);
  }
  if (source.primaryExecution !== undefined
    && (typeof source.primaryExecution !== 'string'
      || !PRIMARY_EXECUTION_KINDS.includes(source.primaryExecution))) {
    throw new Error(`Unknown primaryExecution kind: ${String(source.primaryExecution)}`);
  }
  if (source.childDelegation !== undefined && typeof source.childDelegation !== 'string') {
    throw new Error('capability.childDelegation must be a string policy.');
  }
  if (source.executionMode !== undefined && typeof source.executionMode !== 'string') {
    throw new Error('capability.executionMode must be a string mode.');
  }
  if (source.executionMode === 'worker_self_goal') {
    assertGoalContract(source.goalContract);
  }
}

export function buildAssignmentPacket(input: Input = {}): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Assignment packet input must be an object.');
  }
  const missing = ASSIGNMENT_PACKET_FIELDS.filter((field) => !Object.hasOwn(input, field));
  if (missing.length > 0) {
    throw new Error(`Assignment packet requires eight fields: ${missing.join(', ')}.`);
  }
  const unexpected = Object.keys(input).filter((field) => !ASSIGNMENT_PACKET_FIELDS.includes(field));
  if (unexpected.length > 0) {
    throw new Error(`Assignment packet rejects unexpected top-level fields: ${unexpected.join(', ')}.`);
  }
  assertAuthorityBinding(input.authority);
  assertCapabilityPolicy(input.capability);
  return Object.fromEntries(ASSIGNMENT_PACKET_FIELDS.map((field) => [field, input[field]]));
}

export function calculateNextAction(input: Input = {}): Record<string, unknown> {
  if (input.dryRun !== true) {
    throw new Error('calculateNextAction is read-only only with --dry-run.');
  }

  const route = typeof input.route === 'string' ? routeTask({ taskClass: input.route }) : input.route ?? routeTask(input);
  const taskClass = (route as Record<string, unknown>).taskClass ?? classifyTask(route as Input);

  if (taskClass === 'quick') {
    return {
      action: 'execute-inline',
      route: 'quick',
      dryRun: true,
      readOnly: true,
      createTrio: false,
      writes: []
    };
  }

  if (input.hasTrio) {
    return {
      action: 'resume-trio',
      route: 'tracked',
      dryRun: true,
      readOnly: true,
      createTrio: false,
      writes: []
    };
  }

  return {
    action: 'create-trio',
    route: 'tracked',
    dryRun: true,
    readOnly: true,
    createTrio: true,
    writes: []
  };
}

function assertHostOperation(operation: unknown): string {
  if (typeof operation !== 'string' || !HOST_OPERATIONS.includes(operation)) {
    throw new Error(`Unsupported Host operation: ${String(operation)}`);
  }
  return operation;
}

function normalizeSet(values: unknown, label: string): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array.`);
  }
  const normalized = values.map((value) => {
    if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
      throw new Error(`${label} contains an invalid entry.`);
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error(`${label} contains a control character.`);
    }
    return value;
  });
  return [...new Set(normalized)].sort();
}

function normalizeRelativePath(value: unknown, label = 'path'): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)
    || path.isAbsolute(value)
    || /^[A-Za-z]:[\\/]/.test(value)
    || /^[\\/]/.test(value)) {
    throw new Error(`${label} must be authority-relative.`);
  }
  const segments = value.split(/[\\/]/);
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`${label} contains an unsafe segment.`);
  }
  return segments.join('/');
}

function normalizePathSet(values: unknown, label: string): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array.`);
  }
  return [...new Set(values.map((value) => normalizeRelativePath(value, label)))].sort();
}

function normalizeEnvelope(input: unknown, label = 'envelope'): Envelope {
  const source = objectRecord(input);
  const permissionSource = objectRecord(source.permissionEnvelope);
  const pathSource = objectRecord(source.pathEnvelope);
  const permissions = source.permissions ?? permissionSource.permissions;
  const operations = source.operations ?? permissionSource.operations;
  const externalEffects = source.externalEffects ?? permissionSource.externalEffects;
  const mutablePaths = source.mutablePaths ?? pathSource.mutablePaths;
  return {
    permissions: normalizeSet(permissions, `${label}.permissions`),
    mutablePaths: normalizePathSet(mutablePaths, `${label}.mutablePaths`),
    operations: normalizeSet(operations, `${label}.operations`),
    externalEffects: normalizeSet(externalEffects, `${label}.externalEffects`)
  };
}

function publicPermissionEnvelope(envelope: Envelope): Record<string, string[]> {
  return {
    permissions: [...envelope.permissions],
    operations: [...envelope.operations],
    externalEffects: [...envelope.externalEffects]
  };
}

function publicPathEnvelope(envelope: Envelope): Record<string, string[]> {
  return { mutablePaths: [...envelope.mutablePaths] };
}

function pathIsWithin(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

export function pathsConflict(left: string, right: string): boolean {
  const normalizedLeft = normalizeRelativePath(left, 'left path');
  const normalizedRight = normalizeRelativePath(right, 'right path');
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(`${normalizedRight}/`)
    || normalizedRight.startsWith(`${normalizedLeft}/`);
}

export function hasMutablePathConflict(leftPaths: unknown = [], rightPaths: unknown = []): boolean {
  const left = normalizePathSet(leftPaths, 'left paths');
  const right = normalizePathSet(rightPaths, 'right paths');
  return left.some((leftPath) => right.some((rightPath) => pathsConflict(leftPath, rightPath)));
}

function setIsSubset(child: string[], parent: string[]): boolean {
  return child.every((value) => parent.includes(value));
}

function pathSetIsSubset(child: string[], parent: string[]): boolean {
  return child.every((childPath) => parent.some((parentPath) => pathIsWithin(childPath, parentPath)));
}

function setsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function envelopeIsSubset(child: Envelope, parent: Envelope): boolean {
  return setIsSubset(child.permissions, parent.permissions)
    && pathSetIsSubset(child.mutablePaths, parent.mutablePaths)
    && setIsSubset(child.operations, parent.operations)
    && setIsSubset(child.externalEffects, parent.externalEffects);
}

function envelopeIsProperSubset(child: Envelope, parent: Envelope): boolean {
  return !setsEqual(child.permissions, parent.permissions)
    || !setsEqual(child.mutablePaths, parent.mutablePaths)
    || !setsEqual(child.operations, parent.operations)
    || !setsEqual(child.externalEffects, parent.externalEffects);
}

export function isEnvelopeSubset(childInput: unknown, parentInput: unknown): boolean {
  const child = normalizeEnvelope(childInput, 'child envelope');
  const parent = normalizeEnvelope(parentInput, 'parent envelope');
  return envelopeIsSubset(child, parent);
}

function normalizeObservationRecord(input: unknown): Record<string, unknown> {
  const source = objectRecord(input);
  const capabilities = objectRecord(source.capabilities);
  const visibleWorker = objectRecord(
    source.visibleWorker ?? capabilities.visible_worker
  );
  const nativeSubagent = objectRecord(
    source.nativeSubagent ?? capabilities.native_subagent
  );
  const worktreeSetup = objectRecord(source.worktreeSetup);
  const createAttempts = source.createAttempts;
  if (createAttempts !== undefined
    && (!Number.isSafeInteger(createAttempts) || (createAttempts as number) < 0)) {
    throw new Error('Host createAttempts must be a non-negative safe integer.');
  }
  return {
    authenticated: source.authenticated === true,
    evidenceRef: normalizedString(source.evidenceRef),
    packetDigest: normalizedString(source.packetDigest),
    actualModel: source.actualModel,
    actualEffort: source.actualEffort,
    visibleWorker,
    nativeSubagent,
    workerId: normalizedString(source.workerId),
    status: normalizedString(source.status ?? source.workerStatus),
    lanes: source.lanes ?? source.laneObservations ?? [],
    worktreeSetup: {
      clientThreadId: normalizedString(worktreeSetup.clientThreadId),
      resolved: worktreeSetup.resolved === true
    },
    createAttempts: createAttempts === undefined ? null : createAttempts
  };
}

function authenticatedActual(observation: Record<string, unknown>, packetDigest: string | null): Record<string, string> {
  if (observation.authenticated !== true || !observation.evidenceRef) {
    return { actualModel: 'unknown', actualEffort: 'unknown' };
  }
  if (packetDigest !== null && observation.packetDigest !== packetDigest) {
    return { actualModel: 'unknown', actualEffort: 'unknown' };
  }
  return {
    actualModel: normalizedString(observation.actualModel) ?? 'unknown',
    actualEffort: normalizedString(observation.actualEffort) ?? 'unknown'
  };
}

function unknownActual(): Record<string, string> {
  return { actualModel: 'unknown', actualEffort: 'unknown' };
}

function operationSupport(capability: unknown, operation: string): string {
  const source = objectRecord(capability);
  const operations = source.operations;
  if (operations && typeof operations === 'object' && !Array.isArray(operations)) {
    const operationsSource = operations as Record<string, unknown>;
    if (Object.hasOwn(operationsSource, operation)) {
      return operationsSource[operation] === true ? 'supported'
        : operationsSource[operation] === false ? 'unsupported' : 'unknown';
    }
    return source.operationsComplete === true
      ? 'unsupported'
      : 'unknown';
  }
  if (source.supported === false) return 'unsupported';
  return 'unknown';
}

function capabilityEvidence(capability: unknown, operation: string, kind: string, observation: Record<string, unknown>): Record<string, unknown> {
  const source = objectRecord(capability);
  return {
    kind,
    authenticated: observation.authenticated,
    evidenceRef: observation.evidenceRef ?? null,
    visible: kind === 'native_subagent' ? false : source.visible === true,
    operation,
    operationSupport: operationSupport(source, operation),
    requestedModelEffortControls: source.requestedModelEffortControls === true,
    permissionBinding: source.permissionBinding === true,
    pathBinding: source.pathBinding === true,
    nativeCollaboration: source.nativeCollaboration === true || source.supported === true
  };
}

function matchesChiefRelease(source: Record<string, unknown>, workerId: string | null, mutablePaths: string[]): boolean {
  const release = objectRecord(source.chiefRelease);
  if (release.authenticated !== true
    || release.disposition !== 'release'
    || !workerId
    || normalizedString(release.workerId) !== workerId
    || !normalizedString(release.evidenceRef)) {
    return false;
  }
  const releasedPaths = normalizePathSet(release.mutablePaths, 'chiefRelease.mutablePaths');
  return setsEqual(releasedPaths, mutablePaths);
}

function normalizeLanes(input: Input, observation: Record<string, unknown>): LaneObservation[] {
  const rawLanes = input.lanes ?? observation.lanes;
  if (rawLanes === undefined) return [];
  if (!Array.isArray(rawLanes)) throw new Error('lane observations must be an array.');
  return rawLanes.map((lane, index) => {
    const source = objectRecord(lane);
    const routeKind = normalizedString(source.routeKind);
    if (!routeKind || !HOST_ROUTE_KINDS.includes(routeKind)) {
      throw new Error(`Host lane route kind is invalid: ${String(source.routeKind)}`);
    }
    const status = normalizedString(source.status);
    if (!status || !HOST_WORKER_STATUSES.has(status)) {
      throw new Error(`Host lane status is invalid: ${String(source.status)}`);
    }
    const lanePathEnvelope = normalizeEnvelope(source.pathEnvelope ?? source, `lane ${index}`);
    const workerId = normalizedString(source.workerId);
    const taskId = normalizedString(source.taskId);
    const currentSlice = normalizedString(source.currentSlice);
    const packetDigest = normalizedString(source.packetDigest);
    if (source.packetDigest !== undefined
      && (packetDigest === null || !SHA256_PATTERN.test(packetDigest))) {
      throw new Error(`Host lane packet digest is invalid: ${String(source.packetDigest)}`);
    }
    return {
      routeKind,
      workerId,
      status,
      released: matchesChiefRelease(source, workerId, lanePathEnvelope.mutablePaths),
      mutablePaths: lanePathEnvelope.mutablePaths,
      taskId,
      currentSlice,
      packetDigest
    };
  });
}

function laneIsReserved(lane: LaneObservation): boolean {
  return lane.mutablePaths.length > 0 && lane.released !== true;
}

function laneConflicts(lanes: LaneObservation[], candidatePaths: string[], workerId: string | null, operation: string): boolean {
  return lanes.some((lane) => {
    if (!laneIsReserved(lane) || (operation !== 'spawn' && workerId && lane.workerId === workerId)) return false;
    return hasMutablePathConflict(candidatePaths, lane.mutablePaths);
  });
}

function executingVisibleLaneCount(lanes: LaneObservation[], workerId: string | null, operation: string): number {
  return lanes.filter((lane) => laneIsReserved(lane)
    && lane.status === 'executing'
    && lane.routeKind === 'visible_worker'
    && !(operation !== 'spawn' && workerId && lane.workerId === workerId)).length;
}

const ACTIVE_SEMANTIC_STATUSES = Object.freeze([
  'planned',
  'observed',
  'idle',
  'executing',
  'awaiting_approval',
  'blocked',
  'candidate_done'
]) as readonly string[];

function packetSemanticLane(assignmentPacket: Record<string, unknown> | null): { taskId: string; sliceName: string } | null {
  if (!assignmentPacket) return null;
  const binding = objectRecord(objectRecord(assignmentPacket.authority).binding);
  const taskId = normalizedString(binding.taskId);
  const slice = objectRecord(assignmentPacket.currentSlice);
  const sliceName = normalizedString(slice.name);
  if (!taskId || !sliceName) return null;
  return { taskId, sliceName };
}

function laneSemanticIdentity(lane: LaneObservation): { taskId: string; sliceName: string } | null {
  if (!lane.taskId || !lane.currentSlice) return null;
  return { taskId: lane.taskId, sliceName: lane.currentSlice };
}

function semanticSpawnBlocker({
  lanes,
  assignmentPacket,
  candidatePaths
}: {
  lanes: LaneObservation[];
  assignmentPacket: Record<string, unknown> | null;
  candidatePaths: string[];
}): Record<string, unknown> | null {
  if (lanes.length === 0) return null;
  const candidate = packetSemanticLane(assignmentPacket);
  for (const lane of lanes) {
    if (lane.released === true || !ACTIVE_SEMANTIC_STATUSES.includes(lane.status)) {
      continue;
    }
    const identity = laneSemanticIdentity(lane);
    if (identity === null) {
      if (!hasMutablePathConflict(candidatePaths, lane.mutablePaths)) {
        return {
          blocker: `semantic_identity_unbound:${lane.status}`,
          workerId: lane.workerId,
          status: lane.status,
          resumeCondition: `Reserved ${lane.status} lane ${lane.workerId ?? 'unknown'} lacks authority task and frozen current-slice identity. Do not spawn a replacement: supply the lane's task ID and current-slice identity, or settle the lane with an authenticated Chief release (chiefRelease disposition release with matching workerId and mutable paths).`
        };
      }
      continue;
    }
    if (candidate
      && identity.taskId === candidate.taskId
      && identity.sliceName === candidate.sliceName) {
      return {
        blocker: `semantic_lane_reserved:${lane.status}`,
        workerId: lane.workerId,
        status: lane.status,
        resumeCondition: `Semantic lane ${candidate.taskId}/${candidate.sliceName} is reserved by worker ${lane.workerId ?? 'unknown'} in status ${lane.status}. Do not spawn a replacement: observe, approve, and continue that exact worker, or supply an authenticated Chief release (chiefRelease disposition release with the matching workerId and mutable paths) before any new spawn.`
      };
    }
    if (!candidate && !hasMutablePathConflict(candidatePaths, lane.mutablePaths)) {
      return {
        blocker: `semantic_identity_unbound:${lane.status}`,
        workerId: lane.workerId,
        status: lane.status,
        resumeCondition: `Semantic lane ${identity.taskId}/${identity.sliceName} is reserved by worker ${lane.workerId ?? 'unknown'} in status ${lane.status}, but this request carries no immutable assignment packet. Do not spawn a replacement: supply the immutable assignment packet (authority task ID and frozen currentSlice), or settle the lane with an authenticated Chief release (chiefRelease disposition release with matching workerId and mutable paths).`
      };
    }
  }
  return null;
}

function worktreePendingBlocker(observation: Record<string, unknown>): { blocker: string; resumeCondition: string } | null {
  const setup = objectRecord(observation.worktreeSetup);
  const clientThreadId = setup.clientThreadId;
  if (!clientThreadId || setup.resolved === true) return null;
  return {
    blocker: `worktree_setup_pending:${clientThreadId}`,
    resumeCondition: `Resolve the pending worktree setup ${clientThreadId} with a bounded status/wait on that exact setup before any fallback spawn; one corrected create-request attempt is the maximum.`
  };
}

function createAttemptsBlocker(observation: Record<string, unknown>): { blocker: string; resumeCondition: string } | null {
  const attempts = observation.createAttempts;
  if (attempts === null || (attempts as number) < 2) return null;
  return {
    blocker: 'worker_create_attempts_exhausted',
    resumeCondition: 'One bounded create correction is the maximum; a second Host validation error returns manual_pending for Chief/human correction, not another retry.'
  };
}

function validateObservedStatus(status: string | null): void {
  if (status === 'accepted' || status === 'chief_accepted') {
    throw new Error('Host worker observation cannot claim Chief acceptance.');
  }
  if (status !== null && !HOST_WORKER_STATUSES.has(status)) {
    throw new Error(`Unknown Host worker status: ${status}`);
  }
}

function visibleSafety({
  operation,
  capability,
  observation,
  requestedWorkerId,
  parentEnvelope,
  lanes
}: {
  operation: string;
  capability: Record<string, unknown>;
  observation: Record<string, unknown>;
  requestedWorkerId: string | null;
  parentEnvelope: Envelope;
  lanes: LaneObservation[];
}): { safe: boolean; reason: string | null; support: string } {
  const support = operationSupport(capability, operation);
  if (observation.authenticated !== true || !observation.evidenceRef) {
    return { safe: false, reason: 'visible_observation_unknown', support };
  }
  if (capability.visible !== true) {
    return { safe: false, reason: capability.visible === false ? 'visible_unsupported' : 'visible_unknown', support };
  }
  if (support !== 'supported') {
    return { safe: false, reason: `visible_operation_${support}`, support };
  }
  if (capability.requestedModelEffortControls !== true) {
    return { safe: false, reason: 'visible_model_controls_unbound', support };
  }
  if (capability.permissionBinding !== true || !parentEnvelope.operations.includes(operation)) {
    return { safe: false, reason: 'visible_permission_unbound', support };
  }
  if (capability.pathBinding !== true) {
    return { safe: false, reason: 'visible_path_unbound', support };
  }
  const workerId = observation.workerId as string | null;
  if (operation !== 'spawn'
    && (!requestedWorkerId || !workerId || requestedWorkerId !== workerId)) {
    return { safe: false, reason: 'visible_target_unbound', support };
  }
  if (laneConflicts(lanes, parentEnvelope.mutablePaths, workerId, operation)) {
    return { safe: false, reason: 'mutable_path_conflict', support };
  }
  if (operation === 'spawn'
    && parentEnvelope.mutablePaths.length > 0
    && executingVisibleLaneCount(lanes, workerId, operation) >= 2) {
    return { safe: false, reason: 'visible_lane_capacity', support };
  }
  return { safe: true, reason: null, support };
}

function nativeSafety({
  operation,
  capability,
  observation,
  parentEnvelope,
  childEnvelope,
  requestedEffort,
  lanes
}: {
  operation: string;
  capability: Record<string, unknown>;
  observation: Record<string, unknown>;
  parentEnvelope: Envelope;
  childEnvelope: Envelope | null;
  requestedEffort: string;
  lanes: LaneObservation[];
}): { safe: boolean; reason: string | null; support: string } {
  const support = operationSupport(capability, operation);
  if (operation !== 'spawn') {
    return { safe: false, reason: 'native_target_unbound', support };
  }
  if (observation.authenticated !== true || !observation.evidenceRef) {
    return { safe: false, reason: 'native_observation_unknown', support };
  }
  if (capability.supported !== true && capability.nativeCollaboration !== true) {
    return { safe: false, reason: capability.supported === false ? 'native_unsupported' : 'native_unknown', support };
  }
  if (capability.visible === true) {
    return { safe: false, reason: 'native_visible_identity_conflict', support };
  }
  if (support !== 'supported') {
    return { safe: false, reason: `native_operation_${support}`, support };
  }
  if (requestedEffort.toLowerCase() === 'ultra') {
    return { safe: false, reason: 'native_ultra_forbidden', support };
  }
  if (!childEnvelope || !childEnvelope.operations.includes(operation)) {
    return { safe: false, reason: 'child_operation_unbound', support };
  }
  if (!envelopeIsSubset(childEnvelope, parentEnvelope)) {
    return { safe: false, reason: 'child_envelope_widened', support };
  }
  if (!envelopeIsProperSubset(childEnvelope, parentEnvelope)) {
    return { safe: false, reason: 'child_envelope_not_narrower', support };
  }
  if (laneConflicts(lanes, childEnvelope.mutablePaths, null, operation)) {
    return { safe: false, reason: 'mutable_path_conflict', support };
  }
  return { safe: true, reason: null, support };
}

function routeStatus(observation: Record<string, unknown>, routeKind: string, operation: string): string {
  if (routeKind === 'manual_pending') return 'manual_pending';
  if (routeKind === 'visible_worker' && operation !== 'spawn') {
    return (observation.status as string) ?? 'observed';
  }
  return 'planned';
}

function buildRouteEvidence({
  routeKind,
  requestedModel,
  requestedEffort,
  actual,
  workerId,
  capability,
  permissionEnvelope,
  pathEnvelope,
  fallbackReason,
  status
}: {
  routeKind: string;
  requestedModel: string;
  requestedEffort: string;
  actual: Record<string, string>;
  workerId: string | null;
  capability: Record<string, unknown>;
  permissionEnvelope: Envelope;
  pathEnvelope: Envelope;
  fallbackReason: string | null;
  status: string;
}): RouteEvidence {
  return Object.fromEntries([
    ['routeKind', routeKind],
    ['requestedModel', requestedModel],
    ['requestedEffort', requestedEffort],
    ['actualModel', actual.actualModel],
    ['actualEffort', actual.actualEffort],
    ['workerId', workerId],
    ['capabilityEvidence', capability],
    ['permissionEnvelope', publicPermissionEnvelope(permissionEnvelope)],
    ['pathEnvelope', publicPathEnvelope(pathEnvelope)],
    ['fallbackReason', fallbackReason],
    ['status', status]
  ]) as RouteEvidence;
}

function buildOperationDescriptor({
  operation,
  routeKind,
  childEnvelope,
  assignmentPacket,
  packetDigest,
  blocker,
  resumeCondition,
  reservedLane
}: {
  operation: string;
  routeKind: string;
  childEnvelope: Envelope | null;
  assignmentPacket?: Record<string, unknown> | null;
  packetDigest?: string | null;
  blocker?: string;
  resumeCondition?: string;
  reservedLane?: { workerId: string | null; status: string };
}): OperationDescriptor {
  const descriptor: Record<string, unknown> = {
    kind: 'host_operation',
    operation,
    routeKind,
    executed: false,
    writes: []
  };
  if (routeKind === 'native_subagent' && childEnvelope) {
    descriptor.childEnvelope = {
      permissions: [...childEnvelope.permissions],
      mutablePaths: [...childEnvelope.mutablePaths],
      operations: [...childEnvelope.operations],
      externalEffects: [...childEnvelope.externalEffects]
    };
  }
  if (routeKind === 'visible_worker' && assignmentPacket) {
    descriptor.assignmentPacket = assignmentPacket;
    descriptor.packetDigest = packetDigest;
  }
  if (routeKind === 'manual_pending') {
    descriptor.kind = 'manual_pending';
    descriptor.assignmentPacket = assignmentPacket;
    descriptor.packetDigest = packetDigest;
    descriptor.blocker = blocker;
    descriptor.resumeCondition = resumeCondition;
    if (reservedLane) {
      descriptor.reservedLane = {
        workerId: reservedLane.workerId,
        status: reservedLane.status
      };
    }
  }
  return descriptor;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function packetDigestOf(packet: unknown): string | null {
  if (!packet) return null;
  return createHash('sha256').update(stableStringify(packet)).digest('hex');
}

function primaryExecutionKind(input: Input): string {
  const packet = objectRecord(input.assignmentPacket);
  const capability = objectRecord(packet.capability);
  const value = capability.primaryExecution ?? 'default';
  if (typeof value !== 'string' || !PRIMARY_EXECUTION_KINDS.includes(value)) {
    throw new Error(`Unknown primaryExecution kind: ${String(value)}`);
  }
  return value;
}

function childProfileBlocker(resolution: Record<string, unknown>, parentEffort: string | null): string | null {
  if (resolution.requestedModel !== FLASH_EXECUTION_MODEL) {
    return `child_profile_unbound:model:${resolution.requestedModel}`;
  }
  if (!Object.hasOwn(EFFORT_RANK, resolution.requestedEffort as string)) {
    return `child_profile_unbound:effort:${resolution.requestedEffort}`;
  }
  if (!parentEffort || !Object.hasOwn(EFFORT_RANK, parentEffort)) {
    return `child_profile_unbound:parent_effort:${parentEffort ?? 'missing'}`;
  }
  if (EFFORT_RANK[resolution.requestedEffort as string] > EFFORT_RANK[parentEffort]) {
    return `child_profile_widened:${resolution.requestedEffort}_over_${parentEffort}`;
  }
  return null;
}

function resolveHostModelPolicy(input: Input, assignmentPacket: Record<string, unknown> | null): Record<string, unknown> {
  const capability = objectRecord(assignmentPacket?.capability);
  const taskClass = (capability.taskClass as string) ?? classifyTask(input);
  let resolution: Record<string, unknown>;
  if (assignmentPacket) {
    resolution = resolveEconomicPolicy({
      ...capability,
      taskClass,
      isChild: input.isChild === true,
      evidence: { authenticated: false }
    }, taskClass);
    const outerModel = normalizedString(input.requestedModel);
    const outerEffort = normalizedString(input.requestedEffort);
    if (outerModel !== null && outerModel !== resolution.requestedModel) {
      throw new Error(`Outer requested model ${outerModel} conflicts with the validated packet policy ${resolution.requestedModel}.`);
    }
    if (outerEffort !== null && outerEffort !== resolution.requestedEffort && outerEffort !== 'ultra') {
      throw new Error(`Outer requested effort ${outerEffort} conflicts with the validated packet policy ${resolution.requestedEffort}.`);
    }
  } else {
    resolution = resolveModelEffort({
      taskClass,
      workRole: input.workRole,
      complexity: input.complexity,
      override: input.override,
      requestedModel: input.requestedModel,
      requestedEffort: input.requestedEffort,
      primaryExecution: input.primaryExecution,
      executionMode: input.executionMode,
      isChild: input.isChild === true,
      evidence: { authenticated: false }
    });
  }
  return resolution;
}

function childDelegationPolicy(capability: Record<string, unknown>, primaryExecution: string): { valid: boolean; blocker?: string; policy?: string | null } {
  const source = objectRecord(capability);
  const declared = source.childDelegation;
  if (declared === undefined) {
    return primaryExecution === PRIMARY_EXECUTION_REQUIRED
      ? { valid: false, blocker: 'child_delegation_missing' }
      : { valid: true, policy: null };
  }
  if (typeof declared !== 'string' || !CHILD_DELEGATION_KINDS.includes(declared)) {
    return { valid: false, blocker: `child_delegation_unknown:${String(declared)}` };
  }
  return { valid: true, policy: declared };
}

function executionModePolicy(capability: Record<string, unknown>): { valid: boolean; mode?: string | null; blocker?: string } {
  const source = objectRecord(capability);
  const declared = source.executionMode;
  if (declared === undefined) {
    return { valid: true, mode: null };
  }
  if (typeof declared !== 'string' || !EXECUTION_MODE_KINDS.includes(declared)) {
    return { valid: false, blocker: `execution_mode_unknown:${String(declared)}` };
  }
  return { valid: true, mode: declared };
}

function manualCapabilityEvidence({
  operation,
  observation,
  visibleCapability,
  nativeCapability,
  visibleResult,
  nativeResult
}: {
  operation: string;
  observation: Record<string, unknown>;
  visibleCapability: Record<string, unknown>;
  nativeCapability: Record<string, unknown>;
  visibleResult: { safe: boolean; reason: string | null; support: string };
  nativeResult: { safe: boolean; reason: string | null; support: string };
}): Record<string, unknown> {
  const visibleSource = objectRecord(visibleCapability);
  const nativeSource = objectRecord(nativeCapability);
  return {
    kind: 'manual_pending',
    authenticated: observation.authenticated,
    evidenceRef: observation.evidenceRef ?? null,
    visible: visibleSource.visible === true,
    operation,
    visibleOperationSupport: visibleResult.support,
    requestedModelEffortControls: visibleSource.requestedModelEffortControls === true,
    permissionBinding: visibleSource.permissionBinding === true,
    pathBinding: visibleSource.pathBinding === true,
    nativeCollaboration: nativeSource.nativeCollaboration === true || nativeSource.supported === true,
    nativeOperationSupport: nativeResult.support
  };
}

function normalizeSandboxMode(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SANDBOX_MODE_KINDS.includes(value)) {
    throw new Error(`${label} must be bounded or full_access.`);
  }
  return value;
}

function normalizeApproval(input: unknown): { kind: string; granted: boolean } | null {
  if (input === undefined || input === null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('approval requires a structured signal.');
  }
  const source = input as Record<string, unknown>;
  const kind = normalizedString(source.kind);
  if (!kind || !APPROVAL_KINDS.includes(kind)) {
    throw new Error('approval kind must be user or auto_review.');
  }
  if (typeof source.granted !== 'boolean') {
    throw new Error('approval granted must be a boolean.');
  }
  return { kind, granted: source.granted };
}

function scopeDecision(assignmentPacket: Record<string, unknown>, targetPaths: string[], generatedTargets: string[]): { decision: string; reason: string | null } {
  const allowedFiles = normalizePathSet(
    objectRecord(objectRecord(assignmentPacket).allowedOperations).files,
    'assignment scope files'
  );
  for (const target of targetPaths) {
    if (generatedTargets.some((root) => pathIsWithin(target, root))) {
      return { decision: 'blocked', reason: `generated_target:${target}` };
    }
  }
  for (const target of targetPaths) {
    if (!allowedFiles.some((root) => pathIsWithin(target, root))) {
      return { decision: 'blocked', reason: `outside_assignment_scope:${target}` };
    }
  }
  return { decision: 'allowed', reason: null };
}

function permissionActual(hostObservation: Record<string, unknown>, packetDigest: string | null): Record<string, unknown> {
  const authenticated = hostObservation.authenticated === true
    && normalizedString(hostObservation.evidenceRef) !== null;
  if (!authenticated || (packetDigest !== null && hostObservation.packetDigest !== packetDigest)) {
    return { authenticated: false, evidenceRef: null, sandbox: 'unknown', writableRoots: 'unknown' };
  }
  const sandbox = normalizedString(hostObservation.actualSandbox);
  return {
    authenticated: true,
    evidenceRef: normalizedString(hostObservation.evidenceRef),
    sandbox: sandbox !== null && SANDBOX_MODE_KINDS.includes(sandbox) ? sandbox : 'unknown',
    writableRoots: Array.isArray(hostObservation.actualWritableRoots)
      ? normalizePathSet(hostObservation.actualWritableRoots, 'actual writable roots')
      : 'unknown'
  };
}

function sandboxDecision(hostObservation: Record<string, unknown>, packetDigest: string | null, targetPaths: string[]): { decision: string; reason: string | null; actual: Record<string, unknown> } {
  const actual = permissionActual(hostObservation, packetDigest);
  if (actual.sandbox === 'unknown' || actual.writableRoots === 'unknown') {
    return { decision: 'blocked', reason: 'sandbox_actual_unknown', actual };
  }
  if (actual.sandbox === 'bounded') {
    const covered = targetPaths.every((target) =>
      (actual.writableRoots as string[]).some((root) => pathIsWithin(target, root)));
    if (!covered) {
      return { decision: 'blocked', reason: 'sandbox_writable_roots_unbound', actual };
    }
  }
  return { decision: 'allowed', reason: null, actual };
}

function permissionVerdict({
  stage,
  reason,
  scope,
  sandbox,
  approval,
  requested,
  actual
}: {
  stage: string;
  reason: string | null;
  scope: { decision: string; reason: string | null };
  sandbox: { decision: string; reason: string | null };
  approval: { decision: string; reason: string | null };
  requested: { sandboxMode: string; writableRoots: string[]; approval: { kind: string; granted: boolean } | null };
  actual: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    verdict: reason === null ? 'allowed' : 'blocked',
    stage,
    reason,
    approvalEligible: scope.decision === 'allowed' && sandbox.decision === 'allowed',
    stages: {
      scope: { decision: scope.decision, reason: scope.reason },
      sandbox: { decision: sandbox.decision, reason: sandbox.reason },
      approval: { decision: approval.decision, reason: approval.reason }
    },
    requested: {
      sandboxMode: requested.sandboxMode,
      writableRoots: [...requested.writableRoots],
      approval: requested.approval === null
        ? null
        : { kind: requested.approval.kind, granted: requested.approval.granted }
    },
    actual: {
      authenticated: actual.authenticated,
      evidenceRef: actual.evidenceRef,
      sandbox: actual.sandbox,
      writableRoots: Array.isArray(actual.writableRoots) ? [...(actual.writableRoots as string[])] : actual.writableRoots
    }
  };
}

export function adjudicatePermission(input: Input = {}): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Permission adjudication input must be an object.');
  }
  const assignmentPacket = buildAssignmentPacket(objectRecord(input.assignmentPacket));
  const targetPaths = normalizePathSet(input.targetPaths, 'target paths');
  if (targetPaths.length === 0) {
    throw new Error('Permission adjudication requires at least one target path.');
  }
  const callerGeneratedTargets = input.generatedTargets ?? [];
  if (!Array.isArray(callerGeneratedTargets)) {
    throw new Error('generated targets must be an array.');
  }
  const generatedTargets = normalizePathSet(
    [...DEFAULT_GENERATED_TARGETS, ...callerGeneratedTargets],
    'generated targets'
  );
  const intent = objectRecord(input.permissionIntent);
  const requested = {
    sandboxMode: normalizeSandboxMode(intent.sandboxMode, 'permissionIntent.sandboxMode'),
    writableRoots: normalizePathSet(intent.writableRoots, 'permissionIntent.writableRoots'),
    approval: normalizeApproval(input.approval)
  };
  const hostObservation = objectRecord(input.hostObservation);
  const packetDigest = packetDigestOf(assignmentPacket);

  const scope = scopeDecision(assignmentPacket, targetPaths, generatedTargets);
  if (scope.decision === 'blocked') {
    return permissionVerdict({
      stage: 'scope',
      reason: scope.reason,
      scope,
      sandbox: { decision: 'skipped', reason: null },
      approval: { decision: 'skipped', reason: null },
      requested,
      actual: permissionActual(hostObservation, packetDigest)
    });
  }
  const sandbox = sandboxDecision(hostObservation, packetDigest, targetPaths);
  if (sandbox.decision === 'blocked') {
    return permissionVerdict({
      stage: 'sandbox',
      reason: sandbox.reason,
      scope,
      sandbox,
      approval: { decision: 'skipped', reason: null },
      requested,
      actual: sandbox.actual
    });
  }
  const approval = requested.approval === null || requested.approval.granted
    ? { decision: 'allowed', reason: null }
    : { decision: 'blocked', reason: 'approval_denied' };
  return permissionVerdict({
    stage: 'approval',
    reason: approval.reason,
    scope,
    sandbox,
    approval,
    requested,
    actual: sandbox.actual
  });
}

export function resolveHostOperation(input: Input = {}): { operation: string; routeEvidence: RouteEvidence; descriptor: OperationDescriptor } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Host operation input must be an object.');
  }
  const operation = assertHostOperation(input.operation);
  const packetInput = input.assignmentPacket ?? input.packet;
  const assignmentPacket = packetInput === undefined ? null : buildAssignmentPacket(objectRecord(packetInput));
  const packetDigest = packetDigestOf(assignmentPacket);
  const modelResolution = resolveHostModelPolicy(input, assignmentPacket);
  const observation = normalizeObservationRecord(input.observation ?? input.hostObservation);
  const childBlocker = input.isChild === true
    ? childProfileBlocker(modelResolution, normalizedString(input.parentEffort))
    : null;
  if (childBlocker) {
    const routeEvidence = buildRouteEvidence({
      routeKind: 'manual_pending',
      requestedModel: modelResolution.requestedModel as string,
      requestedEffort: modelResolution.requestedEffort as string,
      actual: unknownActual(),
      workerId: null,
      capability: manualCapabilityEvidence({
        operation,
        observation,
        visibleCapability: observation.visibleWorker as Record<string, unknown>,
        nativeCapability: observation.nativeSubagent as Record<string, unknown>,
        visibleResult: { support: 'unknown', safe: false, reason: null },
        nativeResult: { support: 'unknown', safe: false, reason: null }
      }),
      permissionEnvelope: normalizeEnvelope(
        input.parentEnvelope ?? {
          permissionEnvelope: input.permissionEnvelope,
          pathEnvelope: input.pathEnvelope
        },
        'parent envelope'
      ),
      pathEnvelope: normalizeEnvelope(
        input.parentEnvelope ?? {
          permissionEnvelope: input.permissionEnvelope,
          pathEnvelope: input.pathEnvelope
        },
        'parent envelope'
      ),
      fallbackReason: childBlocker,
      status: 'manual_pending'
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'manual_pending',
        childEnvelope: null,
        assignmentPacket,
        packetDigest,
        blocker: childBlocker,
        resumeCondition: 'A child request must carry a Flash execution profile with effort no greater than its parent and a Host that can bind that requested profile.'
      })
    };
  }
  const primaryExecution = primaryExecutionKind(input);
  validateObservedStatus(observation.status as string | null);
  const requestedWorkerId = normalizedString(input.requestedWorkerId);
  const parentEnvelope = normalizeEnvelope(
    input.parentEnvelope ?? {
      permissionEnvelope: input.permissionEnvelope,
      pathEnvelope: input.pathEnvelope
    },
    'parent envelope'
  );
  const childEnvelope = input.childEnvelope === undefined
    ? null
    : normalizeEnvelope(input.childEnvelope, 'child envelope');
  const lanes = normalizeLanes(input, observation);
  if (operation === 'spawn') {
    const worktreeBlock = worktreePendingBlocker(observation);
    if (worktreeBlock) {
      const routeEvidence = buildRouteEvidence({
        routeKind: 'manual_pending',
        requestedModel: modelResolution.requestedModel as string,
        requestedEffort: modelResolution.requestedEffort as string,
        actual: unknownActual(),
        workerId: null,
        capability: manualCapabilityEvidence({
          operation,
          observation,
          visibleCapability: observation.visibleWorker as Record<string, unknown>,
          nativeCapability: observation.nativeSubagent as Record<string, unknown>,
          visibleResult: { support: 'unknown', safe: false, reason: null },
          nativeResult: { support: 'unknown', safe: false, reason: null }
        }),
        permissionEnvelope: parentEnvelope,
        pathEnvelope: parentEnvelope,
        fallbackReason: worktreeBlock.blocker,
        status: 'manual_pending'
      });
      return {
        operation,
        routeEvidence,
        descriptor: buildOperationDescriptor({
          operation,
          routeKind: 'manual_pending',
          childEnvelope: null,
          assignmentPacket,
          packetDigest,
          blocker: worktreeBlock.blocker,
          resumeCondition: worktreeBlock.resumeCondition
        })
      };
    }
    const attemptsBlock = createAttemptsBlocker(observation);
    if (attemptsBlock) {
      const routeEvidence = buildRouteEvidence({
        routeKind: 'manual_pending',
        requestedModel: modelResolution.requestedModel as string,
        requestedEffort: modelResolution.requestedEffort as string,
        actual: unknownActual(),
        workerId: null,
        capability: manualCapabilityEvidence({
          operation,
          observation,
          visibleCapability: observation.visibleWorker as Record<string, unknown>,
          nativeCapability: observation.nativeSubagent as Record<string, unknown>,
          visibleResult: { support: 'unknown', safe: false, reason: null },
          nativeResult: { support: 'unknown', safe: false, reason: null }
        }),
        permissionEnvelope: parentEnvelope,
        pathEnvelope: parentEnvelope,
        fallbackReason: attemptsBlock.blocker,
        status: 'manual_pending'
      });
      return {
        operation,
        routeEvidence,
        descriptor: buildOperationDescriptor({
          operation,
          routeKind: 'manual_pending',
          childEnvelope: null,
          assignmentPacket,
          packetDigest,
          blocker: attemptsBlock.blocker,
          resumeCondition: attemptsBlock.resumeCondition
        })
      };
    }
    const semanticBlock = semanticSpawnBlocker({
      lanes,
      assignmentPacket,
      candidatePaths: parentEnvelope.mutablePaths
    });
    if (semanticBlock) {
      const routeEvidence = buildRouteEvidence({
        routeKind: 'manual_pending',
        requestedModel: modelResolution.requestedModel as string,
        requestedEffort: modelResolution.requestedEffort as string,
        actual: unknownActual(),
        workerId: semanticBlock.workerId as string | null,
        capability: manualCapabilityEvidence({
          operation,
          observation,
          visibleCapability: observation.visibleWorker as Record<string, unknown>,
          nativeCapability: observation.nativeSubagent as Record<string, unknown>,
          visibleResult: { support: 'unknown', safe: false, reason: null },
          nativeResult: { support: 'unknown', safe: false, reason: null }
        }),
        permissionEnvelope: parentEnvelope,
        pathEnvelope: parentEnvelope,
        fallbackReason: semanticBlock.blocker as string,
        status: 'manual_pending'
      });
      return {
        operation,
        routeEvidence,
        descriptor: buildOperationDescriptor({
          operation,
          routeKind: 'manual_pending',
          childEnvelope: null,
          assignmentPacket,
          packetDigest,
          blocker: semanticBlock.blocker as string,
          resumeCondition: semanticBlock.resumeCondition as string,
          reservedLane: {
            workerId: semanticBlock.workerId as string | null,
            status: semanticBlock.status as string
          }
        })
      };
    }
  }
  const visibleCapability = observation.visibleWorker as Record<string, unknown>;
  const nativeCapability = observation.nativeSubagent as Record<string, unknown>;
  const visibleResult = visibleSafety({
    operation,
    capability: visibleCapability,
    observation,
    requestedWorkerId,
    parentEnvelope,
    lanes
  });
  const visibleEvidence = capabilityEvidence(
    visibleCapability,
    operation,
    'visible_worker',
    observation
  );
  const nativeResult = nativeSafety({
    operation,
    capability: nativeCapability,
    observation,
    parentEnvelope,
    childEnvelope,
    requestedEffort: normalizedString(input.requestedEffort) ?? (modelResolution.requestedEffort as string),
    lanes
  });
  const packetSource = objectRecord(input.assignmentPacket);
  const capabilitySource = objectRecord(packetSource.capability);
  const childPolicy = childDelegationPolicy(capabilitySource, primaryExecution);
  const modePolicy = executionModePolicy(capabilitySource);
  const policyBlocker = !childPolicy.valid
    ? childPolicy.blocker ?? null
    : (!modePolicy.valid ? modePolicy.blocker ?? null : null);
  if (policyBlocker) {
    const routeEvidence = buildRouteEvidence({
      routeKind: 'manual_pending',
      requestedModel: modelResolution.requestedModel as string,
      requestedEffort: modelResolution.requestedEffort as string,
      actual: unknownActual(),
      workerId: null,
      capability: manualCapabilityEvidence({
        operation,
        observation,
        visibleCapability,
        nativeCapability,
        visibleResult,
        nativeResult
      }),
      permissionEnvelope: parentEnvelope,
      pathEnvelope: parentEnvelope,
      fallbackReason: policyBlocker,
      status: 'manual_pending'
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'manual_pending',
        childEnvelope: null,
        assignmentPacket,
        packetDigest,
        blocker: policyBlocker,
        resumeCondition: policyBlocker === 'child_delegation_missing'
          ? 'Declare an explicit childDelegation policy (prohibited | worker_discretion | encouraged) on the assignment packet before routing.'
          : policyBlocker.startsWith('child_delegation_unknown')
            ? 'Replace the unknown childDelegation value with an explicit prohibited, worker_discretion, or encouraged policy.'
            : 'Replace the unknown executionMode value with bounded_slice or worker_self_goal.'
      })
    };
  }
  if (visibleResult.safe) {
    const routeEvidence = buildRouteEvidence({
      routeKind: 'visible_worker',
      requestedModel: modelResolution.requestedModel as string,
      requestedEffort: modelResolution.requestedEffort as string,
      actual: operation === 'spawn' ? unknownActual() : authenticatedActual(observation, packetDigest),
      workerId: operation === 'spawn' ? null : (observation.workerId as string | null),
      capability: visibleEvidence,
      permissionEnvelope: parentEnvelope,
      pathEnvelope: parentEnvelope,
      fallbackReason: null,
      status: routeStatus(observation, 'visible_worker', operation)
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'visible_worker',
        childEnvelope: null,
        assignmentPacket,
        packetDigest
      })
    };
  }

  if (primaryExecution === PRIMARY_EXECUTION_REQUIRED) {
    const fallbackReason = `visible_worker_required_unavailable:${visibleResult.reason}`;
    const routeEvidence = buildRouteEvidence({
      routeKind: 'manual_pending',
      requestedModel: modelResolution.requestedModel as string,
      requestedEffort: modelResolution.requestedEffort as string,
      actual: unknownActual(),
      workerId: null,
      capability: manualCapabilityEvidence({
        operation,
        observation,
        visibleCapability,
        nativeCapability,
        visibleResult,
        nativeResult
      }),
      permissionEnvelope: parentEnvelope,
      pathEnvelope: parentEnvelope,
      fallbackReason,
      status: 'manual_pending'
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'manual_pending',
        childEnvelope: null,
        assignmentPacket,
        packetDigest,
        blocker: fallbackReason,
        resumeCondition: `Provide an authenticated Host visible worker with bound model, effort, permission, and path controls, or release the ${PRIMARY_EXECUTION_REQUIRED} topology.`
      })
    };
  }

  if (childPolicy.policy === 'prohibited') {
    const blocker = 'child_delegation_prohibited';
    const routeEvidence = buildRouteEvidence({
      routeKind: 'manual_pending',
      requestedModel: modelResolution.requestedModel as string,
      requestedEffort: modelResolution.requestedEffort as string,
      actual: unknownActual(),
      workerId: null,
      capability: manualCapabilityEvidence({
        operation,
        observation,
        visibleCapability,
        nativeCapability,
        visibleResult,
        nativeResult
      }),
      permissionEnvelope: parentEnvelope,
      pathEnvelope: parentEnvelope,
      fallbackReason: blocker,
      status: 'manual_pending'
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'manual_pending',
        childEnvelope: null,
        assignmentPacket,
        packetDigest,
        blocker,
        resumeCondition: 'childDelegation: prohibited denies native child creation; admit a native child only under an explicit worker_discretion or encouraged policy.'
      })
    };
  }
  const nativeEvidence = capabilityEvidence(
    nativeCapability,
    operation,
    'native_subagent',
    observation
  );
  if (nativeResult.safe) {
    const routeEvidence = buildRouteEvidence({
      routeKind: 'native_subagent',
      requestedModel: modelResolution.requestedModel as string,
      requestedEffort: modelResolution.requestedEffort as string,
      actual: unknownActual(),
      workerId: null,
      capability: nativeEvidence,
      permissionEnvelope: childEnvelope ?? parentEnvelope,
      pathEnvelope: childEnvelope ?? parentEnvelope,
      fallbackReason: visibleResult.reason,
      status: routeStatus(observation, 'native_subagent', operation)
    });
    return {
      operation,
      routeEvidence,
      descriptor: buildOperationDescriptor({
        operation,
        routeKind: 'native_subagent',
        childEnvelope
      })
    };
  }

  const fallbackReason = `${visibleResult.reason};${nativeResult.reason}`;
  const routeEvidence = buildRouteEvidence({
    routeKind: 'manual_pending',
    requestedModel: modelResolution.requestedModel as string,
    requestedEffort: modelResolution.requestedEffort as string,
    actual: unknownActual(),
    workerId: null,
    capability: manualCapabilityEvidence({
      operation,
      observation,
      visibleCapability,
      nativeCapability,
      visibleResult,
      nativeResult
    }),
    permissionEnvelope: parentEnvelope,
    pathEnvelope: parentEnvelope,
    fallbackReason,
    status: 'manual_pending'
  });
  return {
    operation,
    routeEvidence,
    descriptor: buildOperationDescriptor({
      operation,
      routeKind: 'manual_pending',
      childEnvelope: null,
      assignmentPacket,
      packetDigest,
      blocker: fallbackReason,
      resumeCondition: `Obtain authenticated Host support for ${operation} with a bound permission and path envelope.`
    })
  };
}
