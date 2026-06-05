import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import { resolveHarnessSourcePath } from '../../runtime/source-root.mjs';

const execFileAsync = promisify(execFile);

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    return inline.slice(name.length + 3);
  }

  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for --${name}.`);
  }

  return value;
}

function usage() {
  return [
    'Usage: ./scripts/harness active-summary [--json] [--output <path>]',
    '',
    'Options:',
    '  --json           Print the active-task summary as JSON',
    '  --output <path>  Write the JSON report to the given path',
    '  --help, -h       Show this help message'
  ].join('\n');
}

async function runPythonJson(rootDir, scriptPath, args) {
  const { stdout } = await execFileAsync('python3', [scriptPath, ...args], { cwd: rootDir });
  return JSON.parse(stdout);
}

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
    if (task.looksComplete) {
      looksComplete += 1;
    }
    if (task.safeToArchive) {
      safeToArchive += 1;
    }
    if (task.archive_ready) {
      archiveReady += 1;
    }
    if (
      (task.warnings?.length || 0) > 0 ||
      !task.exists ||
      (task.companion?.has_companion && !task.companion.ok) ||
      (task.safeToArchive && !task.archive_ready)
    ) {
      needsAttention += 1;
    }
  }

  return {
    total: tasks.length,
    byStatus,
    byReconciliationStatus,
    looksComplete,
    safeToArchive,
    archiveReady,
    needsAttention
  };
}

function buildAnomalies(tasks) {
  const anomalies = [];

  for (const task of tasks) {
    if (!task.exists) {
      anomalies.push({
        taskId: task.task_id,
        kind: 'missing_task_plan',
        message: task.reason
      });
    }

    for (const warning of task.warnings || []) {
      anomalies.push({
        taskId: task.task_id,
        kind: 'warning',
        message: warning
      });
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
  }

  return anomalies;
}

function buildTextReport(report) {
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
    for (const warning of task.warnings || []) {
      lines.push(`[planning-with-files]   warning: ${warning}`);
    }
    if (task.companion?.has_companion && !task.companion.ok) {
      for (const reason of task.companion?.reasons || []) {
        lines.push(`[planning-with-files]   companion: ${reason}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function activeSummary(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const outputPath = readOption(args, 'output');
  const scanScript = resolveHarnessSourcePath(
    rootDir,
    'harness/core/upstream-overlays/planning-with-files/scripts/scan-active.py'
  );
  const statusScript = resolveHarnessSourcePath(
    rootDir,
    'harness/core/upstream-overlays/planning-with-files/scripts/task-status.py'
  );

  const scanReport = await runPythonJson(rootDir, scanScript, [rootDir, '--json']);
  const tasks = await Promise.all(
    (scanReport.tasks || []).map(async (task) => {
      let companion = {
        has_companion: false,
        ok: true,
        reasons: []
      };
      const declaredCompanion = await taskDeclaresCompanion(task.task_plan);

      if ((task.lifecycle_archive_ready ?? task.safe_to_archive) || declaredCompanion) {
        const statusReport = await runPythonJson(rootDir, statusScript, [rootDir, task.task_id, '--json']);
        companion = statusReport.companion || companion;
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

  const report = {
    projectPath: scanReport.project_path,
    activeRoot: scanReport.active_root,
    generatedAt: new Date().toISOString(),
    counts: buildCounts(tasks),
    anomalies: buildAnomalies(tasks),
    tasks
  };

  if (outputPath) {
    const absoluteOutputPath = path.resolve(rootDir, outputPath);
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await writeFile(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (hasFlag(args, '--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  process.stdout.write(buildTextReport(report));
}
