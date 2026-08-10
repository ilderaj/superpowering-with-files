import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function loadUpstreamConfigModule() {
  return import('../../harness/installer/lib/upstream-config.mjs');
}

test('normalizeUpstreamSource applies legacy branch-head defaults', async () => {
  const { normalizeUpstreamSource } = await loadUpstreamConfigModule();

  const source = normalizeUpstreamSource('planning-with-files', {
    type: 'git',
    url: 'https://github.com/OthmanAdi/planning-with-files',
    path: 'harness/upstream/planning-with-files'
  });

  assert.equal(source.resolution.strategy, 'branch-head');
  assert.equal(source.resolution.allowPrerelease, false);
  assert.deepEqual(source.resolution.fallbacks, []);
});

test('loadUpstreamSourceConfig normalizes schema v2 sources', async () => {
  const { loadUpstreamSourceConfig } = await loadUpstreamConfigModule();

  const config = await loadUpstreamSourceConfig(rootDir);

  assert.equal(config.schemaVersion, 2);
  assert.deepEqual(Object.keys(config.sources), ['planning-with-files']);
  assert.equal(config.sources['planning-with-files'].resolution.strategy, 'latest-release');
  assert.equal(config.sources['planning-with-files'].overlayPath, 'harness/core/upstream-overlays/planning-with-files');
  assert.deepEqual(config.sources['planning-with-files'].resolution.fallbacks, []);
});

test('loadSourceLock ignores legacy source-head records when no authoritative lock exists', async () => {
  const { loadSourceLock } = await loadUpstreamConfigModule();
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'upstream-config-legacy-'));
  const legacySourceHeadsPath = 'harness/upstream/.source-heads.json';

  await mkdir(path.join(tempRoot, path.dirname(legacySourceHeadsPath)), { recursive: true });
  await writeFile(
    path.join(tempRoot, legacySourceHeadsPath),
    JSON.stringify({
      schemaVersion: 1,
      refreshedAt: '2026-06-22T01:30:41.867Z',
      sources: {
        'planning-with-files': {
          name: 'planning-with-files',
          url: 'https://github.com/OthmanAdi/planning-with-files',
          headSha: '896224c4b1879920ab573417e68fd51d2ccc9072',
          refreshedAt: '2026-06-22T01:30:41.867Z'
        }
      }
    })
  );

  const lock = await loadSourceLock({ rootDir: tempRoot });

  assert.deepEqual(lock, {
    schemaVersion: 2,
    refreshedAt: null,
    sources: {}
  });
});

test('writeSourceLock persists the lock document to the default path', async () => {
  const { loadSourceLock, writeSourceLock, defaultSourceLockPath } = await loadUpstreamConfigModule();

  const tempRoot = await mkdtemp(path.join(tmpdir(), 'upstream-config-'));
  const lock = await loadSourceLock({ rootDir });

  await writeSourceLock(lock, { rootDir: tempRoot });

  const written = JSON.parse(await readFile(path.join(tempRoot, defaultSourceLockPath), 'utf8'));
  assert.equal(written.schemaVersion, 2);
  assert.equal(
    written.sources['planning-with-files'].resolved.commitSha,
    lock.sources['planning-with-files'].resolved.commitSha
  );
  assert.equal(
    written.sources['planning-with-files'].resolved.kind,
    lock.sources['planning-with-files'].resolved.kind
  );
});

test('compareResolvedFingerprints reports changes when the resolved commit moves', async () => {
  const { compareResolvedFingerprints, loadSourceLock } = await loadUpstreamConfigModule();

  const recordedLock = await loadSourceLock({ rootDir });
  const resolvedLock = structuredClone(recordedLock);
  resolvedLock.sources['planning-with-files'].resolved.commitSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  const comparison = compareResolvedFingerprints({ recordedLock, resolvedLock });

  assert.deepEqual(comparison.changedSources, ['planning-with-files']);
  assert.equal(comparison.status, 'changes_detected');
});
