import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { inspectPlanLocations } from './plan-locations.mjs';
import { resolveHarnessSourcePath } from '../../runtime/source-root.mjs';
import { parseExecutionContract, validateExecutionContract } from '../../runtime/execution-contract.mjs';
import {
  parseVerificationContract,
  readVerificationContractSection,
  validateVerificationContract
} from '../../runtime/verification-contract.mjs';

const execFileAsync = promisify(execFile);
const UTC8_TIMESTAMP_PATTERN = /(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC\+8/g;
const MIDNIGHT_RECORD_PATTERN =
  /^(## (?:Session|Findings Record|Plan Record): |-\s+\*\*Started:\*\* )(\d{4}-\d{2}-\d{2}) 00:00:00 UTC\+8$/gm;
const VERIFICATION_FIELD_LABELS = new Set([
  'Proof Target',
  'Primary Proof',
  'Backstop Proof',
  'Escalation Trigger',
  'Evidence Sink',
  'Reconcile Rule',
  'Unacceptable Substitute'
]);

function normalizeVerificationFieldLabel(value = '') {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function collectMalformedVerificationFieldLabels(markdown = '') {
  const { lines } = readVerificationContractSection(markdown);
  const malformed = [];
  let currentMode = null;

  for (const { line, trimmed, inFence } of lines) {
    if (inFence) {
      continue;
    }

    if (trimmed.startsWith('### Mode:')) {
      currentMode = trimmed.slice('### Mode:'.length).trim() || '(missing mode name)';
      continue;
    }

    if (!line.startsWith('- ')) {
      continue;
    }

    const rawLabel = trimmed.slice(2);
    if (!rawLabel || rawLabel.startsWith('- ')) {
      continue;
    }

    const colonIndex = rawLabel.indexOf(':');
    const label = colonIndex === -1 ? rawLabel : rawLabel.slice(0, colonIndex).trim();
    if (!label) {
      continue;
    }

    const normalizedLabel = normalizeVerificationFieldLabel(label);
    const matchingField = [...VERIFICATION_FIELD_LABELS].find(
      (fieldLabel) => normalizeVerificationFieldLabel(fieldLabel) === normalizedLabel
    );

    if (!matchingField) {
      continue;
    }

    if (label !== matchingField || colonIndex === -1) {
      malformed.push({
        mode: currentMode,
        label,
        expected: `${matchingField}:`
      });
    }
  }

  return malformed;
}

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

export async function inspectVerificationContractHealth(rootDir) {
  const activeRoot = path.join(rootDir, 'planning/active');
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const taskPlanPath = path.join(activeRoot, entry.name, 'task_plan.md');
    const markdown = await readFile(taskPlanPath, 'utf8').catch(() => null);
    if (!markdown) {
      continue;
    }

    const section = readVerificationContractSection(markdown);
    if (!section.present) {
      continue;
    }

    const parsed = parseVerificationContract(markdown);
    const validation = validateVerificationContract(parsed);
    const malformedFields = collectMalformedVerificationFieldLabels(markdown);
    const reasons = [];
    if (parsed.modes.length === 0) {
      reasons.push(
        'Verification Contract declares a section but does not define any `### Mode:` blocks.'
      );
    }

    reasons.push(...validation.reasons);
    for (const malformedField of malformedFields) {
      const modeLabel = malformedField.mode ? `Mode ${malformedField.mode}` : 'Verification contract';
      reasons.push(
        `${modeLabel} has malformed field label "${malformedField.label}". Use "${malformedField.expected}".`
      );
    }

    if (reasons.length === 0) {
      continue;
    }

    results.push({
      type: 'verification-contract-warning',
      path: path.relative(rootDir, taskPlanPath),
      severity: 'warning',
      message: `Verification contract declaration needs attention: ${reasons.join('; ')}`
    });
  }

  return results;
}

function collectUtc8TimesByDate(text) {
  const byDate = new Map();

  for (const match of text.matchAll(UTC8_TIMESTAMP_PATTERN)) {
    const date = match[1];
    const time = match[2];
    const values = byDate.get(date) ?? new Set();
    values.add(time);
    byDate.set(date, values);
  }

  return byDate;
}

export async function inspectPlanningTimestampHealth(rootDir) {
  const activeRoot = path.join(rootDir, 'planning/active');
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const taskDir = path.join(activeRoot, entry.name);
    const filePaths = ['task_plan.md', 'findings.md', 'progress.md'].map((fileName) =>
      path.join(taskDir, fileName)
    );
    const fileContents = await Promise.all(
      filePaths.map(async (filePath) => ({
        filePath,
        text: await readFile(filePath, 'utf8').catch(() => null)
      }))
    );

    const taskTimesByDate = new Map();
    for (const { text } of fileContents) {
      if (!text) {
        continue;
      }

      for (const [date, times] of collectUtc8TimesByDate(text)) {
        const existing = taskTimesByDate.get(date) ?? new Set();
        for (const time of times) {
          existing.add(time);
        }
        taskTimesByDate.set(date, existing);
      }
    }

    for (const { filePath, text } of fileContents) {
      if (!text) {
        continue;
      }

      const suspiciousDates = new Set();
      for (const match of text.matchAll(MIDNIGHT_RECORD_PATTERN)) {
        const date = match[2];
        const taskTimes = taskTimesByDate.get(date);
        if (!taskTimes) {
          continue;
        }

        const hasPreciseTime = [...taskTimes].some((time) => time !== '00:00:00');
        if (hasPreciseTime) {
          suspiciousDates.add(date);
        }
      }

      if (suspiciousDates.size === 0) {
        continue;
      }

      const dates = [...suspiciousDates].sort().join(', ');
      results.push({
        type: 'planning-timestamp-warning',
        path: path.relative(rootDir, filePath),
        severity: 'warning',
        message:
          `Suspicious planning timestamp fallback detected for ${dates}: ` +
          'found `00:00:00 UTC+8` alongside more precise timestamps on the same task/date. ' +
          'Use `./scripts/harness record` instead of hand-writing fresh dated blocks.'
      });
    }
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
    ...(await inspectExecutionContractHealth(rootDir)),
    // V1 keeps verification-contract enforcement on health/doctor only.
    // Summary exposure stays deferred until exact summary tests exist and operator need is demonstrated.
    ...(await inspectVerificationContractHealth(rootDir)),
    ...(await inspectPlanningTimestampHealth(rootDir))
  ];

  return {
    activeTaskState,
    homeDir,
    planLocations
  };
}
