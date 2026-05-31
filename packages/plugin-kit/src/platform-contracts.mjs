export const supportedPluginTargets = ['codex', 'claude-code', 'cursor', 'copilot'];

export const platformContracts = {
  codex: {
    id: 'codex',
    displayName: 'Codex',
    packageName: 'harness-codex-plugin',
    manifestPath: '.codex-plugin/plugin.json',
    requiredFiles: [
      '.codex-plugin/plugin.json',
      '.mcp.json',
      'skills/harness/SKILL.md',
      'hooks/hooks.json',
      'mcp/harness-runtime.mjs',
      'README.md'
    ],
    loadsRootInstructionFile: true,
    capabilities: {
      skills: true,
      hooks: true,
      mcpStdio: true,
      cloudMcpToolsOnly: false
    }
  },
  'claude-code': {
    id: 'claude-code',
    displayName: 'Claude Code',
    packageName: 'harness-claude-code-plugin',
    manifestPath: '.claude-plugin/plugin.json',
    requiredFiles: [
      '.claude-plugin/plugin.json',
      '.mcp.json',
      'skills/harness/SKILL.md',
      'hooks/hooks.json',
      'mcp/harness-runtime.mjs',
      'README.md'
    ],
    loadsRootInstructionFile: false,
    capabilities: {
      skills: true,
      hooks: true,
      mcpStdio: true,
      cloudMcpToolsOnly: false
    }
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor',
    packageName: 'harness-cursor-plugin',
    manifestPath: 'plugin.json',
    requiredFiles: [
      'plugin.json',
      '.mcp.json',
      'skills/harness/SKILL.md',
      'rules/harness.mdc',
      'hooks/hooks.json',
      'mcp/harness-runtime.mjs',
      'README.md'
    ],
    loadsRootInstructionFile: true,
    capabilities: {
      skills: true,
      hooks: true,
      mcpStdio: true,
      cloudMcpToolsOnly: false
    }
  },
  copilot: {
    id: 'copilot',
    displayName: 'GitHub Copilot',
    packageName: 'harness-copilot-plugin',
    manifestPath: 'plugin.json',
    requiredFiles: [
      'plugin.json',
      '.mcp.json',
      'skills/harness/SKILL.md',
      'hooks/hooks.json',
      'mcp/harness-runtime.mjs',
      'instructions/harness.instructions.md',
      'README.md'
    ],
    loadsRootInstructionFile: true,
    capabilities: {
      skills: true,
      hooks: true,
      mcpStdio: true,
      cloudMcpToolsOnly: true
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
