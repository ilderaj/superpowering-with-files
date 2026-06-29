#!/usr/bin/env node
import {
  evaluateCodexConciseOutputRunFile,
  formatCodexConciseOutputReport
} from '../lib/evaluate-codex-concise-output.mjs';

function printUsage() {
  process.stdout.write(
    [
      'Usage: evaluate-codex-concise-output [--eval-root <dir>] [--file <name>]',
      '',
      'Options:',
      '  --eval-root <dir>  Read acceptance artifacts from a custom eval root.',
      '  --file <name>      Read a custom acceptance run JSON file.',
      '  --help             Show this help text.'
    ].join('\n') + '\n'
  );
}

function parseArgs(argv) {
  const options = {
    evalRoot: undefined,
    fileName: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--eval-root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--eval-root requires a value');
      }
      options.evalRoot = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--eval-root=')) {
      options.evalRoot = arg.slice('--eval-root='.length);
      continue;
    }
    if (arg === '--file') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--file requires a value');
      }
      options.fileName = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--file=')) {
      options.fileName = arg.slice('--file='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
  } else {
    const report = await evaluateCodexConciseOutputRunFile(options.evalRoot, options.fileName);
    process.stdout.write(formatCodexConciseOutputReport(report));
    if (!report.pass) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
