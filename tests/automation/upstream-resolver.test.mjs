import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadUpstreamResolverModule() {
  return import('../../scripts/ci/lib/upstream-resolver.mjs');
}

const planningWithFilesSource = {
  name: 'planning-with-files',
  type: 'git',
  url: 'https://github.com/OthmanAdi/planning-with-files',
  github: {
    owner: 'OthmanAdi',
    repo: 'planning-with-files'
  },
  path: 'harness/upstream/planning-with-files',
  resolution: {
    strategy: 'latest-release',
    allowPrerelease: false,
    fallbacks: []
  }
};

const pinnedCommitSource = {
  ...planningWithFilesSource,
  resolution: {
    strategy: 'pinned-commit',
    pinnedRef: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  }
};

test('latest-release ignores prereleases by default', async () => {
  const { resolveSourceTarget } = await loadUpstreamResolverModule();

  const resolved = await resolveSourceTarget(planningWithFilesSource, {
    listReleases: async () => [
      { tag_name: 'v6.2.0-rc.1', prerelease: true, draft: false },
      { tag_name: 'v6.1.1', prerelease: false, draft: false }
    ],
    gitLsRemote: async (_url, refs) => ({
      refs: {
        [refs[0]]: 'tag-object-sha',
        [refs[1]]: 'd884ae04edebef577e82ff7c4e143debd0bbec99'
      }
    })
  });

  assert.equal(resolved.strategy, 'latest-release');
  assert.equal(resolved.resolved.kind, 'latest-release');
  assert.equal(resolved.resolved.version, 'v6.1.1');
  assert.equal(resolved.resolved.commitSha, 'd884ae04edebef577e82ff7c4e143debd0bbec99');
});

test('latest-release skips draft releases even when they are newer', async () => {
  const { resolveSourceTarget } = await loadUpstreamResolverModule();

  const resolved = await resolveSourceTarget(planningWithFilesSource, {
    listReleases: async () => [
      { tag_name: 'v6.2.0', prerelease: false, draft: true },
      { tag_name: 'v6.1.1', prerelease: false, draft: false }
    ],
    gitLsRemote: async (_url, refs) => ({
      refs: {
        [refs[0]]: 'tag-object-sha',
        [refs[1]]: 'd884ae04edebef577e82ff7c4e143debd0bbec99'
      }
    })
  });

  assert.equal(resolved.resolved.kind, 'latest-release');
  assert.equal(resolved.resolved.version, 'v6.1.1');
});

test('latest-release uses latest-tag fallback only when configured', async () => {
  const { resolveSourceTarget } = await loadUpstreamResolverModule();

  const resolved = await resolveSourceTarget(
    {
      ...planningWithFilesSource,
      resolution: {
        strategy: 'latest-release',
        allowPrerelease: false,
        fallbacks: ['latest-tag']
      }
    },
    {
      listReleases: async () => [],
      gitLsRemote: async (_url, refs) => {
        if (refs.length === 1 && refs[0] === 'refs/tags/*') {
          return {
            refs: {
              'refs/tags/v6.1.1': 'tag-object-sha',
              'refs/tags/v6.1.1^{}': 'd884ae04edebef577e82ff7c4e143debd0bbec99'
            }
          };
        }

        if (refs.length === 2 && refs[0] === 'refs/tags/v6.1.1') {
          return {
            refs: {
              [refs[0]]: 'tag-object-sha',
              [refs[1]]: 'd884ae04edebef577e82ff7c4e143debd0bbec99'
            }
          };
        }

        return { refs: {} };
      }
    }
  );

  assert.equal(resolved.fallbackUsed, true);
  assert.equal(resolved.resolved.kind, 'latest-tag');
});

test('latest-release rejects API failure instead of silently falling back to branch-head', async () => {
  const { resolveSourceTarget } = await loadUpstreamResolverModule();

  await assert.rejects(
    resolveSourceTarget(planningWithFilesSource, {
      listReleases: async () => {
        throw new Error('release resolution failed: api down');
      },
      gitLsRemote: async () => {
        throw new Error('should not resolve tags after release failure without fallback');
      }
    }),
    /release resolution failed/i
  );
});

test('pinned-commit returns the configured SHA without release lookup', async () => {
  const { resolveSourceTarget } = await loadUpstreamResolverModule();

  const resolved = await resolveSourceTarget(pinnedCommitSource, {
    gitLsRemote: async () => {
      throw new Error('should not reach git ls-remote for pinned commit');
    }
  });

  assert.equal(resolved.resolved.kind, 'pinned-commit');
  assert.equal(resolved.resolved.commitSha, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});

test('pinned-tag resolves the configured tag to its commit SHA', async () => {
  const { resolveSourceTarget } = await loadUpstreamResolverModule();

  const resolved = await resolveSourceTarget(
    {
      ...planningWithFilesSource,
      resolution: {
        strategy: 'pinned-tag',
        pinnedRef: 'v6.1.1'
      }
    },
    {
      gitLsRemote: async (_url, refs) => ({
        refs: {
          [refs[0]]: 'tag-object-sha',
          [refs[1]]: 'd884ae04edebef577e82ff7c4e143debd0bbec99'
        }
      })
    }
  );

  assert.equal(resolved.resolved.kind, 'pinned-tag');
  assert.equal(resolved.resolved.ref, 'v6.1.1');
  assert.equal(resolved.resolved.commitSha, 'd884ae04edebef577e82ff7c4e143debd0bbec99');
});

test('branch-head resolves HEAD directly for branch fallback sources', async () => {
  const { resolveSourceTarget } = await loadUpstreamResolverModule();

  const resolved = await resolveSourceTarget(
    {
      ...planningWithFilesSource,
      resolution: {
        strategy: 'branch-head',
        fallbacks: []
      }
    },
    {
      gitLsRemote: async (_url, refs) => ({
        refs: {
          [refs[0]]: '1111111111111111111111111111111111111111'
        }
      })
    }
  );

  assert.equal(resolved.resolved.kind, 'branch-head');
  assert.equal(resolved.resolved.ref, 'HEAD');
  assert.equal(resolved.resolved.commitSha, '1111111111111111111111111111111111111111');
});

test('resolveTagCommit peels annotated tags to the commit SHA', async () => {
  const { resolveTagCommit } = await loadUpstreamResolverModule();

  const commitSha = await resolveTagCommit(
    planningWithFilesSource.url,
    'v6.1.1',
    {
      gitLsRemote: async (_url, refs) => ({
        refs: {
          [refs[0]]: 'tag-object-sha',
          [refs[1]]: 'd884ae04edebef577e82ff7c4e143debd0bbec99'
        }
      })
    }
  );

  assert.equal(commitSha, 'd884ae04edebef577e82ff7c4e143debd0bbec99');
});

test('resolveSourceTarget latest-tag resolves the latest annotated tag commit', async () => {
  const { resolveSourceTarget } = await loadUpstreamResolverModule();

  const resolved = await resolveSourceTarget(
    {
      ...planningWithFilesSource,
      resolution: {
        strategy: 'latest-tag',
        allowPrerelease: false,
        fallbacks: []
      }
    },
    {
      gitLsRemote: async (_url, refs) => {
        if (refs.length === 1 && refs[0] === 'refs/tags/*') {
          return {
            refs: {
              'refs/tags/v6.0.0': 'aaaaaaa',
              'refs/tags/v6.1.1': 'tag-object-sha',
              'refs/tags/v6.1.1^{}': 'd884ae04edebef577e82ff7c4e143debd0bbec99'
            }
          };
        }

        return {
          refs: {
            [refs[0]]: 'tag-object-sha',
            [refs[1]]: 'd884ae04edebef577e82ff7c4e143debd0bbec99'
          }
        };
      }
    }
  );

  assert.equal(resolved.resolved.kind, 'latest-tag');
  assert.equal(resolved.resolved.version, 'v6.1.1');
  assert.equal(resolved.resolved.commitSha, 'd884ae04edebef577e82ff7c4e143debd0bbec99');
});

test('buildFetchPlan returns an exact detached fetch plan for pinned commits', async () => {
  const { buildFetchPlan } = await loadUpstreamResolverModule();

  const plan = buildFetchPlan({
    resolved: {
      kind: 'pinned-commit',
      ref: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  });

  assert.equal(plan.fetchRef, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(plan.checkoutCommitSha, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});
