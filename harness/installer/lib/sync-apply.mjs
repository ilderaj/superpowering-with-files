import { realpathSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyCopilotPlanningPatch } from './copilot-planning-patch.mjs';
import { applyPlanningWithFilesCompanionPlanPatch } from './planning-with-files-companion-plan-patch.mjs';
import { applyPlanningWithFilesSkillRootPatch } from './planning-with-files-skill-root-patch.mjs';
import { applySuperpowersExecutingPlansReplanPatch } from './superpowers-executing-plans-replan-patch.mjs';
import { applySuperpowersFinishingADevelopmentBranchPatch } from './superpowers-finishing-a-development-branch-patch.mjs';
import { applySuperpowersSubagentDrivenDevelopmentBudgetPatch } from './superpowers-subagent-driven-development-budget-patch.mjs';
import { applySuperpowersUsingGitWorktreesPatch } from './superpowers-using-git-worktrees-patch.mjs';
import { applySuperpowersVerificationBeforeCompletionPatch } from './superpowers-verification-before-completion-patch.mjs';
import { applySuperpowersWritingPlansPatch } from './superpowers-writing-plans-patch.mjs';
import {
  applySuperpowersDebugLoopPatch,
  applySuperpowersReviewAxesPatch,
  applySuperpowersTddSeamPatch
} from './superpowers-coding-contracts-patch.mjs';
import {
  ensureDirectoryProjection,
  linkDirectoryProjection,
  materializeDirectoryProjection,
  materializeFileProjection,
  writeRenderedProjection
} from './fs-ops.mjs';
import { mergeHookConfig, mergeHookSettings } from './hook-config.mjs';
import { createBackupArchiveManager } from './backup-archive.mjs';
import {
  ownedTargetSet,
  writeProjectionManifest
} from './projection-manifest.mjs';
import { updateState } from './state.mjs';
import { removeManagedHookConfig, removeManagedHookSettings } from './hook-config.mjs';
import { isUserManagedTarget } from './user-managed.mjs';
import { diffProjectionManifest } from './projection-manifest.mjs';

function isWithinDirectory(candidatePath, directoryPath) {
  const relative = path.relative(directoryPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function canonicalSessionPath(targetPath) {
  try {
    return realpathSync.native?.(targetPath) ?? realpathSync(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return path.resolve(targetPath);
    }
    throw error;
  }
}

function isManagedSessionBoundary(targetPath, rootDir, homeDir) {
  const resolvedTargetPath = canonicalSessionPath(targetPath);
  return (
    isWithinDirectory(resolvedTargetPath, canonicalSessionPath(rootDir)) ||
    isWithinDirectory(resolvedTargetPath, canonicalSessionPath(homeDir))
  );
}

async function applySkillPatches(projection) {
  for (const patch of projection.patches ?? []) {
    if (patch.type === 'planning-with-files-companion-plan') {
      await applyPlanningWithFilesCompanionPlanPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'planning-with-files-skill-root') {
      await applyPlanningWithFilesSkillRootPatch(projection.targetPath, {
        preferGithubSkillRoot: projection.deploymentProfile === 'github-cloud'
      });
      continue;
    }

    if (patch.type === 'copilot-planning-with-files') {
      await applyCopilotPlanningPatch(projection.targetPath, {
        preferGithubSkillRoot: projection.deploymentProfile === 'github-cloud'
      });
      continue;
    }

    if (patch.type === 'superpowers-writing-plans') {
      await applySuperpowersWritingPlansPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'superpowers-executing-plans-replan') {
      await applySuperpowersExecutingPlansReplanPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'superpowers-subagent-driven-development-budget') {
      await applySuperpowersSubagentDrivenDevelopmentBudgetPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'superpowers-verification-before-completion') {
      await applySuperpowersVerificationBeforeCompletionPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'superpowers-finishing-a-development-branch') {
      await applySuperpowersFinishingADevelopmentBranchPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'superpowers-using-git-worktrees') {
      await applySuperpowersUsingGitWorktreesPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'superpowers-tdd-seam') {
      await applySuperpowersTddSeamPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'superpowers-debug-red-capable-loop') {
      await applySuperpowersDebugLoopPatch(projection.targetPath);
      continue;
    }

    if (patch.type === 'superpowers-code-review-axes') {
      await applySuperpowersReviewAxesPatch(projection.targetPath);
      continue;
    }

    throw new Error(`Unsupported skill patch type: ${patch.type}`);
  }
}

async function applySkillProjection(
  projection,
  ownedTargets,
  conflictMode,
  projectionMode,
  backupHandler
) {
  const effectiveStrategy =
    projection.strategy === 'link' && projectionMode === 'portable' ? 'materialize' : projection.strategy;

  if (effectiveStrategy === 'link') {
    await linkDirectoryProjection({
      sourcePath: projection.sourcePath,
      targetPath: projection.targetPath,
      ownedTargets,
      conflictMode,
      backupHandler
    });
    return effectiveStrategy;
  }

  if (effectiveStrategy === 'materialize') {
    await materializeDirectoryProjection({
      sourcePath: projection.sourcePath,
      targetPath: projection.targetPath,
      ownedTargets,
      conflictMode,
      backupHandler
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
        'sh -c \'[ -f .cursor/hooks/session-start ] && sh .cursor/hooks/session-start cursor || sh "$HOME/.cursor/hooks/session-start" cursor\'';
    }
  }

  if (projection.parentSkillName === 'superpowers' && projection.target === 'claude-code') {
    for (const entry of marked.hooks?.SessionStart ?? []) {
      for (const hook of entry.hooks ?? []) {
        hook.command =
          'sh -c \'[ -f .claude/hooks/session-start ] && sh .claude/hooks/session-start claude-code || sh "$HOME/.claude/hooks/session-start" claude-code\'';
      }
    }
  }

  return marked;
}

async function writeHookConfigProjection({ projection, ownedTargets, conflictMode, backupHandler }) {
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
      conflictMode,
      backupHandler
    });
    return;
  }

  await mkdir(path.dirname(projection.configTarget), { recursive: true });
  await writeFile(projection.configTarget, `${JSON.stringify(merged, null, 2)}\n`);
}

async function applyHookProjection(projection, ownedTargets, conflictMode, backupHandler) {
  if (projection.status === 'unsupported') return false;
  if (projection.status !== 'planned') {
    throw new Error(`Unsupported hook projection status: ${projection.status}`);
  }

  await writeHookConfigProjection({ projection, ownedTargets, conflictMode, backupHandler });
  ownedTargets.add(path.resolve(projection.configTarget));

  for (const sourcePath of projection.scriptSourcePaths) {
    const targetPath = path.join(projection.scriptTargetRoot, path.basename(sourcePath));
    await materializeFileProjection({
      sourcePath,
      targetPath,
      ownedTargets,
      conflictMode,
      backupHandler
    });
    ownedTargets.add(path.resolve(targetPath));
  }

  return true;
}

async function applyManagedProjection(projection, ownedTargets, conflictMode, backupHandler) {
  if (projection.kind === 'safety-directory') {
    await ensureDirectoryProjection({
      targetPath: projection.targetPath,
      ownedTargets,
      conflictMode,
      backupHandler
    });
    return;
  }

  if (projection.kind === 'safety-file') {
    await materializeFileProjection({
      sourcePath: projection.sourcePath,
      targetPath: projection.targetPath,
      ownedTargets,
      conflictMode,
      backupHandler
    });
    return;
  }

  throw new Error(`Unsupported managed projection kind: ${projection.kind}`);
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

export async function applySyncPlan(plan, options = {}) {
  const {
    rootDir,
    homeDir,
    state,
    currentManifest,
    conflictMode = 'reject',
    takeover = false
  } = options;
  const executionPlan = plan.executionPlan ?? plan;
  const backupManager = await createBackupArchiveManager({
    rootDir,
    homeDir,
    state,
    manifest: currentManifest,
    plan: executionPlan
  });
  const diff = diffProjectionManifest(currentManifest, plan.desiredManifest ?? executionPlan.manifest);
  const ownedTargets = takeover
    ? new Set([...ownedTargetSet(currentManifest), ...ownedTargetSet(plan.desiredManifest ?? executionPlan.manifest)])
    : ownedTargetSet(currentManifest);
  const normalization = await backupManager.normalizeLegacyBackups();
  let removedFiles = 0;
  let wroteFiles = 0;

  for (const warning of normalization.warnings) {
    console.warn(warning);
  }

  for (const entry of diff.stale) {
    if (isUserManagedTarget(entry.targetPath, executionPlan.userManaged)) {
      continue;
    }
    if (!isManagedSessionBoundary(entry.targetPath, rootDir, homeDir)) {
      continue;
    }
    await cleanupStaleProjection(entry);
    removedFiles += 1;
  }

  for (const entry of executionPlan.entryWrites) {
    if (isUserManagedTarget(entry.targetPath, executionPlan.userManaged)) {
      continue;
    }
    await writeRenderedProjection({
      targetPath: entry.targetPath,
      content: entry.content,
      ownedTargets,
      conflictMode,
      backupHandler: backupManager.backupHandler
    });
    ownedTargets.add(path.resolve(entry.targetPath));
    wroteFiles += 1;
  }

  for (const projection of executionPlan.skillWrites) {
    if (isUserManagedTarget(projection.targetPath, executionPlan.userManaged)) {
      continue;
    }
    const effectiveStrategy = await applySkillProjection(
      projection,
      ownedTargets,
      conflictMode,
      state.projectionMode,
      backupManager.backupHandler
    );
    if (!['link', 'materialize'].includes(effectiveStrategy)) {
      throw new Error(`Unsupported projection strategy: ${effectiveStrategy}`);
    }
    ownedTargets.add(path.resolve(projection.targetPath));
    wroteFiles += 1;
  }

  for (const projection of executionPlan.hookWrites) {
    if (isUserManagedTarget(projection.configTarget, executionPlan.userManaged)) {
      continue;
    }
    const installed = await applyHookProjection(
      projection,
      ownedTargets,
      conflictMode,
      backupManager.backupHandler
    );
    if (!installed) continue;

    ownedTargets.add(path.resolve(projection.configTarget));
    for (const sourcePath of projection.scriptSourcePaths) {
      ownedTargets.add(path.resolve(path.join(projection.scriptTargetRoot, path.basename(sourcePath))));
      wroteFiles += 1;
    }
    wroteFiles += 1;
  }

  for (const projection of executionPlan.managedWrites) {
    if (isUserManagedTarget(projection.targetPath, executionPlan.userManaged)) {
      continue;
    }
    await applyManagedProjection(
      projection,
      ownedTargets,
      conflictMode,
      backupManager.backupHandler
    );
    ownedTargets.add(path.resolve(projection.targetPath));
    wroteFiles += 1;
  }

  await writeProjectionManifest(rootDir, plan.desiredManifest ?? executionPlan.manifest);
  await updateState(rootDir, (currentState) => ({
    ...currentState,
    lastSync: new Date().toISOString()
  }));

  return {
    wroteFiles,
    removedFiles,
    projectionMode: state.projectionMode
  };
}
