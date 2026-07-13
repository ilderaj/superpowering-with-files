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
    '       ./scripts/harness chiefops overlay handoff --file <json-file> [--model-resolution <json-file>] [--codex-home <dir>]',
    '       ./scripts/harness chiefops overlay subagent-handoff --file <parent-binding.json> --child <child-dispatch.json> --codex-home <dir>',
    '       ./scripts/harness chiefops overlay subagent-return --file <parent-binding.json> --child <child-contract.json> --return <child-return.json> --codex-home <dir>',
    '       ./scripts/harness chiefops overlay resolve-model --capability-class <class> --reasoning-demand <demand> --cost-preference <preference> --latency-class <class> --available <json-file>',
    '       ./scripts/harness chiefops overlay resolve-model --dispatch-intent --codex-home <dir> --mapping <json-file> --binding <json-file> --capability-class <class> --reasoning-demand <demand> --cost-preference <preference> --latency-class <class>',
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
    '  --reasoning-demand <demand>  Resolve the requested reasoning demand',
    '  --cost-preference <preference>  Resolve the requested cost preference',
    '  --latency-class <class>      Resolve the requested latency class',
    '  --upgrade-trigger <text>     Record the reason an upgrade may be needed',
    '  --available <path>          Read available models from a JSON file',
    '  --dispatch-intent           Use the trusted explicit-dispatch path',
    '  --codex-home <dir>          Explicit Codex home for trusted inventory',
    '  --mapping <path>            Profile mapping for explicit dispatch',
    '  --binding <path>            Required authority binding for explicit economy dispatch',
    '  --model-resolution <path>   Read exact resolver evidence for a handoff',
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
      prepareSubagentHandoff,
      readJsonFile,
      resolveModelFromFile,
      validateSubagentReturn,
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
      const bindingIdentity = packet.schemaVersion === 'chiefops.v0b'
        ? packet.bindingId
        : packet.kind === 'stable_prefix'
          ? packet.prefixBindingId
          : packet.deltaBindingId;
      const result = packet.schemaVersion === 'chiefops.v0b'
        ? { ok: true, bindingId: bindingIdentity }
        : { ok: true, bindingIdentity };
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if (overlayCommand === 'handoff') {
      const file = readOption(overlayArgs, '--file');
      if (!file) {
        throw new Error('Missing required --file <json-file>.');
      }

      const modelResolutionFile = readOption(overlayArgs, '--model-resolution');
      const codexHome = readOption(overlayArgs, '--codex-home');
      process.stdout.write(`${await buildHandoffFromFile({ root: rootDir, file, modelResolutionFile, codexHome })}\n`);
      return;
    }

    if (overlayCommand === 'subagent-handoff' || overlayCommand === 'subagent-return') {
      const file = readOption(overlayArgs, '--file');
      const childFile = readOption(overlayArgs, '--child');
      const codexHome = readOption(overlayArgs, '--codex-home');
      if (!file || !childFile || !codexHome) {
        throw new Error(`${overlayCommand} requires --file, --child, and --codex-home.`);
      }
      const parentBinding = await validateBindingFile({ file });
      const child = await readJsonFile(childFile);
      if (overlayCommand === 'subagent-handoff') {
        process.stdout.write(`${JSON.stringify(await prepareSubagentHandoff({ root: rootDir, parentBinding, childDispatch: child, codexHome }), null, 2)}\n`);
        return;
      }
      const returnFile = readOption(overlayArgs, '--return');
      if (!returnFile) throw new Error('subagent-return requires --return <child-return.json>.');
      process.stdout.write(`${JSON.stringify(await validateSubagentReturn({ root: rootDir, parentBinding, childContract: child, childReturn: await readJsonFile(returnFile), codexHome }), null, 2)}\n`);
      return;
    }

    if (overlayCommand === 'resolve-model') {
      const capabilityClass = readOption(overlayArgs, '--capability-class');
      const reasoningDemand = readOption(overlayArgs, '--reasoning-demand');
      const costPreference = readOption(overlayArgs, '--cost-preference');
      const latencyClass = readOption(overlayArgs, '--latency-class');
      const upgradeTrigger = readOption(overlayArgs, '--upgrade-trigger') ?? null;
      const availableFile = readOption(overlayArgs, '--available');
      const dispatchIntent = hasFlag(overlayArgs, '--dispatch-intent');
      const codexHome = readOption(overlayArgs, '--codex-home');
      const mappingFile = readOption(overlayArgs, '--mapping');
      const bindingFile = readOption(overlayArgs, '--binding');

      if (!capabilityClass) {
        throw new Error('Missing required --capability-class <class>.');
      }
      if (!dispatchIntent && !availableFile) {
        throw new Error('Missing required --available <json-file>.');
      }
      if (dispatchIntent && (!codexHome || !mappingFile || availableFile)) {
        throw new Error('Explicit dispatch requires --codex-home and --mapping, and forbids --available.');
      }
      if (!reasoningDemand) {
        throw new Error('Missing required --reasoning-demand <demand>.');
      }
      if (!costPreference) {
        throw new Error('Missing required --cost-preference <preference>.');
      }
      if (!latencyClass) {
        throw new Error('Missing required --latency-class <class>.');
      }

      const result = await resolveModelFromFile({
        capabilityClass,
        reasoningDemand,
        costPreference,
        latencyClass,
        upgradeTrigger,
        availableFile,
        dispatchIntent,
        codexHome,
        mappingFile,
        bindingFile,
        root: rootDir
      });
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
