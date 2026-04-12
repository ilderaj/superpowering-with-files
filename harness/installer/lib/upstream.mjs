import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const UPSTREAM_ROOT = 'harness/upstream';
const CANDIDATE_ROOT = '.harness/upstream-candidates';

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
  if (metadata.schemaVersion !== 1 || !metadata.sources || typeof metadata.sources !== 'object') {
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

export function parseSourceFilter(args) {
  const sourceArg = args.find((arg) => arg.startsWith('--source='));
  return sourceArg ? sourceArg.slice('--source='.length) : 'all';
}

export function parseFromPath(args) {
  const fromArg = args.find((arg) => arg.startsWith('--from='));
  return fromArg ? fromArg.slice('--from='.length) : undefined;
}

export async function stageLocalCandidate(rootDir, sourceName, fromPath) {
  if (!fromPath) {
    throw new Error(`Source ${sourceName} requires --from=/path/to/source for local candidate staging.`);
  }
  const candidatePath = candidatePathForSource(rootDir, sourceName);
  await rm(candidatePath, { recursive: true, force: true });
  await mkdir(path.dirname(candidatePath), { recursive: true });
  await cp(path.resolve(fromPath), candidatePath, { recursive: true });
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

export async function stageGitCandidate(rootDir, sourceName, source) {
  if (!source.url) {
    throw new Error(`Git source ${sourceName} must define a url.`);
  }
  const candidatePath = candidatePathForSource(rootDir, sourceName);
  await rm(candidatePath, { recursive: true, force: true });
  await mkdir(path.dirname(candidatePath), { recursive: true });
  await runGit(['clone', '--depth=1', source.url, candidatePath]);
  await rm(path.join(candidatePath, '.git'), { recursive: true, force: true });
  return candidatePath;
}

export async function applyCandidate(rootDir, sourceName, source) {
  const candidatePath = candidatePathForSource(rootDir, sourceName);
  const targetPath = upstreamPathForSource(rootDir, sourceName, source);
  await rm(targetPath, { recursive: true, force: true });
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(candidatePath, targetPath, { recursive: true });
  return targetPath;
}
