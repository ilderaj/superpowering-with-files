import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_BULLETS = 3;
const MAX_SUMMARY_LENGTH = 180;
const GOAL_HEADING_NAMES = ['任务目标', '目标', 'Goal', 'Task Goal'];
const CURRENT_STATE_HEADING_NAMES = ['Current State', '当前状态'];
const LIFECYCLE_LINE_NAMES = ['Status', 'Archive Eligible', 'Close Reason'];

function normalizeText(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function compact(text, limit = MAX_SUMMARY_LENGTH) {
  const value = normalizeText(text)
    .replace(/\s+/g, ' ')
    .trim();

  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function readOptionalFile(filePath) {
  return readFile(filePath, 'utf8').catch(() => '');
}

function firstHeading(text) {
  const match = normalizeText(text).match(/^#\s+(.+)$/m);
  return compact(match?.[1] ?? '');
}

function sectionBody(text, headingNames) {
  const normalized = normalizeText(text);
  const lines = normalized.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim();

    if (!heading || !headingNames.some((name) => heading === name)) {
      continue;
    }

    const bodyLines = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^#{1,6}\s+/.test(lines[cursor].trim())) {
        break;
      }

      bodyLines.push(lines[cursor]);
    }

    return bodyLines.join('\n').trim();
  }

  return '';
}

function isLifecycleLine(line) {
  return LIFECYCLE_LINE_NAMES.some((name) => new RegExp(`^${name}:`, 'i').test(line));
}

function firstBulletLikeLine(text) {
  const lines = normalizeText(text).split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isLifecycleLine(trimmed)) continue;
    if (/^[-*+]\s+/.test(trimmed)) {
      return compact(trimmed.replace(/^[-*+]\s+/, ''));
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      return compact(trimmed.replace(/^\d+\.\s+/, ''));
    }
    if (!/^#{1,6}\s+/.test(trimmed)) {
      return compact(trimmed);
    }
  }

  return '';
}

function collectBullets(text, limit, fromEnd = false) {
  const lines = normalizeText(text).split('\n');
  const bullets = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isLifecycleLine(trimmed)) continue;

    const bulletText = trimmed.match(/^[-*+]\s+(.+)$/)?.[1];
    const numberedText = trimmed.match(/^\d+\.\s+(.+)$/)?.[1];
    const value = bulletText ?? numberedText;

    if (!value) {
      continue;
    }

    bullets.push(compact(value));
  }

  const chosen = fromEnd ? bullets.slice(-limit) : bullets.slice(0, limit);
  return chosen;
}

function summarizeGoal(taskPlan) {
  const goalSection = sectionBody(taskPlan, GOAL_HEADING_NAMES);
  const goalLine = firstBulletLikeLine(goalSection);

  if (goalLine) {
    return goalLine;
  }

  return firstHeading(taskPlan) || 'Not recorded';
}

function summarizeCurrentState(taskPlan) {
  const stateSection = sectionBody(taskPlan, CURRENT_STATE_HEADING_NAMES);
  const statusLine = normalizeText(stateSection)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^Status:\s*/i.test(line));

  return statusLine ? compact(statusLine.replace(/^Status:\s*/i, '')) : 'unknown';
}

export async function buildPlanningHotContext({ taskPlanPath, findingsPath, progressPath }) {
  const [taskPlan, findings, progress] = await Promise.all([
    readOptionalFile(taskPlanPath),
    readOptionalFile(findingsPath),
    readOptionalFile(progressPath)
  ]);

  const taskDirName = taskPlanPath ? path.basename(path.dirname(taskPlanPath)) : 'unknown task';
  const taskName = firstHeading(taskPlan) || taskDirName || 'unknown task';
  const goal = summarizeGoal(taskPlan);
  const status = summarizeCurrentState(taskPlan);
  const findingsBullets = collectBullets(findings, MAX_BULLETS);
  const progressBullets = collectBullets(progress, MAX_BULLETS, true);

  const lines = [
    '[planning-with-files] HOT CONTEXT',
    `Task: ${taskName}`,
    `Goal: ${goal}`,
    `Status: ${status}`
  ];

  if (findingsBullets.length > 0) {
    lines.push('', 'Findings:');
    for (const item of findingsBullets) {
      lines.push(`- ${item}`);
    }
  }

  if (progressBullets.length > 0) {
    lines.push('', 'Recent progress:');
    for (const item of progressBullets) {
      lines.push(`- ${item}`);
    }
  }

  lines.push('', 'Recovery cue: read the authoritative task_plan.md, findings.md, and progress.md for full context.');

  return lines.join('\n');
}
