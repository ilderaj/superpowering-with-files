import { discoverAuthorityRoot } from '../../trio/core/authority.mjs';
import { renderTokenAuditMarkdown, runTokenAudit } from '../lib/token-audit.mjs';

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
    'Usage: ./scripts/harness token-audit [--sessions-root <path>] [--date-from <iso>] [--date-to <iso>]',
    '',
    'Options:',
    '  --sessions-root <path>  Read rollout JSONL from the given directory instead of ~/.codex/sessions',
    '  --date-from <iso>       Inclusive ISO timestamp for the audit window start',
    '  --date-to <iso>         Inclusive ISO timestamp for the audit window end',
    '  --help, -h              Show this help message'
  ].join('\n');
}

export async function tokenAudit(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const report = await runTokenAudit({
    rootDir,
    sessionsRoot: readOption(args, 'sessions-root'),
    dateFrom: readOption(args, 'date-from'),
    dateTo: readOption(args, 'date-to')
  });

  process.stdout.write(`${renderTokenAuditMarkdown(report)}\n`);
}
