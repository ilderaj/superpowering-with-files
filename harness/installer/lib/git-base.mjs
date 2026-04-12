import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TRUNK_BRANCHES = new Set(['main', 'master']);
const DEFAULT_CANDIDATE_REFS = ['dev', 'origin/dev', 'main', 'origin/main', 'master', 'origin/master'];

function isTrunkBranch(branch) {
  return TRUNK_BRANCHES.has(branch);
}

function shaForRef(snapshot, ref) {
  if (!ref) return undefined;
  if (snapshot.refs && snapshot.refs[ref]) return snapshot.refs[ref];
  if (ref === snapshot.currentBranch) return snapshot.currentSha;
  if (ref === snapshot.upstreamBranch) return snapshot.upstreamSha;
  if (ref === snapshot.defaultBranch) return snapshot.defaultSha;
  return undefined;
}

export function recommendWorktreeBase(snapshot, options = {}) {
  const warnings = [...(snapshot.warnings ?? [])];
  const explicitBase = options.baseRef;

  if (explicitBase) {
    const baseSha = shaForRef(snapshot, explicitBase);
    if (!baseSha) {
      warnings.push(`Explicit base ${explicitBase} could not be resolved in the local Git snapshot.`);
    }
    return {
      baseRef: explicitBase,
      baseSha,
      reason: `Explicit base ${explicitBase} was provided.`,
      warnings
    };
  }

  if (snapshot.dirty) {
    warnings.push('Current worktree has uncommitted changes; base selection uses committed refs only.');
  }

  if (snapshot.currentBranch && !isTrunkBranch(snapshot.currentBranch)) {
    const baseSha = shaForRef(snapshot, snapshot.currentBranch);
    const remoteRef = `origin/${snapshot.currentBranch}`;
    const remoteSha = shaForRef(snapshot, remoteRef);
    if (remoteSha && baseSha && remoteSha !== baseSha) {
      warnings.push(`${snapshot.currentBranch} differs from ${remoteRef}; confirm whether local HEAD or remote should be the base.`);
    }

    return {
      baseRef: snapshot.currentBranch,
      baseSha,
      reason: `Current branch ${snapshot.currentBranch} is a non-trunk branch, so the worktree should preserve the active development context.`,
      warnings
    };
  }

  if (snapshot.currentBranch && isTrunkBranch(snapshot.currentBranch)) {
    return {
      baseRef: snapshot.currentBranch,
      baseSha: shaForRef(snapshot, snapshot.currentBranch),
      reason: `Current branch ${snapshot.currentBranch} is a trunk branch.`,
      warnings
    };
  }

  if (snapshot.defaultBranch) {
    return {
      baseRef: snapshot.defaultBranch,
      baseSha: shaForRef(snapshot, snapshot.defaultBranch),
      reason: `No current branch was available, so the repository default branch ${snapshot.defaultBranch} was used.`,
      warnings
    };
  }

  return {
    baseRef: 'HEAD',
    baseSha: snapshot.currentSha,
    reason: 'No branch metadata was available, so HEAD was used as a fallback.',
    warnings
  };
}

async function gitOutput(args, options = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: options.cwd,
      maxBuffer: 1024 * 1024
    });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

async function gitSuccess(args, options = {}) {
  try {
    await execFileAsync('git', args, { cwd: options.cwd, maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

export async function collectGitBaseSnapshot(rootDir, candidateRefs = DEFAULT_CANDIDATE_REFS) {
  const [currentBranch, currentSha, upstreamBranch, defaultBranch, status] = await Promise.all([
    gitOutput(['branch', '--show-current'], { cwd: rootDir }),
    gitOutput(['rev-parse', 'HEAD'], { cwd: rootDir }),
    gitOutput(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd: rootDir }),
    gitOutput(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: rootDir }),
    gitOutput(['status', '--porcelain'], { cwd: rootDir })
  ]);

  const refs = {};
  await Promise.all(candidateRefs.map(async (ref) => {
    const exists = await gitSuccess(['rev-parse', '--verify', '--quiet', ref], { cwd: rootDir });
    if (!exists) return;
    const sha = await gitOutput(['rev-parse', ref], { cwd: rootDir });
    if (sha) refs[ref] = sha;
  }));

  const upstreamSha = upstreamBranch ? await gitOutput(['rev-parse', upstreamBranch], { cwd: rootDir }) : undefined;
  const defaultSha = defaultBranch ? await gitOutput(['rev-parse', defaultBranch], { cwd: rootDir }) : undefined;

  return {
    currentBranch,
    currentSha,
    upstreamBranch,
    upstreamSha,
    defaultBranch,
    defaultSha,
    dirty: Boolean(status),
    refs
  };
}
