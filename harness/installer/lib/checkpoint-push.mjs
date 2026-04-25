import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const BLOCKED_BRANCHES = new Set(['main', 'master']);

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function normalizePath(targetPath) {
  return targetPath.split(path.sep).join('/');
}

function timestampSegment(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-');
}

async function gitOutput(rootDir, ...args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: rootDir, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function gitResult(rootDir, ...args) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd: rootDir, maxBuffer: 1024 * 1024 });
    return { ok: true, stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: (error.stdout ?? '').trimEnd(),
      stderr: (error.stderr ?? '').trimEnd(),
      exitCode: typeof error.code === 'number' ? error.code : 1
    };
  }
}

async function commandResult(rootDir, command) {
  try {
    const { stdout, stderr } = await execFileAsync('bash', ['-lc', command], {
      cwd: rootDir,
      maxBuffer: 1024 * 1024 * 10
    });
    return { ok: true, stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: (error.stdout ?? '').trimEnd(),
      stderr: (error.stderr ?? '').trimEnd(),
      exitCode: typeof error.code === 'number' ? error.code : 1
    };
  }
}

function classifyStatusEntries(statusOutput) {
  const changedFiles = [];
  const untrackedFiles = [];

  for (const line of statusOutput.split('\n').filter(Boolean)) {
    const code = line.slice(0, 2);
    const filePath = line.slice(3).trim();
    if (!filePath) continue;
    if (code === '??') {
      untrackedFiles.push(filePath);
      continue;
    }
    changedFiles.push(filePath);
  }

  return { changedFiles, untrackedFiles };
}

export async function collectCheckpointPushSnapshot(rootDir) {
  const [repoRoot, currentBranch, upstreamBranch, currentSha, originUrl, gitDir, gitCommonDir, statusOutput] = await Promise.all([
    gitOutput(rootDir, 'rev-parse', '--show-toplevel'),
    gitOutput(rootDir, 'branch', '--show-current'),
    gitOutput(rootDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'),
    gitOutput(rootDir, 'rev-parse', 'HEAD'),
    gitOutput(rootDir, 'remote', 'get-url', 'origin'),
    gitOutput(rootDir, 'rev-parse', '--absolute-git-dir'),
    gitOutput(rootDir, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
    gitOutput(rootDir, 'status', '--porcelain')
  ]);

  const { changedFiles, untrackedFiles } = classifyStatusEntries(statusOutput);

  return {
    repoRoot: repoRoot || rootDir,
    currentBranch,
    upstreamBranch,
    currentSha,
    hasOrigin: Boolean(originUrl),
    isWorktree: Boolean(gitDir && gitCommonDir && gitDir !== gitCommonDir),
    dirty: Boolean(statusOutput),
    changedFiles,
    untrackedFiles
  };
}

export function evaluateCheckpointPushReadiness(snapshot) {
  const reasons = [];
  const expectedUpstream = snapshot.currentBranch ? `origin/${snapshot.currentBranch}` : '';

  if (!snapshot.currentBranch) {
    reasons.push('detached HEAD');
  } else if (BLOCKED_BRANCHES.has(snapshot.currentBranch)) {
    reasons.push(`branch ${snapshot.currentBranch} is not eligible`);
  } else if (snapshot.currentBranch === 'dev' && !snapshot.isWorktree) {
    reasons.push('dev requires a linked worktree');
  } else if (snapshot.upstreamBranch && snapshot.upstreamBranch !== expectedUpstream) {
    reasons.push(`upstream must be ${expectedUpstream}`);
  }

  if (!snapshot.hasOrigin) {
    reasons.push('origin remote is not configured');
  }

    return {
      status: reasons.length > 0 ? 'problem' : 'ok',
      reasons,
      preferredPushTarget: expectedUpstream,
      canCommit: reasons.length === 0 && snapshot.dirty,
      canPush: reasons.length === 0
    };
  }

async function ensureArtifactPaths(rootDir) {
  const timestamp = timestampSegment();
  const artifactDir = path.join(rootDir, '.harness', 'checkpoint-push', timestamp);
  await mkdir(artifactDir, { recursive: true });

  return {
    artifactDir,
    reviewArtifactPath: normalizePath(path.relative(rootDir, path.join(artifactDir, 'review.md'))),
    resultPath: normalizePath(path.relative(rootDir, path.join(artifactDir, 'result.json')))
  };
}

async function resolveVerifyCommand(rootDir, explicitCommand) {
  if (explicitCommand) {
    return { command: explicitCommand, error: '' };
  }

  const packageJsonPath = path.join(rootDir, 'package.json');
  let packageJson = null;
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      return { command: '', error: 'package.json could not be parsed while resolving scripts.verify.' };
    }
  }
  if (packageJson?.scripts?.verify) {
    return { command: 'npm run verify', error: '' };
  }

  return { command: '', error: '' };
}

function formatSection(title, body) {
  return `## ${title}\n${body && body.trim() ? `${body.trimEnd()}\n` : '(none)\n'}`;
}

async function collectWorkingEvidence(rootDir) {
  const statusShort = await gitOutput(rootDir, 'status', '--short');
  const { changedFiles, untrackedFiles } = classifyStatusEntries(statusShort);
  const cachedDiffStat = await gitOutput(rootDir, 'diff', '--stat', '--cached');
  const workingDiffStat = await gitOutput(rootDir, 'diff', '--stat');
  const diffLines = [cachedDiffStat, workingDiffStat].filter(Boolean);
  for (const filePath of untrackedFiles) {
    diffLines.push(`${filePath} | untracked`);
  }

  return {
    statusShort,
    changedFiles: [...changedFiles, ...untrackedFiles],
    diffStat: diffLines.join('\n')
  };
}

async function writeReviewArtifact(rootDir, result, review) {
  const reviewPath = path.join(rootDir, result.reviewArtifactPath);
  const lines = [
    '# Checkpoint Push Review Evidence',
    '',
    `- Branch: ${result.branch || 'detached HEAD'}`,
    `- Worktree: ${result.isWorktree ? 'yes' : 'no'}`,
    `- Upstream before push: ${result.upstreamBeforePush || 'none'}`,
    `- Verify command: ${result.verifyCommand || 'none'}`,
    `- Verify result: ${review.verify.ok ? 'success' : review.verify.command ? 'failed' : 'not-run'}`,
    '',
    formatSection('Git Status --short', review.statusShort),
    '',
    formatSection('Changed Files', review.changedFiles.map((filePath) => `- ${filePath}`).join('\n')),
    '',
    formatSection('Git Diff --stat', review.diffStat),
    '',
    formatSection(
      'Git Diff --check',
      !review.diffCheck.ran
        ? 'not run'
        : review.diffCheck.ok
        ? (review.diffCheck.stdout || 'clean')
        : [review.diffCheck.stdout, review.diffCheck.stderr].filter(Boolean).join('\n') || 'failed'
    ),
    '',
    formatSection(
      'Verify Command',
      review.verify.command
        ? [`Command: ${review.verify.command}`, `Exit code: ${review.verify.exitCode}`].join('\n')
        : 'Not run'
    ),
    '',
    formatSection('Verify STDOUT', review.verify.stdout),
    '',
    formatSection('Verify STDERR', review.verify.stderr)
  ];

  await writeFile(reviewPath, `${lines.join('\n')}\n`);
}

async function writeResult(rootDir, result) {
  await writeFile(path.join(rootDir, result.resultPath), `${JSON.stringify(result, null, 2)}\n`);
}

function createBaseResult(snapshot, artifacts, message, verifyCommand) {
  return {
    status: 'blocked',
    branch: snapshot.currentBranch || '',
    upstream: snapshot.upstreamBranch || '',
    upstreamBeforePush: snapshot.upstreamBranch || '',
    isWorktree: snapshot.isWorktree,
    verifyCommand: verifyCommand || '',
    reviewArtifactPath: artifacts.reviewArtifactPath,
    resultPath: artifacts.resultPath,
    headBefore: snapshot.currentSha || '',
    headAfter: snapshot.currentSha || '',
    message: message || '',
    blockedReason: ''
  };
}

function shapePushFailure(result) {
  const combined = [result.stdout, result.stderr].join('\n');
  if (/authentication failed|could not read from remote repository|permission denied|repository not found/i.test(combined)) {
    return 'Push failed: authentication or remote authorization was rejected.';
  }
  if (/operation not permitted|sandbox|denied/i.test(combined)) {
    return 'Push failed: host approval or sandbox policy blocked the push.';
  }
  if (/network|timed out|could not resolve host|failed to connect/i.test(combined)) {
    return 'Push failed: network access to origin failed.';
  }
  return 'Push failed: git push did not complete successfully.';
}

function renderText(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

async function backupIndexFile(rootDir) {
  const indexPath = await gitOutput(rootDir, 'rev-parse', '--path-format=absolute', '--git-path', 'index');
  if (!indexPath) return null;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'harness-checkpoint-index-'));
  const backupPath = path.join(tempDir, 'original.index');
  await copyFile(indexPath, backupPath);
  return { indexPath, backupPath, tempDir };
}

async function restoreOriginalIndex(indexBackup) {
  if (!indexBackup) return;
  await copyFile(indexBackup.backupPath, indexBackup.indexPath);
}

export async function checkpointPush(rootDir, args = []) {
  const message = readOption(args, 'message', '');
  const explicitVerifyCommand = readOption(args, 'verify-cmd', '');
  const dryRun = hasFlag(args, '--dry-run');
  const json = hasFlag(args, '--json');

  const snapshot = await collectCheckpointPushSnapshot(rootDir);
  const readiness = evaluateCheckpointPushReadiness(snapshot);
  const artifacts = await ensureArtifactPaths(rootDir);
  const verifyResolution = await resolveVerifyCommand(rootDir, explicitVerifyCommand);
  const verifyCommand = verifyResolution.command;
  const result = createBaseResult(snapshot, artifacts, message, verifyCommand);
  const review = {
    statusShort: '',
    changedFiles: [...snapshot.changedFiles, ...snapshot.untrackedFiles],
    diffStat: '',
    diffCheck: { ran: false, ok: false, stdout: '', stderr: '', exitCode: 0 },
    verify: { command: verifyCommand, ok: false, stdout: '', stderr: '', exitCode: 0 }
  };
  let stagedForCheck = false;
  const indexBackup = await backupIndexFile(rootDir);

  Object.assign(review, await collectWorkingEvidence(rootDir));

  try {
    if (readiness.status === 'problem') {
      result.status = 'blocked';
      result.blockedReason = readiness.reasons[0] ?? 'checkpoint push is not ready';
    } else if (!message) {
      result.status = 'blocked';
      result.blockedReason = 'A commit message is required.';
    } else if (!snapshot.dirty) {
      result.status = 'no_changes';
    } else if (verifyResolution.error) {
      result.status = 'blocked';
      result.blockedReason = verifyResolution.error;
    } else if (!verifyCommand) {
      result.status = 'blocked';
      result.blockedReason = 'No verify command was provided and package.json does not define scripts.verify.';
    } else {
      review.verify = {
        command: verifyCommand,
        ...(await commandResult(rootDir, verifyCommand))
      };
      Object.assign(review, await collectWorkingEvidence(rootDir));

      if (!review.verify.ok) {
        result.status = 'verification_failed';
      } else {
        const addResult = await gitResult(rootDir, 'add', '-A');
        if (!addResult.ok) {
          result.status = 'blocked';
          result.blockedReason = 'git add -A failed.';
        } else {
          stagedForCheck = true;
          review.statusShort = await gitOutput(rootDir, 'status', '--short');
          const { changedFiles, untrackedFiles } = classifyStatusEntries(review.statusShort);
          review.changedFiles = [...changedFiles, ...untrackedFiles];
          review.diffStat = await gitOutput(rootDir, 'diff', '--stat', '--cached');
          review.diffCheck = { ran: true, ...(await gitResult(rootDir, 'diff', '--check', '--cached')) };

          if (!review.diffCheck.ok) {
            result.status = 'blocked';
            result.blockedReason = 'git diff --check failed.';
          } else if (dryRun) {
            result.status = 'success';
            result.headAfter = result.headBefore;
          } else {
            const commitResult = await gitResult(rootDir, 'commit', '-m', message);
            if (!commitResult.ok) {
              result.status = 'blocked';
              result.blockedReason = 'git commit failed.';
            } else {
              stagedForCheck = false;
              result.headAfter = await gitOutput(rootDir, 'rev-parse', 'HEAD');

              const pushResult = snapshot.upstreamBranch
                ? await gitResult(rootDir, 'push', 'origin', `HEAD:refs/heads/${snapshot.currentBranch}`)
                : await gitResult(rootDir, 'push', '-u', 'origin', `HEAD:refs/heads/${snapshot.currentBranch}`);

              if (!pushResult.ok) {
                result.status = 'push_failed';
                result.blockedReason = shapePushFailure(pushResult);
              } else {
                result.status = 'success';
                result.upstream = snapshot.upstreamBranch || `origin/${snapshot.currentBranch}`;
              }
            }
          }
        }
      }
    }
  } finally {
    if (stagedForCheck) {
      await restoreOriginalIndex(indexBackup);
    }
    await writeReviewArtifact(rootDir, result, review);
    await writeResult(rootDir, result);
    if (indexBackup?.tempDir) {
      await rm(indexBackup.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  return {
    result,
    stdout: json ? JSON.stringify(result, null, 2) + '\n' : renderText(result)
  };
}
