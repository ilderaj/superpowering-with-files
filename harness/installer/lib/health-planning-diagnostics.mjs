import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { inspectPlanLocations } from './plan-locations.mjs';
import { resolveHarnessSourcePath } from '../../runtime/source-root.mjs';
import { parseExecutionContract, validateExecutionContract } from '../../runtime/execution-contract.mjs';

const execFileAsync = promisify(execFile);

export async function inspectActiveTaskState(rootDir) {
  const activeRoot = path.join(rootDir, 'planning/active');
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  const matches = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const planPath = path.join(activeRoot, entry.name, 'task_plan.md');
    let planText;
    try {
      planText = await readFile(planPath, 'utf8');
    } catch {
      continue;
    }

    if (/^Status:\s*active$/m.test(planText)) {
      matches.push(path.join(activeRoot, entry.name));
    }
  }

  return {
    activeTaskCount: matches.length,
    activeTaskDir: matches.length === 1 ? matches[0] : null
  };
}

export async function inspectCompanionSyncHealth(rootDir) {
  const activeRoot = path.join(rootDir, 'planning/active');
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  const statusScript = resolveHarnessSourcePath(
    rootDir,
    'harness/core/upstream-overlays/planning-with-files/scripts/task-status.py'
  );
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const taskId = entry.name;
    const taskPlanPath = path.join(activeRoot, taskId, 'task_plan.md');
    let statusReport;
    try {
      const { stdout } = await execFileAsync('python3', [statusScript, rootDir, taskId, '--json'], {
        cwd: rootDir
      });
      statusReport = JSON.parse(stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        type: 'companion-sync-inspection-error',
        path: path.relative(rootDir, taskPlanPath),
        severity: 'problem',
        message: `Companion sync inspection failed: ${message}`
      });
      continue;
    }

    const companion = statusReport?.companion;
    if (!companion?.has_companion || companion.ok) {
      continue;
    }

    results.push({
      type: statusReport.safe_to_archive ? 'companion-sync-block' : 'companion-sync-warning',
      path: path.relative(rootDir, taskPlanPath),
      severity: statusReport.safe_to_archive ? 'problem' : 'warning',
      message: `${
        statusReport.safe_to_archive ? 'Companion sync blocks archive readiness' : 'Companion sync needs attention'
      }: ${(companion.reasons || []).join('; ') || 'companion sync check failed'}`,
      taskId,
      reasons: companion.reasons || []
    });
  }

  return results;
}

export async function inspectExecutionContractHealth(rootDir) {
  const activeRoot = path.join(rootDir, 'planning/active');
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const taskPlanPath = path.join(activeRoot, entry.name, 'task_plan.md');
    const markdown = await readFile(taskPlanPath, 'utf8').catch(() => null);
    if (!markdown || !markdown.includes('## Execution Contract')) {
      continue;
    }

    const parsed = parseExecutionContract(markdown);
    const validation = validateExecutionContract(parsed);
    if (validation.ok) {
      continue;
    }

    results.push({
      type: 'execution-contract-warning',
      path: path.relative(rootDir, taskPlanPath),
      severity: 'warning',
      message: `Execution contract needs attention: ${validation.reasons.join('; ')}`
    });
  }

  return results;
}

export async function inspectPlanningDiagnostics({ rootDir, homeDir }) {
  const activeTaskState = await inspectActiveTaskState(rootDir);
  const canonicalPlanLocations = await inspectPlanLocations(rootDir);
  const companionSyncLocations = await inspectCompanionSyncHealth(rootDir);
  const validCompanionReferences = new Set(
    canonicalPlanLocations
      .filter((location) => location.type === 'companion-plan')
      .flatMap((location) => location.referencedBy ?? [])
  );
  const filteredCompanionSyncLocations = companionSyncLocations.filter((location) => {
    if (location.type !== 'companion-sync-warning') {
      return true;
    }

    const reasons = location.reasons ?? [];
    const onlyMissingCompanionPath =
      reasons.length > 0 &&
      reasons.every((reason) => typeof reason === 'string' && reason.startsWith('Companion plan does not exist:'));

    if (!onlyMissingCompanionPath) {
      return true;
    }

    return !validCompanionReferences.has(location.path);
  });
  const planLocations = [
    ...canonicalPlanLocations,
    ...filteredCompanionSyncLocations,
    ...(await inspectExecutionContractHealth(rootDir))
  ];

  return {
    activeTaskState,
    homeDir,
    planLocations
  };
}
