import { discoverAuthorityRoot } from '../../trio/core/authority.mjs';
import {
  assertValidTaskId,
  isNoActiveTaskError,
  isTaskNotFoundError,
  readTrioTask
} from '../../trio/core/read.mjs';
import {
  calculateNextAction,
  resolveModelEffort,
  routeTask
} from '../../trio/core/routing.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRIO_USAGE = [
  'Usage: node harness/installer/commands/trio.mjs <status|next> [options]',
  '',
  'Commands:',
  '  status                 Read the selected Trio',
  '  next --dry-run        Calculate the next action without writing',
  '',
  'Options:',
  '  --root <path>         Use an explicit authority root',
  '  --task <id>           Select an explicit task id',
  '  --class <quick|tracked>  Select the routing class for next'
].join('\n');

function optionValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

export function parseTrioArgs(args = []) {
  if (!Array.isArray(args) || args.length === 0) throw new Error(TRIO_USAGE);
  const command = args[0];
  if (command === '--help' || command === '-h') return { help: true };
  if (command !== 'status' && command !== 'next') throw new Error(`Unknown Trio command: ${command}`);

  const result = { command, root: undefined, taskId: undefined, taskClass: undefined, dryRun: false };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      if (result.dryRun) throw new Error('Duplicate --dry-run.');
      result.dryRun = true;
    } else if (arg === '--root') {
      if (result.root !== undefined) throw new Error('Duplicate --root.');
      result.root = optionValue(args, index, '--root');
      index += 1;
    } else if (arg.startsWith('--root=')) {
      if (result.root !== undefined || arg.slice('--root='.length) === '') throw new Error('Invalid --root.');
      result.root = arg.slice('--root='.length);
    } else if (arg === '--task') {
      if (result.taskId !== undefined) throw new Error('Duplicate --task.');
      result.taskId = optionValue(args, index, '--task');
      index += 1;
    } else if (arg.startsWith('--task=')) {
      if (result.taskId !== undefined || arg.slice('--task='.length) === '') throw new Error('Invalid --task.');
      result.taskId = arg.slice('--task='.length);
    } else if (arg === '--class') {
      if (result.taskClass !== undefined) throw new Error('Duplicate --class.');
      result.taskClass = optionValue(args, index, '--class');
      index += 1;
    } else if (arg.startsWith('--class=')) {
      if (result.taskClass !== undefined || arg.slice('--class='.length) === '') throw new Error('Invalid --class.');
      result.taskClass = arg.slice('--class='.length);
    } else {
      throw new Error(`Unknown Trio option: ${arg}`);
    }
  }

  if (command === 'next' && !result.dryRun) {
    throw new Error('Trio next is read-only only with --dry-run.');
  }
  if (command === 'status' && result.dryRun) throw new Error('status does not accept --dry-run.');
  if (result.taskClass && !['quick', 'tracked'].includes(result.taskClass)) {
    throw new Error(`Unknown task class: ${result.taskClass}`);
  }
  return result;
}

function taskReport(trio) {
  return {
    taskId: trio.taskId,
    taskDir: trio.taskDir,
    status: trio.status,
    terminal: trio.terminal,
    source: trio.source
  };
}

export async function trioCommand(args = process.argv.slice(2), options = {}) {
  const parsed = parseTrioArgs(args);
  if (parsed.help) {
    if (options.writeOutput !== false) (options.stdout ?? process.stdout).write(`${TRIO_USAGE}\n`);
    return { help: true, usage: TRIO_USAGE };
  }

  if (parsed.taskId !== undefined) assertValidTaskId(parsed.taskId);
  const route = parsed.command === 'next'
    ? routeTask({ taskClass: parsed.taskClass ?? 'tracked' })
    : null;
  const cwd = options.cwd ?? process.cwd();
  const authority = await discoverAuthorityRoot(cwd, { inputRoot: parsed.root });
  const readOptions = parsed.taskId === undefined ? {} : { taskId: parsed.taskId };
  let trio = null;

  if (parsed.command === 'status') {
    trio = await readTrioTask(authority.rootDir, readOptions);
  } else if (route.taskClass === 'tracked') {
    try {
      trio = await readTrioTask(authority.rootDir, readOptions);
    } catch (error) {
      if (!isNoActiveTaskError(error) && !isTaskNotFoundError(error)) throw error;
    }
  }

  const report = {
    command: parsed.command,
    mode: parsed.command === 'next' ? 'dry-run' : 'read-only',
    readOnly: true,
    authorityRoot: authority.rootDir,
    task: trio ? taskReport(trio) : null,
    model: resolveModelEffort({ taskClass: route?.taskClass ?? parsed.taskClass ?? 'tracked' })
  };

  if (parsed.command === 'next') {
    Object.assign(report, calculateNextAction({ route, hasTrio: trio !== null, dryRun: true }));
  }

  if (options.writeOutput !== false) (options.stdout ?? process.stdout).write(`${JSON.stringify(report)}\n`);
  return report;
}

export const trio = trioCommand;
export const runTrioCommand = trioCommand;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await trioCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
