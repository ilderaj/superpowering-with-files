import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TASK_PLAN_MARKER = 'Harness planning-with-files risk assessment patch';
const FINDINGS_MARKER = 'Harness planning-with-files destructive log patch';

const RISK_ASSESSMENT_BLOCK = [
  `## ${TASK_PLAN_MARKER}`,
  '',
  '## Risk Assessment',
  '',
  '| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |',
  '|---|---|---|---|',
  '|    |          |          |                          |',
  ''
].join('\n');

const DESTRUCTIVE_OPERATIONS_LOG_BLOCK = [
  `## ${FINDINGS_MARKER}`,
  '',
  '## Destructive Operations Log',
  '<!-- Record destructive or potentially destructive commands, checkpoint paths, and rollback steps. -->',
  '| Command | Target | Checkpoint | Rollback |',
  '|---------|--------|------------|----------|',
  '|         |        |            |          |',
  ''
].join('\n');

export async function applyPlanningWithFilesRiskAssessmentPatch(targetDir) {
  const taskPlanPath = path.join(targetDir, 'templates/task_plan.md');
  const findingsPath = path.join(targetDir, 'templates/findings.md');

  const [taskPlanOriginal, findingsOriginal] = await Promise.all([
    readFile(taskPlanPath, 'utf8'),
    readFile(findingsPath, 'utf8')
  ]);

  const taskPlanPatched = taskPlanOriginal.includes(TASK_PLAN_MARKER)
    ? taskPlanOriginal
    : taskPlanOriginal.replace('\n## Key Questions\n', `\n${RISK_ASSESSMENT_BLOCK}\n## Key Questions\n`);
  if (taskPlanPatched === taskPlanOriginal && !taskPlanOriginal.includes(TASK_PLAN_MARKER)) {
    throw new Error(`Unable to apply ${TASK_PLAN_MARKER} to ${taskPlanPath}`);
  }

  const findingsPatched = findingsOriginal.includes(FINDINGS_MARKER)
    ? findingsOriginal
    : findingsOriginal.replace('\n## Resources\n', `\n${DESTRUCTIVE_OPERATIONS_LOG_BLOCK}\n## Resources\n`);
  if (findingsPatched === findingsOriginal && !findingsOriginal.includes(FINDINGS_MARKER)) {
    throw new Error(`Unable to apply ${FINDINGS_MARKER} to ${findingsPath}`);
  }

  await Promise.all([
    writeFile(taskPlanPath, taskPlanPatched),
    writeFile(findingsPath, findingsPatched)
  ]);
}

export {
  FINDINGS_MARKER as PLANNING_WITH_FILES_DESTRUCTIVE_LOG_PATCH_MARKER,
  TASK_PLAN_MARKER as PLANNING_WITH_FILES_RISK_ASSESSMENT_PATCH_MARKER
};
