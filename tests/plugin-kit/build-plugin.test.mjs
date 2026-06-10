import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';
import { platformContracts, supportedPluginTargets } from '../../packages/plugin-kit/src/platform-contracts.mjs';

test('plugin source configs exist for every supported target', async () => {
  for (const target of supportedPluginTargets) {
    const config = JSON.parse(await readFile(`plugins/${target}/plugin.harness.json`, 'utf8'));
    assert.equal(config.target, target);
    assert.equal(config.version, '1.0.8');
    assert.equal(config.components.mcp.serverName, 'harness-runtime');
    assert.equal(config.components.skills.profile, 'minimal-global');
  }
});

test('buildPlugin creates self-contained plugin roots without runtime planning state', async () => {
  const outDir = path.join(await fsMkdtemp('harness-build-plugin-'), 'plugins');

  for (const target of supportedPluginTargets) {
    const build = await buildPlugin({ target, version: '1.0.8', outDir });
    const contract = platformContracts[target];

    assert.equal(build.target, target);
    assert.equal(build.version, '1.0.8');
    assert.equal(build.pluginRoot, path.join(outDir, contract.packageName));

    for (const requiredFile of contract.requiredFiles) {
      await access(path.join(build.pluginRoot, requiredFile));
    }

    const mcpConfig = JSON.parse(await readFile(path.join(build.pluginRoot, '.mcp.json'), 'utf8'));
    assert.equal(mcpConfig.mcpServers['harness-runtime'].command, 'node');
    const hookConfig = JSON.parse(await readFile(path.join(build.pluginRoot, 'hooks/hooks.json'), 'utf8'));
    const hookConfigText = JSON.stringify(hookConfig);
    assert.ok(Object.values(hookConfig.hooks).some((entries) => Array.isArray(entries) && entries.length > 0));
    assert.match(hookConfigText, /\.\/hooks\/task-scoped-hook\.sh/);
    assert.doesNotMatch(hookConfigText, /\.(codex|claude|cursor|github)\/hooks\/task-scoped-hook\.sh/);
    assert.doesNotMatch(hookConfigText, /\$HOME\/\.\/hooks\/task-scoped-hook\.sh/);

    await access(path.join(build.pluginRoot, 'runtime/harness/mcp/stdio.mjs'));
    await access(path.join(build.pluginRoot, 'runtime/scripts/harness'));

    const harnessSkill = await readFile(path.join(build.pluginRoot, 'skills/harness/SKILL.md'), 'utf8');
    assert.match(harnessSkill, /Harness Runtime/);
    assert.doesNotMatch(harnessSkill, /planning\/active/);

    await assert.rejects(access(path.join(build.pluginRoot, 'runtime/planning/active')), /ENOENT/);
  }
});

test('Codex plugin manifest follows the supported manifest shape', async () => {
  const outDir = path.join(await fsMkdtemp('harness-codex-manifest-'), 'plugins');
  const build = await buildPlugin({ target: 'codex', version: '1.0.8', outDir });
  const manifest = JSON.parse(await readFile(path.join(build.pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));

  assert.equal(manifest.name, 'harness-codex-plugin');
  assert.equal(manifest.version, '1.0.8');
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.mcpServers, './.mcp.json');
  assert.equal(manifest.hooks, './hooks/hooks.json');
  assert.equal(manifest.interface.displayName, 'Harness for Codex');
  assert.ok(Array.isArray(manifest.interface.defaultPrompt));
  assert.ok(manifest.interface.defaultPrompt.length > 0);
  assert.equal(manifest.components, undefined);
});

test('Claude Code plugin manifest avoids ignored Codex interface metadata', async () => {
  const outDir = path.join(await fsMkdtemp('harness-claude-manifest-'), 'plugins');
  const build = await buildPlugin({ target: 'claude-code', version: '1.0.8', outDir });
  const manifest = JSON.parse(await readFile(path.join(build.pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));

  assert.equal(manifest.name, 'harness-claude-code-plugin');
  assert.equal(manifest.version, '1.0.8');
  assert.equal(manifest.interface, undefined);
});

async function fsMkdtemp(prefix) {
  const { mkdtemp } = await import('node:fs/promises');
  return mkdtemp(path.join(os.tmpdir(), prefix));
}
