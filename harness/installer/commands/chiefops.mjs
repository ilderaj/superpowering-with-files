import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import { buildChiefOpsBoardText, getChiefOpsBoard } from '../../runtime/chiefops-service.mjs';

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function readTaskId(args) {
  return readOption(args, '--task');
}

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

function usage() {
  return [
    'Usage: ./scripts/harness chiefops board --task <task-id> [--json]',
    '       ./scripts/harness chiefops overlay index --task <task-id> [--json]',
    '       ./scripts/harness chiefops overlay validate-binding --file <json-file>',
    '       ./scripts/harness chiefops overlay handoff --file <json-file>',
    '       ./scripts/harness chiefops overlay resolve-model --capability-class <class> --available <json-file>',
    '',
    'Subcommands:',
    '  board           Read the derived ChiefOps board for an active task',
    '  overlay         Read or validate the thin ChiefOps overlay surfaces',
    '',
    'Options:',
    '  --task <task-id>  Render the specified active tracked task',
    '  --json            Print the derived board as JSON',
    '  --file <path>     Read a JSON file for validation or handoff',
    '  --capability-class <class>  Resolve a model for the requested capability class',
    '  --available <path>          Read available models from a JSON file',
    '  --help, -h        Show this help message'
  ].join('\n');
}

export async function chiefopsCommand(args = []) {
  if (hasFlag(args, '--help', '-h') || args.length === 0) {
    console.log(usage());
    return;
  }

  const [subcommand, ...rest] = args;
  if (subcommand === 'overlay') {
    const [overlayCommand, ...overlayArgs] = rest;
    const { rootDir } = await discoverAuthorityRoot(process.cwd());
    const {
      buildHandoffFromFile,
      buildOverlayIndex,
      buildOverlayIndexText,
      resolveModelFromFile,
      validateBindingFile
    } = await import('../../runtime/chiefops-overlay/overlay-service.mjs');

    if (hasFlag(overlayArgs, '--help', '-h') || !overlayCommand) {
      console.log(usage());
      return;
    }

    if (overlayCommand === 'index') {
      const taskId = readTaskId(overlayArgs);
      if (!taskId) {
        throw new Error('Missing required --task <task-id>.');
      }

      const index = await buildOverlayIndex({ root: rootDir, taskId });
      if (hasFlag(overlayArgs, '--json')) {
        process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
        return;
      }

      process.stdout.write(`${buildOverlayIndexText(index)}\n`);
      return;
    }

    if (overlayCommand === 'validate-binding') {
      const file = readOption(overlayArgs, '--file');
      if (!file) {
        throw new Error('Missing required --file <json-file>.');
      }

      const packet = await validateBindingFile({ file });
      process.stdout.write(`${JSON.stringify({ ok: true, bindingId: packet.bindingId }, null, 2)}\n`);
      return;
    }

    if (overlayCommand === 'handoff') {
      const file = readOption(overlayArgs, '--file');
      if (!file) {
        throw new Error('Missing required --file <json-file>.');
      }

      process.stdout.write(`${await buildHandoffFromFile({ root: rootDir, file })}\n`);
      return;
    }

    if (overlayCommand === 'resolve-model') {
      const capabilityClass = readOption(overlayArgs, '--capability-class');
      const availableFile = readOption(overlayArgs, '--available');

      if (!capabilityClass) {
        throw new Error('Missing required --capability-class <class>.');
      }
      if (!availableFile) {
        throw new Error('Missing required --available <json-file>.');
      }

      const result = await resolveModelFromFile({ capabilityClass, availableFile });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    throw new Error(`Unknown chiefops overlay subcommand: ${overlayCommand}`);
  }

  if (subcommand !== 'board') {
    throw new Error(`Unknown chiefops subcommand: ${subcommand}`);
  }

  const taskId = readTaskId(rest);
  if (!taskId) {
    throw new Error('Missing required --task <task-id>.');
  }

  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const board = await getChiefOpsBoard({ root: rootDir, taskId });

  if (hasFlag(rest, '--json')) {
    process.stdout.write(`${JSON.stringify(board, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${buildChiefOpsBoardText(board)}\n`);
}
