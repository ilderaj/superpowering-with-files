import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildArtifactManifest } from '../../packages/plugin-kit/src/artifact-manifest.mjs';
import { sha256File } from '../../packages/plugin-kit/src/sha256.mjs';

test('sha256File returns a lowercase hex digest', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-sha-'));
  const file = path.join(dir, 'artifact.txt');
  await writeFile(file, 'harness\n');

  assert.equal(
    await sha256File(file),
    'c7eacb8ccadb7a650ad4eac69aca2d8bbb57d759d785ee07de32526d7a69c93f'
  );
});

test('buildArtifactManifest records versioned artifact names and checksums', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-manifest-'));
  const artifactPath = path.join(dir, 'harness-codex-plugin-1.0.6.tgz');
  await writeFile(artifactPath, 'codex plugin\n');

  const manifest = await buildArtifactManifest({
    version: '1.0.6',
    artifacts: [
      {
        target: 'codex',
        type: 'plugin',
        path: artifactPath
      }
    ]
  });

  assert.equal(manifest.version, '1.0.6');
  assert.equal(manifest.artifacts.length, 1);
  assert.equal(manifest.artifacts[0].name, 'harness-codex-plugin-1.0.6.tgz');
  assert.equal(manifest.artifacts[0].target, 'codex');
  assert.equal(manifest.artifacts[0].type, 'plugin');
  assert.equal(manifest.artifacts[0].sha256, await sha256File(artifactPath));

  await readFile(artifactPath);
});
