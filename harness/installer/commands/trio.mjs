import { discoverAuthorityRoot } from '../../trio/core/authority.mjs';
import {
  assertValidTaskId,
  isNoActiveTaskError,
  isTaskNotFoundError
} from '../../trio/core/read.mjs';
import {
  acceptTrioTask,
  appendProgressEvent,
  archiveTrioTask,
  closeTrioTask,
  initializeTrioTask,
  readExactTrioTask,
  stopTrioTask
} from '../../trio/core/store.mjs';
import {
  calculateNextAction,
  resolveModelEffort,
  routeTask
} from '../../trio/core/routing.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRIO_USAGE = [
  'Usage: node harness/installer/commands/trio.mjs <status|next|init|progress|accept|stop|close|archive> [options]',
  '',
  'Commands:',
  '  status                 Read the selected Trio',
  '  next --dry-run        Calculate the next action without writing',
  '  init --goal <text>    Create a new Trio',
  '  progress              Append one progress event',
  '  accept                Record chief acceptance evidence',
  '  stop                  Record chief stop evidence',
  '  close                 Close a Trio after acceptance or stop',
  '  archive               Move an eligible closed Trio',
  '',
  'Options:',
  '  --root <path>         Use an explicit authority root',
  '  --task <id>           Select an explicit task id',
  '  --class <quick|tracked>  Select the routing class for next',
  '  --goal <text>         Goal for init',
  '  --event <type>        Progress event type',
  '  --actor <actor>       Event actor',
  '  --detail <text>       Event detail',
  '  --reason <text>       Stop or close reason',
  '  --timestamp <value>   Archive timestamp YYYYMMDD-HHmmss'
].join('\n');

const WRITE_COMMANDS = new Set(['init', 'progress', 'accept', 'stop', 'close', 'archive']);

function optionValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

export function parseTrioArgs(args = []) {
  if (!Array.isArray(args) || args.length === 0) throw new Error(TRIO_USAGE);
  const command = args[0];
  if (command === '--help' || command === '-h') return { help: true };
  if (!['status', 'next', ...WRITE_COMMANDS].includes(command)) throw new Error(`Unknown Trio command: ${command}`);

  const result = {
    command,
    root: undefined,
    taskId: undefined,
    taskClass: undefined,
    dryRun: false,
    goal: undefined,
    event: undefined,
    actor: undefined,
    detail: undefined,
    reason: undefined,
    timestamp: undefined
  };
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
    } else if (arg === '--goal') {
      if (result.goal !== undefined) throw new Error('Duplicate --goal.');
      result.goal = optionValue(args, index, '--goal');
      index += 1;
    } else if (arg.startsWith('--goal=')) {
      if (result.goal !== undefined || arg.slice('--goal='.length) === '') throw new Error('Invalid --goal.');
      result.goal = arg.slice('--goal='.length);
    } else if (arg === '--event') {
      if (result.event !== undefined) throw new Error('Duplicate --event.');
      result.event = optionValue(args, index, '--event');
      index += 1;
    } else if (arg.startsWith('--event=')) {
      if (result.event !== undefined || arg.slice('--event='.length) === '') throw new Error('Invalid --event.');
      result.event = arg.slice('--event='.length);
    } else if (arg === '--actor') {
      if (result.actor !== undefined) throw new Error('Duplicate --actor.');
      result.actor = optionValue(args, index, '--actor');
      index += 1;
    } else if (arg.startsWith('--actor=')) {
      if (result.actor !== undefined || arg.slice('--actor='.length) === '') throw new Error('Invalid --actor.');
      result.actor = arg.slice('--actor='.length);
    } else if (arg === '--detail') {
      if (result.detail !== undefined) throw new Error('Duplicate --detail.');
      result.detail = optionValue(args, index, '--detail');
      index += 1;
    } else if (arg.startsWith('--detail=')) {
      if (result.detail !== undefined || arg.slice('--detail='.length) === '') throw new Error('Invalid --detail.');
      result.detail = arg.slice('--detail='.length);
    } else if (arg === '--reason') {
      if (result.reason !== undefined) throw new Error('Duplicate --reason.');
      result.reason = optionValue(args, index, '--reason');
      index += 1;
    } else if (arg.startsWith('--reason=')) {
      if (result.reason !== undefined || arg.slice('--reason='.length) === '') throw new Error('Invalid --reason.');
      result.reason = arg.slice('--reason='.length);
    } else if (arg === '--timestamp') {
      if (result.timestamp !== undefined) throw new Error('Duplicate --timestamp.');
      result.timestamp = optionValue(args, index, '--timestamp');
      index += 1;
    } else if (arg.startsWith('--timestamp=')) {
      if (result.timestamp !== undefined || arg.slice('--timestamp='.length) === '') throw new Error('Invalid --timestamp.');
      result.timestamp = arg.slice('--timestamp='.length);
    } else {
      throw new Error(`Unknown Trio option: ${arg}`);
    }
  }

  if (command === 'next' && !result.dryRun) {
    throw new Error('Trio next is read-only only with --dry-run.');
  }
  if (command === 'status' && result.dryRun) throw new Error('status does not accept --dry-run.');
  if (WRITE_COMMANDS.has(command) && result.dryRun) throw new Error(`${command} does not accept --dry-run.`);
  if (WRITE_COMMANDS.has(command) && result.taskId === undefined) {
    throw new Error(`${command} requires an explicit --task <id>.`);
  }
  const requiredOptions = {
    init: ['goal'],
    progress: ['event', 'actor', 'detail'],
    accept: ['actor', 'detail'],
    stop: ['actor', 'reason'],
    close: ['actor', 'reason'],
    archive: ['actor', 'timestamp']
  }[command] ?? [];
  for (const option of requiredOptions) {
    if (result[option] === undefined) throw new Error(`${command} requires --${option}.`);
  }
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
  const isWriteCommand = WRITE_COMMANDS.has(parsed.command);
  const route = parsed.command === 'next'
    ? routeTask({ taskClass: parsed.taskClass ?? 'tracked' })
    : null;
  const cwd = options.cwd ?? process.cwd();
  const authority = await discoverAuthorityRoot(cwd, { inputRoot: parsed.root });

  if (isWriteCommand) {
    let result;
    switch (parsed.command) {
      case 'init':
        result = await initializeTrioTask(authority.rootDir, parsed.taskId, parsed.goal);
        break;
      case 'progress':
        result = await appendProgressEvent(authority.rootDir, parsed.taskId, {
          event: parsed.event,
          actor: parsed.actor,
          detail: parsed.detail
        });
        break;
      case 'accept':
        result = await acceptTrioTask(authority.rootDir, parsed.taskId, {
          actor: parsed.actor,
          detail: parsed.detail
        });
        break;
      case 'stop':
        result = await stopTrioTask(authority.rootDir, parsed.taskId, {
          actor: parsed.actor,
          reason: parsed.reason
        });
        break;
      case 'close':
        result = await closeTrioTask(authority.rootDir, parsed.taskId, {
          actor: parsed.actor,
          reason: parsed.reason
        });
        break;
      case 'archive':
        result = await archiveTrioTask(authority.rootDir, parsed.taskId, {
          actor: parsed.actor,
          timestamp: parsed.timestamp
        });
        break;
      default:
        throw new Error(`Unsupported Trio write command: ${parsed.command}`);
    }

    const archived = parsed.command === 'archive';
    const current = archived ? null : await readExactTrioTask(authority.rootDir, { taskId: parsed.taskId });
    const report = {
      command: parsed.command,
      mode: 'write',
      readOnly: false,
      authorityRoot: authority.rootDir,
      task: current ? taskReport(current) : null,
      result,
      writes: archived
        ? [result.archiveDir]
        : parsed.command === 'init'
          ? Object.values(result.paths)
          : [parsed.command === 'close'
            ? result.paths.taskPlan
            : result.path ?? path.join(authority.rootDir, 'planning', 'active', parsed.taskId, 'progress.md')],
      model: resolveModelEffort({ taskClass: 'tracked' })
    };
    if (options.writeOutput !== false) (options.stdout ?? process.stdout).write(`${JSON.stringify(report)}\n`);
    return report;
  }

  const readOptions = parsed.taskId === undefined ? {} : { taskId: parsed.taskId };
  let trio = null;

  if (parsed.command === 'status') {
    trio = await readExactTrioTask(authority.rootDir, readOptions);
  } else if (route.taskClass === 'tracked') {
    try {
      trio = await readExactTrioTask(authority.rootDir, readOptions);
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
