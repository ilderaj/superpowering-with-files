import { access, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { discoverAuthorityRoot } from './authority-root.mjs';

function splitRoots(rawValue) {
  return rawValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveAllowedRoots(cwd) {
  const discovered = await discoverAuthorityRoot(cwd);
  const roots = [cwd, discovered.rootDir];
  const extraRoots = process.env.HARNESS_MCP_ROOTS ? splitRoots(process.env.HARNESS_MCP_ROOTS) : [];

  for (const extraRoot of extraRoots) {
    const resolvedExtraRoot = path.resolve(cwd, extraRoot);
    if (await pathExists(resolvedExtraRoot)) {
      roots.push(await realpath(resolvedExtraRoot));
    }
  }

  return [...new Set(await Promise.all(roots.map((root) => realpath(root).catch(() => path.resolve(root)))))].sort();
}

function isWithinAllowedRoot(candidateRoot, allowedRoot) {
  const relativePath = path.relative(allowedRoot, candidateRoot);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export async function resolveHarnessRoot(inputRoot, options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const authority = await discoverAuthorityRoot(cwd, { inputRoot });
  const requestedRoot = authority.requestedRoot;

  if (!(await pathExists(requestedRoot))) {
    throw new Error(`Harness MCP root does not exist: ${requestedRoot}`);
  }

  const resolvedRoot = await realpath(requestedRoot);
  const allowedRoots = options.allowedRoots ?? (await resolveAllowedRoots(cwd));

  if (!allowedRoots.some((allowedRoot) => isWithinAllowedRoot(resolvedRoot, allowedRoot))) {
    throw new Error(`Harness MCP root is not allow-listed: ${resolvedRoot}`);
  }

  return {
    cwd: authority.cwd,
    requestedRoot,
    rootDir: resolvedRoot,
    allowedRoots,
    source: authority.source,
    markerPath: authority.markerPath ?? null
  };
}
