import os from 'node:os';
import path from 'node:path';
import { computeAdoptionStatus } from '../lib/adoption.mjs';
import { assessCodexModelDefault } from '../lib/codex-model-config.mjs';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith('--' + name + '='));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf('--' + name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error('Missing value for --' + name + '.');
  return value;
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
  const expectedModel = readOption(args, 'expected-model');
  const expectedReasoning = readOption(args, 'expected-reasoning');
  if (Boolean(expectedModel) !== Boolean(expectedReasoning)) {
    throw new Error('expected-model and expected-reasoning must be supplied together.');
  }
  if (expectedModel) {
    status.codexModelDefault = await assessCodexModelDefault({
      codexHome: path.join(os.homedir(), '.codex'),
      expectedModel,
      expectedReasoning
    });
  }
  console.log(JSON.stringify(status, null, 2));
}
