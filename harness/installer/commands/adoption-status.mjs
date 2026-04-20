import os from 'node:os';
import { computeAdoptionStatus } from '../lib/adoption.mjs';

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function usage() {
  return [
    'Usage: ./scripts/harness adoption-status',
    '',
    'Print the current user-global adoption status as JSON.',
    '',
    'Options:',
    '  --help, -h  Show this help message'
  ].join('\n');
}

export async function adoptionStatus(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const status = await computeAdoptionStatus(process.cwd(), os.homedir());
  console.log(JSON.stringify(status, null, 2));
}
