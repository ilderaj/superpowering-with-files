import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';
import { validateBuiltPlugin } from '../../packages/plugin-kit/src/preflight.mjs';

test('validateBuiltPlugin accepts a generated Codex Trio plugin root', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.9', outDir: path.join(workDir, 'plugins') });
  const result = await validateBuiltPlugin({ target: 'codex', pluginRoot: build.pluginRoot });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateBuiltPlugin reports missing required files', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-missing-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.9', outDir: path.join(workDir, 'plugins') });
  await rm(path.join(build.pluginRoot, 'skills/trio/dev/SKILL.md'));

  const result = await validateBuiltPlugin({ target: 'codex', pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('skills/trio/dev/SKILL.md')));
});

test('validateBuiltPlugin rejects an entire runtime directory', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-runtime-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.9', outDir: path.join(workDir, 'plugins') });
  await mkdir(path.join(build.pluginRoot, 'runtime'), { recursive: true });
  await writeFile(path.join(build.pluginRoot, 'runtime/forbidden.mjs'), 'bad runtime\n');

  const result = await validateBuiltPlugin({ target: 'codex', pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('runtime/')));
});
