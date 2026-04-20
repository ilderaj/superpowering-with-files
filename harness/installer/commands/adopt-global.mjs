import os from 'node:os';
import path from 'node:path';
import { sync } from './sync.mjs';
import { verify } from './verify.mjs';
import {
  adoptionReceiptPath,
  computeAdoptionStatus,
  createSuccessReceipt,
  ensureUserGlobalState,
  parseAdoptionTargets,
  writeAdoptionFailure,
  writeAdoptionReceipt
} from '../lib/adoption.mjs';
import { readHarnessHealth } from '../lib/health.mjs';

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
    'Usage: ./scripts/harness adopt-global [--targets=<list>|all] [--skills-profile=<name>] [--projection=link|portable] [--hooks=off|on] [--mode=ensure|force] [--output=<dir>]',
    '',
    'Options:',
    '  --targets=<list>|all       Global targets to adopt. Defaults to the existing user-global install.',
    '  --skills-profile=<name>    Override the skills profile when bootstrapping or forcing state.',
    '  --projection=link|portable Override projection mode when bootstrapping or forcing state.',
    '  --hooks=off|on             Override hook mode when bootstrapping or forcing state.',
    '  --mode=ensure|force        Ensure the existing user-global state or rewrite it.',
    '  --output=<dir>             Verification report directory. Defaults to .harness/adoption/verification',
    '  --help, -h                 Show this help message'
  ].join('\n');
}

export async function adoptGlobal(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const rootDir = process.cwd();
  const homeDir = os.homedir();
  const verificationOutput = readOption(args, 'output', '.harness/adoption/verification');
  const nextState = await ensureUserGlobalState(rootDir, {
    homeDir,
    targets: parseAdoptionTargets(readOption(args, 'targets', '')),
    skillProfile: readOption(args, 'skills-profile', undefined),
    projectionMode: readOption(args, 'projection', undefined),
    hookMode: readOption(args, 'hooks', undefined),
    mode: readOption(args, 'mode', 'ensure')
  });

  await sync([]);
  await verify([`--output=${verificationOutput}`]);

  const health = await readHarnessHealth(rootDir, homeDir);
  if (health.problems.length > 0) {
    await writeAdoptionFailure(rootDir, {
      schemaVersion: 1,
      status: 'apply_failed',
      failedAt: new Date().toISOString(),
      problems: health.problems
    });
    throw new Error(`Global adoption failed health checks: ${health.problems.join(' | ')}`);
  }

  const receipt = await createSuccessReceipt(rootDir, nextState, {
    verificationReportPath: path.join(verificationOutput, 'latest.json')
  });
  await writeAdoptionReceipt(rootDir, receipt);

  const status = await computeAdoptionStatus(rootDir, homeDir);
  console.log(
    JSON.stringify(
      {
        ...status,
        receiptPath: path.relative(rootDir, adoptionReceiptPath(rootDir)).split(path.sep).join('/')
      },
      null,
      2
    )
  );
}
