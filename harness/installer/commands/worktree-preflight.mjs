import { collectGitBaseSnapshot, recommendWorktreeBase } from '../lib/git-base.mjs';

function parseBase(args) {
  const baseArg = args.find((arg) => arg.startsWith('--base='));
  return baseArg ? baseArg.slice('--base='.length) : undefined;
}

function wantsJson(args) {
  return args.includes('--json');
}

function renderText(snapshot, recommendation) {
  const lines = [
    'Worktree base preflight',
    '',
    `Recommended base: ${recommendation.baseRef}`,
    `Base SHA: ${recommendation.baseSha ?? 'unresolved'}`,
    `Reason: ${recommendation.reason}`,
    '',
    'Git context:',
    `- Current branch: ${snapshot.currentBranch || 'detached HEAD'}`,
    `- Current SHA: ${snapshot.currentSha ?? 'unknown'}`,
    `- Upstream branch: ${snapshot.upstreamBranch ?? 'none'}`,
    `- Default branch: ${snapshot.defaultBranch ?? 'none'}`,
    `- Dirty worktree: ${snapshot.dirty ? 'yes' : 'no'}`,
    '',
    'Use this explicit start point when creating a worktree:',
    `git worktree add <path> -b <new-branch> ${recommendation.baseRef}`,
    '',
    'Record this in Planning with Files:',
    `- Worktree base: ${recommendation.baseRef} @ ${recommendation.baseSha ?? 'unresolved'}`
  ];

  if (recommendation.warnings.length > 0) {
    lines.push('', 'Warnings:', ...recommendation.warnings.map((warning) => `- ${warning}`));
  }

  return `${lines.join('\n')}\n`;
}

export async function worktreePreflight(args = []) {
  const rootDir = process.cwd();
  const snapshot = await collectGitBaseSnapshot(rootDir);
  const recommendation = recommendWorktreeBase(snapshot, { baseRef: parseBase(args) });

  if (wantsJson(args)) {
    console.log(JSON.stringify({ snapshot, recommendation }, null, 2));
    return;
  }

  console.log(renderText(snapshot, recommendation));
}
