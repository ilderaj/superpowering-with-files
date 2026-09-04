#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evaluateChangeQuality } from './lib/pr-quality.mjs';

function resultForError(code, reason, field = 'input') {
  return {
    schema: 'swf/change-quality-gate-result',
    version: 1,
    status: 'rejected',
    readOnly: true,
    errors: [{ code, reason, field }]
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function runPrQualityGate({ argv = process.argv.slice(2) } = {}) {
  if (argv.length > 1) {
    return resultForError(
      'invalid_cli_arguments',
      'Provide one packet path or JSON on standard input; no action flags are supported.'
    );
  }

  try {
    const source = argv[0] && argv[0] !== '-' ? await readFile(argv[0], 'utf8') : await readStdin();
    return evaluateChangeQuality(JSON.parse(source));
  } catch (cause) {
    const reason = cause instanceof SyntaxError
      ? 'The supplied evidence packet is not valid JSON.'
      : `The evidence packet could not be read: ${cause instanceof Error ? cause.message : String(cause)}`;
    return resultForError(cause instanceof SyntaxError ? 'invalid_json' : 'input_read_failed', reason);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runPrQualityGate();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== 'accepted') process.exitCode = 1;
}
