import { access, readFile, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const AUTHORITY_OVERRIDE_RELATIVE_PATH = path.join('.harness', 'authority-root.json');
const AUTHORITY_MARKERS = [
  path.join('.harness', 'state.json'),
  path.join('planning', 'active'),
  path.join('scripts', 'harness')
];

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRealPath(targetPath) {
  return realpath(targetPath).catch(() => path.resolve(targetPath));
}

function parentDirectories(startDir) {
  const directories = [];
  let currentDir = path.resolve(startDir);

  while (true) {
    directories.push(currentDir);
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return directories;
}

function isWithinBoundary(candidateDir, boundaryDir) {
  if (!boundaryDir) {
    return true;
  }

  const relative = path.relative(boundaryDir, candidateDir);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function readOverrideFile(overridePath) {
  const parsed = JSON.parse(await readFile(overridePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid authority-root override: ${overridePath}`);
  }
  if (parsed.schemaVersion !== 1) {
    throw new Error(`Unsupported authority-root override schemaVersion in ${overridePath}`);
  }
  if (typeof parsed.authorityRoot !== 'string' || parsed.authorityRoot.trim() === '') {
    throw new Error(`authorityRoot must be a non-empty string in ${overridePath}`);
  }

  const resolvedRoot = path.resolve(path.dirname(overridePath), parsed.authorityRoot);
  if (!(await pathExists(resolvedRoot))) {
    throw new Error(`Harness authority root override does not exist: ${resolvedRoot}`);
  }

  return resolvedRoot;
}

async function findOverrideRootWithinBoundary(cwd, boundaryDir = undefined) {
  for (const candidateDir of parentDirectories(cwd)) {
    if (!isWithinBoundary(candidateDir, boundaryDir)) {
      continue;
    }
    const overridePath = path.join(candidateDir, AUTHORITY_OVERRIDE_RELATIVE_PATH);
    if (!(await pathExists(overridePath))) {
      continue;
    }

    return {
      rootDir: await resolveRealPath(await readOverrideFile(overridePath)),
      source: 'override-file',
      markerPath: await resolveRealPath(overridePath)
    };
  }

  return null;
}

async function findAncestorMarkerRootWithinBoundary(cwd, boundaryDir = undefined) {
  for (const candidateDir of parentDirectories(cwd)) {
    if (!isWithinBoundary(candidateDir, boundaryDir)) {
      continue;
    }
    for (const marker of AUTHORITY_MARKERS) {
      const markerPath = path.join(candidateDir, marker);
      if (!(await pathExists(markerPath))) {
        continue;
      }

      return {
        rootDir: await resolveRealPath(candidateDir),
        source: 'ancestor-marker',
        markerPath: await resolveRealPath(markerPath)
      };
    }
  }

  return null;
}

async function resolveGitTopLevel(cwd) {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      maxBuffer: 1024 * 1024
    });
    const resolved = stdout.trim();
    if (!resolved) {
      return null;
    }

    return {
      rootDir: await resolveRealPath(resolved),
      source: 'git-top-level',
      markerPath: null
    };
  } catch {
    return null;
  }
}

export async function discoverAuthorityRoot(cwdInput, options = {}) {
  const cwd = await resolveRealPath(cwdInput ?? options.cwd ?? process.cwd());

  if (options.inputRoot) {
    const explicitRoot = path.resolve(cwd, options.inputRoot);
    if (!(await pathExists(explicitRoot))) {
      throw new Error(`Harness authority root does not exist: ${explicitRoot}`);
    }

    return {
      cwd,
      requestedRoot: explicitRoot,
      rootDir: await resolveRealPath(explicitRoot),
      source: 'explicit',
      markerPath: null
    };
  }

  const envRoot = process.env.HARNESS_PROJECT_ROOT?.trim();
  if (envRoot) {
    const explicitRoot = path.resolve(cwd, envRoot);
    if (!(await pathExists(explicitRoot))) {
      throw new Error(`Harness authority root does not exist: ${explicitRoot}`);
    }

    return {
      cwd,
      requestedRoot: explicitRoot,
      rootDir: await resolveRealPath(explicitRoot),
      source: 'env',
      markerPath: null
    };
  }

  const gitRoot = await resolveGitTopLevel(cwd);
  const boundaryDir = gitRoot?.rootDir;

  const overrideRoot = await findOverrideRootWithinBoundary(cwd, boundaryDir);
  if (overrideRoot) {
    return {
      cwd,
      requestedRoot: overrideRoot.rootDir,
      ...overrideRoot
    };
  }

  if (gitRoot) {
    return {
      cwd,
      requestedRoot: gitRoot.rootDir,
      ...gitRoot
    };
  }

  const ancestorRoot = await findAncestorMarkerRootWithinBoundary(cwd, boundaryDir);
  if (ancestorRoot) {
    return {
      cwd,
      requestedRoot: ancestorRoot.rootDir,
      ...ancestorRoot
    };
  }

  return {
    cwd,
    requestedRoot: cwd,
    rootDir: cwd,
    source: 'cwd',
    markerPath: null
  };
}
