import path from 'node:path';

const workspacePaths = {
  codex: ['AGENTS.md'],
  copilot: ['.copilot/copilot-instructions.md'],
  cursor: ['.cursor/rules/harness.mdc'],
  'claude-code': ['CLAUDE.md']
};

const globalPaths = {
  codex: ['.codex/AGENTS.md'],
  copilot: ['.copilot/copilot-instructions.md'],
  cursor: ['.cursor/rules/harness.mdc'],
  'claude-code': ['.claude/CLAUDE.md']
};

function expand(base, values) {
  return values.map((value) => path.join(base, value));
}

export function resolveTargetPaths(rootDir, homeDir, scope, target) {
  const results = [];

  if (scope === 'workspace' || scope === 'both') {
    results.push(...expand(rootDir, workspacePaths[target] || []));
  }

  if (scope === 'user-global' || scope === 'both') {
    results.push(...expand(homeDir, globalPaths[target] || []));
  }

  return results;
}
