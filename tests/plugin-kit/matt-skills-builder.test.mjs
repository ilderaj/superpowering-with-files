import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';
import { loadMattSkillsSource } from '../../packages/plugin-kit/src/matt-skills-source.mjs';
import { validateBuiltPlugin } from '../../packages/plugin-kit/src/preflight.mjs';
import { validatePortablePlugin } from '../../packages/plugin-kit/src/portable-validation.mjs';

const targets = ['matt-skills-codex', 'matt-skills-agent-plugins'];

test('Matt companion builds use the verified source loader and pass preflight', async () => {
  const source = await loadMattSkillsSource();
  const outDir = path.join(await mkdtemp(path.join(os.tmpdir(), 'matt-skills-build-')), 'plugins');

  for (const target of targets) {
    const build = await buildPlugin({ target, version: '1.1.0', outDir });
    const validation = await validateBuiltPlugin({ target, pluginRoot: build.pluginRoot });
    assert.equal(validation.ok, true, validation.errors.join('\n'));

    for (const [name, body] of Object.entries(source.skills)) {
      assert.equal(await readFile(path.join(build.pluginRoot, 'skills', name, 'SKILL.md'), 'utf8'), body);
    }
    assert.equal(await readFile(path.join(build.pluginRoot, 'LICENSE'), 'utf8'), source.license);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(build.pluginRoot, 'UPSTREAM.json'), 'utf8')),
      source.metadata,
    );
  }
});

test('Matt portable validation permits only the three flat companion skills', async () => {
  const outDir = path.join(await mkdtemp(path.join(os.tmpdir(), 'matt-skills-portable-')), 'plugins');
  const build = await buildPlugin({ target: 'matt-skills-agent-plugins', version: '1.1.0', outDir });
  const valid = await validatePortablePlugin({
    pluginRoot: build.pluginRoot,
    skillNames: ['grill-me', 'grilling', 'to-questionnaire'],
  });
  assert.equal(valid.ok, true, valid.errors.join('\n'));

  await mkdir(path.join(build.pluginRoot, 'skills', 'extra'));
  await writeFile(path.join(build.pluginRoot, 'skills', 'extra', 'SKILL.md'), '---\nname: extra\ndescription: extra\n---\n');
  const invalid = await validatePortablePlugin({
    pluginRoot: build.pluginRoot,
    skillNames: ['grill-me', 'grilling', 'to-questionnaire'],
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes('grill-me, grilling, to-questionnaire')));
});
