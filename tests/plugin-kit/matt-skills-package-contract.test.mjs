import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SUPPORT_SURFACES } from '../../harness/trio/projection.mjs';
import {
  harnessSkillSourceMap,
  mattSkillsCompanionFamily,
  mattSkillsCompanionTargets,
  mattSkillsPlatformContracts,
  platformContractFor,
  supportedPluginTargets,
  trioSkillSourceMap,
} from '../../packages/plugin-kit/src/platform-contracts.mjs';

const corpusRoot = 'harness/optional-skills/mattpocock/v1.2.3';

const expectedSkillNames = ['grill-me', 'grilling', 'to-questionnaire'];

const expectedSkillSources = expectedSkillNames.map((name) => ({
  name,
  source: `${corpusRoot}/${name}/SKILL.md`,
}));

const expectedCodexConfig = {
  target: 'matt-skills-codex',
  name: 'harness-matt-skills-codex-plugin',
  displayName: 'Matt Pocock Skills for Codex',
  version: '1.2.0',
  description: 'Optional Matt Pocock skills for Codex.',
};

const expectedPortableConfig = {
  target: 'matt-skills-agent-plugins',
  name: 'harness-matt-skills-agent-plugins',
  displayName: 'Matt Pocock Skills for Agent Plugins',
  version: '1.2.0',
  description: 'Optional Matt Pocock skills for Agent Plugins clients.',
  repository: 'https://github.com/ilderaj/superpowering-with-files',
  keywords: ['harness', 'matt-pocock', 'skills', 'grilling', 'questionnaire'],
};

test('core Trio targets and source map remain exact', () => {
  assert.deepEqual(supportedPluginTargets, ['codex', 'agent-plugins']);
  assert.deepEqual(trioSkillSourceMap.map(({ name, source }) => ({ name, source })), [
    { name: 'trio', source: 'harness/trio/skill/SKILL.md' },
    { name: 'dev', source: 'harness/trio/capabilities/dev/SKILL.md' },
    { name: 'office', source: 'harness/trio/capabilities/office/SKILL.md' },
    { name: 'safety', source: 'harness/trio/capabilities/safety/SKILL.md' },
    { name: 'chiefops', source: 'harness/trio/governance/chiefops/SKILL.md' },
  ]);
  assert.equal(SUPPORT_SURFACES.length, 5);
  assert.deepEqual(trioSkillSourceMap.flatMap(({ name, support }) => support.map((file) => ({
    id: `${name}/${file.relativePath}`, source: file.source
  }))), SUPPORT_SURFACES.map(({ id, source }) => ({ id, source })));
});

test('harness skill source map covers the additional SWF skills as directory copies', () => {
  assert.deepEqual(harnessSkillSourceMap, [
    {
      name: 'planning-with-files',
      source: 'harness/core/upstream-overlays/planning-with-files',
      directory: true
    },
    {
      name: 'overengineering-review',
      source: 'harness/core/skills/overengineering-review',
      directory: true
    },
    {
      name: 'simplification-ledger',
      source: 'harness/core/skills/simplification-ledger',
      directory: true
    }
  ]);
});

test('Matt companion family is separate from the core target loop', () => {
  assert.deepEqual(mattSkillsCompanionTargets, [
    'matt-skills-codex',
    'matt-skills-agent-plugins',
  ]);
  assert.equal(
    mattSkillsCompanionTargets.every((target) => !supportedPluginTargets.includes(target)),
    true,
  );
  assert.deepEqual(mattSkillsCompanionFamily, {
    id: 'matt-skills',
    targets: mattSkillsCompanionTargets,
    skillSourceMap: expectedSkillSources,
  });
});

test('Matt companion contracts provide native and portable layouts', () => {
  assert.deepEqual(Object.keys(mattSkillsPlatformContracts).sort(), [
    'matt-skills-agent-plugins',
    'matt-skills-codex',
  ]);

  assert.deepEqual(mattSkillsPlatformContracts['matt-skills-codex'], {
    id: 'matt-skills-codex',
    displayName: 'Matt Pocock Skills for Codex',
    packageName: 'harness-matt-skills-codex-plugin',
    manifestPath: '.codex-plugin/plugin.json',
    requiredFiles: [
      '.codex-plugin/plugin.json',
      'skills/grill-me/SKILL.md',
      'skills/grilling/SKILL.md',
      'skills/to-questionnaire/SKILL.md',
      'LICENSE',
      'UPSTREAM.json',
      'OVERLAYS.json',
      'README.md',
    ],
    loadsRootInstructionFile: true,
    capabilities: { skills: true },
    skillDestinations: {
      'grill-me': 'skills/grill-me/SKILL.md',
      grilling: 'skills/grilling/SKILL.md',
      'to-questionnaire': 'skills/to-questionnaire/SKILL.md',
    },
  });

  assert.deepEqual(mattSkillsPlatformContracts['matt-skills-agent-plugins'], {
    id: 'matt-skills-agent-plugins',
    displayName: 'Matt Pocock Skills for Agent Plugins',
    packageName: 'harness-matt-skills-agent-plugins',
    manifestPath: 'plugin.json',
    requiredFiles: [
      'plugin.json',
      'skills/grill-me/SKILL.md',
      'skills/grilling/SKILL.md',
      'skills/to-questionnaire/SKILL.md',
      'LICENSE',
      'UPSTREAM.json',
      'OVERLAYS.json',
      'README.md',
    ],
    loadsRootInstructionFile: false,
    capabilities: { skills: true },
    skillDestinations: {
      'grill-me': 'skills/grill-me/SKILL.md',
      grilling: 'skills/grilling/SKILL.md',
      'to-questionnaire': 'skills/to-questionnaire/SKILL.md',
    },
  });

  for (const target of mattSkillsCompanionTargets) {
    assert.equal(platformContractFor(target), mattSkillsPlatformContracts[target]);
  }
});

test('Matt companion plugin configurations match their package contracts', async () => {
  const [codexConfig, portableConfig] = await Promise.all([
    readFile('plugins/matt-skills-codex/plugin.harness.json', 'utf8').then(JSON.parse),
    readFile('plugins/matt-skills-agent-plugins/plugin.harness.json', 'utf8').then(JSON.parse),
  ]);

  assert.deepEqual(codexConfig, expectedCodexConfig);
  assert.deepEqual(portableConfig, expectedPortableConfig);
});
