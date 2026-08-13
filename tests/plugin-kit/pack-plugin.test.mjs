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
  assert.match(stdout, /skills\/trio\/SKILL\.md/);
  assert.match(stdout, /skills\/trio\/dev\/SKILL\.md/);
  assert.match(stdout, /skills\/trio\/office\/SKILL\.md/);
  assert.match(stdout, /skills\/trio\/safety\/SKILL\.md/);
  assert.doesNotMatch(stdout, /skills\/harness\/SKILL\.md/);
  assert.doesNotMatch(stdout, /(?:^|\/)hooks\//);
  assert.doesNotMatch(stdout, /(?:^|\/)\.mcp\.json$/m);
  assert.doesNotMatch(stdout, /(?:^|\/)mcp\//);
  assert.doesNotMatch(stdout, /(?:^|\/)runtime\//);
  assert.doesNotMatch(stdout, /(?:^|\/)node_modules\//);
});

test('packPlugin creates a versioned Agent Plugins tarball with flat portable skills', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-pack-portable-'));
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir: path.join(workDir, 'build') });
  const artifact = await packPlugin({
    pluginRoot: build.pluginRoot,
    target: 'agent-plugins',
    version: '1.1.0',
    outDir: path.join(workDir, 'release')
  });

  assert.equal(artifact.name, 'harness-agent-plugins-1.1.0.tgz');
  assert.equal(artifact.type, 'plugin');
  assert.equal(artifact.target, 'agent-plugins');
  await access(artifact.path);

  const { stdout } = await execFileAsync('tar', ['-tzf', artifact.path]);
  assert.match(stdout, /(?:^|\/)plugin\.json$/m);
  assert.match(stdout, /skills\/trio\/SKILL\.md/);
  assert.match(stdout, /skills\/dev\/SKILL\.md/);
  assert.match(stdout, /skills\/office\/SKILL\.md/);
  assert.match(stdout, /skills\/safety\/SKILL\.md/);
  assert.match(stdout, /skills\/chiefops\/SKILL\.md/);
  assert.doesNotMatch(stdout, /skills\/trio\/dev\/SKILL\.md/);
  assert.doesNotMatch(stdout, /\.codex-plugin\/plugin\.json/);
  assert.doesNotMatch(stdout, /skills\/harness\/SKILL\.md/);
  assert.doesNotMatch(stdout, /(?:^|\/)hooks\//);
  assert.doesNotMatch(stdout, /(?:^|\/)\.mcp\.json$/m);
  assert.doesNotMatch(stdout, /(?:^|\/)mcp\//);
  assert.doesNotMatch(stdout, /(?:^|\/)runtime\//);
  assert.doesNotMatch(stdout, /(?:^|\/)node_modules\//);
});

test('buildAll creates release artifacts, manifest, checksums, and notes', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-build-all-'));
  const release = await buildAll({
    version: '1.1.0',
    release: true,
    outDir: path.join(workDir, 'release')
  });

  const names = (await readdir(release.releaseOut)).sort();
  assert.deepEqual(names, [
    'SHA256SUMS',
    'harness-agent-plugins-1.1.0.tgz',
    'harness-codex-plugin-1.1.0.tgz',
    'manifest.json',
    'release-notes.md'
  ]);

  const manifest = JSON.parse(await readFile(path.join(release.releaseOut, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, '1.1.0');
  assert.equal(manifest.artifacts.length, 2);
  assert.deepEqual(
    manifest.artifacts.map((artifact) => artifact.target).sort(),
    ['agent-plugins', 'codex']
  );
  assert.deepEqual(
    manifest.artifacts.map((artifact) => artifact.name).sort(),
    ['harness-agent-plugins-1.1.0.tgz', 'harness-codex-plugin-1.1.0.tgz']
  );

  const sums = await readFile(path.join(release.releaseOut, 'SHA256SUMS'), 'utf8');
  assert.doesNotMatch(sums, /harness-runtime-1\.1\.0\.tgz/);
  assert.match(sums, /harness-codex-plugin-1\.1\.0\.tgz/);
  assert.match(sums, /harness-agent-plugins-1\.1\.0\.tgz/);
  assert.doesNotMatch(sums, /harness-(?:claude-code|cursor|copilot)-plugin-1\.1\.0\.tgz/);

  const notes = await readFile(path.join(release.releaseOut, 'release-notes.md'), 'utf8');
  assert.match(notes, /harness-agent-plugins-1\.1\.0\.tgz/);
  assert.match(notes, /harness-codex-plugin-1\.1\.0\.tgz/);

  for (const artifact of release.artifacts) {
    const { stdout } = await execFileAsync('tar', ['-tzf', artifact.path]);
    assert.match(stdout, /skills\/trio\/SKILL\.md/);
    assert.match(stdout, /skills\/chiefops\/SKILL\.md/);
  }
});
