import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadSourceLock, loadUpstreamSourceConfig, normalizeUpstreamSource } from './upstream-config.mjs';
import { buildFetchPlan } from '../../../scripts/ci/lib/upstream-resolver.mjs';

const UPSTREAM_ROOT = 'harness/upstream';
const CANDIDATE_ROOT = '.harness/upstream-candidates';

const PLANNING_WITH_FILES_LANGUAGE_ALLOWLIST = new Set([
  'planning-with-files',
  'planning-with-files-zh',
  'planning-with-files-zht'
]);

const PLANNING_WITH_FILES_LANGUAGE_REMOVALS = [
  'planning-with-files-ar',
  'planning-with-files-de',
  'planning-with-files-es'
];
function normalizeInside(rootDir, relativePath) {
  const resolved = path.resolve(rootDir, relativePath);
  const root = path.resolve(rootDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }
  return resolved;
}

export function assertInsideRoot(targetPath, allowedRoot) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(allowedRoot);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${resolvedTarget} is outside allowed root ${resolvedRoot}`);
  }
}

export async function loadUpstreamSources(rootDir) {
  const file = path.join(rootDir, 'harness/upstream/sources.json');
  const metadata = JSON.parse(await readFile(file, 'utf8'));
  if ((metadata.schemaVersion !== 1 && metadata.schemaVersion !== 2) || !metadata.sources || typeof metadata.sources !== 'object') {
    throw new Error('Invalid upstream sources metadata.');
  }
  return metadata.sources;
}

export function upstreamPathForSource(rootDir, sourceName, source) {
  if (!source || typeof source.path !== 'string') {
    throw new Error(`Unknown upstream source: ${sourceName}`);
  }
  const targetPath = normalizeInside(rootDir, source.path);
  const allowedRoot = path.join(rootDir, UPSTREAM_ROOT);
  assertInsideRoot(targetPath, allowedRoot);
  if (path.relative(allowedRoot, targetPath).startsWith('..')) {
    throw new Error(`Upstream source ${sourceName} must stay inside ${UPSTREAM_ROOT}.`);
  }
  return targetPath;
}

export function candidatePathForSource(rootDir, sourceName) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(sourceName)) {
    throw new Error(`Invalid upstream source name: ${sourceName}`);
  }
  return path.join(rootDir, CANDIDATE_ROOT, sourceName);
}

function overlayPathForSource(rootDir, sourceName, source) {
  if (!source?.overlayPath) {
    return null;
  }

  const overlayPath = normalizeInside(rootDir, source.overlayPath);
  if (path.relative(path.resolve(rootDir), overlayPath).startsWith('..')) {
    throw new Error(`Overlay for ${sourceName} must stay inside the repository root.`);
  }

  return overlayPath;
}

export function parseSourceFilter(args) {
  const sourceArg = args.find((arg) => arg.startsWith('--source='));
  return sourceArg ? sourceArg.slice('--source='.length) : 'all';
}

export function parseFromPath(args) {
  const fromArg = args.find((arg) => arg.startsWith('--from='));
  return fromArg ? fromArg.slice('--from='.length) : undefined;
}

export async function loadFetchSourceConfig(rootDir) {
  try {
    return await loadUpstreamSourceConfig(rootDir);
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid upstream source config.') {
      const legacySources = await loadUpstreamSources(rootDir);
      return {
        schemaVersion: 1,
        sources: Object.fromEntries(
          Object.entries(legacySources).map(([name, rawSource]) => [name, normalizeUpstreamSource(name, rawSource)])
        )
      };
    }
    throw error;
  }
}

export async function loadResolvedSourceForFetch(rootDir, sourceName) {
  const sourcesDocument = await loadFetchSourceConfig(rootDir);
  const source = sourcesDocument.sources[sourceName];
  if (!source) {
    throw new Error(`Unknown upstream source: ${sourceName}`);
  }

  const sourceLock = await loadSourceLock({ rootDir });
  const resolvedSource = sourceLock.sources?.[sourceName];
  if (!resolvedSource?.resolved?.commitSha || !resolvedSource?.resolved?.ref) {
    throw new Error(`Missing resolved source lock for ${sourceName}.`);
  }

  return {
    source,
    resolvedSource
  };
}

export async function stageLocalCandidate(rootDir, sourceName, fromPath) {
  if (!fromPath) {
    throw new Error(`Source ${sourceName} requires --from=/path/to/source for local candidate staging.`);
  }
  const candidatePath = candidatePathForSource(rootDir, sourceName);
  await rm(candidatePath, { recursive: true, force: true });
  await mkdir(path.dirname(candidatePath), { recursive: true });
  await cp(path.resolve(fromPath), candidatePath, { recursive: true, verbatimSymlinks: true });
  return candidatePath;
}

export function runGit(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { stdio: 'pipe', ...options });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `git ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

export async function stageGitCandidate(rootDir, sourceName, source, resolvedSource) {
  if (!source.url) {
    throw new Error(`Git source ${sourceName} must define a url.`);
  }
  const candidatePath = candidatePathForSource(rootDir, sourceName);
  await rm(candidatePath, { recursive: true, force: true });
  await mkdir(path.dirname(candidatePath), { recursive: true });
  const fetchPlan = buildFetchPlan(resolvedSource);
  await runGit(['clone', '--no-checkout', source.url, candidatePath]);
  await runGit(['-C', candidatePath, 'fetch', '--depth=1', 'origin', fetchPlan.fetchRef]);
  await runGit(['-C', candidatePath, 'checkout', '--detach', fetchPlan.checkoutCommitSha]);
  await rm(path.join(candidatePath, '.git'), { recursive: true, force: true });
  return candidatePath;
}

export async function curatePlanningWithFilesCandidate(candidatePath, overlayPath) {
  if (overlayPath) {
    await cp(overlayPath, candidatePath, { recursive: true, force: true });
  }

  const skillsDir = path.join(candidatePath, 'skills');
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return candidatePath;
    }
    throw error;
  }

  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  for (const name of directories) {
    if (PLANNING_WITH_FILES_LANGUAGE_REMOVALS.includes(name)) {
      await rm(path.join(skillsDir, name), { recursive: true, force: true });
    }
  }

  const remaining = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const name of remaining) {
    if (!PLANNING_WITH_FILES_LANGUAGE_ALLOWLIST.has(name)) {
      throw new Error(`Unsupported planning-with-files language variant: ${name}`);
    }
  }

  return candidatePath;
}

export async function applyCandidate(rootDir, sourceName, source) {
  const candidatePath = candidatePathForSource(rootDir, sourceName);
  const targetPath = upstreamPathForSource(rootDir, sourceName, source);
  const overlayPath = overlayPathForSource(rootDir, sourceName, source);

  if (sourceName === 'planning-with-files') {
    await curatePlanningWithFilesCandidate(candidatePath, overlayPath);
  }

  await rm(targetPath, { recursive: true, force: true });
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(candidatePath, targetPath, { recursive: true, verbatimSymlinks: true });

  return targetPath;
}
