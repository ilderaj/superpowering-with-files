import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SKILL_HEADING = '## Model Selection';
const IMPLEMENTER_INSERT_BEFORE = '    ## Before You Begin';
const SPEC_INSERT_BEFORE = '    ## What Was Requested';
const REVIEWER_INSERT_BEFORE = '**Code reviewer returns:**';

const MARKER = 'Harness Superpowers subagent-driven-development budget patch';

const BUDGET_SECTION = [
  `## ${MARKER}`,
  '',
  '## Subagent Budget Policy',
  '',
  'Treat subagents as a budgeted resource.',
  '',
  '- Start with one implementer subagent for one bounded task.',
  '- Add another worker only when the next task owns a disjoint write set and the controller can keep moving locally.',
  '- Treat review loops as budgeted: one spec pass and one code-quality pass by default; extra loops need a concrete defect or mismatch.',
  '- Before upgrading model capability, first narrow the task slice or trim context.',
  '- If the task still needs broad repo discovery, split out an explorer or escalate instead of widening every worker prompt.'
].join('\n');

const IMPLEMENTER_SECTION = [
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

const SPEC_SECTION = [
  '    ## Review Budget',
  '',
  '    Review the changed files and the explicit requirements only.',
  '    Do not widen the review into unrelated repository surfaces unless the task requirements explicitly demand it.'
].join('\n');

const REVIEWER_BULLET =
  '- Did the controller keep the task narrow enough for the assigned model tier, or did this change needlessly widen context?';

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
  const specPath = path.join(targetDir, 'spec-reviewer-prompt.md');
  const reviewerPath = path.join(targetDir, 'code-quality-reviewer-prompt.md');

  const [skillOriginal, implementerOriginal, specOriginal, reviewerOriginal] = await Promise.all([
    readFile(skillPath, 'utf8'),
    readFile(implementerPath, 'utf8'),
    readFile(specPath, 'utf8'),
    readFile(reviewerPath, 'utf8')
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

  const implementerPatched = implementerOriginal.includes('    ## Context Budget')
    ? implementerOriginal
    : replaceOnce(
        implementerOriginal,
        IMPLEMENTER_INSERT_BEFORE,
        IMPLEMENTER_SECTION,
        implementerPath,
        'superpowers-subagent-budget implementer context budget section'
      );

  const specPatched = specOriginal.includes('    ## Review Budget')
    ? specOriginal
    : replaceOnce(
        specOriginal,
        SPEC_INSERT_BEFORE,
        SPEC_SECTION,
        specPath,
        'superpowers-subagent-budget reviewer budget section'
      );

  const reviewerPatched = reviewerOriginal.includes(REVIEWER_BULLET)
    ? reviewerOriginal
    : replaceOnce(
        reviewerOriginal,
        REVIEWER_INSERT_BEFORE,
        `${REVIEWER_BULLET}\n\n`,
        reviewerPath,
        'superpowers-subagent-budget code-review guidance'
      );

  await Promise.all([
    writeFile(skillPath, skillPatched),
    writeFile(implementerPath, implementerPatched),
    writeFile(specPath, specPatched),
    writeFile(reviewerPath, reviewerPatched)
  ]);
}

export const SUPERPOWERS_SUBAGENT_DRIVEN_DEVELOPMENT_BUDGET_PATCH_MARKER =
  MARKER;
