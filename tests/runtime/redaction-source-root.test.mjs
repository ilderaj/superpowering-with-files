import { test } from 'node:test';
import assert from 'node:assert/strict';

import { redactText, sanitizeText, truncateText } from '../../harness/runtime/redaction.mjs';
import { resolveHarnessSourcePath, resolveHarnessSourceRoot } from '../../harness/runtime/source-root.mjs';

test('resolveHarnessSourceRoot falls back to the current root when HARNESS_SOURCE_ROOT is unset', () => {
  assert.equal(resolveHarnessSourceRoot('/repo/worktree', {}), '/repo/worktree');
});

test('resolveHarnessSourceRoot trims HARNESS_SOURCE_ROOT before resolving', () => {
  assert.equal(
    resolveHarnessSourceRoot('/repo/worktree', { HARNESS_SOURCE_ROOT: '  harness/core  ' }),
    '/repo/worktree/harness/core'
  );
});

test('resolveHarnessSourcePath joins segments from the resolved harness source root', () => {
  assert.equal(
    resolveHarnessSourcePath('/repo/worktree', 'runtime', 'source-root.mjs'),
    '/repo/worktree/runtime/source-root.mjs'
  );
  assert.equal(
    resolveHarnessSourcePath('/repo/worktree', 'runtime', 'source-root.mjs'),
    resolveHarnessSourcePath('/repo/worktree', 'runtime', 'source-root.mjs')
  );
});

test('redactText replaces the configured home directory, GitHub tokens, and bearer tokens', () => {
  const input = [
    '/home/tester/project',
    'token=ghp_abcdefghijklmnopqrstuvwxyz1234',
    'Authorization: Bearer secretBearerTokenValue12345'
  ].join('\n');

  const result = redactText(input, { homeDir: '/home/tester' });

  assert.doesNotMatch(result, /\/home\/tester/);
  assert.doesNotMatch(result, /ghp_abcdefghijklmnopqrstuvwxyz1234/);
  assert.doesNotMatch(result, /secretBearerTokenValue12345/);
  assert.match(result, /<HOME>\/project/);
  assert.match(result, /<REDACTED_TOKEN>/);
  assert.match(result, /Bearer <REDACTED_TOKEN>/);
});

test('truncateText preserves short strings and appends a truncation marker only when needed', () => {
  assert.equal(truncateText('short', 10), 'short');
  assert.equal(truncateText('1234567890', 10), '1234567890');
  assert.equal(truncateText('12345678901', 10), '1234567890\n…truncated…');
});

test('sanitizeText redacts before truncating', () => {
  const input = '/home/tester/secret ghp_abcdefghijklmnopqrstuvwxyz1234';
  const result = sanitizeText(input, { homeDir: '/home/tester', maxLength: 18 });

  assert.doesNotMatch(result, /\/home\/tester/);
  assert.doesNotMatch(result, /ghp_/);
  assert.match(result, /<HOME>/);
  assert.match(result, /…truncated…/);
});
