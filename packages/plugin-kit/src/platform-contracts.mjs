export const supportedPluginTargets = ['codex', 'agent-plugins'];

export const agentPluginsSchemaUrl = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

export const trioSkillSourceMap = [
  { name: 'trio', source: 'harness/trio/skill/SKILL.md' },
  { name: 'dev', source: 'harness/trio/capabilities/dev/SKILL.md' },
  { name: 'office', source: 'harness/trio/capabilities/office/SKILL.md' },
  { name: 'safety', source: 'harness/trio/capabilities/safety/SKILL.md' },
  { name: 'chiefops', source: 'harness/trio/governance/chiefops/SKILL.md' }
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
  chiefops: 'skills/chiefops/SKILL.md'
};

const codexSkillDestinations = {
  trio: 'skills/trio/SKILL.md',
  dev: 'skills/trio/dev/SKILL.md',
  office: 'skills/trio/office/SKILL.md',
  safety: 'skills/trio/safety/SKILL.md',
  chiefops: 'skills/chiefops/SKILL.md'
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
      'README.md'
    ],
    loadsRootInstructionFile: false,
    capabilities: {
      skills: true
    },
    skillDestinations: portableSkillDestinations
  }
};

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
