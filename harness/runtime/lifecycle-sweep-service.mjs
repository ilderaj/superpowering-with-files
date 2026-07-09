import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getActiveTaskSummary } from './summary-service.mjs';
import { readLifecycleAnchorReceipts } from './lifecycle-anchor-receipt.mjs';

const KNOWN_STATUSES = new Set([
  'active',
  'blocked',
  'waiting_review',
  'waiting_execution',
  'waiting_integration',
  'closed',
  'archived'
]);

const FRESHNESS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const APPLY_TRANSITIONS = new Set([
  'active->waiting_review',
  'active->waiting_integration',
  'waiting_review->waiting_integration'
]);

function parseTime(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function hasInProgressPhases(task = {}) {
  if ((task.phase_in_progress || 0) > 0) return true;
  if ((task.phase_total || 0) > 0 && (task.phase_complete || 0) < (task.phase_total || 0)) {
    return true;
  }
  return false;
}

function isStaleAnchor(anchor, now) {
  const observedAt = parseTime(anchor.observedAt);
  if (!Number.isFinite(observedAt)) return true;
  return now - observedAt > FRESHNESS_WINDOW_MS;
}

function hasAuthorityMismatch(taskId, anchor) {
  const authorityTaskId = anchor.subject?.authorityTaskId;
  return Boolean(authorityTaskId && authorityTaskId !== taskId);
}

function hasWrongTarget(anchor) {
  const subject = anchor.subject || {};
  if (subject.base && subject.expectedBase && subject.base !== subject.expectedBase) return true;
  if (subject.base && subject.intendedBase && subject.base !== subject.intendedBase) return true;
  return false;
}

function terminalStatus(anchor) {
  if (!['strong', 'terminal'].includes(anchor.anchorStrength)) return null;
  if (!['closed', 'blocked', 'discarded'].includes(anchor.recommendedStatus)) return null;
  return anchor.recommendedStatus;
}

function hasConflictingTerminalAnchors(anchors) {
  const statuses = new Set(anchors.map(terminalStatus).filter(Boolean));
  return statuses.size > 1;
}

function sortAnchors(anchors) {
  const strengthRank = { terminal: 4, strong: 3, moderate: 2, weak: 1 };
  return [...anchors].sort((left, right) => {
    const leftRank = strengthRank[left.anchorStrength] || 0;
    const rightRank = strengthRank[right.anchorStrength] || 0;
    if (leftRank !== rightRank) return rightRank - leftRank;
    return String(right.observedAt || '').localeCompare(String(left.observedAt || ''));
  });
}

function baseRecommendation(task, anchors) {
  if (anchors.length === 0) {
    return {
      taskId: task.task_id,
      currentStatus: task.status,
      recommendedStatus: task.status,
      confidence: 'low',
      action: 'keep_active',
      archiveAction: 'never_auto_archive',
      anchors: [],
      retainReasons: ['No lifecycle anchors found.'],
      blockers: [],
      applyEligible: false
    };
  }

  const anchor = sortAnchors(anchors)[0];
  const compactAnchors = anchors.map((entry) => ({
    anchorId: entry.anchorId,
    anchorType: entry.anchorType,
    anchorStrength: entry.anchorStrength,
    evidenceRefs: entry.evidenceRefs || []
  }));

  if (anchor.anchorType === 'pr_created') {
    return {
      taskId: task.task_id,
      currentStatus: task.status,
      recommendedStatus: 'waiting_review',
      confidence: 'medium',
      action: 'mark_waiting_review',
      archiveAction: 'never_auto_archive',
      anchors: compactAnchors,
      retainReasons: [],
      blockers: [],
      applyEligible: false
    };
  }

  if (anchor.anchorType === 'branch_pushed' || anchor.anchorType === 'worktree_merged') {
    return {
      taskId: task.task_id,
      currentStatus: task.status,
      recommendedStatus: 'waiting_integration',
      confidence: anchor.anchorType === 'worktree_merged' ? 'medium' : 'low',
      action: 'mark_waiting_integration',
      archiveAction: 'never_auto_archive',
      anchors: compactAnchors,
      retainReasons: [],
      blockers: [],
      applyEligible: false
    };
  }

  if (['pr_merged', 'release_published'].includes(anchor.anchorType)) {
    return {
      taskId: task.task_id,
      currentStatus: task.status,
      recommendedStatus: 'closed',
      confidence: 'high',
      action: 'recommend_close',
      archiveAction: 'never_auto_archive',
      anchors: compactAnchors,
      retainReasons: [],
      blockers: [],
      applyEligible: false
    };
  }

  if (anchor.anchorType === 'autonomous_closure_terminal') {
    const blocked = anchor.recommendedStatus === 'blocked';
    return {
      taskId: task.task_id,
      currentStatus: task.status,
      recommendedStatus: blocked ? 'blocked' : 'closed',
      confidence: 'high',
      action: blocked ? 'mark_blocked' : 'recommend_close',
      archiveAction: 'never_auto_archive',
      anchors: compactAnchors,
      retainReasons: [],
      blockers: [],
      applyEligible: false
    };
  }

  return {
    taskId: task.task_id,
    currentStatus: task.status,
    recommendedStatus: task.status,
    confidence: 'low',
    action: 'manual_review',
    archiveAction: 'never_auto_archive',
    anchors: compactAnchors,
    retainReasons: [],
    blockers: [`Unsupported lifecycle anchor type "${anchor.anchorType}".`],
    applyEligible: false
  };
}

function withManualReview(recommendation, blockers) {
  return {
    ...recommendation,
    recommendedStatus: recommendation.currentStatus,
    confidence: 'low',
    action: 'manual_review',
    blockers,
    applyEligible: false
  };
}

export function classifyLifecycleRecommendation(task, anchors = [], options = {}) {
  const now = options.now ?? Date.now();
  const blockers = [];

  if (!KNOWN_STATUSES.has(task.status)) {
    blockers.push(`Unknown lifecycle status "${task.status}".`);
  }
  if (hasInProgressPhases(task)) {
    blockers.push('Task has in-progress or incomplete phases.');
  }
  if (task.companion?.has_companion && !task.companion.ok) {
    blockers.push('Task has companion drift.');
  }
  if ((task.executionSignals?.openFollowups || 0) > 0) {
    blockers.push('Task has open execution followups.');
  }
  if ((task.executionSignals?.blockedUnits || 0) > 0) {
    blockers.push('Task has blocked execution units.');
  }
  if ((task.executionSignals?.failedUnits || 0) > 0) {
    blockers.push('Task has failed execution units.');
  }
  if (anchors.some((anchor) => isStaleAnchor(anchor, now))) {
    blockers.push('Task has stale anchor evidence.');
  }
  if (hasConflictingTerminalAnchors(anchors)) {
    blockers.push('Task has conflicting terminal anchors.');
  }
  if (anchors.some((anchor) => hasAuthorityMismatch(task.task_id, anchor))) {
    blockers.push('Task has lifecycle anchor authorityTaskId mismatch.');
  }
  if (anchors.some(hasWrongTarget)) {
    blockers.push('Task has lifecycle anchor wrong target branch evidence.');
  }

  const recommendation = baseRecommendation(task, anchors);
  if (blockers.length > 0) {
    return withManualReview(recommendation, blockers);
  }

  const transition = `${task.status}->${recommendation.recommendedStatus}`;
  const allowedNonTerminalApply =
    APPLY_TRANSITIONS.has(transition) &&
    !['branch_pushed'].includes(anchors[0]?.anchorType) &&
    !['recommend_close', 'mark_blocked'].includes(recommendation.action);

  return {
    ...recommendation,
    applyEligible: allowedNonTerminalApply
  };
}

function createHealth() {
  return {
    prematureCloseGuards: 0,
    staleAnchorGuards: 0,
    conflictGuards: 0,
    blockedByOpenFollowups: 0,
    blockedByInProgressPhases: 0,
    blockedByUnknownStatus: 0,
    authorityMismatchGuards: 0,
    wrongTargetGuards: 0,
    applyEligibleNonTerminal: 0,
    terminalRecommendations: 0
  };
}

function updateHealth(health, recommendation) {
  if (recommendation.action === 'recommend_close' && !recommendation.applyEligible) {
    health.prematureCloseGuards += 1;
    health.terminalRecommendations += 1;
  }
  if (recommendation.action === 'mark_blocked' && !recommendation.applyEligible) {
    health.terminalRecommendations += 1;
  }
  if (recommendation.applyEligible) {
    health.applyEligibleNonTerminal += 1;
  }
  for (const blocker of recommendation.blockers || []) {
    if (/stale anchor/i.test(blocker)) health.staleAnchorGuards += 1;
    if (/conflicting terminal anchors/i.test(blocker)) health.conflictGuards += 1;
    if (/open execution followups/i.test(blocker)) health.blockedByOpenFollowups += 1;
    if (/in-progress|incomplete phases/i.test(blocker)) health.blockedByInProgressPhases += 1;
    if (/unknown lifecycle status/i.test(blocker)) health.blockedByUnknownStatus += 1;
    if (/authorityTaskId/i.test(blocker)) health.authorityMismatchGuards += 1;
    if (/wrong target branch/i.test(blocker)) health.wrongTargetGuards += 1;
  }
}

export async function getLifecycleSweepReport(input = {}) {
  const { rootDir, report: activeSummary } = await getActiveTaskSummary({ root: input.root });
  const now = input.now ?? Date.now();
  const health = createHealth();
  const recommendations = [];

  for (const task of activeSummary.tasks || []) {
    const anchors = await readLifecycleAnchorReceipts(rootDir, task.task_id);
    const recommendation = classifyLifecycleRecommendation(task, anchors, { now });
    updateHealth(health, recommendation);
    recommendations.push(recommendation);
  }

  return {
    rootDir,
    generatedAt: new Date(now).toISOString(),
    archiveAction: 'never_auto_archive',
    health,
    recommendations
  };
}

function replaceCurrentStateStatus(markdown, status) {
  const currentStateMatch = /^## Current State\s*$/im.exec(markdown);
  if (!currentStateMatch) {
    throw new Error('Cannot apply lifecycle sweep: task_plan.md is missing ## Current State.');
  }

  const afterStart = currentStateMatch.index + currentStateMatch[0].length;
  const nextHeadingIndex = markdown.slice(afterStart).search(/^## /m);
  const sectionEnd = nextHeadingIndex === -1 ? markdown.length : afterStart + nextHeadingIndex;
  const before = markdown.slice(0, afterStart);
  const section = markdown.slice(afterStart, sectionEnd);
  const after = markdown.slice(sectionEnd);

  if (!/^\s*Status\s*:/im.test(section)) {
    throw new Error('Cannot apply lifecycle sweep: ## Current State is missing Status:.');
  }

  return `${before}${section.replace(/^(\s*Status\s*:\s*).*$/im, `$1${status}`)}${after}`;
}

export async function applyLifecycleSweepRecommendation(rootDir, recommendation) {
  if (!recommendation.applyEligible) {
    throw new Error(`Recommendation for ${recommendation.taskId} is not apply-eligible.`);
  }
  if (['closed', 'blocked', 'archived'].includes(recommendation.recommendedStatus)) {
    throw new Error(`Refusing terminal lifecycle status "${recommendation.recommendedStatus}".`);
  }

  const transition = `${recommendation.currentStatus}->${recommendation.recommendedStatus}`;
  if (!APPLY_TRANSITIONS.has(transition)) {
    throw new Error(`Refusing unsupported lifecycle transition "${transition}".`);
  }

  const taskPlanPath = path.join(rootDir, 'planning', 'active', recommendation.taskId, 'task_plan.md');
  const before = await readFile(taskPlanPath, 'utf8');
  const after = replaceCurrentStateStatus(before, recommendation.recommendedStatus);
  await writeFile(taskPlanPath, after, 'utf8');

  return {
    taskId: recommendation.taskId,
    taskPath: path.relative(rootDir, taskPlanPath),
    beforeStatus: recommendation.currentStatus,
    afterStatus: recommendation.recommendedStatus,
    anchorIds: (recommendation.anchors || []).map((anchor) => anchor.anchorId),
    reason: recommendation.action
  };
}
