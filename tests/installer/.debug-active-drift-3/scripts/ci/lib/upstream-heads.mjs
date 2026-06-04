import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const defaultSourcesPath = 'harness/upstream/sources.json';
export const defaultSourceHeadsPath = 'harness/upstream/.source-heads.json';

export function normalizeUpstreamSources(sourcesDocument) {
  const rawSources = Array.isArray(sourcesDocument)
    ? sourcesDocument
    : Object.entries(sourcesDocument?.sources ?? {}).map(([name, source]) => ({
        name,
        ...source
      }));

  return rawSources
    .filter((source) => (source.type ?? 'git') === 'git')
    .map((source) => ({
      name: source.name,
      url: source.url
    }))
    .filter((source) => source.name && source.url);
}

export async function loadUpstreamSources({
  cwd = process.cwd(),
  sourcesPath = defaultSourcesPath
} = {}) {
  const documentText = await readFile(path.resolve(cwd, sourcesPath), 'utf8');
  return normalizeUpstreamSources(JSON.parse(documentText));
}

export function getRecordedHeadSha(recordedHeads, sourceName) {
  const entry = recordedHeads?.sources?.[sourceName] ?? recordedHeads?.[sourceName];

  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return undefined;

  return entry.headSha ?? entry.sha ?? entry.observedHeadSha ?? entry.observedHead ?? entry.head;
}

export function createSourceHeadRecord({ source, headSha, timestamp }) {
  return {
    name: source.name,
    url: source.url,
    headSha,
    refreshedAt: timestamp
  };
}

export function buildSourceHeadsRecord({ sources, observedHeads, timestamp }) {
  return {
    schemaVersion: 1,
    refreshedAt: timestamp,
    sources: Object.fromEntries(
      sources.map((source) => [
        source.name,
        createSourceHeadRecord({
          source,
          headSha: observedHeads[source.name],
          timestamp
        })
      ])
    )
  };
}

export async function loadRecordedSourceHeads({
  cwd = process.cwd(),
  sourceHeadsPath = defaultSourceHeadsPath
} = {}) {
  try {
    const documentText = await readFile(path.resolve(cwd, sourceHeadsPath), 'utf8');
    return JSON.parse(documentText);
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeSourceHeadsRecord(record, {
  cwd = process.cwd(),
  sourceHeadsPath = defaultSourceHeadsPath
} = {}) {
  const targetPath = path.resolve(cwd, sourceHeadsPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

export function parseLsRemoteHead(output) {
  const firstLine = output.trim().split(/\r?\n/)[0] ?? '';
  const [headSha] = firstLine.split(/\s+/);

  if (!/^[0-9a-f]{40}$/i.test(headSha)) {
    throw new Error(`Unable to parse git ls-remote HEAD output: ${output}`);
  }

  return headSha;
}

export async function lsRemoteHead(url, { cwd = process.cwd() } = {}) {
  const { stdout } = await execFileAsync('git', ['ls-remote', url, 'HEAD'], {
    cwd,
    maxBuffer: 1024 * 1024
  });

  return parseLsRemoteHead(stdout);
}

export function compareSourceHeads({ sources, observedHeads, recordedHeads }) {
  const changedSources = sources
    .filter((source) => getRecordedHeadSha(recordedHeads, source.name) !== observedHeads[source.name])
    .map((source) => source.name);

  return {
    status: changedSources.length === 0 ? 'no_changes' : 'changes_detected',
    changedSources
  };
}

export async function probeUpstreamHeads({
  cwd = process.cwd(),
  sources,
  recordedHeads,
  lsRemoteHead: probeHead = (url) => lsRemoteHead(url, { cwd })
} = {}) {
  const gitSources = sources ? normalizeUpstreamSources(sources) : await loadUpstreamSources({ cwd });
  const sourceHeadRecord = recordedHeads ?? await loadRecordedSourceHeads({ cwd });
  const observedEntries = [];

  for (const source of gitSources) {
    observedEntries.push([source.name, await probeHead(source.url, source)]);
  }

  const observedHeads = Object.fromEntries(observedEntries);
  const comparison = compareSourceHeads({
    sources: gitSources,
    observedHeads,
    recordedHeads: sourceHeadRecord
  });

  return {
    ...comparison,
    sources: gitSources,
    sourceHeads: observedHeads,
    shouldCreateBranch: comparison.status !== 'no_changes',
    shouldOpenPullRequest: comparison.status !== 'no_changes',
    shouldRunRefreshChain: comparison.status !== 'no_changes'
  };
}