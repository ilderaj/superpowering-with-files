import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import { buildChiefOpsBoardText, getChiefOpsBoard } from '../../runtime/chiefops-service.mjs';

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function readTaskId(args) {
  const inline = args.find((arg) => arg.startsWith('--task='));
  if (inline) {
    return inline.slice('--task='.length);
  }

  const index = args.indexOf('--task');
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('Missing value for --task.');
  }

  return value;
}

function usage() {
  return [
    'Usage: ./scripts/harness chiefops board --task <task-id> [--json]',
    '',
    'Subcommands:',
    '  board           Read the derived ChiefOps board for an active task',
    '',
    'Options:',
    '  --task <task-id>  Render the specified active tracked task',
    '  --json            Print the derived board as JSON',
    '  --help, -h        Show this help message'
  ].join('\n');
}

export async function chiefopsCommand(args = []) {
  if (hasFlag(args, '--help', '-h') || args.length === 0) {
    console.log(usage());
    return;
  }

  const [subcommand, ...rest] = args;
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
