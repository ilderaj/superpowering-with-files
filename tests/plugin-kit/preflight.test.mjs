import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';
import { validateBuiltPlugin } from '../../packages/plugin-kit/src/preflight.mjs';
import { supportedPluginTargets } from '../../packages/plugin-kit/src/platform-contracts.mjs';

test('validateBuiltPlugin accepts generated plugin roots for every supported target', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-'));

  for (const target of supportedPluginTargets) {
    const build = await buildPlugin({ target, version: '1.0.9', outDir: path.join(workDir, 'plugins') });
    const result = await validateBuiltPlugin({ target, pluginRoot: build.pluginRoot });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  }
});

test('validateBuiltPlugin reports missing required files', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-missing-'));
  const build = await buildPlugin({ target: 'cursor', version: '1.0.9', outDir: path.join(workDir, 'plugins') });
  await rm(path.join(build.pluginRoot, 'skills/harness/SKILL.md'));

  const result = await validateBuiltPlugin({ target: 'cursor', pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('skills/harness/SKILL.md')));
});

test('validateBuiltPlugin rejects runtime planning state', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-state-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.9', outDir: path.join(workDir, 'plugins') });
  await mkdir(path.join(build.pluginRoot, 'runtime/planning'), { recursive: true });
  await writeFile(path.join(build.pluginRoot, 'runtime/planning/active'), 'bad state\n');

  const result = await validateBuiltPlugin({ target: 'codex', pluginRoot: build.pluginRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('runtime/planning/active')));
});
