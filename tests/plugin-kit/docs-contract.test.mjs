import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public installation docs retain only the Codex page', async () => {
  for (const retiredDoc of [
    'docs/install/claude-code.md',
    'docs/install/cursor.md',
    'docs/install/copilot.md'
  ]) {
    await assert.rejects(readFile(retiredDoc, 'utf8'), { code: 'ENOENT' });
  }
});

test('release and installation docs describe one Codex Trio plugin artifact', async () => {
  const [releaseArtifacts, pluginPackages, platformSupport, codex] = await Promise.all([
    readFile('docs/release-plugin-artifacts.md', 'utf8'),
    readFile('docs/install/plugin-packages.md', 'utf8'),
    readFile('docs/install/platform-support.md', 'utf8'),
    readFile('docs/install/codex.md', 'utf8')
  ]);

  assert.match(releaseArtifacts, /harness-codex-plugin-<version>\.tgz/);
  assert.match(releaseArtifacts, /\.codex-plugin\/plugin\.json/);
  assert.match(releaseArtifacts, /four Trio skills/i);
  assert.doesNotMatch(releaseArtifacts, /harness-runtime|harness-(?:claude-code|cursor|copilot)-plugin/i);

  assert.match(pluginPackages, /harness-codex-plugin-<version>\.tgz/);
  assert.match(pluginPackages, /codex plugin marketplace add/);
  assert.doesNotMatch(pluginPackages, /harness-(?:claude-code|cursor|copilot)-plugin/i);

  assert.match(platformSupport, /Codex is the only managed native target/i);
  assert.match(platformSupport, /generic\/manual fallback/i);
  assert.match(codex, /harness-codex-plugin-<version>\.tgz/);
  assert.match(codex, /codex plugin marketplace add/);

  for (const doc of [pluginPackages, codex]) {
    assert.match(doc, /PLUGIN_ROOT=.*harness-codex-plugin-\$\{VERSION\}/);
    assert.match(doc, /if test -e "\$PLUGIN_ROOT"; then/);
    assert.match(doc, /Refusing existing destination/);
    assert.doesNotMatch(doc, /mkdir -p "\$PLUGIN_ROOT"/);
  }
});

test('README names the Trio as the sole durable authority and only seven public commands', async () => {
  const readme = await readFile('README.md', 'utf8');

  for (const file of ['task_plan.md', 'findings.md', 'progress.md']) {
    assert.match(readme, new RegExp(`planning/active/<task-id>/${file}`));
  }
  assert.doesNotMatch(readme, /reconciliation\.md|companion[- ]plan|ChiefOps|receipt|registry/i);
  assert.match(
    readme,
    /`install`, `sync`, `doctor`, `trio`, `verify`, `checkpoint`, and `token-audit`/
  );
  assert.doesNotMatch(readme, /`(?:status|update|fetch|active-summary|summary|record|worktree-preflight|worktree-name)`/);
  assert.doesNotMatch(readme, /(?:profile|hooks|MCP)\s+(?:is|are|stays|remains|supports|projects)/i);
});

test('maintenance docs name only the current upstream source config and lock', async () => {
  const maintenance = await readFile('docs/maintenance.md', 'utf8');

  assert.match(maintenance, /harness\/upstream\/sources\.json/);
  assert.match(maintenance, /harness\/upstream\/\.source-lock\.json/);
  assert.doesNotMatch(maintenance, /harness\/upstream\/\.source-heads\.json/);
});
