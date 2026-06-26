import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
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
const DATED_PLANNING_HEADING_PATTERN =
  /^## (?:Session|Findings Record|Plan Record|Reconciliation Record): (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\+8)$/gm;
const MIDNIGHT_RECORD_PATTERN =
  /^(## (?:Session|Findings Record|Plan Record): |-\s+\*\*Started:\*\* )(\d{4}-\d{2}-\d{2}) 00:00:00 UTC\+8$/gm;
const AD_HOC_MEMORY_FILENAME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-.+\.md$/;
const FUTURE_TIMESTAMP_GRACE_MS = 5 * 60 * 1000;
const PLANNING_LIFECYCLE_STATUSES = [
  'active',
  'blocked',
  'waiting_review',
  'waiting_execution',
  'waiting_integration',
  'closed',
  'archived',
  'unknown'
];
const PLANNING_LIFECYCLE_STATUS_SET = new Set(PLANNING_LIFECYCLE_STATUSES);
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

function normalizePlanningLifecycleStatus(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function extractPlanningCurrentStateStatus(markdown = '') {
  const lines = markdown.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === '## Current State');
  if (startIndex === -1) {
    return null;
  }

  const sectionLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('## ')) {
      break;
    }
    sectionLines.push(line);
  }

  const currentStateSection = sectionLines.join('\n');
  const statusLine = currentStateSection.match(/^\s*(?:[-*]\s*)?Status\s*:\s*(.*?)\s*$/im);
  if (!statusLine) {
    return null;
  }

  return {
    raw: statusLine[1].trim(),
    normalized: normalizePlanningLifecycleStatus(statusLine[1].trim())
  };
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

export async function inspectPlanningLifecycleStatusHealth(rootDir) {
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

    const currentStateStatus = extractPlanningCurrentStateStatus(markdown);
    if (!currentStateStatus) {
      continue;
    }

    if (PLANNING_LIFECYCLE_STATUS_SET.has(currentStateStatus.normalized)) {
      continue;
    }

    results.push({
      type: 'planning-lifecycle-status-warning',
      path: path.relative(rootDir, taskPlanPath),
      severity: 'warning',
      message:
        `Planning lifecycle status "${currentStateStatus.raw}" is unsupported in ` +
        `${path.relative(rootDir, taskPlanPath)}. Allowed lifecycle values: ` +
        `${PLANNING_LIFECYCLE_STATUSES.join(', ')}.`
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

function collectDatedPlanningHeadings(text) {
  return [...text.matchAll(DATED_PLANNING_HEADING_PATTERN)].map((match) => match[1]);
}

function parseUtc8Timestamp(value) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC\+8$/);
  if (!match) {
    return null;
  }

  return new Date(`${match[1]}T${match[2]}+08:00`);
}

function formatAsUtc8Timestamp(value) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return formatter.format(value).replace(' ', ' ') + ' UTC+8';
}

export async function inspectPlanningChronologyHealth(rootDir) {
  const activeRoot = path.join(rootDir, 'planning/active');
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const taskDir = path.join(activeRoot, entry.name);
    const filePaths = ['task_plan.md', 'findings.md', 'progress.md', 'reconciliation.md'].map((fileName) =>
      path.join(taskDir, fileName)
    );

    for (const filePath of filePaths) {
      const text = await readFile(filePath, 'utf8').catch(() => null);
      if (!text) {
        continue;
      }

      const headings = collectDatedPlanningHeadings(text);
      if (headings.length <= 1) {
        continue;
      }

      let inversion = null;
      for (let index = 1; index < headings.length; index += 1) {
        if (headings[index] < headings[index - 1]) {
          inversion = {
            previous: headings[index - 1],
            current: headings[index]
          };
          break;
        }
      }

      if (!inversion) {
        continue;
      }

      results.push({
        type: 'planning-chronology-warning',
        path: path.relative(rootDir, filePath),
        severity: 'warning',
        message:
          'Planning record headings are not top-to-bottom chronological: ' +
          `found \`${inversion.current}\` after \`${inversion.previous}\`. ` +
          'Append new dated blocks at the end of the file, or restore full chronological order after manual backfills.'
      });
    }
  }

  return results;
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

export async function inspectPlanningFutureTimestampHealth(rootDir) {
  const activeRoot = path.join(rootDir, 'planning/active');
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const taskDir = path.join(activeRoot, entry.name);
    const filePaths = ['task_plan.md', 'findings.md', 'progress.md', 'reconciliation.md'].map((fileName) =>
      path.join(taskDir, fileName)
    );

    for (const filePath of filePaths) {
      const [text, fileStat] = await Promise.all([
        readFile(filePath, 'utf8').catch(() => null),
        stat(filePath).catch(() => null)
      ]);
      if (!text || !fileStat) {
        continue;
      }

      const mtimeMs = fileStat.mtime.getTime();
      const futureHeading = collectDatedPlanningHeadings(text).find((heading) => {
        const parsed = parseUtc8Timestamp(heading);
        return parsed && parsed.getTime() > mtimeMs + FUTURE_TIMESTAMP_GRACE_MS;
      });

      if (!futureHeading) {
        continue;
      }

      results.push({
        type: 'planning-future-timestamp-warning',
        path: path.relative(rootDir, filePath),
        severity: 'warning',
        message:
          `Planning record heading \`${futureHeading}\` is later than the file mtime ` +
          `\`${formatAsUtc8Timestamp(fileStat.mtime)}\`. ` +
          'Use the timestamp helper instead of hand-writing guessed future times.'
      });
    }
  }

  return results;
}

function parseAdHocMemoryFilenameTimestamp(fileName) {
  const match = fileName.match(AD_HOC_MEMORY_FILENAME_PATTERN);
  if (!match) {
    return null;
  }

  const [, date, hour, minute, second] = match;
  return new Date(`${date}T${hour}:${minute}:${second}+08:00`);
}

export async function inspectAdHocMemoryTimestampHealth(homeDir) {
  if (!homeDir) {
    return [];
  }

  const notesDir = path.join(homeDir, '.codex/memories/extensions/ad_hoc/notes');
  const entries = await readdir(notesDir, { withFileTypes: true }).catch(() => []);
  const results = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const noteTimestamp = parseAdHocMemoryFilenameTimestamp(entry.name);
    if (!noteTimestamp) {
      continue;
    }

    const notePath = path.join(notesDir, entry.name);
    const noteStat = await stat(notePath).catch(() => null);
    if (!noteStat) {
      continue;
    }

    if (noteTimestamp.getTime() <= noteStat.mtime.getTime() + FUTURE_TIMESTAMP_GRACE_MS) {
      continue;
    }

    results.push({
      type: 'ad-hoc-memory-future-timestamp-warning',
      path: path.relative(homeDir, notePath),
      severity: 'warning',
      message:
        `Ad-hoc memory note filename timestamp \`${entry.name.slice(0, 19)} UTC+8\` is later than the file mtime ` +
        `\`${formatAsUtc8Timestamp(noteStat.mtime)}\`. ` +
        'Create note filenames from the real tool-derived current time instead of guessing future timestamps.'
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
    ...(await inspectExecutionContractHealth(rootDir)),
    ...(await inspectPlanningLifecycleStatusHealth(rootDir)),
    // V1 keeps verification-contract enforcement on health/doctor only.
    // Summary exposure stays deferred until exact summary tests exist and operator need is demonstrated.
    ...(await inspectVerificationContractHealth(rootDir)),
    ...(await inspectPlanningChronologyHealth(rootDir)),
    ...(await inspectPlanningTimestampHealth(rootDir)),
    ...(await inspectPlanningFutureTimestampHealth(rootDir)),
    ...(await inspectAdHocMemoryTimestampHealth(homeDir))
  ];

  return {
    activeTaskState,
    homeDir,
    planLocations
  };
}
