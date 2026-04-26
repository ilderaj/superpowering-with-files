import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { collectGitBaseSnapshot, recommendWorktreeBase } from '../lib/git-base.mjs';
import {
  collectCheckpointPushSnapshot,
  evaluateCheckpointPushReadiness
} from '../lib/checkpoint-push.mjs';
import { resolveWorktreeNaming } from '../lib/worktree-name.mjs';

const execFileAsync = promisify(execFile);

function parseBase(args) {
  const baseArg = args.find((arg) => arg.startsWith('--base='));
  return baseArg ? baseArg.slice('--base='.length) : undefined;
}

function parseTaskId(args) {
  const inline = args.find((arg) => arg.startsWith('--task='));
  if (inline) {
    return inline.slice('--task='.length);
  }

  const taskIndex = args.indexOf('--task');
  if (taskIndex === -1) {
    return undefined;
  }

  const taskId = args[taskIndex + 1];
  if (!taskId || taskId.startsWith('--')) {
    throw new Error('Missing value for --task.');
  }

  return taskId;
}

function wantsJson(args) {
  return args.includes('--json');
}

function wantsSafety(args) {
  return args.includes('--safety');
}

function namespaceFromBranch(branchName) {
  if (!branchName || !branchName.includes('/')) {
    return undefined;
  }

  return branchName.split('/')[0] || undefined;
}

function hasFilledRiskAssessment(content) {
  const start = content.indexOf('## Risk Assessment');
  if (start === -1) return false;
  const rest = content.slice(start + '## Risk Assessment'.length);
  const nextHeading = rest.search(/\n## |\n# /);
  const block = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const rows = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));
  return rows.some((line) => {
    if (/^\|\s*-/.test(line) || line.includes('风险 |') || line.includes('---|---')) {
      return false;
    }
    return line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)
      .some((cell) => cell !== '');
  });
}

async function gitOutput(cwd, ...args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function findSingleActiveTask(rootDir) {
  const activeRoot = path.join(rootDir, 'planning/active');
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  const matches = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const taskPlanPath = path.join(activeRoot, entry.name, 'task_plan.md');
    const content = await readFile(taskPlanPath, 'utf8').catch(() => null);
    if (!content) continue;
    if (/^Status:\s*active$/m.test(content)) {
      matches.push({ taskDir: path.join(activeRoot, entry.name), content });
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

async function collectSafetyChecks(rootDir, snapshot) {
  const [remote, activeTask, gitDir, gitCommonDir, checkpointSnapshot] = await Promise.all([
    gitOutput(rootDir, 'remote', 'get-url', 'origin'),
    findSingleActiveTask(rootDir),
    gitOutput(rootDir, 'rev-parse', '--absolute-git-dir'),
    gitOutput(rootDir, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
    collectCheckpointPushSnapshot(rootDir)
  ]);

  const isWorktree = Boolean(gitDir && gitCommonDir && gitDir !== gitCommonDir);
  const riskAssessmentRecorded = Boolean(activeTask && hasFilledRiskAssessment(activeTask.content));
  const checkpointReadiness = evaluateCheckpointPushReadiness(checkpointSnapshot);
  const checkpointMessage = checkpointReadiness.status === 'ok'
    ? ''
    : checkpointReadiness.reasons[0] ?? 'checkpoint push is not ready';

  return {
    activeTaskDir: activeTask?.taskDir ?? null,
    checkpointCommand: './scripts/harness checkpoint . --quiet --skip-if-clean',
    isWorktree,
    checks: [
      {
        name: 'remoteConfigured',
        status: remote ? 'ok' : 'problem',
        message: remote ? remote : 'No origin remote is configured.'
      },
      {
        name: 'dirtyStateVisible',
        status: 'ok',
        message: snapshot.dirty ? 'Current worktree is dirty.' : 'Current worktree is clean.'
      },
      {
        name: 'riskAssessmentRecorded',
        status: riskAssessmentRecorded ? 'ok' : 'problem',
        message: riskAssessmentRecorded
          ? activeTask.taskDir
          : 'No active task with a filled Risk Assessment row was found.'
      },
      {
        name: 'worktreeIsolation',
        status: isWorktree ? 'ok' : 'warning',
        message: isWorktree
          ? 'Current checkout is already a worktree.'
          : 'Create a dedicated worktree before risky or long-running execution.'
      },
      {
        name: 'checkpointPushReady',
        status: checkpointReadiness.status,
        message: checkpointMessage
      }
    ]
  };
}

function renderText(snapshot, recommendation, naming, safety) {
  const lines = [
    'Worktree base preflight',
    '',
    `Recommended base: ${recommendation.baseRef}`,
    `Base SHA: ${recommendation.baseSha ?? 'unresolved'}`,
    `Reason: ${recommendation.reason}`,
    `Suggested worktree label: ${naming.canonicalLabel}`,
    `Suggested branch name: ${naming.branchName}`,
    '',
    'Git context:',
    `- Current branch: ${snapshot.currentBranch || 'detached HEAD'}`,
    `- Current SHA: ${snapshot.currentSha ?? 'unknown'}`,
    `- Upstream branch: ${snapshot.upstreamBranch ?? 'none'}`,
    `- Default branch: ${snapshot.defaultBranch ?? 'none'}`,
    `- Dirty worktree: ${snapshot.dirty ? 'yes' : 'no'}`,
    '',
    'Use this explicit start point when creating a worktree:',
    `git worktree add <path>/${naming.worktreeBasename} -b ${naming.branchName} ${recommendation.baseRef}`,
    '',
    'Record this in Planning with Files:',
    `- Worktree base: ${recommendation.baseRef} @ ${recommendation.baseSha ?? 'unresolved'}`
  ];

  if (recommendation.warnings.length > 0) {
    lines.push('', 'Warnings:', ...recommendation.warnings.map((warning) => `- ${warning}`));
  }

  if (safety) {
    lines.push(
      '',
      'Safety checks:',
      ...safety.checks.map((check) => `- ${check.name}: ${check.status}${check.message ? ` (${check.message})` : ''}`),
      `- checkpointCommand: ${safety.checkpointCommand}`
    );
  }

  return `${lines.join('\n')}\n`;
}

export async function worktreePreflight(args = []) {
  const rootDir = process.cwd();
  const snapshot = await collectGitBaseSnapshot(rootDir);
  const recommendation = recommendWorktreeBase(snapshot, { baseRef: parseBase(args) });
  const naming = await resolveWorktreeNaming(rootDir, {
    taskId: parseTaskId(args),
    namespace: namespaceFromBranch(snapshot.currentBranch)
  });
  const safety = wantsSafety(args) ? await collectSafetyChecks(rootDir, snapshot) : null;

  if (wantsJson(args)) {
    console.log(JSON.stringify({ snapshot, recommendation, naming, safety }, null, 2));
    return;
  }

  console.log(renderText(snapshot, recommendation, naming, safety));
}
