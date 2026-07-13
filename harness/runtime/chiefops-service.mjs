import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getActiveTaskSummary } from './summary-service.mjs';
import { readExecutionReceipts } from './execution-receipt.mjs';
import { parseChiefOpsBlocks } from './chiefops-overlay/coordination-blocks.mjs';
import { rebuildChiefOpsIndex } from './chiefops-overlay/index-service.mjs';
import { validateBindingPacket } from './chiefops-overlay/schema.mjs';

const INBOX_LANES = [
  'running',
  'chief_gate_pending',
  'human_gate_pending',
  'waiting_external',
  'blocked',
  'acceptance_pending',
  'closed',
  'unknown'
];

function parseProofTarget(markdown = '') {
  const match =
    markdown.match(/^\s*-\s+\*\*Proof Target:\*\*\s*(.+?)\s*$/m) ||
    markdown.match(/^\s*Proof Target:\s*(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

function deriveChiefOpsDeclared(task, taskPlanMarkdown) {
  return /chiefops|chief ops/i.test(`${task?.task_id || ''}\n${taskPlanMarkdown || ''}`);
}

function deriveBlockedSignals(task) {
  const signals = [];

  if ((task.executionSignals?.blockedUnits || 0) > 0) {
    signals.push('execution_receipt_blocked');
  }
  if ((task.executionSignals?.failedUnits || 0) > 0) {
    signals.push('execution_receipt_failed');
  }
  if ((task.executionSignals?.openFollowups || 0) > 0) {
    signals.push('execution_followup_open');
  }
  if (task.companion?.has_companion && !task.companion.ok) {
    signals.push(task.safeToArchive ? 'companion_sync_block' : 'companion_sync_warning');
  }
  if ((task.reconciliationStatus || task.reconciliation_status) === 'open') {
    signals.push('reconciliation_open');
  }
  if ((task.warnings || []).length > 0) {
    signals.push('planning_warning');
  }

  return signals;
}

function deriveRisk(blockedSignals) {
  if (blockedSignals.some((signal) => signal === 'execution_receipt_blocked' || signal === 'execution_receipt_failed')) {
    return 'high';
  }
  if (blockedSignals.length > 0) {
    return 'medium';
  }
  return 'low';
}

function deriveNextAction(blockedSignals) {
  if (blockedSignals.includes('execution_receipt_blocked') || blockedSignals.includes('execution_receipt_failed')) {
    return 'Resolve the blocked or failed execution unit before widening scope.';
  }
  if (blockedSignals.includes('execution_followup_open')) {
    return 'Close or waive the open followups before declaring the slice complete.';
  }
  if (blockedSignals.includes('companion_sync_block') || blockedSignals.includes('companion_sync_warning')) {
    return 'Sync the companion plan back to planning/active before making stronger lifecycle claims.';
  }
  if (blockedSignals.includes('reconciliation_open')) {
    return 'Finish reconciliation evidence before claiming archive readiness.';
  }
  if (blockedSignals.includes('planning_warning')) {
    return 'Clear the planning warnings before expanding the execution slice.';
  }
  return 'Continue with the next bounded slice and sync back after meaningful progress.';
}

function summarizeLatestReceipt(receipt) {
  if (!receipt) {
    return null;
  }

  return {
    unitId: receipt.unitId || null,
    resultStatus: receipt.resultStatus || null,
    finishedAt: receipt.finishedAt || null,
    syncBackRef: receipt.syncBackRef || null
  };
}

export function buildChiefOpsBoardText(board) {
  const execution = board.executionSignals || {};
  const latestReceipt = board.latestReceipt?.unitId
    ? `${board.latestReceipt.unitId}/${board.latestReceipt.resultStatus || 'unknown'}`
    : 'none';

  const lines = [
    `ChiefOps board for ${board.taskId}`,
    `status=${board.status} lane=${board.lane} risk=${board.derivedRisk}`,
    `proof=${board.proofTarget || 'unrecorded'}`,
    `execution=receipts:${execution.receiptCount || 0} blocked:${execution.blockedUnits || 0} failed:${execution.failedUnits || 0} open_followups:${execution.openFollowups || 0}`,
    `reconciliation=${board.reconciliationStatus} latest_receipt=${latestReceipt}`,
    `next=${board.recommendedNextAction}`
  ];

  if ((board.blockedSignals || []).length > 0) {
    lines.splice(4, 0, `signals=${board.blockedSignals.join(',')}`);
  }

  return lines.join('\n');
}

export async function getChiefOpsBoard({ root, taskId }) {
  if (!taskId) {
    throw new Error('taskId is required for ChiefOps board.');
  }

  const { rootDir, report } = await getActiveTaskSummary({ root });
  const task = (report.tasks || []).find((entry) => entry.task_id === taskId);
  if (!task) {
    throw new Error(`Active task not found: ${taskId}`);
  }

  const taskPlanMarkdown = task.task_plan ? await readFile(task.task_plan, 'utf8').catch(() => '') : '';
  const receipts = await readExecutionReceipts(rootDir, taskId);
  const latestReceipt = receipts.length > 0 ? receipts[receipts.length - 1] : null;
  const blockedSignals = deriveBlockedSignals(task);

  return {
    rootDir,
    taskId,
    status: task.status || 'unknown',
    chiefOpsDeclared: deriveChiefOpsDeclared(task, taskPlanMarkdown),
    lane: task.routingDecision?.selectedRoute || 'tracked',
    proofTarget: parseProofTarget(taskPlanMarkdown),
    latestReceipt: summarizeLatestReceipt(latestReceipt),
    executionSignals: task.executionSignals || {
      receiptCount: 0,
      blockedUnits: 0,
      failedUnits: 0,
      openFollowups: 0,
      resolvedFollowups: 0,
      waivedFollowups: 0
    },
    blockedSignals,
    reconciliationStatus: task.reconciliationStatus || task.reconciliation_status || 'unknown',
    derivedRisk: deriveRisk(blockedSignals),
    recommendedNextAction: deriveNextAction(blockedSignals)
  };
}

function hasV0bBinding(markdown) {
  const blocks = parseChiefOpsBlocks(markdown);
  return blocks
    .filter((block) => block.type === 'ChiefOpsWorkerBinding')
    .some((block) => {
      validateBindingPacket(block.value);
      return true;
    });
}

async function readIndexableTaskIds(rootDir, tasks) {
  const taskIds = [];
  const observationErrors = [];

  for (const task of tasks) {
    try {
      const progress = await readFile(path.join(rootDir, 'planning', 'active', task.task_id, 'progress.md'), 'utf8');
      if (hasV0bBinding(progress)) taskIds.push(task.task_id);
    } catch {
      observationErrors.push({ taskId: task.task_id, reason: 'v0b_index_unavailable' });
    }
  }

  return { taskIds, observationErrors };
}

function conflictTaskIds(conflicts = []) {
  const taskIds = new Set();
  for (const conflict of conflicts) {
    if (conflict.taskId) taskIds.add(conflict.taskId);
    if (conflict.previousTaskId) taskIds.add(conflict.previousTaskId);
  }
  return taskIds;
}

function hasBlockingReceipt(board) {
  return (board.blockedSignals || []).some((signal) => (
    signal === 'execution_receipt_blocked' || signal === 'execution_receipt_failed'
  ));
}

export function classifyChiefOpsInboxLane({ task, board, conflictTaskIdSet, workers = [] }) {
  const status = task.status || 'unknown';
  if (status === 'closed') return 'closed';
  if (status === 'blocked' || hasBlockingReceipt(board) || conflictTaskIdSet.has(task.task_id)) return 'blocked';
  if (task.looksComplete && !task.archive_ready) return 'acceptance_pending';
  if (status !== 'active') return 'unknown';

  // A requirement is not proof that approval remains unsatisfied.  Keep the
  // lane unknown rather than guessing either approval state or worker activity.
  if (workers.some((worker) => worker.requiresHumanApproval)) return 'unknown';
  if (workers.some((worker) => worker.status === 'bound' || worker.status === 'started')) return 'running';
  return 'unknown';
}

function makeLaneCounts(tasks) {
  return Object.fromEntries(INBOX_LANES.map((lane) => [lane, 0]));
}

export async function getChiefOpsInbox({ root, now = () => new Date().toISOString() } = {}) {
  const { rootDir, report } = await getActiveTaskSummary({ root });
  const tasks = [...(report.tasks || [])].sort((left, right) => left.task_id.localeCompare(right.task_id));
  const [boardResults, indexable] = await Promise.all([
    Promise.all(tasks.map((task) => getChiefOpsBoard({ root: rootDir, taskId: task.task_id }))),
    readIndexableTaskIds(rootDir, tasks)
  ]);
  const observationErrors = [...indexable.observationErrors];
  let index = { workers: [], conflicts: [] };

  if (indexable.taskIds.length > 0) {
    try {
      index = await rebuildChiefOpsIndex({ root: rootDir, taskIds: indexable.taskIds });
    } catch {
      observationErrors.push({ taskId: null, reason: 'v0b_index_unavailable' });
    }
  }

  const boardsByTaskId = new Map(boardResults.map((board) => [board.taskId, board]));
  const workersByTaskId = new Map();
  for (const worker of index.workers || []) {
    const workers = workersByTaskId.get(worker.authorityTaskId) || [];
    workers.push(worker);
    workersByTaskId.set(worker.authorityTaskId, workers);
  }
  const conflicts = index.conflicts || [];
  const conflictIds = conflictTaskIds(conflicts);
  const inboxTasks = tasks.map((task) => {
    const board = boardsByTaskId.get(task.task_id);
    const lane = classifyChiefOpsInboxLane({
      task,
      board,
      conflictTaskIdSet: conflictIds,
      workers: workersByTaskId.get(task.task_id) || []
    });
    return {
      taskId: task.task_id,
      lane,
      status: task.status || 'unknown',
      proofTarget: board.proofTarget,
      blockedSignals: board.blockedSignals,
      recommendedNextAction: board.recommendedNextAction
    };
  });
  const laneCounts = makeLaneCounts(inboxTasks);
  for (const task of inboxTasks) laneCounts[task.lane] += 1;

  return {
    schemaVersion: 'chiefops.v1.inbox',
    generatedAt: now(),
    tasks: inboxTasks,
    laneCounts,
    conflicts,
    observationErrors
  };
}

export function buildChiefOpsControlBrief(inbox) {
  const lines = [
    `ChiefOps Control Brief (${inbox.schemaVersion})`,
    `lanes=${INBOX_LANES.map((lane) => `${lane}:${inbox.laneCounts?.[lane] || 0}`).join(',')}`
  ];

  for (const lane of INBOX_LANES) {
    for (const task of (inbox.tasks || []).filter((entry) => entry.lane === lane)) {
      lines.push(`${lane} ${task.taskId}: ${task.recommendedNextAction}`);
    }
  }
  lines.push(`conflicts=${(inbox.conflicts || []).length}`);
  lines.push('Restore task_plan.md, findings.md, and progress.md before acting.');
  lines.push('Worker/session ownership and user-global, external, or release constraints are unrecorded unless explicit in the selected task evidence.');
  return lines.join('\n');
}
