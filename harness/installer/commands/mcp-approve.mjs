import { readFile } from 'node:fs/promises';
import { createApprovalToken } from '../../runtime/approval-token.mjs';

function usage() {
  return [
    'Usage: ./scripts/harness mcp-approve --plan-file <path> [--actor <label>]',
    '',
    'Options:',
    '  --plan-file <path>  Read the JSON write plan from a local file',
    '  --actor <label>     Record an actor label in the approval token',
    '  --help, -h          Show this help message'
  ].join('\n');
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

export async function mcpApprove(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }

  const planFile = readOption(args, 'plan-file');
  if (!planFile) {
    throw new Error('Missing required --plan-file.');
  }

  const plan = JSON.parse(await readFile(planFile, 'utf8'));
  const token = await createApprovalToken(process.cwd(), plan, {
    actor: readOption(args, 'actor') ?? 'local-operator'
  });
  process.stdout.write(`${JSON.stringify(token, null, 2)}\n`);
}
