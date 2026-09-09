import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SUPPORT_SURFACES } from '../../harness/trio/projection.mjs';
import { LOCKED_SKILLS } from '../../packages/plugin-kit/src/matt-skills-lock.mjs';
import { MATT_SKILLS_INVENTORY, mattSkillsPackagedFiles } from '../../packages/plugin-kit/src/matt-skills-source.mjs';
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

const expectedSkillNames = [...MATT_SKILLS_INVENTORY];
const expectedSkillSources = LOCKED_SKILLS.map(({ name }) => ({
  name,
  source: `${corpusRoot}/${name}`,
  directory: true,
}));
const expectedPackagedFiles = mattSkillsPackagedFiles();
const expectedPackagedFileSet = new Set(expectedPackagedFiles);

const expectedCodexConfig = {
  target: 'matt-skills-codex',
  name: 'harness-matt-skills-codex-plugin',
  displayName: 'Matt Pocock Skills for Codex',
  version: '2.0.0',
  description: 'Optional Matt Pocock skills for Codex.',
};

const expectedPortableConfig = {
  target: 'matt-skills-agent-plugins',
  name: 'harness-matt-skills-agent-plugins',
  displayName: 'Matt Pocock Skills for Agent Plugins',
  version: '2.0.0',
  description: 'Optional Matt Pocock skills for Agent Plugins clients.',
  repository: 'https://github.com/ilderaj/superpowering-with-files',
  keywords: ['harness', 'matt-pocock', 'skills', 'grilling', 'questionnaire'],
};

function expectedRequiredFiles(manifestPath, packagedFiles) {
  return [
    manifestPath,
    ...packagedFiles,
    'LICENSE',
    'UPSTREAM.json',
    'OVERLAYS.json',
    'README.md',
  ];
}

function expectedSkillDestinations() {
  return Object.fromEntries(LOCKED_SKILLS.map(({ name }) => [name, `skills/${name}`]));
}

test('core Trio targets and source map remain exact', () => {
  assert.deepEqual(supportedPluginTargets, ['codex', 'agent-plugins']);
  assert.deepEqual(trioSkillSourceMap.map(({ name, source }) => ({ name, source })), [
    { name: 'trio', source: 'harness/trio/skill/SKILL.md' },
    { name: 'dev', source: 'harness/trio/capabilities/dev/SKILL.md' },
    { name: 'office', source: 'harness/trio/capabilities/office/SKILL.md' },
    { name: 'safety', source: 'harness/trio/capabilities/safety/SKILL.md' },
    { name: 'chiefops', source: 'harness/trio/governance/chiefops/SKILL.md' },
  ]);
  assert.equal(SUPPORT_SURFACES.length, 7);
  const packagedSupport = new Map(trioSkillSourceMap.flatMap(({ name, support }) => support.map((file) => [
    `${name}/${file.relativePath}`,
    file.source,
  ])));
  assert.equal(packagedSupport.size, SUPPORT_SURFACES.length);
  assert.deepEqual(SUPPORT_SURFACES.map(({ id, source }) => ({
    id,
    source: packagedSupport.get(id),
  })), SUPPORT_SURFACES.map(({ id, source }) => ({ id, source })));
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

test('Matt companion family covers the full locked 24-skill catalog', () => {
  assert.equal(LOCKED_SKILLS.length, 24);
  assert.equal(expectedSkillNames.length, 24);
  assert.equal(expectedPackagedFiles.length, 67);
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
  for (const { name, files } of LOCKED_SKILLS) {
    for (const file of files) {
      assert.ok(
        expectedPackagedFileSet.has(`skills/${name}/${file.path}`),
        `missing packaged file for ${name}/${file.path}`,
      );
    }
  }
});

test('Matt companion contracts provide native and portable layouts for all skills', () => {
  assert.deepEqual(Object.keys(mattSkillsPlatformContracts).sort(), [
    'matt-skills-agent-plugins',
    'matt-skills-codex',
  ]);

  const destinations = expectedSkillDestinations();

  assert.deepEqual(mattSkillsPlatformContracts['matt-skills-codex'], {
    id: 'matt-skills-codex',
    displayName: 'Matt Pocock Skills for Codex',
    packageName: 'harness-matt-skills-codex-plugin',
    manifestPath: '.codex-plugin/plugin.json',
    requiredFiles: expectedRequiredFiles('.codex-plugin/plugin.json', expectedPackagedFiles),
    loadsRootInstructionFile: true,
    capabilities: { skills: true },
    skillDestinations: destinations,
  });

  assert.deepEqual(mattSkillsPlatformContracts['matt-skills-agent-plugins'], {
    id: 'matt-skills-agent-plugins',
    displayName: 'Matt Pocock Skills for Agent Plugins',
    packageName: 'harness-matt-skills-agent-plugins',
    manifestPath: 'plugin.json',
    requiredFiles: expectedRequiredFiles('plugin.json', expectedPackagedFiles),
    loadsRootInstructionFile: false,
    capabilities: { skills: true },
    skillDestinations: destinations,
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

