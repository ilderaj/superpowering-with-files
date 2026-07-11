import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SKILL_HEADING = '## Model Selection';
const IMPLEMENTER_INSERT_BEFORE = '    ## Before You Begin';
const TASK_REVIEWER_INSERT_BEFORE = '    ## What Was Requested';

const MARKER = 'Harness Superpowers subagent-driven-development budget patch';
const IMPLEMENTER_MARKER =
  'Harness Superpowers subagent-driven-development implementer context budget patch';
const TASK_REVIEWER_MARKER =
  'Harness Superpowers subagent-driven-development task reviewer budget patch';

const BUDGET_SECTION = [
  `## ${MARKER}`,
  '',
  '## Subagent Budget Policy',
  '',
  'Treat subagents as a budgeted resource.',
  '',
  '- Start with one implementer subagent for one bounded task.',
  '- Add another worker only when the next task owns a disjoint write set and the controller can keep moving locally.',
  '- Treat review loops as budgeted: one task-review pass by default; extra loops need a concrete defect or mismatch.',
  '- Before upgrading model capability, first narrow the task slice or trim context.',
  '- Every subagent dispatch must declare an explicit model and thinking, be mechanically narrower than its parent envelope, use Terra/high without verified detailed-plan eligibility, and keep Luna/high/Sol as manual-contract exceptions rather than native host enforcement.',
  '- If the task still needs broad repo discovery, split out an explorer or escalate instead of widening every worker prompt.'
].join('\n');

const IMPLEMENTER_SECTION = [
  `    ## ${IMPLEMENTER_MARKER}`,
  '',
  '    ## Context Budget',
  '',
  '    The controller should give you only:',
  '    - the full text of this task',
  '    - the exact files or directory slice you own',
  '    - the minimum architectural notes needed to implement correctly',
  '',
  '    Do not accept broad session history or unrelated tasks as required context.',
  '    If the context pack is too wide, ask for a narrower one before coding.'
].join('\n');

const TASK_REVIEWER_SECTION = [
  `    ## ${TASK_REVIEWER_MARKER}`,
  '',
  '    ## Review Budget',
  '',
  '    Review the changed files and the explicit requirements only.',
  '    Do not widen the review into unrelated repository surfaces unless the task requirements explicitly demand it.',
  '    Include whether the controller kept the task narrow enough for the assigned model tier.'
].join('\n');

function replaceOnce(original, anchor, block, filePath, label) {
  const updated = original.replace(anchor, `${block}\n\n${anchor}`);
  if (updated === original) {
    throw new Error(`Unable to apply ${label} to ${filePath}`);
  }
  return updated;
}

export async function applySuperpowersSubagentDrivenDevelopmentBudgetPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const implementerPath = path.join(targetDir, 'implementer-prompt.md');
  const taskReviewerPath = path.join(targetDir, 'task-reviewer-prompt.md');

  const [skillOriginal, implementerOriginal, taskReviewerOriginal] = await Promise.all([
    readFile(skillPath, 'utf8'),
    readFile(implementerPath, 'utf8'),
    readFile(taskReviewerPath, 'utf8')
  ]);

  const skillPatched = skillOriginal.includes('## Subagent Budget Policy')
    ? skillOriginal
    : replaceOnce(
        skillOriginal,
        SKILL_HEADING,
        `${BUDGET_SECTION}\n`,
        skillPath,
        'superpowers-subagent-budget skill section'
      );

  const implementerPatched = implementerOriginal.includes(IMPLEMENTER_MARKER)
    ? implementerOriginal
    : replaceOnce(
        implementerOriginal,
        IMPLEMENTER_INSERT_BEFORE,
        IMPLEMENTER_SECTION,
        implementerPath,
        'superpowers-subagent-budget implementer context budget section'
      );

  const taskReviewerPatched = taskReviewerOriginal.includes(TASK_REVIEWER_MARKER)
    ? taskReviewerOriginal
    : replaceOnce(
        taskReviewerOriginal,
        TASK_REVIEWER_INSERT_BEFORE,
        TASK_REVIEWER_SECTION,
        taskReviewerPath,
        'superpowers-subagent-budget task-reviewer budget section'
      );

  await Promise.all([
    writeFile(skillPath, skillPatched),
    writeFile(implementerPath, implementerPatched),
    writeFile(taskReviewerPath, taskReviewerPatched)
  ]);
}

export const SUPERPOWERS_SUBAGENT_DRIVEN_DEVELOPMENT_BUDGET_PATCH_MARKER =
  MARKER;
