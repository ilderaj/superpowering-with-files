import os from 'node:os';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { entriesForScope, loadAdapter, renderEntry } from '../lib/adapters.mjs';
import { applyCopilotPlanningPatch } from '../lib/copilot-planning-patch.mjs';
import { applyPlanningWithFilesCompanionPlanPatch } from '../lib/planning-with-files-companion-plan-patch.mjs';
import { applySuperpowersWritingPlansPatch } from '../lib/superpowers-writing-plans-patch.mjs';
import {
  ensureDirectoryProjection,
  linkDirectoryProjection,
  materializeDirectoryProjection,
  materializeFileProjection,
  writeRenderedProjection
} from '../lib/fs-ops.mjs';
import { mergeHookConfig, mergeHookSettings } from '../lib/hook-config.mjs';
import { planHookProjections } from '../lib/hook-projection.mjs';
import {
  createProjectionManifest,
  diffProjectionManifest,
  ownedTargetSet,
  readProjectionManifest,
  writeProjectionManifest
} from '../lib/projection-manifest.mjs';
import { coalesceSkillProjections, planSkillProjections } from '../lib/skill-projection.mjs';
import { planSafetyProjections } from '../lib/safety-projection.mjs';
import { readState, updateState } from '../lib/state.mjs';
import { removeManagedHookConfig, removeManagedHookSettings } from '../lib/hook-config.mjs';
import { isUserManagedTarget, readUserManaged } from '../lib/user-managed.mjs';

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function usage() {
  return [
    'Usage: ./scripts/harness sync [--conflict=reject|backup] [--dry-run] [--check]',
    '',
    'Options:',
    '  --conflict=reject|backup  Refuse or back up non-Harness-owned paths before writing',
    '  --dry-run                 Print the desired projection diff without writing files',
    '  --check                   Exit non-zero when sync would make changes',
    '  --help, -h                Show this help message'
  ].join('\n');
}

async function applySkillPatches(projection) {
  for (const patch of projection.patches ?? []) {
    if (patch.type === 'planning-with-files-companion-plan') {
      await applyPlanningWithFilesCompanionPlanPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'copilot-planning-with-files') {
      await applyCopilotPlanningPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'superpowers-writing-plans') {
      await applySuperpowersWritingPlansPatch(projection.targetPath);
      continue;
    }

    throw new Error(`Unsupported skill patch type: ${patch.type}`);
  }
}

async function applySkillProjection(projection, ownedTargets, conflictMode, projectionMode) {
  const effectiveStrategy =
    projection.strategy === 'link' && projectionMode === 'portable' ? 'materialize' : projection.strategy;

  if (effectiveStrategy === 'link') {
    await linkDirectoryProjection({
      sourcePath: projection.sourcePath,
      targetPath: projection.targetPath,
      ownedTargets,
      conflictMode
    });
    return effectiveStrategy;
  }

  if (effectiveStrategy === 'materialize') {
    await materializeDirectoryProjection({
      sourcePath: projection.sourcePath,
      targetPath: projection.targetPath,
      ownedTargets,
      conflictMode
    });
    await applySkillPatches(projection);
    return effectiveStrategy;
  }

  throw new Error(`Unsupported projection strategy: ${effectiveStrategy}`);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      error.message = `Malformed JSON in hook config ${filePath}: ${error.message}`;
    }
    throw error;
  }
}

function markHookConfig(config, description) {
  const marked = structuredClone(config);
  for (const entries of Object.values(marked.hooks ?? {})) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (entry && typeof entry === 'object' && !entry.description) {
        entry.description = description;
      }
    }
  }
  return marked;
}

function adaptHookConfig(config, projection) {
  const marked = markHookConfig(config, `Harness-managed ${projection.parentSkillName} hook`);

  if (projection.parentSkillName === 'superpowers' && projection.target === 'cursor') {
    for (const entry of marked.hooks?.sessionStart ?? []) {
      entry.command =
        'sh -c \'[ -f .cursor/hooks/session-start ] && sh .cursor/hooks/session-start || sh "$HOME/.cursor/hooks/session-start"\'';
    }
  }

  if (projection.parentSkillName === 'superpowers' && projection.target === 'claude-code') {
    for (const entry of marked.hooks?.SessionStart ?? []) {
      for (const hook of entry.hooks ?? []) {
        hook.command =
          'sh -c \'[ -f .claude/hooks/run-hook.cmd ] && sh .claude/hooks/run-hook.cmd session-start || sh "$HOME/.claude/hooks/run-hook.cmd" session-start\'';
      }
    }
  }

  return marked;
}

async function writeHookConfigProjection({ projection, ownedTargets, conflictMode }) {
  const incoming = adaptHookConfig(
    JSON.parse(await readFile(projection.configSource, 'utf8')),
    projection
  );
  let merged = incoming;

  try {
    const existing = await readJsonIfExists(projection.configTarget);
    if (projection.configFormat === 'settings') {
      merged = mergeHookSettings(existing ?? {}, incoming, projection.target);
    } else if (existing) {
      merged = mergeHookConfig(existing, incoming, projection.target);
    }
  } catch (error) {
    if (conflictMode !== 'backup') throw error;
    await writeRenderedProjection({
      targetPath: projection.configTarget,
      content: `${JSON.stringify(incoming, null, 2)}\n`,
      ownedTargets,
      conflictMode
    });
    return;
  }

  await mkdir(path.dirname(projection.configTarget), { recursive: true });
  await writeFile(projection.configTarget, `${JSON.stringify(merged, null, 2)}\n`);
}

async function applyHookProjection(projection, ownedTargets, conflictMode) {
  if (projection.status === 'unsupported') return false;
  if (projection.status !== 'planned') {
    throw new Error(`Unsupported hook projection status: ${projection.status}`);
  }

  await writeHookConfigProjection({ projection, ownedTargets, conflictMode });
  ownedTargets.add(path.resolve(projection.configTarget));

  for (const sourcePath of projection.scriptSourcePaths) {
    const targetPath = path.join(projection.scriptTargetRoot, path.basename(sourcePath));
    await materializeFileProjection({
      sourcePath,
      targetPath,
      ownedTargets,
      conflictMode
    });
    ownedTargets.add(path.resolve(targetPath));
  }

  return true;
}

async function applyManagedProjection(projection, ownedTargets, conflictMode) {
  if (projection.kind === 'safety-directory') {
    await ensureDirectoryProjection({
      targetPath: projection.targetPath,
      ownedTargets,
      conflictMode
    });
    return;
  }

  if (projection.kind === 'safety-file') {
    await materializeFileProjection({
      sourcePath: projection.sourcePath,
      targetPath: projection.targetPath,
      ownedTargets,
      conflictMode
    });
    return;
  }

  throw new Error(`Unsupported managed projection kind: ${projection.kind}`);
}

async function planSyncOperations({ rootDir, homeDir, state }) {
  const targets = Object.keys(state.targets).filter((target) => state.targets[target].enabled);
  const entryWrites = [];
  const rawSkillWrites = [];
  const hookWrites = [];
  const managedWrites = planSafetyProjections({
    rootDir,
    homeDir,
    scope: state.scope,
    policyProfile: state.policyProfile
  });
  const manifestEntries = [];
  const userManaged = await readUserManaged(homeDir);

  for (const target of targets) {
    const adapter = await loadAdapter(rootDir, target);
    const content = await renderEntry(rootDir, target, state.policyProfile);
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
      skillProfile: state.skillProfile
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
      policyProfile: state.policyProfile
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

  for (const projection of skillWrites) {
    const strategy =
      projection.strategy === 'link' && state.projectionMode === 'portable'
        ? 'materialize'
        : projection.strategy;
    manifestEntries.push({
      ...projection,
      strategy
    });
  }

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

function formatDiff(diff) {
  return {
    create: diff.create.length,
    update: diff.update.length,
    stale: diff.stale.length,
    unchanged: diff.unchanged.length
  };
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function cleanupStaleHookConfig(entry) {
  const config = await readJsonIfPresent(entry.targetPath);
  if (!config) return;

  const marker = `Harness-managed ${entry.parentSkillName} hook`;
  if (entry.configFormat === 'settings') {
    const { changed, settings, removeFile } = removeManagedHookSettings(
      config,
      marker,
      entry.target
    );
    if (!changed) return;
    if (removeFile) {
      await rm(entry.targetPath, { force: true });
      return;
    }
    await writeFile(entry.targetPath, `${JSON.stringify(settings, null, 2)}\n`);
    return;
  }

  const { changed, config: nextConfig, removeFile } = removeManagedHookConfig(config, marker, entry.target);
  if (!changed) return;
  if (removeFile) {
    await rm(entry.targetPath, { force: true });
    return;
  }
  await writeFile(entry.targetPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
}

async function cleanupStaleProjection(entry) {
  if (entry.kind === 'hook-config') {
    await cleanupStaleHookConfig(entry);
    return;
  }

  await rm(entry.targetPath, { recursive: true, force: true });
}

export async function sync(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const rootDir = process.cwd();
  const homeDir = os.homedir();
  const state = await readState(rootDir);
  const conflictMode = readOption(args, 'conflict', 'reject');
  const dryRun = hasFlag(args, '--dry-run');
  const check = hasFlag(args, '--check');
  if (!['reject', 'backup'].includes(conflictMode)) {
    throw new Error(`Invalid conflict mode: ${conflictMode}`);
  }

  const currentManifest = await readProjectionManifest(rootDir);
  const plan = await planSyncOperations({ rootDir, homeDir, state });
  const diff = diffProjectionManifest(currentManifest, plan.manifest);
  const summary = formatDiff(diff);

  if (dryRun || check) {
    console.log(
      JSON.stringify(
        {
          mode: check ? 'check' : 'dry-run',
          targets: plan.targets,
          summary,
          diff
        },
        null,
        2
      )
    );
    if (check && (summary.create > 0 || summary.update > 0 || summary.stale > 0)) {
      throw new Error('Harness sync check failed: projections are out of sync.');
    }
    return;
  }

  const ownedTargets = ownedTargetSet(currentManifest);

  for (const entry of diff.stale) {
    if (isUserManagedTarget(entry.targetPath, plan.userManaged)) {
      continue;
    }
    await cleanupStaleProjection(entry);
  }

  for (const entry of plan.entryWrites) {
    if (isUserManagedTarget(entry.targetPath, plan.userManaged)) {
      continue;
    }
    await writeRenderedProjection({
      targetPath: entry.targetPath,
      content: entry.content,
      ownedTargets,
      conflictMode
    });
    ownedTargets.add(path.resolve(entry.targetPath));
  }

  for (const projection of plan.skillWrites) {
    if (isUserManagedTarget(projection.targetPath, plan.userManaged)) {
      continue;
    }
    const effectiveStrategy = await applySkillProjection(
      projection,
      ownedTargets,
      conflictMode,
      state.projectionMode
    );
    if (!['link', 'materialize'].includes(effectiveStrategy)) {
      throw new Error(`Unsupported projection strategy: ${effectiveStrategy}`);
    }
    ownedTargets.add(path.resolve(projection.targetPath));
  }

  for (const projection of plan.hookWrites) {
    if (isUserManagedTarget(projection.configTarget, plan.userManaged)) {
      continue;
    }
    const installed = await applyHookProjection(projection, ownedTargets, conflictMode);
    if (!installed) continue;

    ownedTargets.add(path.resolve(projection.configTarget));
    for (const sourcePath of projection.scriptSourcePaths) {
      ownedTargets.add(path.resolve(path.join(projection.scriptTargetRoot, path.basename(sourcePath))));
    }
  }

  for (const projection of plan.managedWrites) {
    if (isUserManagedTarget(projection.targetPath, plan.userManaged)) {
      continue;
    }
    await applyManagedProjection(projection, ownedTargets, conflictMode);
    ownedTargets.add(path.resolve(projection.targetPath));
  }

  await writeProjectionManifest(rootDir, plan.manifest);
  await updateState(rootDir, (currentState) => ({
    ...currentState,
    lastSync: new Date().toISOString()
  }));
  console.log(
    `Synced ${plan.targets.length} target(s): ${plan.targets.join(', ')} (create=${summary.create}, update=${summary.update}, stale=${summary.stale})`
  );
}
