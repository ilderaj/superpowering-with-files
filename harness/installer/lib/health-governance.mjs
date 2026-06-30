import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { readBackupIndex } from './backup-archive.mjs';
import { loadPlatforms } from './metadata.mjs';
import { resolveHookRoots, resolveSkillRoots, resolveTargetPaths } from './paths.mjs';
import {
  PLANNING_WITH_FILES_DESTRUCTIVE_LOG_PATCH_MARKER,
  PLANNING_WITH_FILES_RISK_ASSESSMENT_PATCH_MARKER
} from './planning-with-files-risk-assessment-patch.mjs';
import { isSafetyPolicyProfile, resolveAgentConfigRoots } from './safety-projection.mjs';
import { activeSafetyPolicyProfile } from './state.mjs';
import { readUserManaged } from './user-managed.mjs';

const COPILOT_SCOPE_OVERLAP_RECOMMENDED_ACTION =
  'choose one canonical scope for Copilot unless the workspace install is intentionally overriding safety policy.';

export const MINIMAL_GLOBAL_RECOMMENDED_WARNING =
  'minimal-global stays the recommended default; choose a heavier profile only when the task explicitly needs broader projected context and the operator accepts the extra payload/runtime cost.';

function uniqueSortedPaths(paths) {
  return [...new Set(paths.map((entry) => path.resolve(entry)))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function parseLegacySiblingBackup(targetPath) {
  const marker = '.harness-backup-';
  const markerIndex = targetPath.lastIndexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  return targetPath.slice(0, markerIndex);
}

async function findLegacySiblingBackups(rootPath) {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.name.includes('.harness-backup-'))
      .map((entry) => {
        const targetPath = path.join(rootPath, entry.name);
        const originalPath = parseLegacySiblingBackup(targetPath);
        return originalPath ? { targetPath, originalPath } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.targetPath.localeCompare(right.targetPath));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function inspectBackupGovernance(rootDir, homeDir) {
  const metadata = await loadPlatforms(rootDir);
  const managedRoots = uniqueSortedPaths(
    Object.keys(metadata.platforms ?? {}).flatMap((target) => [
      ...resolveTargetPaths(rootDir, homeDir, 'user-global', target).map((entryPath) =>
        path.dirname(entryPath)
      ),
      ...resolveSkillRoots(rootDir, homeDir, 'user-global', target),
      ...resolveHookRoots(rootDir, homeDir, 'user-global', target)
    ])
  );
  const legacyBackups = uniqueSortedPaths(
    (
      await Promise.all(
        managedRoots.map(async (rootPath) =>
          (await findLegacySiblingBackups(rootPath)).map((backup) => backup.targetPath)
        )
      )
    ).flat()
  );
  const archiveIndex = await readBackupIndex(homeDir);
  const archiveIndexDrift = [];

  for (const entry of archiveIndex.entries ?? []) {
    if (!entry || typeof entry !== 'object' || typeof entry.archivePath !== 'string' || entry.archivePath.length === 0) {
      archiveIndexDrift.push(`backup index contains an invalid archive entry for ${entry?.originalPath ?? 'unknown path'}`);
      continue;
    }

    const archivePath = path.resolve(entry.archivePath);
    if (!(await exists(archivePath))) {
      archiveIndexDrift.push(
        `backup index references missing archive ${archivePath} for ${entry.originalPath ?? 'unknown path'}`
      );
    }
  }

  return {
    legacyBackups,
    archiveIndexDrift: [...new Set(archiveIndexDrift)].sort((left, right) => left.localeCompare(right))
  };
}

function pathScope(rootDir, homeDir, targetPath) {
  const resolvedPath = path.resolve(targetPath);
  const resolvedRootDir = path.resolve(rootDir);
  const resolvedHomeDir = path.resolve(homeDir);
  const matchingScopes = [];

  if (resolvedPath === resolvedRootDir || resolvedPath.startsWith(`${resolvedRootDir}${path.sep}`)) {
    matchingScopes.push({ scope: 'workspace', prefixLength: resolvedRootDir.length });
  }

  if (resolvedPath === resolvedHomeDir || resolvedPath.startsWith(`${resolvedHomeDir}${path.sep}`)) {
    matchingScopes.push({ scope: 'user-global', prefixLength: resolvedHomeDir.length });
  }

  if (matchingScopes.length === 0) {
    return 'external';
  }

  matchingScopes.sort((left, right) => right.prefixLength - left.prefixLength || left.scope.localeCompare(right.scope));
  return matchingScopes[0].scope;
}

export function inspectScopeOverlap(rootDir, homeDir, targets) {
  const overlaps = [];

  for (const [target, targetHealth] of Object.entries(targets)) {
    if (target !== 'copilot') {
      continue;
    }

    const scopes = new Set();
    for (const entry of targetHealth.entries ?? []) {
      scopes.add(pathScope(rootDir, homeDir, entry.path));
    }
    for (const hook of targetHealth.hooks ?? []) {
      if (typeof hook.configTarget === 'string') {
        scopes.add(pathScope(rootDir, homeDir, hook.configTarget));
      }
    }

    if (scopes.has('workspace') && scopes.has('user-global')) {
      overlaps.push({
        target,
        scopes: ['user-global', 'workspace'],
        verdict: 'warning',
        message: 'Copilot is projected in both workspace and user-global scopes; this can duplicate startup and hook context.',
        recommendedAction: COPILOT_SCOPE_OVERLAP_RECOMMENDED_ACTION
      });
    }
  }

  const recommendedAction = overlaps.length > 0
    ? COPILOT_SCOPE_OVERLAP_RECOMMENDED_ACTION
    : null;

  return {
    verdict: overlaps.length > 0 ? 'warning' : 'ok',
    targets: overlaps.map((overlap) => overlap.target),
    overlaps,
    details: overlaps.map((overlap) => `${overlap.target} -> workspace + user-global`),
    message: overlaps[0]?.message ?? null,
    recommendedAction
  };
}

async function fileHasNonEmptyLines(filePath) {
  const text = await readFile(filePath, 'utf8').catch(() => null);
  if (text === null) return false;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length > 0;
}

async function isExecutable(filePath) {
  const targetStat = await stat(filePath).catch(() => null);
  return Boolean(targetStat && (targetStat.mode & 0o111) !== 0);
}

async function isWritable(targetPath) {
  try {
    await access(targetPath, 2);
    return true;
  } catch {
    return false;
  }
}

async function inspectPlanningRiskAssessmentTemplates(targets) {
  const planningRoots = new Set();

  for (const targetHealth of Object.values(targets)) {
    for (const skill of targetHealth.skills ?? []) {
      if (skill.parentSkillName === 'planning-with-files' && typeof skill.targetPath === 'string') {
        planningRoots.add(skill.targetPath);
      }
    }
  }

  if (planningRoots.size === 0) {
    return {
      status: 'problem',
      message: 'planning-with-files is not projected into the active install.'
    };
  }

  for (const root of planningRoots) {
    const [taskPlanTemplate, findingsTemplate] = await Promise.all([
      readFile(path.join(root, 'templates/task_plan.md'), 'utf8').catch(() => ''),
      readFile(path.join(root, 'templates/findings.md'), 'utf8').catch(() => '')
    ]);

    if (!taskPlanTemplate.includes(PLANNING_WITH_FILES_RISK_ASSESSMENT_PATCH_MARKER)) {
      return {
        status: 'problem',
        message: `planning-with-files task_plan.md is missing ${PLANNING_WITH_FILES_RISK_ASSESSMENT_PATCH_MARKER}.`
      };
    }

    if (!findingsTemplate.includes(PLANNING_WITH_FILES_DESTRUCTIVE_LOG_PATCH_MARKER)) {
      return {
        status: 'problem',
        message: `planning-with-files findings.md is missing ${PLANNING_WITH_FILES_DESTRUCTIVE_LOG_PATCH_MARKER}.`
      };
    }
  }

  return { status: 'ok' };
}

async function inspectSafetyHealth(rootDir, homeDir, state, targets) {
  const profile = activeSafetyPolicyProfile(state);
  const enabled = isSafetyPolicyProfile(profile);
  if (!enabled) {
    return {
      enabled: false,
      profile,
      checks: []
    };
  }

  const checks = [];
  const agentConfigRoots = resolveAgentConfigRoots(rootDir, homeDir, state.scope);
  const safetyHooks = Object.entries(targets).map(([target, targetHealth]) => ({
    target,
    hooks: (targetHealth.hooks ?? []).filter((hook) => hook.parentSkillName === 'safety')
  }));

  const hooksInstalled = safetyHooks.every(({ hooks }) => hooks.every((hook) => hook.status === 'ok'));
  checks.push({
    name: 'hooksInstalled',
    status: hooksInstalled ? 'ok' : 'problem',
    message: hooksInstalled ? undefined : 'Safety hooks are missing or unhealthy for one or more targets.'
  });

  const pretoolTargets = [];
  for (const { hooks } of safetyHooks) {
    for (const hook of hooks) {
      for (const sourcePath of hook.scriptSourcePaths ?? []) {
        if (path.basename(sourcePath) !== 'pretool-guard.sh') continue;
        pretoolTargets.push(path.join(hook.scriptTargetRoot, path.basename(sourcePath)));
      }
    }
  }
  const pretoolGuardExecutable =
    pretoolTargets.length > 0 &&
    (await Promise.all(pretoolTargets.map((targetPath) => isExecutable(targetPath)))).every(Boolean);
  checks.push({
    name: 'pretoolGuardExecutable',
    status: pretoolGuardExecutable ? 'ok' : 'problem',
    message: pretoolGuardExecutable ? undefined : 'Projected pretool-guard.sh is missing or not executable.'
  });

  const checkpointTargets = agentConfigRoots.map(({ root }) => path.join(root, 'bin/checkpoint'));
  const checkpointExecutable =
    checkpointTargets.length > 0 &&
    (await Promise.all(checkpointTargets.map((targetPath) => isExecutable(targetPath)))).every(Boolean);
  checks.push({
    name: 'checkpointExecutable',
    status: checkpointExecutable ? 'ok' : 'problem',
    message: checkpointExecutable ? undefined : 'Projected checkpoint binary is missing or not executable.'
  });

  const protectedPathsConfigured =
    agentConfigRoots.length > 0 &&
    (await Promise.all(
      agentConfigRoots.map(({ root }) => fileHasNonEmptyLines(path.join(root, 'safety/protected-paths.txt')))
    )).every(Boolean);
  checks.push({
    name: 'protectedPathsConfigured',
    status: protectedPathsConfigured ? 'ok' : 'problem',
    message: protectedPathsConfigured ? undefined : 'protected-paths.txt is missing or empty.'
  });

  const dangerousPatternsConfigured =
    agentConfigRoots.length > 0 &&
    (await Promise.all(
      agentConfigRoots.map(({ root }) =>
        fileHasNonEmptyLines(path.join(root, 'safety/dangerous-patterns.txt'))
      )
    )).every(Boolean);
  checks.push({
    name: 'dangerousPatternsConfigured',
    status: dangerousPatternsConfigured ? 'ok' : 'problem',
    message: dangerousPatternsConfigured ? undefined : 'dangerous-patterns.txt is missing or empty.'
  });

  const logsWritable =
    agentConfigRoots.length > 0 &&
    (await Promise.all(agentConfigRoots.map(({ root }) => isWritable(path.join(root, 'logs'))))).every(Boolean);
  checks.push({
    name: 'logsWritable',
    status: logsWritable ? 'ok' : 'problem',
    message: logsWritable ? undefined : 'Safety logs directory is missing or not writable.'
  });

  const checkpointDirWritable =
    agentConfigRoots.length > 0 &&
    (await Promise.all(agentConfigRoots.map(({ root }) => isWritable(path.join(root, 'checkpoints'))))).every(
      Boolean
    );
  checks.push({
    name: 'checkpointDirWritable',
    status: checkpointDirWritable ? 'ok' : 'problem',
    message: checkpointDirWritable ? undefined : 'Checkpoint directory is missing or not writable.'
  });

  const riskTemplate = await inspectPlanningRiskAssessmentTemplates(targets);
  checks.push({
    name: 'riskAssessmentTemplatePatched',
    status: riskTemplate.status,
    message: riskTemplate.message
  });

  checks.push({
    name: 'workspaceInICloud',
    status: /iCloud|Mobile Documents/.test(rootDir) ? 'warning' : 'ok',
    message: /iCloud|Mobile Documents/.test(rootDir)
      ? 'Workspace appears to live inside iCloud Drive; checkpoint and destructive operations are riskier there.'
      : undefined
  });

  return {
    enabled,
    profile,
    checks
  };
}

export async function inspectGovernanceHealth({ rootDir, homeDir, state, targets }) {
  const scopeOverlap = inspectScopeOverlap(rootDir, homeDir, targets);
  const safety = await inspectSafetyHealth(rootDir, homeDir, state, targets);
  const userManaged = await readUserManaged(homeDir);
  const userManagedProblems = [];

  for (const managedPath of userManaged.paths ?? []) {
    if (!(await exists(managedPath))) {
      userManagedProblems.push(`user-managed: missing personal projection ${managedPath}`);
    }
  }

  const backupGovernance = await inspectBackupGovernance(rootDir, homeDir);

  return {
    scopeOverlap,
    safety,
    userManaged,
    userManagedProblems,
    backupGovernance
  };
}
