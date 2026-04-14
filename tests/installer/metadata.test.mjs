import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlatforms, normalizeTargets, normalizeScope } from '../../harness/installer/lib/metadata.mjs';

test('loadPlatforms reads v1 supported targets', async () => {
  const metadata = await loadPlatforms(process.cwd());
  assert.equal(metadata.defaultScope, 'workspace');
  assert.deepEqual(metadata.supportedScopes, ['workspace', 'user-global', 'both']);
  assert.ok(metadata.platforms.codex);
  assert.ok(metadata.platforms.copilot);
  assert.ok(metadata.platforms.cursor);
  assert.ok(metadata.platforms['claude-code']);
  assert.equal(metadata.unsupportedPlatforms.gemini.status, 'unsupported');
});

test('normalizeScope rejects invalid scope', () => {
  assert.equal(normalizeScope('both'), 'both');
  assert.throws(() => normalizeScope('global'), /Invalid scope/);
});

test('normalizeTargets expands all and validates names', async () => {
  const metadata = await loadPlatforms(process.cwd());
  assert.deepEqual(normalizeTargets(metadata, ['all']), ['codex', 'copilot', 'cursor', 'claude-code']);
  assert.throws(() => normalizeTargets(metadata, ['gemini']), /Unsupported target: gemini/);
  assert.throws(() => normalizeTargets(metadata, ['unknown']), /Unknown target/);
});
