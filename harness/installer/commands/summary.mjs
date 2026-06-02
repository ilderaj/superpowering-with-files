import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildSessionSummary } from '../lib/session-summary.mjs';
import { resolveActiveTaskDirectory } from '../lib/planning-task.mjs';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
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

function usage() {
  return [
    'Usage: ./scripts/harness summary [--task <task-id>]',
    '',
    'Options:',
    '  --task <task-id>  Render the specified task directory under planning/active',
    '  --help, -h        Show this help message'
  ].join('\n');
}

async function readSessionStartEpoch(taskDir) {
  const rawValue = await readFile(path.join(taskDir, '.session-start'), 'utf8').catch(() => '');
  const normalized = rawValue.trim();
  if (!normalized) {
    return Number.NaN;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function summary(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const taskId = parseTaskId(args);
  const taskDir = await resolveActiveTaskDirectory(rootDir, taskId);
  const output = await buildSessionSummary({
    taskPlanPath: path.join(taskDir, 'task_plan.md'),
    findingsPath: path.join(taskDir, 'findings.md'),
    progressPath: path.join(taskDir, 'progress.md'),
    sessionStartEpoch: await readSessionStartEpoch(taskDir),
    now: Date.now()
  });

  process.stdout.write(`${output}\n`);
}
