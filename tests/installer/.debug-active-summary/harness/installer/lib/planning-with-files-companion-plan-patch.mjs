import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyPlanningWithFilesRiskAssessmentPatch } from './planning-with-files-risk-assessment-patch.mjs';

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

const INSERTION_ANCHORS = [
  '## The Core Pattern',
  '## Critical Rules'
];

function applyCompanionPlanTextPatch(original, skillPath) {
  if (original.includes(UPSTREAM_TEXT)) {
    return original.replace(UPSTREAM_TEXT, HARNESS_TEXT);
  }

  for (const anchor of INSERTION_ANCHORS) {
    if (original.includes(anchor)) {
      return original.replace(anchor, `${HARNESS_TEXT}\n\n${anchor}`);
    }
  }

  throw new Error(`Unable to apply ${MARKER} to ${skillPath}`);
}

export async function applyPlanningWithFilesCompanionPlanPatch(targetDir) {
  await applyPlanningWithFilesRiskAssessmentPatch(targetDir);
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');

  if (original.includes(MARKER)) {
    return;
  }

  const patched = applyCompanionPlanTextPatch(original, skillPath);

  await writeFile(skillPath, patched);
}

export { MARKER as PLANNING_WITH_FILES_COMPANION_PLAN_PATCH_MARKER };
