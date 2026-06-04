import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AUTHORITY_OVERRIDE_RELATIVE_PATH,
  discoverAuthorityRoot
} from '../../runtime/authority-root.mjs';

function readOption(args, name, fallback = undefined) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function isWithinDirectory(candidatePath, directoryPath) {
  const relative = path.relative(directoryPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function usage() {
  return [
    'Usage: ./scripts/harness workspace-link --root <path> [--force]',
    '',
    'Create or update .harness/authority-root.json in the current workspace so leaf workspaces resolve planning and Harness state from a parent authority root.',
    '',
    'Options:',
    '  --root <path>  Existing authority root to link to',
    '  --force        Allow writing an override file even when run from the authority root itself',
    '  --help, -h     Show this help message'
  ].join('\n');
}

export async function workspaceLink(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const requestedRoot = readOption(args, 'root');
  if (!requestedRoot) {
    throw new Error('workspace-link requires --root <path>.');
  }

  const workspaceDir = path.resolve(process.cwd());
  const authority = await discoverAuthorityRoot(workspaceDir, { inputRoot: requestedRoot });
  const authorityRoot = authority.rootDir;
  const authorityCheck = await discoverAuthorityRoot(authorityRoot, { cwd: authorityRoot });

  if (authorityCheck.rootDir !== authorityRoot || authorityCheck.source === 'cwd') {
    throw new Error(`workspace-link requires --root to point to an existing authority root: ${authorityRoot}`);
  }

  if (!isWithinDirectory(workspaceDir, authorityRoot)) {
    throw new Error('workspace-link requires --root to be an ancestor authority root of the current workspace.');
  }

  if (workspaceDir === authorityRoot && !hasFlag(args, '--force')) {
    throw new Error('workspace-link refuses to write an override in the authority root itself unless --force is passed.');
  }

  const overridePath = path.join(workspaceDir, AUTHORITY_OVERRIDE_RELATIVE_PATH);
  const overrideDir = path.dirname(overridePath);
  const authorityRootRelative = path.relative(overrideDir, authorityRoot).split(path.sep).join('/') || '.';
  await mkdir(overrideDir, { recursive: true });
  await writeFile(
    overridePath,
    `${JSON.stringify({ schemaVersion: 1, authorityRoot: authorityRootRelative }, null, 2)}\n`
  );

  console.log(`Linked workspace authority root via ${path.relative(workspaceDir, overridePath) || AUTHORITY_OVERRIDE_RELATIVE_PATH}`);
}
