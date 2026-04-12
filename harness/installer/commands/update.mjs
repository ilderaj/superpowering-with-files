import {
  applyCandidate,
  loadUpstreamSources,
  parseSourceFilter
} from '../lib/upstream.mjs';

function selectedSources(sources, filter) {
  if (filter === 'all') return Object.entries(sources);
  if (!sources[filter]) {
    throw new Error(`Unknown upstream source: ${filter}`);
  }
  return [[filter, sources[filter]]];
}

export async function updateCommand(args = []) {
  const rootDir = process.cwd();
  const sources = await loadUpstreamSources(rootDir);
  const filter = parseSourceFilter(args);
  const updated = [];

  for (const [sourceName, source] of selectedSources(sources, filter)) {
    updated.push(await applyCandidate(rootDir, sourceName, source));
  }

  console.log(`Updated ${updated.length} upstream source(s): ${updated.join(', ')}`);
}
