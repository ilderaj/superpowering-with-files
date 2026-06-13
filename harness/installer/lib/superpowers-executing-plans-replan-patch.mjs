import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKER = 'Harness Superpowers executing-plans replan patch';
const INSERT_BEFORE = '## Remember';

const PATCH_BLOCK = [
  `## ${MARKER}`,
  '',
  '- If verification fails, classify it first: `implementation issue`, `plan issue`, `acceptance proof issue`, or `governance proof issue`.',
  '- An `implementation issue` means the approved plan is still sound but the code or local fix is not there yet; stay in execution and repair the work.',
  '- Only a `plan issue` may trigger a bounded mini `review -> revise -> verify` loop.',
  '- An `acceptance proof issue` means the declared proof target is still unproven; rerun or expand the declared `primary proof` and use the declared `backstop proof` only when its escalation trigger is met.',
  '- A `governance proof issue` means the evidence sink, reconcile rule, or handoff record is incomplete; repair the recorded proof chain before claiming completion.',
  '- Keep the root goal stable instead of reopening broad planning or route selection.',
  '- Sync durable changes back to `planning/active/<task-id>/`.',
  '- If the mini-loop still fails, stop and record blockers instead of looping forever.',
  '',
  INSERT_BEFORE
].join('\n');

export async function applySuperpowersExecutingPlansReplanPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');

  if (original.includes(MARKER)) {
    return;
  }

  const patched = original.replace(INSERT_BEFORE, PATCH_BLOCK);

  if (patched === original) {
    throw new Error(`Unable to apply ${MARKER} to ${skillPath}`);
  }

  await writeFile(skillPath, patched);
}

export { MARKER as SUPERPOWERS_EXECUTING_PLANS_REPLAN_PATCH_MARKER };
