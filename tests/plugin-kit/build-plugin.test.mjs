import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';
import { platformContracts, supportedPluginTargets, trioSkillSourceMap } from '../../packages/plugin-kit/src/platform-contracts.mjs';

test('plugin source config exists for the Codex and Agent Plugins targets', async () => {
  assert.deepEqual(supportedPluginTargets, ['codex', 'agent-plugins']);

  for (const target of supportedPluginTargets) {
    const config = JSON.parse(await readFile(`plugins/${target}/plugin.harness.json`, 'utf8'));
    assert.equal(config.target, target);
    assert.equal(config.version, '1.3.0');
    assert.equal(config.components, undefined);
  }
});

test('buildPlugin creates a Codex root with the Trio skills, ChiefOps companion, and harness skills', async () => {
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
    'references',
    'safety'
  ]);
  assert.deepEqual((await readdir(path.join(build.pluginRoot, 'skills/chiefops'))).sort(), [
    'SKILL.md',
    'references'
  ]);
  await assertFileMatches(build.pluginRoot, 'skills/trio/SKILL.md', /name: trio/);
  await assertFileMatches(build.pluginRoot, 'skills/trio/dev/SKILL.md', /name: dev/);
  await assertFileMatches(build.pluginRoot, 'skills/trio/office/SKILL.md', /name: office/);
  await assertFileMatches(build.pluginRoot, 'skills/trio/safety/SKILL.md', /name: safety/);
  await assertFileMatches(build.pluginRoot, 'skills/chiefops/SKILL.md', /name: chiefops/);
  await assertFileMatches(build.pluginRoot, 'skills/chiefops/SKILL.md', /governance.only/i);
  await assertFileMatches(build.pluginRoot, 'skills/chiefops/SKILL.md', /not a runner|no runner/i);

  await access(path.join(build.pluginRoot, 'skills/planning-with-files/SKILL.md'));
  await access(path.join(build.pluginRoot, 'skills/planning-with-files/scripts/session-catchup.py'));
  await access(path.join(build.pluginRoot, 'skills/planning-with-files/templates/task_plan.md'));
  await access(path.join(build.pluginRoot, 'skills/overengineering-review/SKILL.md'));
  await access(path.join(build.pluginRoot, 'skills/simplification-ledger/SKILL.md'));
  await assert.rejects(access(path.join(build.pluginRoot, 'skills/planning-with-files/.codex')), /ENOENT/);

  for (const forbiddenPath of ['skills/harness', 'hooks', '.mcp.json', 'mcp', 'runtime', 'node_modules']) {
    await assert.rejects(access(path.join(build.pluginRoot, forbiddenPath)), /ENOENT/);
  }
});

test('buildPlugin copies harness skills from a .codex-ancestor root while excluding source descendants', async () => {
  const fixtureRoot = path.join(await fsMkdtemp('harness-build-worktree-'), '.codex', 'worktree');
  const fixtureEntries = [
    'plugins/agent-plugins/plugin.harness.json',
    ...trioSkillSourceMap.flatMap(({ source, support }) => [source, ...support.map((reference) => reference.source)]),
    'harness/core/upstream-overlays/planning-with-files',
    'harness/core/skills/overengineering-review',
    'harness/core/skills/simplification-ledger'
  ];

  for (const relativePath of fixtureEntries) {
    const destination = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(process.cwd(), relativePath), destination, { recursive: true });
  }

  const undeclaredReference = 'harness/trio/skill/references/undeclared.md';
  await writeFile(path.join(fixtureRoot, undeclaredReference), 'not declared support');

  const outDir = path.join(await fsMkdtemp('harness-build-worktree-output-'), 'plugins');
  const build = await buildPlugin({
    target: 'agent-plugins',
    version: '1.1.0',
    outDir,
    rootDir: fixtureRoot
  });
  await assert.rejects(access(path.join(build.pluginRoot, 'skills/trio/references/undeclared.md')), /ENOENT/);
  const planningRoot = path.join(build.pluginRoot, 'skills/planning-with-files');

  await access(path.join(planningRoot, 'SKILL.md'));
  await assert.rejects(
    access(path.join(planningRoot, '.codex/hooks/permission_request.py')),
    /ENOENT/
  );
});

test('buildPlugin creates an Agent Plugins root with eight flat skills and a portable manifest', async () => {
  const outDir = path.join(await fsMkdtemp('harness-build-portable-'), 'plugins');
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir });
  const contract = platformContracts['agent-plugins'];

  assert.equal(build.target, 'agent-plugins');
  assert.equal(build.version, '1.1.0');
  assert.equal(build.pluginRoot, path.join(outDir, contract.packageName));

  for (const requiredFile of contract.requiredFiles) {
    await access(path.join(build.pluginRoot, requiredFile));
  }

  assert.deepEqual((await readdir(path.join(build.pluginRoot, 'skills'))).sort(), [
    'chiefops',
    'dev',
    'office',
    'overengineering-review',
    'planning-with-files',
    'safety',
    'simplification-ledger',
    'trio'
  ]);

  for (const name of ['trio', 'dev', 'office', 'safety', 'chiefops']) {
    const skill = trioSkillSourceMap.find((skill) => skill.name === name);
    assert.deepEqual((await readdir(path.join(build.pluginRoot, 'skills', name))).sort(), skill.support.length ? ['SKILL.md', 'references'] : ['SKILL.md']);
    await assertFileMatches(build.pluginRoot, `skills/${name}/SKILL.md`, new RegExp(`name: ${name}`));
  }

  for (const name of ['planning-with-files', 'overengineering-review', 'simplification-ledger']) {
    await access(path.join(build.pluginRoot, 'skills', name, 'SKILL.md'));
    await assertFileMatches(build.pluginRoot, `skills/${name}/SKILL.md`, new RegExp(`name: ${name}`));
  }
  await access(path.join(build.pluginRoot, 'skills/planning-with-files/scripts/session-catchup.py'));
  await access(path.join(build.pluginRoot, 'skills/planning-with-files/templates/task_plan.md'));
  await access(path.join(build.pluginRoot, 'skills/overengineering-review/rubric.md'));
  await assert.rejects(access(path.join(build.pluginRoot, 'skills/planning-with-files/.codex')), /ENOENT/);

  await assert.rejects(access(path.join(build.pluginRoot, 'skills/trio/dev/SKILL.md')), /ENOENT/);
  await assert.rejects(access(path.join(build.pluginRoot, '.codex-plugin/plugin.json')), /ENOENT/);

  for (const forbiddenPath of ['skills/harness', 'hooks', '.mcp.json', 'mcp', 'runtime', 'node_modules']) {
    await assert.rejects(access(path.join(build.pluginRoot, forbiddenPath)), /ENOENT/);
  }
});

test('Agent Plugins manifest follows the closed portable v1 schema', async () => {
  const outDir = path.join(await fsMkdtemp('harness-portable-manifest-'), 'plugins');
  const build = await buildPlugin({ target: 'agent-plugins', version: '1.1.0', outDir });
  const manifest = JSON.parse(await readFile(path.join(build.pluginRoot, 'plugin.json'), 'utf8'));

  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name, 'harness-agent-plugins');
  assert.equal(manifest.version, '1.1.0');
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.repository, 'https://github.com/ilderaj/superpowering-with-files');
  assert.ok(Array.isArray(manifest.keywords) && manifest.keywords.length > 0);
  assert.equal(manifest.author.name, 'Superpowering With Files');
  assert.equal(manifest.skills, undefined);
  assert.equal(manifest.mcp, undefined);
  assert.equal(manifest.interface, undefined);
  assert.equal(manifest.capabilities, undefined);
  assert.equal(manifest.extensions, undefined);
  assert.deepEqual(
    Object.keys(manifest).sort(),
    ['$schema', 'author', 'description', 'keywords', 'license', 'name', 'repository', 'version']
  );
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


test('both package layouts preserve every declared reference and local SKILL link', async () => {
  for (const target of supportedPluginTargets) {
    const outDir = await fsMkdtemp('harness-reference-package-');
    const build = await buildPlugin({ target, version: '1.2.0', outDir });
    const contract = platformContracts[target];
    for (const skill of trioSkillSourceMap) {
      const destination = contract.skillDestinations[skill.name];
      const markdown = await readFile(path.join(build.pluginRoot, destination), 'utf8');
      const links = [...markdown.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map((match) => match[1]);
      assert.deepEqual([...links].sort(), skill.support.map((reference) => reference.relativePath).sort());
      for (const reference of skill.support) {
        const output = path.posix.join(path.posix.dirname(destination), reference.relativePath);
        assert.ok(contract.requiredFiles.includes(output));
        assert.deepEqual(await readFile(path.join(build.pluginRoot, output)), await readFile(reference.source));
      }
    }
  }
});
