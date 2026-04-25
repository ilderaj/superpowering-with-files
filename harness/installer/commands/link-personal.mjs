import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  copyManagedFile,
  isUserManagedTarget,
  linkManagedFile,
  readUserManaged,
  replaceManagedTarget,
  targetExists,
  writeUserManaged
} from '../lib/user-managed.mjs';

const execFileAsync = promisify(execFile);

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function usage() {
  return [
    'Usage: ./scripts/harness link-personal --repo=<git-url-or-path> [--branch=main] [--dry-run]',
    '',
    'Options:',
    '  --repo=<git-url-or-path>  Personal config repository to clone or update',
    '  --branch=<name>           Branch to clone or update. Defaults to main',
    '  --dry-run                 Print the plan without writing files',
    '  --help, -h                Show this help message'
  ].join('\n');
}

function expandHome(value, homeDir) {
  return value.replace(/^~(?=\/|$)/, homeDir);
}

function normalizeRepo(value) {
  if (!value) return value;
  if (value.startsWith('.') || value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) {
    return path.resolve(value);
  }
  return value;
}

async function git(cwd, ...args) {
  return execFileAsync('git', args, { cwd, maxBuffer: 1024 * 1024 });
}

async function ensurePersonalRepo(personalRoot, repo, branch) {
  const normalizedRepo = normalizeRepo(repo);
  const gitDir = path.join(personalRoot, '.git');

  if (!(await targetExists(gitDir))) {
    await mkdir(path.dirname(personalRoot), { recursive: true });
    await git(process.cwd(), 'clone', '--branch', branch, normalizedRepo, personalRoot);
    return;
  }

  const { stdout } = await git(personalRoot, 'remote', 'get-url', 'origin');
  const currentRemote = normalizeRepo(stdout.trim());
  if (currentRemote !== normalizedRepo) {
    throw new Error(`Existing personal repo remote ${currentRemote} does not match requested repo ${normalizedRepo}.`);
  }

  await git(personalRoot, 'fetch', 'origin', branch);
  await git(personalRoot, 'checkout', branch);
  await git(personalRoot, 'pull', '--ff-only', 'origin', branch);
}

async function walkFiles(rootDir) {
  const files = [];
  const queue = [''];

  while (queue.length > 0) {
    const relative = queue.shift();
    const dirPath = path.join(rootDir, relative);
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const child = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) {
        queue.push(child);
      } else if (entry.isFile()) {
        files.push(child.split(path.sep).join('/'));
      }
    }
  }

  return files.sort();
}

function globToRegExp(pattern) {
  return new RegExp(
    `^${pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]+')}$`
  );
}

async function resolveManifestMappings(personalRoot, manifest, homeDir) {
  const files = await walkFiles(personalRoot);
  const mappings = [];

  for (const entry of manifest.map ?? []) {
    const sourcePattern = entry.src;
    const destPattern = expandHome(entry.dest, homeDir);
    const mode = entry.mode;
    const regex = globToRegExp(sourcePattern);
    const matches = files.filter((relativePath) => regex.test(relativePath));
    const basePrefix = sourcePattern.includes('*')
      ? sourcePattern.slice(0, sourcePattern.indexOf('*'))
      : path.posix.dirname(sourcePattern) === '.'
        ? ''
        : `${path.posix.dirname(sourcePattern)}/`;

    if (matches.length === 0) {
      throw new Error(`Manifest source pattern matched nothing: ${sourcePattern}`);
    }

    for (const match of matches) {
      const relativeTarget =
        sourcePattern.includes('*') && (destPattern.endsWith('/') || destPattern.endsWith(path.sep))
          ? match.slice(basePrefix.length)
          : path.posix.basename(match);
      const targetPath =
        matches.length > 1 || destPattern.endsWith('/') || destPattern.endsWith(path.sep)
          ? path.join(destPattern, relativeTarget)
          : destPattern;

      mappings.push({
        mode,
        sourcePath: path.join(personalRoot, match),
        targetPath: path.resolve(targetPath)
      });
    }
  }

  return mappings;
}

async function applyMapping(mapping, userManaged) {
  const exists = await targetExists(mapping.targetPath);
  if (exists && !isUserManagedTarget(mapping.targetPath, userManaged)) {
    throw new Error(`Refusing to overwrite existing non-managed path: ${mapping.targetPath}`);
  }

  if (exists) {
    await replaceManagedTarget(mapping.targetPath);
  }

  if (mapping.mode === 'copy') {
    await copyManagedFile(mapping.sourcePath, mapping.targetPath);
    return;
  }

  if (mapping.mode === 'link') {
    await linkManagedFile(mapping.sourcePath, mapping.targetPath);
    return;
  }

  throw new Error(`Unsupported personal mapping mode: ${mapping.mode}`);
}

export async function linkPersonal(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }

  const repo = readOption(args, 'repo', '');
  if (!repo) {
    throw new Error('link-personal requires --repo=<git-url-or-path>.');
  }

  const homeDir = os.homedir();
  const branch = readOption(args, 'branch', 'main');
  const dryRun = args.includes('--dry-run');
  const personalRoot = path.join(homeDir, '.agent-config/personal');

  await ensurePersonalRepo(personalRoot, repo, branch);
  const manifest = JSON.parse(await readFile(path.join(personalRoot, 'manifest.json'), 'utf8'));
  const mappings = await resolveManifestMappings(personalRoot, manifest, homeDir);
  const userManaged = await readUserManaged(homeDir);

  if (dryRun) {
    console.log(JSON.stringify({ personalRoot, branch, mappings }, null, 2));
    return;
  }

  for (const mapping of mappings) {
    if (!mapping.targetPath.startsWith(`${path.resolve(homeDir)}${path.sep}`)) {
      throw new Error(`Personal mapping target must stay inside HOME: ${mapping.targetPath}`);
    }
    await applyMapping(mapping, userManaged);
  }

  await writeUserManaged(homeDir, {
    schemaVersion: 1,
    repo: normalizeRepo(repo),
    branch,
    personalRoot,
    paths: [...new Set(mappings.map((mapping) => mapping.targetPath))].sort(),
    mappings
  });

  console.log(`Linked personal config from ${normalizeRepo(repo)}.`);
}
