import path from 'node:path';

const SAFETY_POLICY_PROFILES = new Set(['safety', 'cloud-safe']);
const SAFETY_FILES = [
  'protected-paths.txt',
  'dangerous-patterns.txt',
  'safe-commands.txt',
  'cloud-protected-paths.txt'
];
const SAFETY_DIRS = ['safety', 'bin', 'templates', 'logs', 'checkpoints'];
const SAFETY_DOCS = [
  'architecture.md',
  'vibe-coding-safety-manual.md',
  'recovery-playbook.md'
];

export function isSafetyPolicyProfile(policyProfile) {
  return SAFETY_POLICY_PROFILES.has(policyProfile);
}

export function resolveAgentConfigRoots(rootDir, homeDir, scope) {
  const roots = [];

  if (scope === 'workspace' || scope === 'both') {
    roots.push({ scope: 'workspace', root: path.join(rootDir, '.agent-config') });
  }

  if (scope === 'user-global' || scope === 'both') {
    roots.push({ scope: 'user-global', root: path.join(homeDir, '.agent-config') });
  }

  return roots;
}

export function planSafetyProjections({ rootDir, homeDir, scope, policyProfile }) {
  if (!isSafetyPolicyProfile(policyProfile)) {
    return [];
  }

  const roots = resolveAgentConfigRoots(rootDir, homeDir, scope);
  const projections = [];

  for (const { scope: scopeName, root } of roots) {
    for (const dirName of SAFETY_DIRS) {
      projections.push({
        kind: 'safety-directory',
        strategy: 'mkdir',
        scope: scopeName,
        targetPath: path.join(root, dirName)
      });
    }

    for (const fileName of SAFETY_FILES) {
      projections.push({
        kind: 'safety-file',
        strategy: 'materialize',
        scope: scopeName,
        sourcePath: path.join(rootDir, 'harness/core/safety', fileName),
        targetPath: path.join(root, 'safety', fileName)
      });
    }

    projections.push({
      kind: 'safety-file',
      strategy: 'materialize',
      scope: scopeName,
      executable: true,
      sourcePath: path.join(rootDir, 'harness/core/safety/bin/checkpoint'),
      targetPath: path.join(root, 'bin/checkpoint')
    });

    projections.push({
      kind: 'safety-file',
      strategy: 'materialize',
      scope: scopeName,
      sourcePath: path.join(rootDir, 'harness/core/templates/safety/vscode-settings.safety.jsonc'),
      targetPath: path.join(root, 'templates/vscode-settings.safety.jsonc')
    });

    for (const fileName of SAFETY_DOCS) {
      projections.push({
        kind: 'safety-file',
        strategy: 'materialize',
        scope: scopeName,
        sourcePath: path.join(rootDir, 'docs/safety', fileName),
        targetPath: path.join(root, 'docs/safety', fileName)
      });
    }
  }

  return projections;
}
