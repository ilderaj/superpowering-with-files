import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveTargetPaths } from './paths.mjs';
import { renderTemplate } from './fs-ops.mjs';
import { renderPolicyProfile } from './policy-render.mjs';

export async function loadAdapter(rootDir, target) {
  const file = path.join(rootDir, 'harness/adapters', target, 'manifest.json');
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function renderEntry(rootDir, target, profileNames) {
  const adapter = await loadAdapter(rootDir, target);
  const [template, policyProfile, platformOverride] = await Promise.all([
    readFile(path.join(rootDir, adapter.template), 'utf8'),
    renderPolicyProfile(rootDir, profileNames),
    readFile(path.join(rootDir, adapter.override), 'utf8'),
  ]);

  return renderTemplate(template, {
    basePolicy: policyProfile,
    platformOverride,
  });
}

export function entriesForScope(rootDir, homeDir, adapter, scope) {
  return resolveTargetPaths(rootDir, homeDir, scope, adapter.target);
}
