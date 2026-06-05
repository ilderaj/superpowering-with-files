import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import { buildActiveSummaryTextReport, getActiveTaskSummary } from '../../runtime/summary-service.mjs';

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
    'Usage: ./scripts/harness active-summary [--json] [--output <path>]',
    '',
    'Options:',
    '  --json           Print the active-task summary as JSON',
    '  --output <path>  Write the JSON report to the given path',
    '  --help, -h       Show this help message'
  ].join('\n');
}

export async function activeSummary(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const outputPath = readOption(args, 'output');
  const { report } = await getActiveTaskSummary({ root: rootDir });

  if (outputPath) {
    const absoluteOutputPath = path.resolve(rootDir, outputPath);
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await writeFile(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (hasFlag(args, '--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  process.stdout.write(buildActiveSummaryTextReport(report));
}
