import { test } from 'node:test';
import assert from 'node:assert/strict';

const upstreamSources = [
  {
    name: 'planning-with-files',
    url: 'https://github.com/OthmanAdi/planning-with-files',
    resolution: {
      strategy: 'latest-release'
    }
  }
];

async function loadUpstreamHeadsModule() {
  return import('../../scripts/ci/lib/upstream-heads.mjs');
}

test('probeUpstreamHeads resolves each provided upstream source', async () => {
  const { probeUpstreamHeads } = await loadUpstreamHeadsModule();
  const resolvedSources = [];

  await probeUpstreamHeads({
    sources: {
      schemaVersion: 2,
      sources: Object.fromEntries(upstreamSources.map((source) => [source.name, source]))
    },
    recordedHeads: { sources: {} },
    resolveSource: async (source) => {
      resolvedSources.push(source.name);
      return {
        name: source.name,
        strategy: source.resolution.strategy,
        fallbackUsed: false,
        resolved: {
          kind: 'latest-release',
          version: `${source.name}-v1.0.0`,
          ref: `${source.name}-v1.0.0`,
          commitSha: `${source.name}-commit`
        }
      };
    }
  });

  assert.deepEqual(resolvedSources, ['planning-with-files']);
});

test('probeUpstreamHeads returns no_changes when release tag stays the same even if branch head moved', async () => {
  const { probeUpstreamHeads } = await loadUpstreamHeadsModule();
  const recordedLock = {
    schemaVersion: 2,
    refreshedAt: '2026-07-04T00:00:00.000Z',
    sources: {
      'planning-with-files': {
        strategy: 'latest-release',
        fallbackUsed: false,
        resolved: {
          kind: 'latest-release',
          version: 'v3.9.0',
          ref: 'v3.9.0',
          commitSha: '1111111111111111111111111111111111111111'
        }
      }
    }
  };

  const result = await probeUpstreamHeads({
    sources: upstreamSources,
    recordedHeads: recordedLock,
    resolveSource: async (source) => {
      if (source.name === 'planning-with-files') {
        return {
          name: source.name,
          strategy: 'latest-release',
          fallbackUsed: false,
          resolved: {
            kind: 'latest-release',
            version: 'v3.9.0',
            ref: 'v3.9.0',
            commitSha: '1111111111111111111111111111111111111111'
          }
        };
      }

      throw new Error(`Unexpected upstream source: ${source.name}`);
    }
  });

  assert.equal(result.status, 'no_changes');
  assert.deepEqual(result.changedSources, []);
  assert.equal(result.previousLock.sources['planning-with-files'].resolved.version, 'v3.9.0');
  assert.equal(
    result.resolvedLock.sources['planning-with-files'].resolved.commitSha,
    '1111111111111111111111111111111111111111'
  );
});

test('probeUpstreamHeads marks changes_detected when any resolved fingerprint changes', async () => {
  const { probeUpstreamHeads } = await loadUpstreamHeadsModule();

  const result = await probeUpstreamHeads({
    sources: upstreamSources,
    recordedHeads: {
      schemaVersion: 2,
      sources: {
        'planning-with-files': {
          strategy: 'latest-release',
          resolved: {
            kind: 'latest-release',
            version: 'v3.8.0',
            ref: 'v3.8.0',
            commitSha: '1111111111111111111111111111111111111111'
          }
        }
      }
    },
    resolveSource: async (source) => {
      return {
        name: source.name,
        strategy: 'latest-release',
        fallbackUsed: false,
        resolved: {
          kind: 'latest-release',
          version: 'v3.9.0',
          ref: 'v3.9.0',
          commitSha: '2222222222222222222222222222222222222222'
        }
      };
    }
  });

  assert.equal(result.status, 'changes_detected');
  assert.deepEqual(result.changedSources, ['planning-with-files']);
  assert.equal(result.resolvedLock.sources['planning-with-files'].resolved.version, 'v3.9.0');
  assert.equal(result.sourceHeads['planning-with-files'], '2222222222222222222222222222222222222222');
});

test('probeUpstreamHeads ignores unselected recorded sources during filtered runs', async () => {
  const { probeUpstreamHeads } = await loadUpstreamHeadsModule();

  const result = await probeUpstreamHeads({
    sources: [upstreamSources[0]],
    recordedHeads: {
      schemaVersion: 2,
      sources: {
        'other-source': {
          strategy: 'latest-release',
          resolved: {
            kind: 'latest-release',
            version: 'v1.0.0',
            ref: 'v1.0.0',
            commitSha: '9999999999999999999999999999999999999999'
          }
        },
        'planning-with-files': {
          strategy: 'latest-release',
          resolved: {
            kind: 'latest-release',
            version: 'v3.9.0',
            ref: 'v3.9.0',
            commitSha: '1111111111111111111111111111111111111111'
          }
        }
      }
    },
    resolveSource: async () => ({
      name: 'planning-with-files',
      strategy: 'latest-release',
      fallbackUsed: false,
      resolved: {
        kind: 'latest-release',
        version: 'v3.9.0',
        ref: 'v3.9.0',
        commitSha: '1111111111111111111111111111111111111111'
      }
    })
  });

  assert.equal(result.status, 'no_changes');
  assert.deepEqual(result.changedSources, []);
  assert.deepEqual(Object.keys(result.previousLock.sources), ['planning-with-files']);
});

test('probeUpstreamHeads passes release-resolution dependencies into the default resolver path', async () => {
  const { probeUpstreamHeads } = await loadUpstreamHeadsModule();
  const receivedDependencies = [];

  await probeUpstreamHeads({
    sources: upstreamSources,
    recordedHeads: { sources: {} },
    resolveSource: async (source, deps) => {
      receivedDependencies.push({
        sourceName: source.name,
        gitLsRemote: typeof deps?.gitLsRemote,
        listReleases: typeof deps?.listReleases
      });
      return {
        name: source.name,
        strategy: source.resolution.strategy,
        fallbackUsed: false,
        resolved: {
          kind: 'latest-release',
          version: `${source.name}-v1.0.0`,
          ref: `${source.name}-v1.0.0`,
          commitSha: `${source.name}-commit`
        }
      };
    }
  });

  assert.deepEqual(receivedDependencies, [
    {
      sourceName: 'planning-with-files',
      gitLsRemote: 'function',
      listReleases: 'function'
    }
  ]);
});
