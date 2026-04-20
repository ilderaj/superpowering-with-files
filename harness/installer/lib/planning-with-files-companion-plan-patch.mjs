import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKER = 'Harness planning-with-files companion-plan patch';

const UPSTREAM_TEXT =
  '- If superpowers is used, durable planning state still belongs here. Do not create a parallel long-lived superpowers plan unless the user explicitly requests that file.';

const HARNESS_TEXT = [
  '- If superpowers is used on a Deep-reasoning task, persist the detailed implementation plan in `docs/superpowers/plans/<date>-<task-id>.md`.',
  '- Keep `planning/active/<task-id>/` authoritative for durable task state, and sync only summaries, companion-plan references, and lifecycle/status updates back there.',
  '- Record the companion plan path, a short summary, and the current sync-back status in the task-scoped planning files.',
  '- The companion plan must also point back to `planning/active/<task-id>/`.',
  '- Prefer compact hot-context recovery from the authoritative planning files before reading long historical detail.',
  '',
  `## ${MARKER}`,
  '',
  'This materialized copy keeps `planning/active/<task-id>/` authoritative while preserving the required companion-plan workflow.'
].join('\n');

export async function applyPlanningWithFilesCompanionPlanPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');

  if (original.includes(MARKER)) {
    return;
  }

  const patched = original.replace(UPSTREAM_TEXT, HARNESS_TEXT);

  if (patched === original) {
    throw new Error(`Unable to apply ${MARKER} to ${skillPath}`);
  }

  await writeFile(skillPath, patched);
}

export { MARKER as PLANNING_WITH_FILES_COMPANION_PLAN_PATCH_MARKER };
