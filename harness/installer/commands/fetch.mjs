import path from 'node:path';
import {
  loadUpstreamSources,
  parseFromPath,
  parseSourceFilter,
  stageGitCandidate,
  stageLocalCandidate
} from '../lib/upstream.mjs';
import { updateState } from '../lib/state.mjs';

function selectedSources(sources, filter) {
  if (filter === 'all') return Object.entries(sources);
  if (!sources[filter]) {
    throw new Error(`Unknown upstream source: ${filter}`);
  }
  return [[filter, sources[filter]]];
}

function relativeStatePath(rootDir, targetPath) {
  return path.relative(rootDir, targetPath).split(path.sep).join('/');
}

export async function fetchCommand(args = []) {
  const rootDir = process.cwd();
  const sources = await loadUpstreamSources(rootDir);
  const filter = parseSourceFilter(args);
  const fromPath = parseFromPath(args);
  const stagedBySource = [];

  for (const [sourceName, source] of selectedSources(sources, filter)) {
    if (source.type === 'git') {
      stagedBySource.push({ sourceName, path: await stageGitCandidate(rootDir, sourceName, source) });
      continue;
    }
    if (source.type === 'local-initial-import') {
      stagedBySource.push({ sourceName, path: await stageLocalCandidate(rootDir, sourceName, fromPath) });
      continue;
    }
    throw new Error(`Unsupported upstream source type: ${source.type}`);
  }

  const lastFetch = new Date().toISOString();
  await updateState(rootDir, (state) => ({
    ...state,
    lastFetch,
    upstream: Object.fromEntries([
      ...Object.entries(state.upstream),
      ...stagedBySource.map(({ sourceName, path: candidatePath }) => [
        sourceName,
        {
          ...(state.upstream[sourceName] ?? {}),
          candidatePath: relativeStatePath(rootDir, candidatePath),
          lastFetch
        }
      ])
    ])
  }));

  const stagedPaths = stagedBySource.map((entry) => entry.path);
  console.log(`Fetched ${stagedBySource.length} upstream candidate(s): ${stagedPaths.join(', ')}`);
}
