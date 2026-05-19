import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { resolveActiveTaskDirectory } from '../lib/planning-task.mjs';

const execFileAsync = promisify(execFile);
const VALID_FILES = new Set(['task_plan', 'findings', 'progress', 'reconciliation']);

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    return inline.slice(name.length + 3);
  }

  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for --${name}.`);
  }

  return value;
}

function usage() {
  return [
    'Usage: ./scripts/harness record --file <task_plan|findings|progress|reconciliation> [--task <task-id>] [--title <text>]',
    '',
    'Options:',
    '  --file <name>    Planning file to append to: task_plan, findings, progress, or reconciliation',
    '  --task <task-id> Append to a specific task under planning/active',
    '  --title <text>   Optional subheading to insert below the timestamped record heading',
    '  --help, -h       Show this help message'
  ].join('\n');
}

function validateFileKind(fileKind) {
  if (!fileKind) {
    throw new Error('Missing required option --file.');
  }

  if (!VALID_FILES.has(fileKind)) {
    throw new Error(`Invalid --file "${fileKind}". Expected one of: task_plan, findings, progress.`);
  }
}

export async function record(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const fileKind = readOption(args, 'file');
  validateFileKind(fileKind);

  const rootDir = process.cwd();
  const taskId = readOption(args, 'task');
  const taskDir = await resolveActiveTaskDirectory(rootDir, taskId);
  const resolvedTaskId = path.basename(taskDir);
  const title = readOption(args, 'title');
  const scriptPath = path.join(
    rootDir,
    'harness/core/upstream-overlays/planning-with-files/scripts/planning_record.py'
  );

  const { stdout } = await execFileAsync('python3', [
    scriptPath,
    'append',
    rootDir,
    resolvedTaskId,
    fileKind,
    ...(title ? [title] : [])
  ]);

  process.stdout.write(stdout);
}
