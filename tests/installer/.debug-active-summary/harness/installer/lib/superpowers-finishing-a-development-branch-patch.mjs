import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKER = 'Harness Superpowers finishing-a-development-branch base patch';

const LEGACY_BASE_BRANCH_PATTERN = /### Step 2: Determine Base Branch\n[\s\S]*?(?=\n### Step 3: Present Options)/;
const ENVIRONMENT_AWARE_BASE_BRANCH_PATTERN = /### Step 3: Determine Base Branch\n[\s\S]*?(?=\n### Step 4: Present Options)/;

function patchedBlock(stepNumber) {
  return [
  `## ${MARKER}`,
  '',
  `### Step ${stepNumber}: Determine Base Branch`,
  '',
  'Prefer the recorded `Worktree base: <base-ref> @ <base-sha>` from planning/active/<task-id>/ before using any late Git guess.',
  '',
  'Use this order:',
  '',
  '1. If the user or task explicitly named a base branch, use it and record why.',
  '2. Otherwise, read the active task planning files and look for the recorded worktree base.',
  '3. If a recorded worktree base exists, use that branch name as `<base-branch>`.',
  '4. Only fall back to explicit user confirmation or a conservative branch check when no recorded worktree base is available.',
  '',
  'Conservative fallback check:',
  '```bash',
  'git branch --show-current',
  'git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null',
  'git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null',
  '```',
  '',
  'Do not default to `main` or `master` when the repository already records a non-trunk worktree base such as `dev`.'
  ].join('\n');
}

const PATCH_VARIANTS = [
  {
    pattern: ENVIRONMENT_AWARE_BASE_BRANCH_PATTERN,
    block: patchedBlock(3)
  },
  {
    pattern: LEGACY_BASE_BRANCH_PATTERN,
    block: patchedBlock(2)
  }
];

export async function applySuperpowersFinishingADevelopmentBranchPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');

  if (original.includes(MARKER)) {
    return;
  }

  let patched = original;
  for (const variant of PATCH_VARIANTS) {
    if (!variant.pattern.test(original)) {
      continue;
    }

    patched = original.replace(variant.pattern, variant.block);
    break;
  }

  if (patched === original) {
    throw new Error(`Unable to apply ${MARKER} to ${skillPath}`);
  }

  await writeFile(skillPath, patched);
}

export { MARKER as SUPERPOWERS_FINISHING_A_DEVELOPMENT_BRANCH_PATCH_MARKER };
