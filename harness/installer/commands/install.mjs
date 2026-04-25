import os from 'node:os';
import { loadPlatforms, normalizeScope, normalizeTargets } from '../lib/metadata.mjs';
import { loadPolicyProfiles } from '../lib/policy-render.mjs';
import { resolveTargetPaths } from '../lib/paths.mjs';
import { loadSkillProfiles } from '../lib/skill-projection.mjs';
import { writeState } from '../lib/state.mjs';
import { sync } from './sync.mjs';

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

export async function install(args = []) {
  const rootDir = process.cwd();
  const metadata = await loadPlatforms(rootDir);
  const policyProfiles = await loadPolicyProfiles(rootDir);
  const skillProfiles = await loadSkillProfiles(rootDir);
  const scope = normalizeScope(readOption(args, 'scope', metadata.defaultScope));
  const projectionMode = readOption(args, 'projection', 'link');
  const policyProfile = readOption(args, 'profile', policyProfiles.defaultProfile);
  const hookMode = readOption(
    args,
    'hooks',
    ['safety', 'cloud-safe'].includes(policyProfile) ? 'on' : 'off'
  );
  const skillProfile = readOption(args, 'skills-profile', skillProfiles.defaultProfile);
  const targetArg = readOption(args, 'targets', 'all');
  const targets = normalizeTargets(metadata, targetArg.split(',').filter(Boolean));

  if (!['link', 'portable'].includes(projectionMode)) {
    throw new Error(`Invalid projection mode: ${projectionMode}`);
  }

  if (!['off', 'on'].includes(hookMode)) {
    throw new Error(`Invalid hooks mode: ${hookMode}`);
  }

  if (!policyProfiles.profiles[policyProfile]) {
    throw new Error(
      `Invalid profile: ${policyProfile}. Expected one of: ${Object.keys(policyProfiles.profiles).join(', ')}.`
    );
  }

  if (!skillProfiles.profiles[skillProfile]) {
    throw new Error(
      `Invalid skills profile: ${skillProfile}. Expected one of: ${Object.keys(skillProfiles.profiles).join(', ')}.`
    );
  }

  const state = {
    schemaVersion: 1,
    scope,
    projectionMode,
    hookMode,
    policyProfile,
    skillProfile,
    targets: {},
    upstream: {}
  };

  for (const target of targets) {
    state.targets[target] = {
      enabled: true,
      paths: resolveTargetPaths(rootDir, os.homedir(), scope, target)
    };
  }

  await writeState(rootDir, state);
  await sync([]);
  console.log(`Installed Harness state for ${targets.join(', ')} using ${scope} scope.`);
}
