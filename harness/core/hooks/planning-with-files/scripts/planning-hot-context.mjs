import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  collectBullets,
  compactText,
  currentPhaseTitle,
  extractPhases,
  firstHeading,
  firstIncompleteChecklistItem,
  latestOpenError,
  readOptionalFile,
  sectionBody
} from './session-summary.mjs';

const MAX_BULLETS = 3;
const GOAL_HEADING_NAMES = ['任务目标', '目标', 'Goal', 'Task Goal'];
const CURRENT_STATE_HEADING_NAMES = ['Current State', '当前状态'];

function summarizeGoal(taskPlan) {
  const goalSection = sectionBody(taskPlan, GOAL_HEADING_NAMES);
  const goalBullet = collectBullets(goalSection, 1)[0];

  if (goalBullet) {
    return compactText(goalBullet);
  }

  return compactText(firstHeading(taskPlan) || 'Not recorded');
}

function summarizeCurrentState(taskPlan) {
  const stateSection = sectionBody(taskPlan, CURRENT_STATE_HEADING_NAMES);
  const statusLine = stateSection
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^Status:\s*/i.test(line));

  return compactText(statusLine ? statusLine.replace(/^Status:\s*/i, '') : 'unknown');
}

function compactValue(value, fallback = '—') {
  return compactText(value || fallback);
}

export function planningFingerprint(text) {
  return createHash('sha256').update(String(text ?? '')).digest('hex');
}

export async function buildPlanningContextModel({ taskPlanPath, findingsPath, progressPath }) {
  const [taskPlan, findings, progress] = await Promise.all([
    readOptionalFile(taskPlanPath),
    readOptionalFile(findingsPath),
    readOptionalFile(progressPath)
  ]);

  const taskDirName = taskPlanPath ? path.basename(path.dirname(taskPlanPath)) : 'unknown-task';
  const taskName = compactText(firstHeading(taskPlan) || taskDirName || 'unknown task');
  const phases = extractPhases(taskPlan);

  return {
    taskName,
    goal: summarizeGoal(taskPlan),
    status: summarizeCurrentState(taskPlan),
    currentPhase: compactValue(currentPhaseTitle(phases)),
    nextStep: compactValue(firstIncompleteChecklistItem(taskPlan)),
    lastFailure: compactValue(latestOpenError(progress)),
    findingsBullets: collectBullets(findings, MAX_BULLETS),
    progressBullets: collectBullets(progress, MAX_BULLETS, { fromEnd: true }),
    sourceText: [taskPlan, findings, progress].join('\n\n---\n\n')
  };
}

export async function buildPlanningHotContext({ taskPlanPath, findingsPath, progressPath }) {
  const context = await buildPlanningContextModel({ taskPlanPath, findingsPath, progressPath });

  const lines = [
    '[planning-with-files] HOT CONTEXT',
    `Task: ${context.taskName}`,
    `Goal: ${context.goal}`,
    `Status: ${context.status}`,
    `Phase: ${context.currentPhase}`,
    `Next: ${context.nextStep}`,
    `Last failure: ${context.lastFailure}`
  ];

  if (context.findingsBullets.length > 0) {
    lines.push('', 'Findings:');
    for (const item of context.findingsBullets) {
      lines.push(`- ${item}`);
    }
  }

  if (context.progressBullets.length > 0) {
    lines.push('', 'Recent progress:');
    for (const item of context.progressBullets) {
      lines.push(`- ${item}`);
    }
  }

  lines.push('', 'Recovery cue: read the authoritative task_plan.md, findings.md, and progress.md for full context.');

  return lines.join('\n');
}
