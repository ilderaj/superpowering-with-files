import { discoverAuthorityRoot } from '../../trio/core/authority.mjs';
import {
  assertValidTaskId,
  isNoActiveTaskError,
  isTaskNotFoundError,
  summarizeTrioTask
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
  COMPLEXITY_KINDS,
  WORK_ROLE_KINDS,
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
  '  status [--summary]     Read the selected Trio, optionally with a recorded summary',
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
  '  --role <role>         Current-slice work role (chief|thinking|planning|orchestrating|high_density_judgment|executing|searching|researching|coding|exploring|repetitive_execution)',
  '  --complexity <level>  Execution complexity (high|xhigh|max)',
  '  next requires --role: no requested model decision is made for an unclassified slice; status and Trio lifecycle commands never make a model decision',
  '  --override-reason <text>  Structured Chief override reason',
  '  --override-source <text>  Structured override provenance',
  '  --goal <text>         Goal for init',
  '  --event <type>        Progress event type',
  '  --actor <actor>       Event actor',
  '  --detail <text>       Event detail',
  '  --reason <text>       Stop or close reason',
  '  --timestamp <value>   Archive timestamp YYYYMMDD-HHmmss'
].join('\n');

const WRITE_COMMANDS = new Set(['init', 'progress', 'accept', 'stop', 'close', 'archive']);

// CLI report boundary: the store's atomic-write receipts carry BigInt
// dev/ino/nlink identity values. BigInt is not JSON-serializable, so the CLI
// normalizes it to its stable decimal string here, before stdout, while
// preserving the structured evidence. The in-process API return is untouched.
function jsonSerializable(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonSerializable);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = jsonSerializable(entry);
    return out;
  }
  return value;
}

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
    role: undefined,
    complexity: undefined,
    overrideReason: undefined,
    overrideSource: undefined,
    dryRun: false,
    summary: false,
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
    } else if (arg === '--summary') {
      if (result.summary) throw new Error('Duplicate --summary.');
      result.summary = true;
    } else if (arg.startsWith('--summary=')) {
      throw new Error('Invalid --summary. Use the flag without a value.');
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
    } else if (arg === '--role') {
      if (result.role !== undefined) throw new Error('Duplicate --role.');
      result.role = optionValue(args, index, '--role');
      index += 1;
    } else if (arg.startsWith('--role=')) {
      if (result.role !== undefined || arg.slice('--role='.length) === '') throw new Error('Invalid --role.');
      result.role = arg.slice('--role='.length);
    } else if (arg === '--complexity') {
      if (result.complexity !== undefined) throw new Error('Duplicate --complexity.');
      result.complexity = optionValue(args, index, '--complexity');
      index += 1;
    } else if (arg.startsWith('--complexity=')) {
      if (result.complexity !== undefined || arg.slice('--complexity='.length) === '') throw new Error('Invalid --complexity.');
      result.complexity = arg.slice('--complexity='.length);
    } else if (arg === '--override-reason') {
      if (result.overrideReason !== undefined) throw new Error('Duplicate --override-reason.');
      result.overrideReason = optionValue(args, index, '--override-reason');
      index += 1;
    } else if (arg.startsWith('--override-reason=')) {
      if (result.overrideReason !== undefined || arg.slice('--override-reason='.length) === '') throw new Error('Invalid --override-reason.');
      result.overrideReason = arg.slice('--override-reason='.length);
    } else if (arg === '--override-source') {
      if (result.overrideSource !== undefined) throw new Error('Duplicate --override-source.');
      result.overrideSource = optionValue(args, index, '--override-source');
      index += 1;
    } else if (arg.startsWith('--override-source=')) {
      if (result.overrideSource !== undefined || arg.slice('--override-source='.length) === '') throw new Error('Invalid --override-source.');
      result.overrideSource = arg.slice('--override-source='.length);
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
  if (command !== 'next' && (result.role !== undefined
    || result.complexity !== undefined
    || result.overrideReason !== undefined
    || result.overrideSource !== undefined)) {
    throw new Error('Role, complexity, and override options apply only to trio next.');
  }
  if (command === 'status' && result.dryRun) throw new Error('status does not accept --dry-run.');
  if (result.summary && command !== 'status') {
    throw new Error('--summary applies only to status.');
  }
  if (result.summary && result.taskId === undefined) {
    throw new Error('status --summary requires an explicit --task <id>.');
  }
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
  if (result.role !== undefined && !WORK_ROLE_KINDS.includes(result.role)) {
    throw new Error(`Unknown work role: ${result.role}`);
  }
  if (result.complexity !== undefined && !COMPLEXITY_KINDS.includes(result.complexity)) {
    throw new Error(`Unknown complexity: ${result.complexity}`);
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
  // Only `next` makes a requested model decision, and only with a declared
  // work role. `status` and the Trio lifecycle commands never make a model
  // decision; their report carries `model: null`.
  let modelResolution = null;
  if (parsed.command === 'next') {
    if (parsed.role === undefined) {
      throw new Error('trio next requires --role <workRole>; a requested model decision cannot be made for an unclassified slice.');
    }
    modelResolution = resolveModelEffort({
      taskClass: route.taskClass,
      workRole: parsed.role,
      complexity: parsed.complexity,
      ...(parsed.overrideReason === undefined
        ? {}
        : {
            override: {
              reason: parsed.overrideReason,
              provenance: parsed.overrideSource ?? 'operator'
            }
          })
    });
  }
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
      model: modelResolution
    };
    const reportOutput = jsonSerializable(report);
    if (options.writeOutput !== false) (options.stdout ?? process.stdout).write(`${JSON.stringify(reportOutput)}\n`);
    return reportOutput;
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
    model: modelResolution
  };

  if (parsed.command === 'next') {
    Object.assign(report, calculateNextAction({ route, hasTrio: trio !== null, dryRun: true }));
  }

  if (parsed.summary) report.summary = summarizeTrioTask(trio);

  const reportOutput = jsonSerializable(report);
  if (options.writeOutput !== false) (options.stdout ?? process.stdout).write(`${JSON.stringify(reportOutput)}\n`);
  return reportOutput;
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
