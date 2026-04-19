import os from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readHarnessHealth } from '../lib/health.mjs';
import { readState } from '../lib/state.mjs';

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function usage() {
  return [
    'Usage: ./scripts/harness verify [--output=stdout|<directory>]',
    '',
    'Options:',
    '  --output=stdout|<directory>  Print the report to stdout or write latest.{json,md} into a directory',
    '  --help, -h                   Show this help message'
  ].join('\n');
}

function renderMarkdown(report) {
  const context = report.health?.context;
  return [
    '# Harness Verification Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Scope: ${report.checks.scope}`,
    `Projection mode: ${report.checks.projectionMode}`,
    `Targets: ${report.checks.selectedTargets.join(', ') || 'none'}`,
    '',
    `Context entry verdict: ${context?.entry?.verdict ?? 'unknown'}`,
    `Context entry size: ${context?.entry?.chars ?? 0} chars, ${context?.entry?.lines ?? 0} lines, ${context?.entry?.approxTokens ?? 0} approx tokens`,
    `Context warnings: ${context?.warnings?.length ?? 0}`
  ].join('\n') + '\n';
}

export async function verify(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const rootDir = process.cwd();
  const state = await readState(rootDir);
  const health = await readHarnessHealth(rootDir, os.homedir());
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    checks: {
      stateReadable: true,
      selectedTargets: Object.keys(state.targets),
      scope: state.scope,
      projectionMode: state.projectionMode
    },
    health
  };

  const output = readOption(args, 'output', 'stdout');
  const markdown = renderMarkdown(report);

  if (output === 'stdout' || output === '-') {
    process.stdout.write(markdown);
    return;
  }

  const dir = path.isAbsolute(output) ? output : path.join(rootDir, output);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(dir, 'latest.md'), markdown);

  console.log(`Verification report written to ${path.relative(rootDir, path.join(dir, 'latest.md'))}`);
}
