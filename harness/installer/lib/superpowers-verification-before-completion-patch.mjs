import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKER = 'Harness Superpowers verification-before-completion proof patch';
const INSERT_BEFORE = '## Common Failures';

const PATCH_BLOCK = [
  `## ${MARKER}`,
  '',
  '- Start from the declared proof stack, not from a convenient command.',
  '- Identify the `proof target`, `primary proof`, `backstop proof`, `escalation trigger`, `evidence sink`, `reconcile rule`, and `unacceptable substitute` before you verify anything.',
  '- Run the declared `primary proof` first and read the full result against the actual claim.',
  '- Only use the declared `backstop proof` when the `escalation trigger` is actually met.',
  '- Store the result in the declared `evidence sink` and apply the declared `reconcile rule` before claiming success.',
  '- Treat the declared `unacceptable substitute` as disallowed evidence even if it is faster or greener.',
  '',
  INSERT_BEFORE
].join('\n');

export async function applySuperpowersVerificationBeforeCompletionPatch(targetDir) {
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

export { MARKER as SUPERPOWERS_VERIFICATION_BEFORE_COMPLETION_PATCH_MARKER };
