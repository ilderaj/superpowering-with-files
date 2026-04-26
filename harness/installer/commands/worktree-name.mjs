import { resolveWorktreeNaming } from '../lib/worktree-name.mjs';

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
    'Usage: ./scripts/harness worktree-name [--task <task-id>] [--namespace <prefix>] [--json]',
    '',
    'Options:',
    '  --task <task-id>      Resolve the canonical name for a specific planning task',
    '  --namespace <prefix>  Wrap the branch name with a namespace such as copilot or fix',
    '  --json                Print the naming contract as JSON',
    '  --help, -h            Show this help message'
  ].join('\n');
}

function renderText(naming) {
  return [
    `taskId: ${naming.taskId}`,
    `taskSlug: ${naming.taskSlug}`,
    `timestamp: ${naming.timestamp}`,
    `sequence: ${naming.sequence}`,
    `canonicalLabel: ${naming.canonicalLabel}`,
    `branchName: ${naming.branchName}`,
    `worktreeBasename: ${naming.worktreeBasename}`
  ].join('\n');
}

export async function worktreeName(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const naming = await resolveWorktreeNaming(process.cwd(), {
    taskId: readOption(args, 'task'),
    namespace: readOption(args, 'namespace')
  });

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(naming, null, 2));
    return;
  }

  console.log(renderText(naming));
}
