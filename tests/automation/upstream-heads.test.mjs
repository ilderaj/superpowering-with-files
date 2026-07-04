import { test } from 'node:test';
import assert from 'node:assert/strict';

const upstreamSources = [
  {
    name: 'superpowers',
    url: 'https://github.com/obra/superpowers',
    resolution: {
      strategy: 'latest-release'
    }
  },
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

  assert.deepEqual(resolvedSources, [
    'superpowers',
    'planning-with-files'
  ]);
});

test('probeUpstreamHeads returns no_changes when release tag stays the same even if branch head moved', async () => {
  const { probeUpstreamHeads } = await loadUpstreamHeadsModule();
  const recordedLock = {
    schemaVersion: 2,
    refreshedAt: '2026-07-04T00:00:00.000Z',
    sources: {
      superpowers: {
        strategy: 'latest-release',
        fallbackUsed: false,
        resolved: {
          kind: 'latest-release',
          version: 'v6.1.1',
          ref: 'v6.1.1',
          commitSha: '1111111111111111111111111111111111111111'
        }
      },
      'planning-with-files': {
        strategy: 'latest-release',
        fallbackUsed: false,
        resolved: {
          kind: 'latest-release',
          version: 'v3.2.0',
          ref: 'v3.2.0',
          commitSha: '2222222222222222222222222222222222222222'
        }
      }
    }
  };

  const result = await probeUpstreamHeads({
    sources: upstreamSources,
    recordedHeads: recordedLock,
    resolveSource: async (source) => {
      if (source.name === 'superpowers') {
        return {
          name: source.name,
          strategy: 'latest-release',
          fallbackUsed: false,
          resolved: {
            kind: 'latest-release',
            version: 'v6.1.1',
            ref: 'v6.1.1',
            commitSha: '1111111111111111111111111111111111111111'
          }
        };
      }

      if (source.name === 'planning-with-files') {
        return {
          name: source.name,
          strategy: 'latest-release',
          fallbackUsed: false,
          resolved: {
            kind: 'latest-release',
            version: 'v3.2.0',
            ref: 'v3.2.0',
            commitSha: '2222222222222222222222222222222222222222'
          }
        };
      }

      throw new Error(`Unexpected upstream source: ${source.name}`);
    }
  });

  assert.equal(result.status, 'no_changes');
  assert.deepEqual(result.changedSources, []);
  assert.equal(result.previousLock.sources.superpowers.resolved.version, 'v6.1.1');
  assert.equal(result.resolvedLock.sources.superpowers.resolved.commitSha, '1111111111111111111111111111111111111111');
});

test('probeUpstreamHeads marks changes_detected when any resolved fingerprint changes', async () => {
  const { probeUpstreamHeads } = await loadUpstreamHeadsModule();

  const result = await probeUpstreamHeads({
    sources: upstreamSources,
    recordedHeads: {
      schemaVersion: 2,
      sources: {
        superpowers: {
          strategy: 'latest-release',
          resolved: {
            kind: 'latest-release',
            version: 'v6.0.3',
            ref: 'v6.0.3',
            commitSha: '1111111111111111111111111111111111111111'
          }
        },
        'planning-with-files': {
          strategy: 'latest-release',
          resolved: {
            kind: 'latest-release',
            version: 'v3.2.0',
            ref: 'v3.2.0',
            commitSha: '2222222222222222222222222222222222222222'
          }
        }
      }
    },
    resolveSource: async (source) => {
      if (source.name === 'superpowers') {
        return {
          name: source.name,
          strategy: 'latest-release',
          fallbackUsed: false,
          resolved: {
            kind: 'latest-release',
            version: 'v6.1.1',
            ref: 'v6.1.1',
            commitSha: '3333333333333333333333333333333333333333'
          }
        };
      }

      return {
        name: source.name,
        strategy: 'latest-release',
        fallbackUsed: false,
        resolved: {
          kind: 'latest-release',
          version: 'v3.2.0',
          ref: 'v3.2.0',
          commitSha: '2222222222222222222222222222222222222222'
        }
      };
    }
  });

  assert.equal(result.status, 'changes_detected');
  assert.deepEqual(result.changedSources, ['superpowers']);
  assert.equal(result.resolvedLock.sources.superpowers.resolved.version, 'v6.1.1');
  assert.equal(result.sourceHeads.superpowers, '3333333333333333333333333333333333333333');
});
