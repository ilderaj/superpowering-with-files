import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKER = 'Harness Superpowers using-git-worktrees naming patch';
const LEGACY_INSERT_BEFORE = '### 2. Create Worktree';
const DIRECTORY_SELECTION_INSERT_BEFORE = '#### Directory Selection';

function patchBlock(insertBefore) {
  return [
  `## ${MARKER}`,
  '',
  '- Before creating a manual worktree, run ./scripts/harness worktree-name.',
  '- Use the suggested worktree basename and branch name instead of deriving them from the prompt.',
  '- If the host already manages the worktree (for example, Codex App), treat this helper as a supplementary naming tool rather than a host override.',
  '',
  insertBefore
  ].join('\n');
}

const PATCH_VARIANTS = [
  {
    anchor: DIRECTORY_SELECTION_INSERT_BEFORE,
    block: patchBlock(DIRECTORY_SELECTION_INSERT_BEFORE)
  },
  {
    anchor: LEGACY_INSERT_BEFORE,
    block: patchBlock(LEGACY_INSERT_BEFORE)
  }
];

export async function applySuperpowersUsingGitWorktreesPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');

  if (original.includes(MARKER)) {
    return;
  }

  let patched = original;
  for (const variant of PATCH_VARIANTS) {
    if (!original.includes(variant.anchor)) {
      continue;
    }

    patched = original.replace(variant.anchor, variant.block);
    break;
  }

  if (patched === original) {
    throw new Error(`Unable to apply ${MARKER} to ${skillPath}`);
  }

  await writeFile(skillPath, patched);
}

export { MARKER as SUPERPOWERS_USING_GIT_WORKTREES_PATCH_MARKER };
