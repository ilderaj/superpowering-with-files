import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function loadUpstreamConfigModule() {
  return import('../../harness/installer/lib/upstream-config.mjs');
}

test('normalizeUpstreamSource applies legacy branch-head defaults', async () => {
  const { normalizeUpstreamSource } = await loadUpstreamConfigModule();

  const source = normalizeUpstreamSource('superpowers', {
    type: 'git',
    url: 'https://github.com/obra/superpowers',
    path: 'harness/upstream/superpowers'
  });

  assert.equal(source.resolution.strategy, 'branch-head');
  assert.equal(source.resolution.allowPrerelease, false);
  assert.deepEqual(source.resolution.fallbacks, []);
});

test('loadUpstreamSourceConfig normalizes schema v2 sources', async () => {
  const { loadUpstreamSourceConfig } = await loadUpstreamConfigModule();

  const config = await loadUpstreamSourceConfig(rootDir);

  assert.equal(config.schemaVersion, 2);
  assert.equal(config.sources.superpowers.resolution.strategy, 'latest-release');
  assert.equal(config.sources['planning-with-files'].overlayPath, 'harness/core/upstream-overlays/planning-with-files');
  assert.deepEqual(config.sources['planning-with-files'].resolution.fallbacks, []);
});

test('loadSourceLock falls back to legacy source-head records for one migration window', async () => {
  const { loadSourceLock } = await loadUpstreamConfigModule();

  const lock = await loadSourceLock({ rootDir });

  assert.equal(lock.sources.superpowers.resolved.kind, 'branch-head');
  assert.equal(lock.sources.superpowers.resolved.commitSha, '896224c4b1879920ab573417e68fd51d2ccc9072');
});

test('writeSourceLock persists the lock document to the default path', async () => {
  const { loadSourceLock, writeSourceLock, defaultSourceLockPath } = await loadUpstreamConfigModule();

  const tempRoot = await mkdtemp(path.join(tmpdir(), 'upstream-config-'));
  const lock = await loadSourceLock({ rootDir });

  await writeSourceLock(lock, { rootDir: tempRoot });

  const written = JSON.parse(await readFile(path.join(tempRoot, defaultSourceLockPath), 'utf8'));
  assert.equal(written.schemaVersion, 2);
  assert.equal(written.sources.superpowers.resolved.commitSha, '896224c4b1879920ab573417e68fd51d2ccc9072');
});

test('compareResolvedFingerprints reports changes when the resolved commit moves', async () => {
  const { compareResolvedFingerprints, loadSourceLock } = await loadUpstreamConfigModule();

  const recordedLock = await loadSourceLock({ rootDir });
  const resolvedLock = structuredClone(recordedLock);
  resolvedLock.sources.superpowers.resolved.commitSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  const comparison = compareResolvedFingerprints({ recordedLock, resolvedLock });

  assert.deepEqual(comparison.changedSources, ['superpowers']);
  assert.equal(comparison.status, 'changes_detected');
});
