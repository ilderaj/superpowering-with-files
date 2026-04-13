import { readFileSync } from 'node:fs';
import path from 'node:path';

const platforms = JSON.parse(
  readFileSync(new URL('../../core/metadata/platforms.json', import.meta.url), 'utf8')
).platforms;

const targetRoots = {
  codex: { workspace: '', global: '.codex' },
  copilot: { workspace: '.github', global: '.copilot' },
  cursor: { workspace: '', global: '' },
  'claude-code': { workspace: '', global: '.claude' }
};

function expand(base, values) {
  return values.map((value) => path.join(base, value));
}

function resolveEntryFiles(target, scopeKey) {
  const platform = platforms[target];
  if (!platform) {
    throw new Error(`Unknown target: ${target}`);
  }

  if (platform.entryFilesByScope?.[scopeKey]) {
    return platform.entryFilesByScope[scopeKey];
  }

  return platform.entryFiles ?? [];
}

function resolveSkillRootEntries(target) {
  const platform = platforms[target];
  if (!platform) {
    throw new Error(`Unknown target: ${target}`);
  }

  if (!platform.skillRoots) {
    throw new Error(`Target ${target} does not define skillRoots.`);
  }

  return platform.skillRoots;
}

function resolveHookRootEntries(target) {
  const platform = platforms[target];
  if (!platform) {
    throw new Error(`Unknown target: ${target}`);
  }

  if (!platform.hookRoots) {
    throw new Error(`Target ${target} does not define hookRoots.`);
  }

  return platform.hookRoots;
}

function resolveScopedPaths(baseDir, target, scopeKey) {
  const root = targetRoots[target]?.[scopeKey];
  if (root === undefined) {
    throw new Error(`Unknown target: ${target}`);
  }

  const entries = resolveEntryFiles(target, scopeKey);
  const paths = entries.map((entry) => (root ? path.join(root, entry) : entry));
  return expand(baseDir, paths);
}

export function resolveTargetPaths(rootDir, homeDir, scope, target) {
  const results = [];

  if (scope === 'workspace' || scope === 'both') {
    results.push(...resolveScopedPaths(rootDir, target, 'workspace'));
  }

  if (scope === 'user-global' || scope === 'both') {
    results.push(...resolveScopedPaths(homeDir, target, 'global'));
  }

  return results;
}

export function resolveSkillRoots(rootDir, homeDir, scope, target) {
  const roots = resolveSkillRootEntries(target);
  const results = [];

  if (scope === 'workspace' || scope === 'both') {
    results.push(...expand(rootDir, roots.workspace ?? []));
  }

  if (scope === 'user-global' || scope === 'both') {
    results.push(...expand(homeDir, roots.global ?? []));
  }

  return results;
}

export function resolveHookRoots(rootDir, homeDir, scope, target) {
  const roots = resolveHookRootEntries(target);
  const results = [];

  if (scope === 'workspace' || scope === 'both') {
    results.push(...expand(rootDir, roots.workspace ?? []));
  }

  if (scope === 'user-global' || scope === 'both') {
    results.push(...expand(homeDir, roots.global ?? []));
  }

  return results;
}

export function resolveSkillTargetPaths(rootDir, homeDir, scope, target, descriptor) {
  const roots = resolveSkillRoots(rootDir, homeDir, scope, target);

  if (descriptor.layout === 'single') {
    return roots.map((root) => path.join(root, descriptor.targetName));
  }

  if (descriptor.layout === 'collection') {
    return roots.flatMap((root) =>
      descriptor.childNames.map((childName) => path.join(root, childName))
    );
  }

  throw new Error(`Unsupported skill layout: ${descriptor.layout}`);
}
