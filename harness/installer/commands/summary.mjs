import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import { getTaskSummary } from '../../runtime/summary-service.mjs';

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

export async function summary(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const taskId = parseTaskId(args);
  const { summary: output } = await getTaskSummary({ root: rootDir, taskId });

  process.stdout.write(`${output}\n`);
}
