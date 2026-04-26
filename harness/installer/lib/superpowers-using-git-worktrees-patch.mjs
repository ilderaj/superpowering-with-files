import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKER = 'Harness Superpowers using-git-worktrees naming patch';
const INSERT_BEFORE = '### 2. Create Worktree';

const PATCH_BLOCK = [
  `## ${MARKER}`,
  '',
  '- Before creating a manual worktree, run ./scripts/harness worktree-name.',
  '- Use the suggested worktree basename and branch name instead of deriving them from the prompt.',
  '- If the host already manages the worktree (for example, Codex App), treat this helper as a supplementary naming tool rather than a host override.',
  '',
  INSERT_BEFORE
].join('\n');

export async function applySuperpowersUsingGitWorktreesPatch(targetDir) {
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

export { MARKER as SUPERPOWERS_USING_GIT_WORKTREES_PATCH_MARKER };
