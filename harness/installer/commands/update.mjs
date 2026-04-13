import path from 'node:path';
import {
  applyCandidate,
  loadUpstreamSources,
  parseSourceFilter
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

export async function updateCommand(args = []) {
  const rootDir = process.cwd();
  const sources = await loadUpstreamSources(rootDir);
  const filter = parseSourceFilter(args);
  const updatedBySource = [];

  for (const [sourceName, source] of selectedSources(sources, filter)) {
    updatedBySource.push({ sourceName, path: await applyCandidate(rootDir, sourceName, source) });
  }

  const lastUpdate = new Date().toISOString();
  await updateState(rootDir, (state) => ({
    ...state,
    lastUpdate,
    upstream: Object.fromEntries([
      ...Object.entries(state.upstream),
      ...updatedBySource.map(({ sourceName, path: appliedPath }) => [
        sourceName,
        {
          ...(state.upstream[sourceName] ?? {}),
          appliedPath: relativeStatePath(rootDir, appliedPath),
          lastUpdate
        }
      ])
    ])
  }));

  const updatedPaths = updatedBySource.map((entry) => entry.path);
  console.log(`Updated ${updatedBySource.length} upstream source(s): ${updatedPaths.join(', ')}`);
}
