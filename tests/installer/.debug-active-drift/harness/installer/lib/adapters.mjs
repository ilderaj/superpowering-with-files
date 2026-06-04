import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveTargetPaths } from './paths.mjs';
import { renderTemplate } from './fs-ops.mjs';
import { renderPolicyProfile } from './policy-render.mjs';

function normalizeProfileNames(profileNames) {
  if (profileNames === undefined) {
    return undefined;
  }

  return Array.isArray(profileNames) ? profileNames : [profileNames];
}

function resolveEntryPolicyProfiles(target, profileNames) {
  const normalized = normalizeProfileNames(profileNames);

  // Non-Copilot targets should not pick up the Copilot concise opt-in profile.
  if (target !== 'copilot') {
    if (!normalized) return undefined;
    const filtered = normalized.filter((p) => p !== 'copilot-concise-output');
    return filtered.length > 0 ? filtered : undefined;
  }

  // For Copilot target, default to the thinner always-on profile when no explicit
  // profiles are requested.
  if (!normalized) {
    return 'copilot-always-on-thin';
  }

  // Map any 'always-on-core' requests to the Copilot thin baseline, but ensure
  // the thin baseline is present whenever Copilot is explicitly targeted so
  // opt-in profiles (like copilot-concise-output) augment rather than replace it.
  const mapped = normalized.map((profileName) =>
    profileName === 'always-on-core' ? 'copilot-always-on-thin' : profileName
  );

  if (!mapped.includes('copilot-always-on-thin')) {
    mapped.unshift('copilot-always-on-thin');
  }

  return mapped;
}

export async function loadAdapter(rootDir, target) {
  const file = path.join(rootDir, 'harness/adapters', target, 'manifest.json');
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function renderEntry(rootDir, target, profileNames) {
  const adapter = await loadAdapter(rootDir, target);
  const resolvedProfiles = resolveEntryPolicyProfiles(target, profileNames);
  const [template, policyProfile, platformOverride] = await Promise.all([
    readFile(path.join(rootDir, adapter.template), 'utf8'),
    renderPolicyProfile(rootDir, resolvedProfiles),
    readFile(path.join(rootDir, adapter.override), 'utf8'),
  ]);

  let finalPlatformOverride = platformOverride;

  // For Copilot target, include the concise guidance only when the opt-in profile is requested.
  if (target === 'copilot') {
    const includesConcise =
      Array.isArray(resolvedProfiles)
        ? resolvedProfiles.includes('copilot-concise-output')
        : resolvedProfiles === 'copilot-concise-output';

    if (!includesConcise) {
      finalPlatformOverride = finalPlatformOverride.replace(
        /<!--\s*profile:copilot-concise-output:start\s*-->[\s\S]*?<!--\s*profile:copilot-concise-output:end\s*-->\n?/g,
        ''
      );
    }
  } else {
    // Ensure unrelated targets never receive the concise guidance even if requested.
    finalPlatformOverride = finalPlatformOverride.replace(
      /<!--\s*profile:copilot-concise-output:start\s*-->[\s\S]*?<!--\s*profile:copilot-concise-output:end\s*-->\n?/g,
      ''
    );
  }

  return renderTemplate(template, {
    basePolicy: policyProfile,
    platformOverride: finalPlatformOverride,
  });
}

export function entriesForScope(rootDir, homeDir, adapter, scope) {
  return resolveTargetPaths(rootDir, homeDir, scope, adapter.target);
}
