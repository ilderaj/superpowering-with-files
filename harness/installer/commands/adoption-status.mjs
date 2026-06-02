import os from 'node:os';
import { computeAdoptionStatus } from '../lib/adoption.mjs';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function usage() {
  return [
    'Usage: ./scripts/harness adoption-status',
    '',
    'Print the current user-global adoption status as JSON, including any workspace-only overlay state.',
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

  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const status = await computeAdoptionStatus(rootDir, os.homedir());
  console.log(JSON.stringify(status, null, 2));
}
