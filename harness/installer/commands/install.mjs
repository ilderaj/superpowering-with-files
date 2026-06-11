import os from 'node:os';
import { loadPlatforms, normalizeScope, normalizeTargets } from '../lib/metadata.mjs';
import { loadPolicyProfiles } from '../lib/policy-render.mjs';
import { resolveTargetPaths } from '../lib/paths.mjs';
import { defaultSkillProfileForTargets, loadSkillProfiles } from '../lib/skill-projection.mjs';
import { isSafetyPolicyProfile } from '../lib/safety-projection.mjs';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import {
  DEFAULT_DEPLOYMENT_PROFILE,
  normalizePolicySelection,
  validateDeploymentProfile,
  writeState
} from '../lib/state.mjs';
import { sync } from './sync.mjs';

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

export async function install(args = [], options = {}) {
  const rootDir = options.rootDir ?? (await discoverAuthorityRoot(process.cwd())).rootDir;
  const metadata = await loadPlatforms(rootDir);
  const policyProfiles = await loadPolicyProfiles(rootDir);
  const skillProfiles = await loadSkillProfiles(rootDir);
  const scope = normalizeScope(readOption(args, 'scope', metadata.defaultScope));
  const mode = readOption(args, 'mode', 'ensure');
  const projectionMode = readOption(args, 'projection', 'link');
  const requestedPolicyProfile = readOption(args, 'profile', policyProfiles.defaultProfile);
  const deploymentProfile = readOption(args, 'deployment-profile', DEFAULT_DEPLOYMENT_PROFILE);
  const { policyProfile, workspacePolicyOverlay } = normalizePolicySelection(requestedPolicyProfile);
  const hookMode = readOption(
    args,
    'hooks',
    ['safety', 'cloud-safe'].includes(requestedPolicyProfile) ? 'on' : 'off'
  );
  const targetArg = readOption(args, 'targets', 'all');
  const targets = normalizeTargets(metadata, targetArg.split(',').filter(Boolean));
  const skillProfile = defaultSkillProfileForTargets(
    skillProfiles,
    targets,
    readOption(args, 'skills-profile', undefined),
    scope
  );

  if (!['link', 'portable'].includes(projectionMode)) {
    throw new Error(`Invalid projection mode: ${projectionMode}`);
  }

  if (!['ensure', 'force'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }

  if (!['off', 'on'].includes(hookMode)) {
    throw new Error(`Invalid hooks mode: ${hookMode}`);
  }

  validateDeploymentProfile(deploymentProfile);

  if (!policyProfiles.profiles[requestedPolicyProfile]) {
    throw new Error(
      `Invalid profile: ${requestedPolicyProfile}. Expected one of: ${Object.keys(policyProfiles.profiles).join(', ')}.`
    );
  }

  if (scope !== 'workspace' && isSafetyPolicyProfile(requestedPolicyProfile)) {
    throw new Error(
      `Safety profiles are workspace-only. Refusing ${requestedPolicyProfile} for ${scope} scope.`
    );
  }

  if (scope !== 'workspace' && deploymentProfile !== DEFAULT_DEPLOYMENT_PROFILE) {
    throw new Error(
      `Deployment profile ${deploymentProfile} is workspace-only. Refusing it for ${scope} scope.`
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
    deploymentProfile,
    policyProfile,
    workspacePolicyOverlay,
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
  await sync(mode === 'force' ? ['--takeover'] : [], { rootDir });
  console.log(`Installed Harness state for ${targets.join(', ')} using ${scope} scope.`);
}
