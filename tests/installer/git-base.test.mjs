import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendWorktreeBase } from '../../harness/installer/lib/git-base.mjs';

test('recommendWorktreeBase preserves current non-trunk branch', () => {
  const result = recommendWorktreeBase({
    currentBranch: 'dev',
    currentSha: 'aaa111',
    upstreamBranch: 'origin/dev',
    upstreamSha: 'aaa111',
    defaultBranch: 'origin/main',
    defaultSha: 'bbb222',
    refs: {
      dev: 'aaa111',
      'origin/dev': 'aaa111',
      main: 'ccc333',
      'origin/main': 'bbb222'
    }
  });

  assert.equal(result.baseRef, 'dev');
  assert.equal(result.baseSha, 'aaa111');
  assert.match(result.reason, /active development context/);
  assert.deepEqual(result.warnings, []);
});

test('recommendWorktreeBase respects explicit base', () => {
  const result = recommendWorktreeBase(
    {
      currentBranch: 'dev',
      currentSha: 'aaa111',
      refs: {
        dev: 'aaa111',
        'origin/main': 'bbb222'
      }
    },
    { baseRef: 'origin/main' }
  );

  assert.equal(result.baseRef, 'origin/main');
  assert.equal(result.baseSha, 'bbb222');
  assert.match(result.reason, /Explicit base/);
});

test('recommendWorktreeBase keeps trunk branch when current context is trunk', () => {
  const result = recommendWorktreeBase({
    currentBranch: 'main',
    currentSha: 'bbb222',
    defaultBranch: 'origin/main',
    defaultSha: 'bbb222',
    refs: {
      main: 'bbb222',
      'origin/main': 'bbb222',
      dev: 'aaa111'
    }
  });

  assert.equal(result.baseRef, 'main');
  assert.equal(result.baseSha, 'bbb222');
  assert.match(result.reason, /trunk branch/);
});

test('recommendWorktreeBase falls back to default branch without a current branch', () => {
  const result = recommendWorktreeBase({
    currentBranch: '',
    currentSha: 'detached111',
    defaultBranch: 'origin/main',
    defaultSha: 'bbb222',
    refs: {
      'origin/main': 'bbb222'
    }
  });

  assert.equal(result.baseRef, 'origin/main');
  assert.equal(result.baseSha, 'bbb222');
  assert.match(result.reason, /default branch/);
});

test('recommendWorktreeBase reports unresolved explicit base', () => {
  const result = recommendWorktreeBase(
    {
      currentBranch: 'dev',
      currentSha: 'aaa111',
      refs: {
        dev: 'aaa111'
      }
    },
    { baseRef: 'release/missing' }
  );

  assert.equal(result.baseRef, 'release/missing');
  assert.equal(result.baseSha, undefined);
  assert.match(result.warnings.join('\n'), /could not be resolved/);
});

test('recommendWorktreeBase warns when local branch differs from remote counterpart', () => {
  const result = recommendWorktreeBase({
    currentBranch: 'dev',
    currentSha: 'aaa111',
    refs: {
      dev: 'aaa111',
      'origin/dev': 'bbb222'
    }
  });

  assert.equal(result.baseRef, 'dev');
  assert.match(result.warnings.join('\n'), /differs from origin\/dev/);
});
