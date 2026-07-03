import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { loadSourceLock, loadUpstreamSourceConfig } from './upstream-config.mjs';
import { buildFetchPlan, resolveSourceTarget } from '../../../scripts/ci/lib/upstream-resolver.mjs';

const UPSTREAM_ROOT = 'harness/upstream';
const CANDIDATE_ROOT = '.harness/upstream-candidates';
const execFileAsync = promisify(execFile);

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

export async function loadResolvedSourceForFetch(rootDir, sourceName) {
  const sourcesDocument = await loadUpstreamSourceConfig(rootDir);
  const source = sourcesDocument.sources[sourceName];
  if (!source) {
    throw new Error(`Unknown upstream source: ${sourceName}`);
  }

  const sourceLock = await loadSourceLock({ rootDir });
  const resolvedSource = sourceLock.sources?.[sourceName];
  if (!resolvedSource?.resolved?.commitSha || !resolvedSource?.resolved?.ref) {
    throw new Error(
      `Missing resolved source lock for ${sourceName}. Run ./scripts/harness upstream-lock before fetch.`
    );
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

async function gitLsRemote(url, refs = []) {
  const { stdout } = await execFileAsync('git', ['ls-remote', url, ...refs], { maxBuffer: 1024 * 1024 });
  return stdout;
}

function githubRepoPathForSource(source) {
  if (source?.github?.owner && source?.github?.repo) {
    return `repos/${source.github.owner}/${source.github.repo}`;
  }

  const match = String(source?.url ?? '').match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (match) {
    return `repos/${match[1]}/${match[2]}`;
  }

  throw new Error(`Missing github repository metadata for upstream source: ${source?.name ?? '(unknown)'}`);
}

async function listReleases(_url, source) {
  const repoPath = githubRepoPathForSource(source);
  const { stdout } = await execFileAsync('gh', ['api', `${repoPath}/releases`], { maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout);
}

export async function resolveConfiguredSources({ rootDir, sources, args = [] }) {
  const sourceEntries = Object.entries(sources?.sources ?? sources ?? {});
  const filter = parseSourceFilter(args);
  const selected =
    filter === 'all'
      ? sourceEntries
      : sourceEntries.filter(([sourceName]) => sourceName === filter);

  if (selected.length === 0) {
    throw new Error(`Unknown upstream source: ${filter}`);
  }

  const resolved = [];
  for (const [sourceName, source] of selected) {
    if (source.type !== 'git') {
      throw new Error(`Unsupported upstream source type for locking: ${source.type}`);
    }
    resolved.push(
      await resolveSourceTarget(
        {
          ...source,
          name: sourceName
        },
        {
          gitLsRemote,
          listReleases
        }
      )
    );
  }

  return resolved;
}

export function buildSourceLockRecord(resolvedSources) {
  const refreshedAt = new Date().toISOString();
  return {
    schemaVersion: 2,
    refreshedAt,
    sources: Object.fromEntries(
      resolvedSources.map((source) => [
        source.name,
        {
          ...source,
          refreshedAt
        }
      ])
    )
  };
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

export async function applyCandidate(rootDir, sourceName, source) {
  const candidatePath = candidatePathForSource(rootDir, sourceName);
  const targetPath = upstreamPathForSource(rootDir, sourceName, source);
  const overlayPath = overlayPathForSource(rootDir, sourceName, source);
  await rm(targetPath, { recursive: true, force: true });
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(candidatePath, targetPath, { recursive: true, verbatimSymlinks: true });

  if (overlayPath) {
    await cp(overlayPath, targetPath, { recursive: true, force: true });
  }

  return targetPath;
}
