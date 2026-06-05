import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildSessionSummary } from '../installer/lib/session-summary.mjs';
import { resolveActiveTaskDirectory } from '../installer/lib/planning-task.mjs';
import { resolveHarnessRoot } from './root-policy.mjs';
import { resolveHarnessSourcePath } from './source-root.mjs';

const execFileAsync = promisify(execFile);

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
    if ((task.warnings?.length || 0) > 0 || !task.exists || (task.safeToArchive && !task.archive_ready)) {
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
    if (task.lifecycleArchiveReady && !task.reconciliationReady) {
      anomalies.push({
        taskId: task.task_id,
        kind: 'reconciliation_open',
        message: task.reconciliation_reason || 'archive-ready task lacks reconciliation readiness'
      });
    }
  }
  return anomalies;
}

async function readSessionStartEpoch(taskDir) {
  const rawValue = await readFile(path.join(taskDir, '.session-start'), 'utf8').catch(() => '');
  const parsed = Number(rawValue.trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function getTaskSummary(input = {}) {
  const resolved = await resolveHarnessRoot(input.root, input);
  const taskDir = await resolveActiveTaskDirectory(resolved.rootDir, input.taskId);
  const summary = await buildSessionSummary({
    taskPlanPath: path.join(taskDir, 'task_plan.md'),
    findingsPath: path.join(taskDir, 'findings.md'),
    progressPath: path.join(taskDir, 'progress.md'),
    sessionStartEpoch: await readSessionStartEpoch(taskDir),
    now: Date.now()
  });

  return {
    rootDir: resolved.rootDir,
    taskDir,
    summary
  };
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
      let companion = {
        has_companion: false,
        ok: true,
        reasons: []
      };

      if (task.lifecycle_archive_ready ?? task.safe_to_archive) {
        const { stdout: statusStdout } = await execFileAsync(
          'python3',
          [statusScript, resolved.rootDir, task.task_id, '--json'],
          { cwd: resolved.rootDir }
        );
        companion = JSON.parse(statusStdout).companion || companion;
      }

      const reconciliationStatus = task.reconciliation_status || 'unknown';
      const reconciliationReady = Boolean(task.reconciliation_ready);

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
        companion
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
