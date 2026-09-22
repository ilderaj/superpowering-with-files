#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { renderCheckpoint } from '../harness/core/skills/linear-work-control/lib/linear-work-control.mjs';
import { recordCheckpointShadow } from '../harness/trio/core/shadow.mjs';

export function parseInput(text) {
  return JSON.parse(text);
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '--trace-dir') {
      const value=argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      flags[arg.slice(2)] = value;
    }
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!flags.input) throw new Error('--input file|- is required');
  return flags;
}

async function readSource(source) {
  return source === '-' ? new Promise((resolve, reject) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { text += chunk; });
    process.stdin.on('end', () => resolve(text));
    process.stdin.on('error', reject);
  }) : readFile(source, 'utf8');
}

function phaseOf(observation) {
  return observation?.request?.subject?.phase ?? null;
}

export async function runCheckpoint({ checkpoint, observations = [], directory = '.harness/decision-trace' } = {}) {
  // Render first: malformed checkpoint errors retain renderCheckpoint's exact
  // failure semantics and no shadow work can hide them.
  const rendered = renderCheckpoint(checkpoint);
  const expectedPhase = checkpoint.phase ?? 'checkpoint';
  const diagnostics = [];
  const phaseMismatches = new Set();
  const prepared = Array.isArray(observations) ? observations.map((observation, index) => {
    const observedPhase = phaseOf(observation);
    if (observedPhase !== expectedPhase || (observation?.phase !== undefined && observation.phase !== expectedPhase)) {
      phaseMismatches.add(index);
      diagnostics.push(`shadow observation ${index}: phase-mismatch (expected ${expectedPhase}, got ${observedPhase})`);
      return null;
    }
    return observation;
  }) : observations;

  let shadow;
  try {
    shadow = await recordCheckpointShadow({ checkpoint, observations: prepared, directory });
  } catch (error) {
    // A valid render remains successful if shadow plumbing fails unexpectedly.
    diagnostics.push(`shadow exception: ${error.message}`);
    shadow = { results: [], summary: { total: 0, traceFailures: 1 } };
  }
  if (phaseMismatches.size > 0) {
    shadow = {
      ...shadow,
      results: shadow.results.map((result, index) => phaseMismatches.has(index)
        ? { ...result, status: 'unevaluable', unevaluable: true, reason: 'phase-mismatch' }
        : result)
    };
  }
  if (shadow.summary?.traceFailures) diagnostics.push(`shadow trace failures: ${shadow.summary.traceFailures}`);
  return { stdout: `${rendered}\n`, shadow, diagnostics };
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  const input = parseInput(await readSource(flags.input));
  const result = await runCheckpoint({
    checkpoint: input.checkpoint,
    observations: input.observations,
    directory: flags['trace-dir'] || '.harness/decision-trace'
  });
  process.stdout.write(result.stdout);
  for (const diagnostic of result.diagnostics) process.stderr.write(`${diagnostic}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
