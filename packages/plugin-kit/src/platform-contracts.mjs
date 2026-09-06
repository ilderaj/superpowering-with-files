import { SURFACES, SUPPORT_SURFACES } from '../../../harness/trio/projection.mjs';

export const supportedPluginTargets = ['codex', 'agent-plugins'];

export const agentPluginsSchemaUrl = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

export const trioSkillSourceMap = SURFACES.filter(({ id }) => id !== 'entry').map(({ id, source }) => ({
  name: id,
  source,
  support: SUPPORT_SURFACES.filter(({ supportFor }) => supportFor === id).map((surface) => ({
    source: surface.source,
    relativePath: surface.id.slice(id.length + 1)
  }))
}));

// Additional SWF skills projected into the packaged plugins. Each entry points
// at a Harness-owned directory whose contents are copied into skills/<name>/
// (minus runtime junk such as __pycache__ and host hook configs that SWF does
// not project).
export const harnessSkillSourceMap = [
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
];

export const mattSkillsCompanionTargets = [
  'matt-skills-codex',
  'matt-skills-agent-plugins'
];

const mattSkillsSkillSourceMap = [
  {
    name: 'grill-me',
    source: 'harness/optional-skills/mattpocock/v1.2.3/grill-me/SKILL.md'
  },
  {
    name: 'grilling',
    source: 'harness/optional-skills/mattpocock/v1.2.3/grilling/SKILL.md'
  },
  {
    name: 'to-questionnaire',
    source: 'harness/optional-skills/mattpocock/v1.2.3/to-questionnaire/SKILL.md'
  }
];

export const mattSkillsCompanionFamily = {
  id: 'matt-skills',
  targets: mattSkillsCompanionTargets,
  skillSourceMap: mattSkillsSkillSourceMap
};

const portableSkillDestinations = {
  trio: 'skills/trio/SKILL.md',
  dev: 'skills/dev/SKILL.md',
  office: 'skills/office/SKILL.md',
  safety: 'skills/safety/SKILL.md',
  chiefops: 'skills/chiefops/SKILL.md',
  'planning-with-files': 'skills/planning-with-files/SKILL.md',
  'overengineering-review': 'skills/overengineering-review/SKILL.md',
  'simplification-ledger': 'skills/simplification-ledger/SKILL.md'
};

const codexSkillDestinations = {
  trio: 'skills/trio/SKILL.md',
  dev: 'skills/trio/dev/SKILL.md',
  office: 'skills/trio/office/SKILL.md',
  safety: 'skills/trio/safety/SKILL.md',
  chiefops: 'skills/chiefops/SKILL.md',
  'planning-with-files': 'skills/planning-with-files/SKILL.md',
  'overengineering-review': 'skills/overengineering-review/SKILL.md',
  'simplification-ledger': 'skills/simplification-ledger/SKILL.md'
};

const mattSkillsSkillDestinations = {
  'grill-me': 'skills/grill-me/SKILL.md',
  grilling: 'skills/grilling/SKILL.md',
  'to-questionnaire': 'skills/to-questionnaire/SKILL.md'
};

export const platformContracts = {
  codex: {
    id: 'codex',
    displayName: 'Codex',
    packageName: 'harness-codex-plugin',
    manifestPath: '.codex-plugin/plugin.json',
    requiredFiles: [
      '.codex-plugin/plugin.json',
      'skills/trio/SKILL.md',
      'skills/trio/dev/SKILL.md',
      'skills/trio/office/SKILL.md',
      'skills/trio/safety/SKILL.md',
      'skills/chiefops/SKILL.md',
      'skills/planning-with-files/SKILL.md',
      'skills/overengineering-review/SKILL.md',
      'skills/simplification-ledger/SKILL.md',
      'README.md'
    ],
    loadsRootInstructionFile: true,
    capabilities: {
      skills: true
    },
    skillDestinations: codexSkillDestinations
  },
  'agent-plugins': {
    id: 'agent-plugins',
    displayName: 'Agent Plugins',
    packageName: 'harness-agent-plugins',
    manifestPath: 'plugin.json',
    requiredFiles: [
      'plugin.json',
      'skills/trio/SKILL.md',
      'skills/dev/SKILL.md',
      'skills/office/SKILL.md',
      'skills/safety/SKILL.md',
      'skills/chiefops/SKILL.md',
      'skills/planning-with-files/SKILL.md',
      'skills/overengineering-review/SKILL.md',
      'skills/simplification-ledger/SKILL.md',
      'README.md'
    ],
    loadsRootInstructionFile: false,
    capabilities: {
      skills: true
    },
    skillDestinations: portableSkillDestinations
  }
};

// Required support destinations follow each target's own skill layout.
for (const contract of Object.values(platformContracts)) {
  for (const { name, support } of trioSkillSourceMap) {
    const skillDirectory = contract.skillDestinations[name].slice(0, -'SKILL.md'.length);
    contract.requiredFiles.push(...support.map(({ relativePath }) => skillDirectory + relativePath));
  }
}

export const mattSkillsPlatformContracts = {
  'matt-skills-codex': {
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
      'README.md'
    ],
    loadsRootInstructionFile: true,
    capabilities: {
      skills: true
    },
    skillDestinations: mattSkillsSkillDestinations
  },
  'matt-skills-agent-plugins': {
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
      'README.md'
    ],
    loadsRootInstructionFile: false,
    capabilities: {
      skills: true
    },
    skillDestinations: mattSkillsSkillDestinations
  }
};

export function platformContractFor(target) {
  const contract = platformContracts[target] ?? mattSkillsPlatformContracts[target];
  if (!contract) {
    throw new Error(`Unsupported plugin target: ${target}`);
  }
  return contract;
}
