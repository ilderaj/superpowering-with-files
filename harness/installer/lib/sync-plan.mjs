import { entriesForScope, loadAdapter, renderEntry } from './adapters.mjs';
import {
  createProjectionManifest
} from './projection-manifest.mjs';
import { digestTarget } from './backup-archive.mjs';
import { coalesceSkillProjections, planSkillProjections } from './skill-projection.mjs';
import { planSafetyProjections } from './safety-projection.mjs';
import {
  activeSafetyPolicyProfile,
  effectiveEntryPolicyProfiles
} from './state.mjs';
import { isUserManagedTarget, readUserManaged } from './user-managed.mjs';
import { planHookProjections } from './hook-projection.mjs';
import path from 'node:path';

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function deriveSyncMode(args = []) {
  if (hasFlag(args, '--dry-run')) return 'dry-run';
  if (hasFlag(args, '--check')) return 'check';
  return 'apply';
}

function listOperationDescriptors(executionPlan) {
  return [
    ...executionPlan.entryWrites.map((entry) => ({
      kind: 'entry',
      targetPath: entry.targetPath
    })),
    ...executionPlan.skillWrites.map((projection) => ({
      kind: 'skill',
      target: projection.target,
      targetPath: projection.targetPath,
      strategy: projection.strategy
    })),
    ...executionPlan.hookWrites.map((projection) => ({
      kind: 'hook',
      target: projection.target,
      targetPath: projection.configTarget
    })),
    ...executionPlan.managedWrites.map((projection) => ({
      kind: projection.kind,
      targetPath: projection.targetPath
    }))
  ];
}

function listHookDetails(executionPlan) {
  return [...new Set(executionPlan.hookWrites.map((projection) => projection.parentSkillName).filter(Boolean))];
}

export async function collectSyncOperations({ rootDir, homeDir, state }) {
  const targets = Object.keys(state.targets).filter((target) => state.targets[target].enabled);
  const effectiveEntryProfiles = effectiveEntryPolicyProfiles(state);
  const safetyProfile = activeSafetyPolicyProfile(state);
  const entryWrites = [];
  const rawSkillWrites = [];
  const hookWrites = [];
  const managedWrites = planSafetyProjections({
    rootDir,
    homeDir,
    scope: state.scope,
    policyProfile: safetyProfile
  });
  const manifestEntries = [];
  const userManaged = await readUserManaged(homeDir);

  for (const target of targets) {
    const adapter = await loadAdapter(rootDir, target);
    const content = await renderEntry(rootDir, target, effectiveEntryProfiles);
    const entries = entriesForScope(rootDir, homeDir, adapter, state.scope);

    for (const entry of entries) {
      entryWrites.push({ targetPath: entry, content });
      if (isUserManagedTarget(entry, userManaged)) {
        continue;
      }
      manifestEntries.push({
        kind: 'entry',
        target,
        strategy: 'render',
        sourcePath: adapter.template,
        targetPath: entry
      });
    }

    const skillProjections = await planSkillProjections({
      rootDir,
      homeDir,
      scope: state.scope,
      target,
      skillProfile: state.skillProfile,
      deploymentProfile: state.deploymentProfile
    });

    for (const projection of skillProjections) {
      if (isUserManagedTarget(projection.targetPath, userManaged)) {
        continue;
      }
      rawSkillWrites.push(projection);
    }

    const hookProjections = await planHookProjections({
      rootDir,
      homeDir,
      scope: state.scope,
      target,
      hookMode: state.hookMode,
      policyProfile: safetyProfile
    });

    for (const projection of hookProjections) {
      if (projection.status === 'unsupported') continue;
      if (isUserManagedTarget(projection.configTarget, userManaged)) {
        continue;
      }
      hookWrites.push(projection);
      manifestEntries.push({
        ...projection,
        kind: 'hook-config',
        strategy: 'merge',
        sourcePath: projection.configSource,
        targetPath: projection.configTarget
      });

      for (const sourcePath of projection.scriptSourcePaths) {
        manifestEntries.push({
          ...projection,
          kind: 'hook-script',
          strategy: 'materialize',
          sourcePath,
          targetPath: path.join(projection.scriptTargetRoot, path.basename(sourcePath))
        });
      }
    }
  }

  const skillWrites = coalesceSkillProjections(rawSkillWrites);

  const skillManifestEntries = await Promise.all(
    skillWrites.map(async (projection) => {
      const strategy =
        projection.strategy === 'link' && state.projectionMode === 'portable'
          ? 'materialize'
          : projection.strategy;
      const manifestEntry = {
        ...projection,
        strategy
      };

      if (strategy === 'materialize') {
        manifestEntry.sourceDigest = await digestTarget(projection.sourcePath);
      }

      return manifestEntry;
    })
  );

  manifestEntries.push(...skillManifestEntries);

  for (const projection of managedWrites) {
    if (isUserManagedTarget(projection.targetPath, userManaged)) {
      continue;
    }
    manifestEntries.push(projection);
  }

  return {
    targets,
    entryWrites,
    skillWrites,
    hookWrites,
    managedWrites,
    userManaged,
    manifest: createProjectionManifest(manifestEntries)
  };
}

export function formatDiff(diff) {
  return {
    create: diff.create.length,
    update: diff.update.length,
    stale: diff.stale.length,
    unchanged: diff.unchanged.length
  };
}

export async function buildSyncPlan(args = [], context = {}) {
  const executionPlan = await collectSyncOperations(context);

  return {
    state: context.state ?? {},
    desiredManifest: executionPlan.manifest,
    operations: listOperationDescriptors(executionPlan),
    executionPlan,
    report: {
      mode: deriveSyncMode(args),
      targets: executionPlan.targets,
      warnings: [],
      details: {
        projections: executionPlan.targets,
        hooks: listHookDetails(executionPlan)
      }
    }
  };
}
