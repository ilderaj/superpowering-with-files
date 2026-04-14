import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveHookRoots } from './paths.mjs';

const PLANNING_SUPPORTED_TARGETS = new Set(['codex', 'copilot', 'cursor', 'claude-code']);

const PLANNING_EVENTS_BY_TARGET = {
  codex: ['SessionStart', 'UserPromptSubmit', 'Stop'],
  copilot: ['sessionStart', 'preToolUse', 'postToolUse', 'agentStop', 'errorOccurred'],
  cursor: ['userPromptSubmit', 'preToolUse', 'postToolUse', 'stop'],
  'claude-code': ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']
};

async function loadSkillIndex(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, 'harness/core/skills/index.json'), 'utf8'));
}

function hookConfigTarget(root, target, parentSkillName) {
  if (target === 'copilot') {
    return path.join(root, `${parentSkillName}.json`);
  }

  if (target === 'claude-code') {
    return path.join(root, 'settings.json');
  }

  return path.join(root, 'hooks.json');
}

function scriptTargetRoot(root, target) {
  if (target === 'copilot') {
    return root;
  }

  return path.join(root, 'hooks');
}

function taskScopedPlanningProjection({ rootDir, root, target, parentSkillName, hookConfig }) {
  if (!PLANNING_SUPPORTED_TARGETS.has(target)) {
    return {
      kind: 'hook',
      parentSkillName,
      target,
      status: 'unsupported',
      message: `No verified planning-with-files hook adapter for ${target}.`
    };
  }

  const sourceRoot = path.join(rootDir, hookConfig.source);
  const configName = target === 'claude-code' ? 'claude-hooks.json' : `${target}-hooks.json`;
  return {
    kind: 'hook',
    parentSkillName,
    target,
    eventNames: PLANNING_EVENTS_BY_TARGET[target] ?? [],
    configSource: path.join(sourceRoot, configName),
    configTarget: hookConfigTarget(root, target, parentSkillName),
    configFormat: target === 'claude-code' ? 'settings' : 'hooks',
    scriptSourcePaths: [path.join(sourceRoot, 'scripts/task-scoped-hook.sh')],
    scriptTargetRoot: scriptTargetRoot(root, target),
    status: 'planned'
  };
}

function configuredHookProjection({ rootDir, root, target, parentSkillName, hookConfig }) {
  if (!hookConfig) {
    return {
      kind: 'hook',
      parentSkillName,
      target,
      status: 'unsupported',
      message: `No verified ${parentSkillName} hook adapter for ${target}.`
    };
  }

  const sourceRoot = path.join(rootDir, hookConfig.source);
  const scriptRoot = hookConfig.scriptRoot
    ? path.join(sourceRoot, hookConfig.scriptRoot)
    : sourceRoot;
  const scripts = hookConfig.scripts ?? ['session-start', 'run-hook.cmd'];
  return {
    kind: 'hook',
    parentSkillName,
    target,
    eventNames: hookConfig.events ?? [],
    configSource: path.join(sourceRoot, hookConfig.config),
    configTarget: hookConfigTarget(root, target, parentSkillName),
    configFormat: target === 'claude-code' ? 'settings' : 'hooks',
    scriptSourcePaths: scripts.map((script) => path.join(scriptRoot, script)),
    scriptTargetRoot: scriptTargetRoot(root, target),
    status: 'planned'
  };
}

export async function planHookProjections({ rootDir, homeDir, scope, target, hookMode }) {
  if (hookMode !== 'on') return [];

  const index = await loadSkillIndex(rootDir);
  const roots = resolveHookRoots(rootDir, homeDir, scope, target);
  const projections = [];

  for (const [parentSkillName, skill] of Object.entries(index.skills).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const targetHookConfig = skill.hooks?.[target] ?? skill.hooks?.default;

    for (const root of roots) {
      if (targetHookConfig?.adapter === 'task-scoped-planning') {
        projections.push(
          taskScopedPlanningProjection({
            rootDir,
            root,
            target,
            parentSkillName,
            hookConfig: targetHookConfig
          })
        );
      } else {
        projections.push(
          configuredHookProjection({
            rootDir,
            root,
            target,
            parentSkillName,
            hookConfig: skill.hooks?.[target]
          })
        );
      }
    }
  }

  return projections;
}
