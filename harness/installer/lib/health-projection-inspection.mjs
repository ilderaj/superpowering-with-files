import { access, lstat, readFile, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { hookEntryMarker } from './hook-config.mjs';
import { planHookProjections } from './hook-projection.mjs';
import {
  classifySkillProjectionDuplicates,
  planSkillProjections
} from './skill-projection.mjs';
import { activeSafetyPolicyProfile } from './state.mjs';
import { readRuntimeHookEvidence, summarizeRuntimeEvidenceForProjection } from './runtime-hook-evidence.mjs';

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function effectiveStrategy(projection, projectionMode) {
  if (projection.strategy === 'link' && projectionMode === 'portable') {
    return 'materialize';
  }
  return projection.strategy;
}

async function inspectSharedSkillRoot(projection) {
  const rootStat = await lstat(path.dirname(projection.targetPath)).catch(() => null);
  if (projection.target === 'claude-code' && rootStat?.isSymbolicLink()) {
    return {
      ...projection,
      status: 'problem',
      message:
        'Claude Code shared skill root symlinks are not supported; project each skill into .claude/skills individually.'
    };
  }
  return null;
}

async function inspectLinkedSkill(projection) {
  const stat = await lstat(projection.targetPath);
  if (!stat.isSymbolicLink()) {
    return { ...projection, status: 'problem', message: 'Expected a symlink.' };
  }

  const linkTarget = await readlink(projection.targetPath);
  const resolvedLinkTarget = path.resolve(path.dirname(projection.targetPath), linkTarget);
  if ((await realpath(resolvedLinkTarget)) !== (await realpath(projection.sourcePath))) {
    return { ...projection, status: 'problem', message: 'Symlink points to the wrong source.' };
  }

  return { ...projection, status: 'ok' };
}

async function inspectMaterializedSkill(projection) {
  const stat = await lstat(projection.targetPath).catch(() => null);
  if (stat?.isSymbolicLink()) {
    return {
      ...projection,
      status: 'problem',
      message: 'Expected a materialized directory, but found a symlink.'
    };
  }

  if (!stat?.isDirectory()) {
    return {
      ...projection,
      status: 'problem',
      message: 'Materialized skill must be a directory.'
    };
  }

  const skillFile = path.join(projection.targetPath, 'SKILL.md');
  if (!(await exists(skillFile))) {
    return { ...projection, status: 'problem', message: 'Materialized skill is missing SKILL.md.' };
  }

  for (const patch of projection.patches ?? []) {
    const text = await readFile(skillFile, 'utf8').catch(() => '');
    if (!text.includes(patch.marker)) {
      return {
        ...projection,
        status: 'problem',
        message: `Materialized skill is missing the Harness patch marker: ${patch.marker}.`
      };
    }
  }

  return { ...projection, status: 'ok' };
}

export async function inspectSkill(projection, projectionMode) {
  if (!(await exists(projection.targetPath))) {
    return { ...projection, status: 'missing', message: 'Skill projection is missing.' };
  }

  const sharedRootProblem = await inspectSharedSkillRoot(projection);
  if (sharedRootProblem) {
    return sharedRootProblem;
  }

  const strategy = effectiveStrategy(projection, projectionMode);
  if (strategy === 'link') {
    return inspectLinkedSkill({ ...projection, strategy });
  }

  if (strategy === 'materialize') {
    return inspectMaterializedSkill({ ...projection, strategy });
  }

  return { ...projection, status: 'problem', message: `Unsupported projection strategy: ${strategy}` };
}

function hookConfigHasMarker(config, marker) {
  if (!isPlainObject(config) || !isPlainObject(config.hooks)) return false;

  return Object.values(config.hooks).some(
    (entries) => Array.isArray(entries) && entries.some((entry) => hookEntryMarker(entry) === marker)
  );
}

function hookConfigHasEvent(config, eventName) {
  return Array.isArray(config?.hooks?.[eventName]) && config.hooks[eventName].length > 0;
}

const HOOK_EVIDENCE_BY_TARGET = {
  codex: { evidenceLevel: 'verified' },
  copilot: { evidenceLevel: 'verified' },
  cursor: { evidenceLevel: 'verified' },
  'claude-code': {
    evidenceLevel: 'config-verified',
    configEvidence: 'settings-hook-present',
    runtimeEvidence: 'not-measured'
  }
};

function hookEvidence(projection) {
  return (
    HOOK_EVIDENCE_BY_TARGET[projection.target] ?? {
      evidenceLevel: 'provisional',
      message: `Official hook documentation has not been verified for ${projection.target}.`
    }
  );
}

export function formatHookProblem(target, inspected) {
  if (
    target === 'claude-code' &&
    typeof inspected?.configTarget === 'string' &&
    /^Hook config\b/.test(inspected.message ?? '')
  ) {
    return `${target}: ${inspected.parentSkillName}: ${inspected.message} Expected Harness-managed hook settings at ${inspected.configTarget}.`;
  }

  return `${target}: ${inspected.parentSkillName}: ${inspected.message}`;
}

export async function inspectHook(projection) {
  if (projection.status === 'unsupported') {
    return projection;
  }

  if (!(await exists(projection.configTarget))) {
    return { ...projection, status: 'missing', message: 'Hook config is missing.' };
  }

  let configText;
  try {
    configText = await readFile(projection.configTarget, 'utf8');
  } catch {
    return { ...projection, status: 'problem', message: 'Hook config is unreadable.' };
  }

  let config;
  try {
    config = JSON.parse(configText);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      return { ...projection, status: 'problem', message: 'Hook config is unreadable.' };
    }
    return { ...projection, status: 'problem', message: 'Hook config is malformed JSON.' };
  }

  const marker = `Harness-managed ${projection.parentSkillName} hook`;
  if (!hookConfigHasMarker(config, marker)) {
    return { ...projection, status: 'problem', message: `Hook config is missing ${marker}.` };
  }

  const missingEvents = (projection.eventNames ?? []).filter((eventName) => !hookConfigHasEvent(config, eventName));
  if (missingEvents.length > 0) {
    return {
      ...projection,
      status: 'problem',
      message: missingEvents.map((eventName) => `Hook config is missing required event ${eventName}.`).join(' ')
    };
  }

  for (const sourcePath of projection.scriptSourcePaths) {
    const targetPath = path.join(projection.scriptTargetRoot, path.basename(sourcePath));
    if (!(await exists(targetPath))) {
      return { ...projection, status: 'missing', message: `Hook script is missing: ${targetPath}` };
    }
  }

  return { ...projection, ...hookEvidence(projection), status: 'ok' };
}

function formatDuplicateSkillMessage(duplicate) {
  return [
    `skill duplicate ${duplicate.target} ${duplicate.skillName}: ${duplicate.classification}.`,
    `source path: ${duplicate.sourcePaths.join(', ') || 'unknown'}.`,
    `resolved path: ${duplicate.resolvedPath}.`,
    `target path: ${duplicate.targetPaths.join(', ')}.`
  ].join(' ');
}

export async function inspectProjectionHealth({ rootDir, homeDir, state, target }) {
  const plannedSkillProjections = await planSkillProjections({
    rootDir,
    homeDir,
    scope: state.scope,
    target,
    skillProfile: state.skillProfile,
    deploymentProfile: state.deploymentProfile
  });
  const duplicateSkillFindings = await classifySkillProjectionDuplicates(plannedSkillProjections);
  const duplicateSkillByTargetPath = new Map();
  const duplicateMessages = [];

  for (const duplicate of duplicateSkillFindings) {
    duplicateMessages.push({
      severity: duplicate.classification === 'true-duplicate' ? 'problem' : 'warning',
      message: formatDuplicateSkillMessage(duplicate)
    });
    for (const targetPath of duplicate.targetPaths) {
      duplicateSkillByTargetPath.set(path.resolve(targetPath), duplicate);
    }
  }

  const skills = [];
  for (const projection of plannedSkillProjections) {
    const inspected = await inspectSkill(projection, state.projectionMode);
    const duplicateSkill = duplicateSkillByTargetPath.get(path.resolve(projection.targetPath));
    if (duplicateSkill) {
      inspected.duplicateClassification = duplicateSkill.classification;
      inspected.duplicateResolvedPath = duplicateSkill.resolvedPath;
    }
    skills.push(inspected);
  }

  let hooks = [];
  for (const projection of await planHookProjections({
    rootDir,
    homeDir,
    scope: state.scope,
    target,
    hookMode: state.hookMode,
    policyProfile: activeSafetyPolicyProfile(state)
  })) {
    hooks.push(await inspectHook(projection));
  }

  const runtimeEvidence = await readRuntimeHookEvidence(rootDir, target);
  hooks = hooks.map((hook) =>
    hook.status === 'ok'
      ? { ...hook, ...summarizeRuntimeEvidenceForProjection(hook, runtimeEvidence, rootDir) }
      : hook
  );

  return {
    skills,
    hooks,
    duplicateMessages,
    runtimeWarnings: runtimeEvidence.warnings ?? []
  };
}
