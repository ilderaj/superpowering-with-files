import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(repo, 'scripts/audit-plugin-cutover.mjs');
const entries = [
  ['trio', 'trio'], ['trio/dev', 'dev'], ['trio/office', 'office'],
  ['trio/safety', 'safety'], ['chiefops', 'chiefops']
];
const names = entries.map(([, name]) => name);

test('cutover audit exposes duplicate policy and skill entries, then their removal', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'swf-cutover-audit-'));
  try {
    const project = path.join(root, 'project');
    const globalAgents = path.join(root, 'home/.codex/AGENTS.md');
    const plugin = path.join(root, 'plugin');
    const prompt = path.join(root, 'prompt.json');
    await mkdir(path.dirname(globalAgents), { recursive: true });
    await mkdir(project, { recursive: true });
    await mkdir(path.join(plugin, '.codex-plugin'), { recursive: true });
    await writeFile(globalAgents, '# Trio Entry Policy\nOld routing\n');
    await writeFile(path.join(project, 'AGENTS.md'), '# Trio Entry Policy\nOld routing\n');
    await writeFile(path.join(plugin, '.codex-plugin/plugin.json'), JSON.stringify({ version: 'test-version' }));
    for (const [sourcePath, name] of entries) {
      const local = path.join(project, '.agents/skills', sourcePath, 'SKILL.md');
      const installed = path.join(plugin, 'skills', sourcePath, 'SKILL.md');
      await mkdir(path.dirname(local), { recursive: true });
      await mkdir(path.dirname(installed), { recursive: true });
      await writeFile(local, `${name} instructions\n`);
      await writeFile(installed, `${name} instructions\n`);
    }
    const oldPrompt = [
      { role: 'developer', content: [{ type: 'input_text', text: names.map(name => `- ${name}: local\n- harness-codex-plugin:${name}: installed\n`).join('') }] },
      { role: 'user', content: [{ type: 'input_text', text: 'project policy' }] }
    ];
    await writeFile(prompt, JSON.stringify(oldPrompt));
    const run = () => {
      const child = spawnSync(process.execPath, [script, '--project', project, '--global-agents', globalAgents, '--plugin-root', plugin, '--prompt-json', prompt], { encoding: 'utf8' });
      assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout);
    };
    const before = run();
    assert.equal(before.policy.identical, true);
    assert.equal(before.plugin.version, 'test-version');
    assert.equal(before.skills.filter(x => x.localAndPluginIdentical).length, 5);
    assert.deepEqual(before.prompt.duplicatedSkillNames, names);

    await writeFile(path.join(project, '.agents/skills/trio/SKILL.md'), 'changed local instructions\n');
    assert.equal(run().skills.find(x => x.name === 'trio').localAndPluginIdentical, false);

    await rm(path.join(project, '.agents/skills'), { recursive: true });
    await writeFile(path.join(project, 'AGENTS.md'), '# Project-specific plugin policy\n');
    await writeFile(prompt, JSON.stringify([{ ...oldPrompt[0], content: [{ type: 'input_text', text: names.map(name => `- harness-codex-plugin:${name}: installed\n`).join('') }] }, oldPrompt[1]]));
    const after = run();
    assert.equal(after.policy.identical, false);
    assert.equal(after.skills.filter(x => x.local.exists).length, 0);
    assert.deepEqual(after.prompt.duplicatedSkillNames, []);
    assert.equal((await readFile(globalAgents, 'utf8')).includes('Old routing'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
