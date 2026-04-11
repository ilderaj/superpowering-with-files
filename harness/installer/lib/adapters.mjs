import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderTemplate } from './fs-ops.mjs';

export async function loadAdapter(rootDir, target) {
  const file = path.join(rootDir, 'harness/adapters', target, 'manifest.json');
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function renderEntry(rootDir, target) {
  const adapter = await loadAdapter(rootDir, target);
  const [template, basePolicy, platformOverride] = await Promise.all([
    readFile(path.join(rootDir, adapter.template), 'utf8'),
    readFile(path.join(rootDir, 'harness/core/policy/base.md'), 'utf8'),
    readFile(path.join(rootDir, adapter.override), 'utf8'),
  ]);

  return renderTemplate(template, {
    basePolicy,
    platformOverride,
  });
}

export function entriesForScope(rootDir, homeDir, adapter, scope) {
  const workspace = adapter.workspaceEntries.map((entry) => path.join(rootDir, entry));
  const global = adapter.globalEntries.map((entry) => path.join(homeDir, entry));

  if (scope === 'workspace') return workspace;
  if (scope === 'user-global') return global;
  return [...workspace, ...global];
}
