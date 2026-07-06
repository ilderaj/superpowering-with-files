import { readFile } from 'node:fs/promises';
import { getActiveTaskSummary } from './summary-service.mjs';
import { readExecutionReceipts } from './execution-receipt.mjs';

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
  return [
    `ChiefOps board for ${board.taskId}`,
    `status=${board.status} lane=${board.lane} risk=${board.derivedRisk}`,
    `proof=${board.proofTarget || 'unrecorded'}`,
    `next=${board.recommendedNextAction}`
  ].join('\n');
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
