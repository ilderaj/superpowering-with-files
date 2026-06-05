import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildSessionSummary } from '../installer/lib/session-summary.mjs';
import { resolveActiveTaskDirectory } from '../installer/lib/planning-task.mjs';
import { resolveHarnessRoot } from './root-policy.mjs';
import { resolveHarnessSourcePath } from './source-root.mjs';
import { deriveDecisionPlaneRoute, parseRoutingDecision } from './decision-plane-router.mjs';
import { readExecutionReceipts, summarizeExecutionReceipts } from './execution-receipt.mjs';
import { readFollowupClosures } from './followup-closure.mjs';

const execFileAsync = promisify(execFile);

async function taskDeclaresCompanion(taskPlanPath) {
  if (!taskPlanPath) {
    return false;
  }

  try {
    const markdown = await readFile(taskPlanPath, 'utf8');
    return /^\s*(?:[-*]\s*)?Companion plan(?: path)?\s*:\s*(.*?)\s*$/im.test(markdown);
  } catch {
    return false;
  }
}

function compactCompanionReason(reason, limit = 140) {
  const value = String(reason ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function appendCompanionNotice(summary, companion, safeToArchive) {
  if (!companion?.has_companion || companion.ok) {
    return summary;
  }

  const reason = compactCompanionReason((companion.reasons || [])[0] || 'companion sync check failed');
  const notice = safeToArchive
    ? `Companion: blocks archive readiness - ${reason}`
    : `Companion: needs attention - ${reason}`;
  const lines = summary.split('\n');
  lines.splice(Math.min(3, lines.length), 0, notice);
  return lines.join('\n');
}

function appendRouteNotice(summary, routingDecision) {
  if (!routingDecision?.selectedRoute) {
    return summary;
  }

  const lines = summary.split('\n');
  lines.splice(
    Math.min(3, lines.length),
    0,
    `Route: ${routingDecision.selectedRoute} - ${compactCompanionReason(routingDecision.routeReason, 120)}`
  );
  return lines.join('\n');
}

function deriveRecordedRoutingDecision(taskPlanMarkdown, signals = {}) {
  const recordedRoute = parseRoutingDecision(taskPlanMarkdown);
  if (!recordedRoute) {
    return null;
  }

  return deriveDecisionPlaneRoute({
    classification: recordedRoute.selectedRoute === 'deep-rich' ? 'deep' : 'tracked',
    recordedRoute,
    signals
  });
}

function buildCounts(tasks) {
  const byStatus = {};
  let looksComplete = 0;
  let safeToArchive = 0;
  let archiveReady = 0;
  let needsAttention = 0;
  const byReconciliationStatus = {};

  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    const reconciliationStatus = task.reconciliationStatus || task.reconciliation_status || 'unknown';
    byReconciliationStatus[reconciliationStatus] = (byReconciliationStatus[reconciliationStatus] || 0) + 1;
    if (task.looksComplete) looksComplete += 1;
    if (task.safeToArchive) safeToArchive += 1;
    if (task.archive_ready) archiveReady += 1;
    if (
      (task.warnings?.length || 0) > 0 ||
      !task.exists ||
      (task.companion?.has_companion && !task.companion.ok) ||
      (task.safeToArchive && !task.archive_ready) ||
      (task.executionSignals?.blockedUnits || 0) > 0 ||
      (task.executionSignals?.failedUnits || 0) > 0 ||
      (task.executionSignals?.openFollowups || 0) > 0
    ) {
      needsAttention += 1;
    }
  }

  return { total: tasks.length, byStatus, byReconciliationStatus, looksComplete, safeToArchive, archiveReady, needsAttention };
}

function buildAnomalies(tasks) {
  const anomalies = [];
  for (const task of tasks) {
    if (!task.exists) {
      anomalies.push({ taskId: task.task_id, kind: 'missing_task_plan', message: task.reason });
    }
    for (const warning of task.warnings || []) {
      anomalies.push({ taskId: task.task_id, kind: 'warning', message: warning });
    }
    if (task.companion?.has_companion && !task.companion.ok) {
      anomalies.push({
        taskId: task.task_id,
        kind: task.safeToArchive ? 'companion_sync_block' : 'companion_sync_warning',
        message: (task.companion?.reasons || []).join('; ') || 'companion sync check failed'
      });
    }
    if (task.lifecycleArchiveReady && !task.reconciliationReady) {
      anomalies.push({
        taskId: task.task_id,
        kind: 'reconciliation_open',
        message: task.reconciliation_reason || 'archive-ready task lacks reconciliation readiness'
      });
    }
    if ((task.executionSignals?.blockedUnits || 0) > 0) {
      anomalies.push({
        taskId: task.task_id,
        kind: 'execution_receipt_blocked',
        message: 'execution receipts report blocked units'
      });
    }
    if ((task.executionSignals?.failedUnits || 0) > 0) {
      anomalies.push({
        taskId: task.task_id,
        kind: 'execution_receipt_failed',
        message: 'execution receipts report failed units'
      });
    }
    if ((task.executionSignals?.openFollowups || 0) > 0) {
      anomalies.push({
        taskId: task.task_id,
        kind: 'execution_followup_open',
        message: 'execution receipts leave open followups'
      });
    }
  }
  return anomalies;
}

async function readSessionStartEpoch(taskDir) {
  const rawValue = await readFile(path.join(taskDir, '.session-start'), 'utf8').catch(() => '');
  const normalized = rawValue.trim();
  if (!normalized) {
    return Number.NaN;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function getTaskSummary(input = {}) {
  const resolved = await resolveHarnessRoot(input.root, input);
  const taskDir = await resolveActiveTaskDirectory(resolved.rootDir, input.taskId);
  const taskPlanPath = path.join(taskDir, 'task_plan.md');
  const taskPlanMarkdown = await readFile(taskPlanPath, 'utf8').catch(() => '');
  const summary = await buildSessionSummary({
    taskPlanPath,
    findingsPath: path.join(taskDir, 'findings.md'),
    progressPath: path.join(taskDir, 'progress.md'),
    sessionStartEpoch: await readSessionStartEpoch(taskDir),
    now: Date.now()
  });

  let finalSummary = appendRouteNotice(summary, deriveRecordedRoutingDecision(taskPlanMarkdown, { hasPlanning: true }));
  if (/^\s*(?:[-*]\s*)?Companion plan(?: path)?\s*:\s*(.*?)\s*$/im.test(taskPlanMarkdown)) {
    const statusScript = resolveHarnessSourcePath(
      resolved.rootDir,
      'harness/core/upstream-overlays/planning-with-files/scripts/task-status.py'
    );
    const taskId = path.basename(taskDir);
    const { stdout } = await execFileAsync('python3', [statusScript, resolved.rootDir, taskId, '--json'], {
      cwd: resolved.rootDir
    });
    const statusReport = JSON.parse(stdout);
    finalSummary = appendCompanionNotice(finalSummary, statusReport?.companion, statusReport?.safe_to_archive);
  }

  return {
    rootDir: resolved.rootDir,
    taskDir,
    summary: finalSummary
  };
}

export function buildActiveSummaryTextReport(report) {
  const lines = [
    '[planning-with-files] ACTIVE SUMMARY',
    `[planning-with-files] Tasks=${report.counts.total} archive_ready=${report.counts.archiveReady} needs_attention=${report.counts.needsAttention}`
  ];

  const statusParts = Object.entries(report.counts.byStatus)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}=${count}`);
  lines.push(`[planning-with-files] Status counts: ${statusParts.join(', ') || 'none'}`);
  const reconciliationParts = Object.entries(report.counts.byReconciliationStatus || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}=${count}`);
  lines.push(`[planning-with-files] Reconciliation counts: ${reconciliationParts.join(', ') || 'none'}`);

  for (const task of report.tasks) {
    lines.push(
      `[planning-with-files] ${task.task_id}: status=${task.status}, archive_ready=${task.archive_ready ? 'yes' : 'no'}, reconciliation=${task.reconciliationStatus || task.reconciliation_status || 'unknown'}, phases=${task.phase_complete}/${task.phase_total}, reason=${task.reason}`
    );
    if (task.routingDecision?.selectedRoute) {
      lines.push(
        `[planning-with-files]   route: ${task.routingDecision.selectedRoute} - ${task.routingDecision.routeReason}`
      );
    }
    for (const warning of task.warnings || []) {
      lines.push(`[planning-with-files]   warning: ${warning}`);
    }
    if (task.companion?.has_companion && !task.companion.ok) {
      for (const reason of task.companion?.reasons || []) {
        lines.push(`[planning-with-files]   companion: ${reason}`);
      }
    }
    if ((task.executionSignals?.receiptCount || 0) > 0) {
      lines.push(
        `[planning-with-files]   execution: receipts=${task.executionSignals.receiptCount}, blocked=${task.executionSignals.blockedUnits}, failed=${task.executionSignals.failedUnits}, open_followups=${task.executionSignals.openFollowups}, resolved_followups=${task.executionSignals.resolvedFollowups || 0}, waived_followups=${task.executionSignals.waivedFollowups || 0}`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function getActiveTaskSummary(input = {}) {
  const resolved = await resolveHarnessRoot(input.root, input);
  const scanScript = resolveHarnessSourcePath(
    resolved.rootDir,
    'harness/core/upstream-overlays/planning-with-files/scripts/scan-active.py'
  );
  const statusScript = resolveHarnessSourcePath(
    resolved.rootDir,
    'harness/core/upstream-overlays/planning-with-files/scripts/task-status.py'
  );
  const { stdout } = await execFileAsync('python3', [scanScript, resolved.rootDir, '--json'], {
    cwd: resolved.rootDir
  });
  const scanReport = JSON.parse(stdout);
  const tasks = await Promise.all(
    (scanReport.tasks || []).map(async (task) => {
      const taskPlanMarkdown = task.task_plan ? await readFile(task.task_plan, 'utf8').catch(() => '') : '';
      let companion = {
        has_companion: false,
        ok: true,
        reasons: []
      };
      const declaredCompanion = /^\s*(?:[-*]\s*)?Companion plan(?: path)?\s*:\s*(.*?)\s*$/im.test(taskPlanMarkdown);

      if ((task.lifecycle_archive_ready ?? task.safe_to_archive) || declaredCompanion) {
        const { stdout: statusStdout } = await execFileAsync(
          'python3',
          [statusScript, resolved.rootDir, task.task_id, '--json'],
          { cwd: resolved.rootDir }
        );
        companion = JSON.parse(statusStdout).companion || companion;
      }

      const reconciliationStatus = task.reconciliation_status || 'unknown';
      const reconciliationReady = Boolean(task.reconciliation_ready);
      const executionReceipts = await readExecutionReceipts(resolved.rootDir, task.task_id);
      const followupClosures = await readFollowupClosures(resolved.rootDir, task.task_id);
      const executionSignals = summarizeExecutionReceipts(executionReceipts, followupClosures);
      const routingDecision = deriveRecordedRoutingDecision(taskPlanMarkdown, {
        hasPlanning: true,
        reconciliationOpen: reconciliationStatus === 'open',
        hasExecutionSignals: (executionSignals?.receiptCount || 0) > 0
      });

      return {
        ...task,
        looksComplete: task.looks_complete,
        safeToArchive: task.safe_to_archive,
        lifecycleArchiveReady: task.lifecycle_archive_ready ?? task.safe_to_archive,
        lifecycle_archive_ready: task.lifecycle_archive_ready ?? task.safe_to_archive,
        reconciliationStatus,
        reconciliation_status: reconciliationStatus,
        reconciliationReady,
        reconciliation_ready: reconciliationReady,
        archive_ready: task.safe_to_archive && (!companion.has_companion || companion.ok),
        companion,
        executionSignals,
        routingDecision
      };
    })
  );

  return {
    rootDir: resolved.rootDir,
    report: {
      projectPath: scanReport.project_path,
      activeRoot: scanReport.active_root,
      generatedAt: new Date().toISOString(),
      counts: buildCounts(tasks),
      anomalies: buildAnomalies(tasks),
      tasks
    }
  };
}
