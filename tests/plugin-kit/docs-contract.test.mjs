import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function assertNoLegacyOperatorClaims(doc, { name }) {
  assert.doesNotMatch(doc, /\[ChiefOps\]\(chiefops\.md\)|harness_chiefops_board/, `${name} must not advertise ChiefOps controls`);
  assert.doesNotMatch(doc, /\[MCP Read-Only Compatibility\]\(mcp-read-only-compatibility\.md\)|MCP read-only compatibility/i, `${name} must not advertise the retired MCP tier`);
  assert.doesNotMatch(doc, /\.\/scripts\/harness\s+(?:chiefops|status|active-summary|summary|record|lifecycle-sweep)\b/, `${name} must not advertise retired command wrappers`);
  assert.doesNotMatch(doc, /execution receipts?|companion[- ]plan|reconciliation\.md|lifecycle anchors?/i, `${name} must not make legacy lifecycle state current`);
  assert.doesNotMatch(doc, /workspace-skills|--skills-profile|\bminimal-global\b|\bhigh-assurance\b/i, `${name} must not make the retired profile plane current`);
}

test('public installation docs retain only the Codex page', async () => {
  for (const retiredDoc of [
    'docs/install/claude-code.md',
    'docs/install/cursor.md',
    'docs/install/copilot.md'
  ]) {
    await assert.rejects(readFile(retiredDoc, 'utf8'), { code: 'ENOENT' });
  }
});

test('profile documentation plane is retired and architecture states the Trio boundary', async () => {
  for (const retiredPath of [
    'docs/skill-profiles.md',
    'docs/skill-profile-evaluation.md',
    'tests/fixtures/skill-profile-evaluation/tasks.json'
  ]) {
    await assert.rejects(readFile(retiredPath, 'utf8'), { code: 'ENOENT' });
  }

  const architecture = await readFile('docs/architecture.md', 'utf8');

  assert.doesNotMatch(architecture, /workspace-skills|--skills-profile|\bminimal-global\b|\bhigh-assurance\b/i);
  assert.doesNotMatch(architecture, /GitHub Copilot|Cursor|Claude Code/i);
  for (const file of ['task_plan.md', 'findings.md', 'progress.md']) {
    assert.match(architecture, new RegExp(`planning/active/<task-id>/${file}`));
  }
  assert.match(architecture, /Route work first, then select one capability family: `dev`, `office`, or `safety`\./);
  assert.match(architecture, /Codex is the only managed native target\./);
  assert.match(architecture, /generic\/manual fallback/i);
  assert.match(architecture, /The Host owns worker and subtask lifecycle, permissions, continuation, and external or human gates\./);
  assert.match(architecture, /This repository does not project planning hooks or scripts\./);
  assert.match(architecture, /Host hook configuration remains Host-owned and non-authoritative\./);
});

test('non-Codex repository projections are retired and current documents retain the K3 boundary', async () => {
  for (const retiredPath of [
    'CLAUDE.md',
    '.claude/launch.json',
    '.cursor/rules/harness.mdc',
    '.github/copilot-instructions.md',
    'docs/compatibility/copilot-planning-with-files.md'
  ]) {
    await assert.rejects(readFile(retiredPath, 'utf8'), { code: 'ENOENT' });
  }

  const documents = await Promise.all([
    readFile('tests/evals/repo-workflow-replays/acceptance-scenarios.md', 'utf8'),
    readFile('tests/evals/repo-workflow-acceptance-matrix.md', 'utf8'),
    readFile('docs/cloud-dev-harness.md', 'utf8'),
    readFile('docs/cloud-dev-parity.md', 'utf8')
  ]);

  for (const document of documents) {
    const nonK3Document = document.replaceAll(
      'Copilot cloud dispatch is a separate external-behavior K3 DAG, not a repository host projection.',
      ''
    );

    assert.doesNotMatch(document, /Cursor|Claude Code|--targets=all|--hooks/i);
    assert.doesNotMatch(nonK3Document, /Copilot(?:-only)? (?:install|overlap|default|preview|workspace|both-scope|target-specific|instructions|projection)/i);
    assert.doesNotMatch(nonK3Document, /GitHub Copilot\s*\|\s*Yes\s*\|\s*Yes/i);
    assert.match(document, /Codex is the only managed local target\./);
    assert.match(document, /Other environments use a generic\/manual fallback\./);
    assert.match(document, /Copilot cloud dispatch is a separate external-behavior K3 DAG, not a repository host projection\./);
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
  assert.match(releaseArtifacts, /ChiefOps governance companion|chiefops/i);
  assert.doesNotMatch(releaseArtifacts, /harness-runtime|harness-(?:claude-code|cursor|copilot)-plugin/i);

  assert.match(pluginPackages, /harness-codex-plugin-<version>\.tgz/);
  assert.match(pluginPackages, /codex plugin marketplace add/);
  assert.match(pluginPackages, /ChiefOps governance companion|chiefops/i);
  assert.doesNotMatch(pluginPackages, /harness-(?:claude-code|cursor|copilot)-plugin/i);

  assert.match(platformSupport, /Codex is the only managed native target/i);
  assert.match(platformSupport, /generic\/manual fallback/i);
  assert.match(codex, /harness-codex-plugin-<version>\.tgz/);
  assert.match(codex, /codex plugin marketplace add/);
  assert.match(codex, /ChiefOps governance companion|chiefops/i);

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

test('operator docs describe the Trio and omit retired control surfaces', async () => {
  for (const retiredDoc of [
    'docs/chiefops.md',
    'docs/chiefops-v0b.md',
    'docs/mcp-read-only-compatibility.md',
    'docs/chief-worker-workflows.md'
  ]) {
    await assert.rejects(readFile(retiredDoc, 'utf8'), { code: 'ENOENT' });
  }

  const [workflows, maintenance] = await Promise.all([
    readFile('docs/workflows.md', 'utf8'),
    readFile('docs/maintenance.md', 'utf8')
  ]);

  for (const file of ['task_plan.md', 'findings.md', 'progress.md']) {
    assert.match(workflows, new RegExp(`planning/active/<task-id>/${file}`));
  }
  assert.match(workflows, /Select one capability pack: `dev`, `office`, or `safety`\./);
  assert.match(workflows, /The Host owns worker and subtask lifecycle, permissions, continuation, and external or human gates\./);
  assert.match(workflows, /manual fallback/i);
  assert.match(workflows, /Worker completion is only a candidate pending Chief acceptance and Trio writeback\./);
  assert.match(workflows, /Requested model and effort are intent\. Without authenticated Host evidence, actual remains `unknown`\./);
  assert.match(workflows, /^## Optional Contracts$/m);
  assert.match(maintenance, /\[Workflows\]\(workflows\.md#optional-contracts\)/);

  assertNoLegacyOperatorClaims(workflows, { name: 'workflows' });
  assertNoLegacyOperatorClaims(maintenance, { name: 'maintenance' });
});

test('PWF hook-plane docs are retired and Host hooks remain non-authoritative', async () => {
  await assert.rejects(readFile('docs/compatibility/hooks.md', 'utf8'), { code: 'ENOENT' });

  const [architecture, matrix] = await Promise.all([
    readFile('docs/architecture.md', 'utf8'),
    readFile('tests/evals/repo-workflow-acceptance-matrix.md', 'utf8')
  ]);

  assert.doesNotMatch(architecture, /hook-config|hook-script|task-scoped planning hook output|planning-with-files.*hook/i);
  assert.match(architecture, /This repository does not project planning hooks or scripts\./);
  assert.match(architecture, /Host hook configuration remains Host-owned and non-authoritative\./);
  assert.doesNotMatch(matrix, /task-scoped planning hook output|tests\/hooks\/task-scoped-hook\.test\.mjs/);
  assert.match(matrix, /native Trio planning files and main-session round start/);
});
