import {
  loadUpstreamSources,
  parseFromPath,
  parseSourceFilter,
  stageGitCandidate,
  stageLocalCandidate
} from '../lib/upstream.mjs';

function selectedSources(sources, filter) {
  if (filter === 'all') return Object.entries(sources);
  if (!sources[filter]) {
    throw new Error(`Unknown upstream source: ${filter}`);
  }
  return [[filter, sources[filter]]];
}

export async function fetchCommand(args = []) {
  const rootDir = process.cwd();
  const sources = await loadUpstreamSources(rootDir);
  const filter = parseSourceFilter(args);
  const fromPath = parseFromPath(args);
  const staged = [];

  for (const [sourceName, source] of selectedSources(sources, filter)) {
    if (source.type === 'git') {
      staged.push(await stageGitCandidate(rootDir, sourceName, source));
      continue;
    }
    if (source.type === 'local-initial-import') {
      staged.push(await stageLocalCandidate(rootDir, sourceName, fromPath));
      continue;
    }
    throw new Error(`Unsupported upstream source type: ${source.type}`);
  }

  console.log(`Fetched ${staged.length} upstream candidate(s): ${staged.join(', ')}`);
}
