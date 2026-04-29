import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_FINDINGS = 3;
const MAX_COMPACT_VALUE_LENGTH = 180;
const SUMMARY_HEADING = '[planning-with-files] SESSION SUMMARY';
const CURRENT_STATE_HEADING_NAMES = ['Current State', '当前状态'];
const ERROR_LOG_HEADING_NAMES = ['Error Log', '错误日志'];

export function normalizeText(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

export function compactText(text, limit = MAX_COMPACT_VALUE_LENGTH) {
  const value = normalizeText(text)
    .replace(/\s+/g, ' ')
    .trim();

  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function readOptionalFile(filePath) {
  return readFile(filePath, 'utf8').catch(() => '');
}

export function firstHeading(text) {
  return normalizeText(text).match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
}

function normalizeTitle(rawTitle) {
  const trimmed = rawTitle.trim().replace(/\s+/g, ' ');
  const statusAtStart = trimmed.match(/^Phase\s+(\d+)\s*\[(complete|pending|in_progress)\]\s*[:：-]?\s*(.+)$/i);
  if (statusAtStart) {
    return `Phase ${statusAtStart[1]}: ${statusAtStart[3].trim()}`;
  }

  const statusAtEnd = trimmed.match(/^Phase\s+(\d+)\s*[:：-]?\s*(.+?)\s*\[(complete|pending|in_progress)\]$/i);
  if (statusAtEnd) {
    return `Phase ${statusAtEnd[1]}: ${statusAtEnd[2].trim()}`;
  }

  return trimmed.replace(/^Phase\s+(\d+)\s*[-：]\s*/i, 'Phase $1: ');
}

function statusFromHeading(rawTitle) {
  const match = rawTitle.match(/\[(complete|pending|in_progress)\]/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function sectionBody(text, headingNames) {
  const lines = normalizeText(text).split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].trim().match(/^#{1,6}\s+(.+)$/)?.[1]?.trim();
    if (!heading || !headingNames.includes(heading)) {
      continue;
    }

    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^#{1,6}\s+/.test(lines[cursor].trim())) {
        break;
      }

      body.push(lines[cursor]);
    }

    return body.join('\n').trim();
  }

  return '';
}

function lifecycleValue(taskPlan, key) {
  const stateSection = sectionBody(taskPlan, CURRENT_STATE_HEADING_NAMES) || normalizeText(taskPlan);
  const match = stateSection.match(new RegExp(`^${key}:\\s*(.*)$`, 'im'));
  return match?.[1]?.trim() ?? '';
}

export function collectBullets(text, limit = Number.POSITIVE_INFINITY, { fromEnd = false } = {}) {
  const bullets = [];
  for (const line of normalizeText(text).split('\n')) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*+]\s+(.+)$/)?.[1] ?? trimmed.match(/^\d+\.\s+(.+)$/)?.[1];
    if (bullet) {
      bullets.push(bullet.trim());
      if (!fromEnd && bullets.length >= limit) {
        break;
      }
    }
  }
  return fromEnd ? bullets.slice(-limit) : bullets;
}

function lastBullet(text) {
  const bullets = collectBullets(text);
  return bullets.at(-1) ?? '';
}

export function tableRowsInSection(text, headingName) {
  const body = sectionBody(text, Array.isArray(headingName) ? headingName : [headingName]);
  const tableLines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\|.*\|$/.test(line));

  if (tableLines.length < 3) {
    return [];
  }

  return tableLines.slice(2).map((line) =>
    line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim())
  );
}

function countMatches(rows, matcher) {
  return rows.reduce((count, row) => count + (matcher(row.map((cell) => cell.toLowerCase()).join(' ')) ? 1 : 0), 0);
}

function verificationSummary(progress) {
  const testRows = tableRowsInSection(progress, 'Test Results');
  const errorRows = tableRowsInSection(progress, 'Error Log');

  return {
    passed: countMatches(testRows, (row) => /\bpass(?:ed)?\b|\bsuccess\b/.test(row)),
    totalTests: testRows.length,
    errorCount: errorRows.length
  };
}

function checklistMarker(status) {
  if (status === 'complete') {
    return 'x';
  }

  if (status === 'in_progress') {
    return '~';
  }

  return ' ';
}

function buildChecklist(phases) {
  return phases.length > 0
    ? phases.map((phase) => `- [${checklistMarker(phase.status)}] ${phase.title}`)
    : ['- [ ] No phases recorded'];
}

export function firstPendingPhase(phases) {
  return phases.find((phase) => phase.status === 'pending')?.title ?? '—';
}

export function currentPhaseTitle(phases) {
  return phases.find((phase) => phase.status === 'in_progress')?.title
    ?? phases.find((phase) => phase.status === 'pending')?.title
    ?? phases.at(-1)?.title
    ?? '—';
}

export function firstIncompleteChecklistItem(taskPlan) {
  for (const line of normalizeText(taskPlan).split('\n')) {
    const trimmed = line.trim();
    const checklistItem = trimmed.match(/^[-*+]\s+\[( |~)\]\s+(.+)$/)?.[2];
    if (checklistItem) {
      return compactText(checklistItem);
    }
  }

  return '';
}

export function latestOpenError(progress) {
  const errorRows = tableRowsInSection(progress, ERROR_LOG_HEADING_NAMES);
  const openRow = [...errorRows]
    .reverse()
    .find((row) => row.some((cell) => /\bopen\b/i.test(cell)));
  if (openRow?.[0]) {
    return compactText(openRow[0]);
  }

  const errorBullets = collectBullets(sectionBody(progress, ERROR_LOG_HEADING_NAMES), Number.POSITIVE_INFINITY, {
    fromEnd: true
  });
  return errorBullets.at(-1) ?? '';
}

function enforceBudget(text) {
  const lines = text.split('\n').slice(0, 160);
  let output = lines.join('\n');
  if (output.length <= 12_000) {
    return output;
  }

  return `${output.slice(0, 11_999).trimEnd()}…`;
}

export function extractPhases(taskPlan) {
  const lines = normalizeText(taskPlan).split('\n');
  const phases = [];

  for (let index = 0; index < lines.length; index += 1) {
    const headingMatch = lines[index].trim().match(/^###\s+(Phase.+)$/i);
    if (!headingMatch) {
      continue;
    }

    const rawTitle = headingMatch[1].trim();
    let status = statusFromHeading(rawTitle);

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor].trim();
      if (/^###\s+/.test(line)) {
        break;
      }

      const statusMatch = line.match(/^(?:[-*+]\s+)?\*\*Status:\*\*\s*(complete|pending|in_progress)$/i);
      if (statusMatch) {
        status = statusMatch[1].toLowerCase();
        break;
      }
    }

    phases.push({
      title: normalizeTitle(rawTitle),
      status: status ?? 'pending'
    });
  }

  return phases;
}

export function formatDuration(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 'unavailable';
  }

  const elapsedMinutes = Math.floor((endMs - startMs) / 60_000);
  if (elapsedMinutes < 1) {
    return '<1m';
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export async function buildSessionSummary({
  taskPlanPath,
  findingsPath,
  progressPath,
  sessionStartEpoch,
  now = Date.now()
}) {
  const [taskPlan, findings, progress] = await Promise.all([
    readOptionalFile(taskPlanPath),
    readOptionalFile(findingsPath),
    readOptionalFile(progressPath)
  ]);

  const taskId = taskPlanPath ? path.basename(path.dirname(taskPlanPath)) : 'unknown-task';
  const taskTitle = firstHeading(taskPlan) || taskId;
  const status = lifecycleValue(taskPlan, 'Status') || 'unknown';
  const closeReason = lifecycleValue(taskPlan, 'Close Reason');
  const phases = extractPhases(taskPlan);
  const completedPhases = phases.filter((phase) => phase.status === 'complete').length;
  const findingsBullets = collectBullets(findings, MAX_FINDINGS);
  const verification = verificationSummary(progress);
  const conclusion = status === 'closed' && closeReason ? closeReason : lastBullet(progress) || 'Not recorded';
  const checklist = buildChecklist(phases);
  const findingsSection = findingsBullets.length > 0 ? findingsBullets.map((item) => `- ${item}`) : ['- Not recorded'];
  const testsLine = verification.totalTests > 0
    ? `- Tests: ${verification.passed}/${verification.totalTests}`
    : '- Tests: none recorded';

  const lines = [
    SUMMARY_HEADING,
    `Task: ${taskTitle} (${taskId})`,
    `Status: ${status}  Phases: ${completedPhases}/${phases.length}  Duration: ${formatDuration(sessionStartEpoch, now)}`,
    '',
    'Conclusion:',
    `- ${conclusion}`,
    '',
    'Checklist:',
    ...checklist,
    '',
    'Key findings:',
    ...findingsSection,
    '',
    'Verification:',
    testsLine,
    `- Errors logged: ${verification.errorCount}`,
    '',
    'Next:',
    `- ${firstPendingPhase(phases)}`,
    '',
    `Sources: planning/active/${taskId}/{task_plan.md,progress.md,findings.md}`
  ];

  return enforceBudget(lines.join('\n'));
}
