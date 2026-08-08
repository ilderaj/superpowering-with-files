export const supportedPluginTargets = ['codex'];

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
      'README.md'
    ],
    loadsRootInstructionFile: true,
    capabilities: {
      skills: true
    }
  }
};

export function platformContractFor(target) {
  const contract = platformContracts[target];
  if (!contract) {
    throw new Error(`Unsupported plugin target: ${target}`);
  }
  return contract;
}
