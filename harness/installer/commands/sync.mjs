import os from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { entriesForScope, loadAdapter, renderEntry } from '../lib/adapters.mjs';
import { applyCopilotPlanningPatch } from '../lib/copilot-planning-patch.mjs';
import {
  linkDirectoryProjection,
  materializeDirectoryProjection,
  materializeFileProjection,
  writeRenderedProjection
} from '../lib/fs-ops.mjs';
import { mergeHookConfig } from '../lib/hook-config.mjs';
import { planHookProjections } from '../lib/hook-projection.mjs';
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
    if (existing) {
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

    const hookProjections = await planHookProjections({
      rootDir,
      homeDir,
      scope: state.scope,
      target,
      hookMode: state.hookMode
    });

    for (const projection of hookProjections) {
      const installed = await applyHookProjection(projection, ownedTargets, conflictMode);
      if (!installed) continue;

      manifest = upsertProjectionEntry(manifest, {
        ...projection,
        kind: 'hook-config',
        strategy: 'merge',
        sourcePath: projection.configSource,
        targetPath: projection.configTarget
      });

      for (const sourcePath of projection.scriptSourcePaths) {
        manifest = upsertProjectionEntry(manifest, {
          ...projection,
          kind: 'hook-script',
          strategy: 'materialize',
          sourcePath,
          targetPath: path.join(projection.scriptTargetRoot, path.basename(sourcePath))
        });
      }
    }
  }

  await writeProjectionManifest(rootDir, manifest);
  console.log(`Synced ${targets.length} target(s): ${targets.join(', ')}`);
}
