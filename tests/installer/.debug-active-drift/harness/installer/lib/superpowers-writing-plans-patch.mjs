import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKER = 'Harness Superpowers writing-plans location patch';

const UPSTREAM_SAVE_BLOCK = [
  '**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`',
  '- (User preferences for plan location override this default)'
].join('\n');

const HARNESS_SAVE_BLOCK = [
  `## ${MARKER}`,
  '',
  'Harness keeps `planning/active/<task-id>/` as the primary task-memory location.',
  '',
  '**Save durable task state to:** `planning/active/<task-id>/task_plan.md`',
  '',
  'Also keep `planning/active/<task-id>/findings.md` and `planning/active/<task-id>/progress.md` updated.',
  '',
  'If a Deep-reasoning task actually uses Superpowers, create a companion plan at `docs/superpowers/plans/<date>-<task-id>.md`.',
  'That companion plan is a secondary artifact for reasoning and review, not the primary task-memory record.',
  'Keep the detailed implementation plan and execution checklist in that companion artifact; sync only durable summaries back into `planning/active/<task-id>/`.',
  '',
  'Whenever a companion plan exists, write its path, a short summary, and the current sync-back status into the task-scoped planning files under `planning/active/<task-id>/`.',
  'The companion plan must also point back to `planning/active/<task-id>/` so execution can move from summary to detail and back.'
].join('\n');

export async function applySuperpowersWritingPlansPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');
  const patched = original.includes(MARKER)
    ? original
    : original.replace(UPSTREAM_SAVE_BLOCK, HARNESS_SAVE_BLOCK);

  if (patched === original && !original.includes(MARKER)) {
    throw new Error(`Unable to apply ${MARKER} to ${skillPath}`);
  }

  await writeFile(skillPath, patched);
}

export { MARKER as SUPERPOWERS_WRITING_PLANS_PATCH_MARKER };
