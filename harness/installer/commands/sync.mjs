import os from 'node:os';
import path from 'node:path';
import { entriesForScope, loadAdapter, renderEntry } from '../lib/adapters.mjs';
import { applyCopilotPlanningPatch } from '../lib/copilot-planning-patch.mjs';
import {
  linkDirectoryProjection,
  materializeDirectoryProjection,
  writeRenderedProjection
} from '../lib/fs-ops.mjs';
import {
  ownedTargetSet,
  readProjectionManifest,
  upsertProjectionEntry,
  writeProjectionManifest
} from '../lib/projection-manifest.mjs';
import { planSkillProjections } from '../lib/skill-projection.mjs';
import { readState } from '../lib/state.mjs';

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
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
    if (projection.patch?.type === 'copilot-planning-with-files') {
      await applyCopilotPlanningPatch(projection.targetPath);
    }
    return effectiveStrategy;
  }

  throw new Error(`Unsupported projection strategy: ${effectiveStrategy}`);
}

export async function sync(args = []) {
  const rootDir = process.cwd();
  const homeDir = os.homedir();
  const state = await readState(rootDir);
  const conflictMode = readOption(args, 'conflict', 'reject');
  if (!['reject', 'backup'].includes(conflictMode)) {
    throw new Error(`Invalid conflict mode: ${conflictMode}`);
  }

  let manifest = await readProjectionManifest(rootDir);
  const ownedTargets = ownedTargetSet(manifest);
  const targets = Object.keys(state.targets).filter((target) => state.targets[target].enabled);

  for (const target of targets) {
    const adapter = await loadAdapter(rootDir, target);
    const content = await renderEntry(rootDir, target);
    const entries = entriesForScope(rootDir, homeDir, adapter, state.scope);

    for (const entry of entries) {
      await writeRenderedProjection({
        targetPath: entry,
        content,
        ownedTargets,
        conflictMode
      });
      manifest = upsertProjectionEntry(manifest, {
        kind: 'entry',
        target,
        strategy: 'render',
        sourcePath: adapter.template,
        targetPath: entry
      });
      ownedTargets.add(path.resolve(entry));
    }

    const skillProjections = await planSkillProjections({
      rootDir,
      homeDir,
      scope: state.scope,
      target
    });

    for (const projection of skillProjections) {
      const effectiveStrategy = await applySkillProjection(
        projection,
        ownedTargets,
        conflictMode,
        state.projectionMode
      );
      manifest = upsertProjectionEntry(manifest, {
        ...projection,
        strategy: effectiveStrategy
      });
      ownedTargets.add(path.resolve(projection.targetPath));
    }
  }

  await writeProjectionManifest(rootDir, manifest);
  console.log(`Synced ${targets.length} target(s): ${targets.join(', ')}`);
}
