import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKER = 'Harness Superpowers executing-plans replan patch';
const INSERT_BEFORE = '## Remember';

const PATCH_BLOCK = [
  `## ${MARKER}`,
  '',
  '- If execution suggests the approved plan is insufficient, first distinguish an `execution issue` from a `plan issue`.',
  '- Only a `plan issue` may trigger a bounded mini `review -> revise -> verify` loop.',
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
