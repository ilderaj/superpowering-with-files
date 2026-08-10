import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';
import { platformContracts, supportedPluginTargets } from '../../packages/plugin-kit/src/platform-contracts.mjs';

test('plugin source config exists only for the Codex target', async () => {
  assert.deepEqual(supportedPluginTargets, ['codex']);

  for (const target of supportedPluginTargets) {
    const config = JSON.parse(await readFile(`plugins/${target}/plugin.harness.json`, 'utf8'));
    assert.equal(config.target, target);
    assert.equal(config.version, '1.0.14');
    assert.equal(config.components, undefined);
  }
});

test('buildPlugin creates a Codex root with exactly four Trio skills plus one ChiefOps companion', async () => {
  const outDir = path.join(await fsMkdtemp('harness-build-plugin-'), 'plugins');
  const build = await buildPlugin({ target: 'codex', version: '1.0.9', outDir });
  const contract = platformContracts.codex;

  assert.equal(build.target, 'codex');
  assert.equal(build.version, '1.0.9');
  assert.equal(build.pluginRoot, path.join(outDir, contract.packageName));

  for (const requiredFile of contract.requiredFiles) {
    await access(path.join(build.pluginRoot, requiredFile));
  }

  assert.deepEqual((await readdir(path.join(build.pluginRoot, 'skills/trio'))).sort(), [
    'SKILL.md',
    'dev',
    'office',
    'safety'
  ]);
  assert.deepEqual((await readdir(path.join(build.pluginRoot, 'skills/chiefops'))).sort(), [
    'SKILL.md'
  ]);
  await assertFileMatches(build.pluginRoot, 'skills/trio/SKILL.md', /name: trio/);
  await assertFileMatches(build.pluginRoot, 'skills/trio/dev/SKILL.md', /name: dev/);
  await assertFileMatches(build.pluginRoot, 'skills/trio/office/SKILL.md', /name: office/);
  await assertFileMatches(build.pluginRoot, 'skills/trio/safety/SKILL.md', /name: safety/);
  await assertFileMatches(build.pluginRoot, 'skills/chiefops/SKILL.md', /name: chiefops/);
  await assertFileMatches(build.pluginRoot, 'skills/chiefops/SKILL.md', /governance companion/i);
  await assertFileMatches(build.pluginRoot, 'skills/chiefops/SKILL.md', /not a runner|no runner/i);

  for (const forbiddenPath of ['skills/harness', 'hooks', '.mcp.json', 'mcp', 'runtime', 'node_modules']) {
    await assert.rejects(access(path.join(build.pluginRoot, forbiddenPath)), /ENOENT/);
  }
});

test('Codex plugin manifest follows the supported manifest shape', async () => {
  const outDir = path.join(await fsMkdtemp('harness-codex-manifest-'), 'plugins');
  const build = await buildPlugin({ target: 'codex', version: '1.0.9', outDir });
  const manifest = JSON.parse(await readFile(path.join(build.pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));

  assert.equal(manifest.name, 'harness-codex-plugin');
  assert.equal(manifest.version, '1.0.9');
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.mcpServers, undefined);
  assert.equal(manifest.hooks, undefined);
  assert.equal(manifest.interface.displayName, 'Harness for Codex');
  assert.deepEqual(manifest.interface.capabilities, ['Skills']);
  assert.doesNotMatch(JSON.stringify(manifest.interface.defaultPrompt), /doctor|record progress/i);
  assert.equal(manifest.components, undefined);
});

test('buildPlugin rejects every non-Codex target', async () => {
  const outDir = path.join(await fsMkdtemp('harness-non-codex-'), 'plugins');

  for (const target of ['claude-code', 'cursor', 'copilot']) {
    await assert.rejects(
      buildPlugin({ target, version: '1.0.9', outDir }),
      new RegExp(`Unsupported plugin target: ${target}`)
    );
  }
});

async function assertFileMatches(root, relativePath, expression) {
  assert.match(await readFile(path.join(root, relativePath), 'utf8'), expression);
}

async function fsMkdtemp(prefix) {
  const { mkdtemp } = await import('node:fs/promises');
  return mkdtemp(path.join(os.tmpdir(), prefix));
}
