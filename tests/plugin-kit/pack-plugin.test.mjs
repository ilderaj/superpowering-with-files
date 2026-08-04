import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildAll } from '../../packages/plugin-kit/src/build-all.mjs';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';
import { packPlugin } from '../../packages/plugin-kit/src/pack-plugin.mjs';

const execFileAsync = promisify(execFile);

test('packPlugin creates a versioned plugin tarball with plugin root contents', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-pack-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.9', outDir: path.join(workDir, 'build') });
  const artifact = await packPlugin({
    pluginRoot: build.pluginRoot,
    target: 'codex',
    version: '1.0.9',
    outDir: path.join(workDir, 'release')
  });

  assert.equal(artifact.name, 'harness-codex-plugin-1.0.9.tgz');
  assert.equal(artifact.type, 'plugin');
  assert.equal(artifact.target, 'codex');
  await access(artifact.path);

  const { stdout } = await execFileAsync('tar', ['-tzf', artifact.path]);
  assert.match(stdout, /\.codex-plugin\/plugin\.json/);
  assert.match(stdout, /skills\/harness\/SKILL\.md/);
  assert.doesNotMatch(stdout, /(?:^|\/)\.mcp\.json$/m);
  assert.doesNotMatch(stdout, /(?:^|\/)mcp\//);
  assert.doesNotMatch(stdout, /(?:^|\/)runtime\//);
  assert.doesNotMatch(stdout, /(?:^|\/)node_modules\//);
});

test('buildAll creates release artifacts, manifest, checksums, and notes', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-build-all-'));
  const release = await buildAll({
    version: '1.0.9',
    release: true,
    outDir: path.join(workDir, 'release')
  });

  const names = (await readdir(release.releaseOut)).sort();
  assert.deepEqual(names, [
    'SHA256SUMS',
    'harness-claude-code-plugin-1.0.9.tgz',
    'harness-codex-plugin-1.0.9.tgz',
    'harness-copilot-plugin-1.0.9.tgz',
    'harness-cursor-plugin-1.0.9.tgz',
    'manifest.json',
    'release-notes.md'
  ]);

  const manifest = JSON.parse(await readFile(path.join(release.releaseOut, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, '1.0.9');
  assert.equal(manifest.artifacts.length, 4);

  const sums = await readFile(path.join(release.releaseOut, 'SHA256SUMS'), 'utf8');
  assert.doesNotMatch(sums, /harness-runtime-1\.0\.9\.tgz/);
  assert.match(sums, /harness-copilot-plugin-1\.0\.9\.tgz/);
});
