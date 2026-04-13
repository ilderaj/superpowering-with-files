import { access, lstat, readFile, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { entriesForScope, loadAdapter } from './adapters.mjs';
import { COPILOT_PLANNING_PATCH_MARKER } from './copilot-planning-patch.mjs';
import { planHookProjections } from './hook-projection.mjs';
import { planSkillProjections } from './skill-projection.mjs';
import { readState } from './state.mjs';

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function effectiveStrategy(projection, projectionMode) {
  if (projection.strategy === 'link' && projectionMode === 'portable') {
    return 'materialize';
  }
  return projection.strategy;
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
  const skillFile = path.join(projection.targetPath, 'SKILL.md');
  if (!(await exists(skillFile))) {
    return { ...projection, status: 'problem', message: 'Materialized skill is missing SKILL.md.' };
  }

  if (projection.patch?.type === 'copilot-planning-with-files') {
    const text = await readFile(skillFile, 'utf8').catch(() => '');
    if (!text.includes(COPILOT_PLANNING_PATCH_MARKER)) {
      return {
        ...projection,
        status: 'problem',
        message: 'Copilot materialized copy is missing the Harness patch marker.'
      };
    }
  }

  return { ...projection, status: 'ok' };
}

async function inspectSkill(projection, projectionMode) {
  if (!(await exists(projection.targetPath))) {
    return { ...projection, status: 'missing', message: 'Skill projection is missing.' };
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

async function inspectHook(projection) {
  if (projection.status === 'unsupported') {
    return projection;
  }

  if (!(await exists(projection.configTarget))) {
    return { ...projection, status: 'missing', message: 'Hook config is missing.' };
  }

  for (const sourcePath of projection.scriptSourcePaths) {
    const targetPath = path.join(projection.scriptTargetRoot, path.basename(sourcePath));
    if (!(await exists(targetPath))) {
      return { ...projection, status: 'missing', message: `Hook script is missing: ${targetPath}` };
    }
  }

  return { ...projection, status: 'ok' };
}

export async function readHarnessHealth(rootDir, homeDir) {
  const state = await readState(rootDir);
  const targets = {};
  const problems = [];

  for (const target of Object.keys(state.targets).filter((name) => state.targets[name].enabled)) {
    const adapter = await loadAdapter(rootDir, target);
    const entries = [];

    for (const entryPath of entriesForScope(rootDir, homeDir, adapter, state.scope)) {
      const status = (await exists(entryPath)) ? 'ok' : 'missing';
      entries.push({ path: entryPath, status });
      if (status !== 'ok') {
        problems.push(`${target}: missing entry ${entryPath}`);
      }
    }

    const skills = [];
    for (const projection of await planSkillProjections({ rootDir, homeDir, scope: state.scope, target })) {
      const inspected = await inspectSkill(projection, state.projectionMode);
      skills.push(inspected);
      if (inspected.status !== 'ok') {
        problems.push(`${target}: ${inspected.skillName}: ${inspected.message}`);
      }
    }

    const hooks = [];
    for (const projection of await planHookProjections({
      rootDir,
      homeDir,
      scope: state.scope,
      target,
      hookMode: state.hookMode
    })) {
      const inspected = await inspectHook(projection);
      hooks.push(inspected);
      if (!['ok', 'unsupported'].includes(inspected.status)) {
        problems.push(`${target}: ${inspected.parentSkillName}: ${inspected.message}`);
      }
    }

    targets[target] = { entries, skills, hooks };
  }

  return {
    scope: state.scope,
    projectionMode: state.projectionMode,
    hookMode: state.hookMode,
    targets,
    problems
  };
}
