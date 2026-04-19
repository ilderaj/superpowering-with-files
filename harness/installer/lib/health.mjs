import { execFile } from 'node:child_process';
import { access, lstat, readFile, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { entriesForScope, loadAdapter } from './adapters.mjs';
import { evaluateBudget, loadContextBudgets, measureText } from './context-budget.mjs';
import { hookEntryMarker } from './hook-config.mjs';
import { planHookProjections } from './hook-projection.mjs';
import { inspectPlanLocations } from './plan-locations.mjs';
import { planSkillProjections } from './skill-projection.mjs';
import { readState } from './state.mjs';

const execFileAsync = promisify(execFile);

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

async function inspectSkill(projection, projectionMode) {
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

function hookEvidence(projection) {
  if (projection.target === 'cursor') {
    return {
      evidenceLevel: 'provisional',
      message:
        'The official Cursor hook documentation has not been verified for this path/schema contract.'
    };
  }

  return {
    evidenceLevel: 'verified'
  };
}

function publicUpstreamStatus(upstream = {}) {
  const result = {};
  for (const [sourceName, sourceState] of Object.entries(upstream)) {
    if (!isPlainObject(sourceState)) continue;

    const publicState = {};
    for (const key of ['candidatePath', 'appliedPath', 'lastFetch', 'lastUpdate']) {
      if (typeof sourceState[key] === 'string') {
        publicState[key] = sourceState[key];
      }
    }
    result[sourceName] = publicState;
  }
  return result;
}

function createEmptyContextTotals() {
  return {
    chars: 0,
    lines: 0,
    approxTokens: 0,
    verdict: 'ok',
    evaluation: null
  };
}

function createEmptyContext() {
  return {
    entries: [],
    hooks: [],
    planning: [],
    skillProfiles: [],
    summary: {
      entries: createEmptyContextTotals()
    },
    warnings: []
  };
}

function formatBudgetThresholds(budget) {
  return `warn ${budget.warn.chars} chars, ${budget.warn.lines} lines, ${budget.warn.tokens} tokens; problem ${budget.problem.chars} chars, ${budget.problem.lines} lines, ${budget.problem.tokens} tokens`;
}

function formatBudgetMessage(scopeName, measurement, budget, verdict) {
  return `context ${scopeName} ${verdict}: ${measurement.chars} chars, ${measurement.lines} lines, ${measurement.approxTokens} approx tokens (${formatBudgetThresholds(budget)})`;
}

function toBudgetEvaluation(evaluation, budget) {
  return {
    ...evaluation,
    thresholds: budget
  };
}

function addUniqueMessage(collection, message) {
  if (!collection.includes(message)) {
    collection.push(message);
  }
}

async function inspectHook(projection) {
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

  for (const eventName of projection.eventNames ?? []) {
    if (!hookConfigHasEvent(config, eventName)) {
      return { ...projection, status: 'problem', message: `Hook config is missing required event ${eventName}.` };
    }
  }

  for (const sourcePath of projection.scriptSourcePaths) {
    const targetPath = path.join(projection.scriptTargetRoot, path.basename(sourcePath));
    if (!(await exists(targetPath))) {
      return { ...projection, status: 'missing', message: `Hook script is missing: ${targetPath}` };
    }
  }

  return { ...projection, ...hookEvidence(projection), status: 'ok' };
}

async function runHookPayloadScript(rootDir, scriptPath, args = []) {
  const { stdout } = await execFileAsync('bash', [scriptPath, ...args], {
    cwd: rootDir,
    env: {
      ...process.env,
      HARNESS_PROJECT_ROOT: rootDir
    },
    maxBuffer: 1024 * 1024
  });

  return stdout;
}

async function inspectLocalHookPayloads(
  rootDir,
  hookPayloadBudget,
  hookMode,
  contextWarnings,
  warnings,
  problems
) {
  if (hookMode !== 'on' || !hookPayloadBudget) {
    return [];
  }

  const payloadSpecs = [
    {
      target: 'codex',
      parentSkillName: 'superpowers',
      eventName: 'SessionStart',
      path: path.join(rootDir, 'harness/core/hooks/superpowers/scripts/session-start'),
      args: []
    },
    {
      target: 'codex',
      parentSkillName: 'planning-with-files',
      eventName: 'UserPromptSubmit',
      path: path.join(rootDir, 'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'),
      args: ['codex', 'user-prompt-submit']
    }
  ];

  const measurements = [];

  for (const spec of payloadSpecs) {
    if (!(await exists(spec.path))) {
      continue;
    }

    const payload = await runHookPayloadScript(rootDir, spec.path, spec.args).catch(() => null);
    if (payload === null) {
      continue;
    }

    const measurement = measureText(payload);
    const evaluation = evaluateBudget(measurement, hookPayloadBudget);
    const entry = {
      target: spec.target,
      parentSkillName: spec.parentSkillName,
      eventName: spec.eventName,
      path: spec.path,
      measurement,
      evaluation: toBudgetEvaluation(evaluation, hookPayloadBudget)
    };

    measurements.push(entry);

    if (evaluation.verdict !== 'ok') {
      const message = formatBudgetMessage(
        `hook payload ${spec.target} ${spec.parentSkillName} ${spec.eventName}`,
        measurement,
        hookPayloadBudget,
        evaluation.verdict
      );
      addUniqueMessage(contextWarnings, message);
      addUniqueMessage(warnings, message);
      if (evaluation.verdict === 'problem') {
        addUniqueMessage(problems, message);
      }
    }
  }

  return measurements;
}

export async function readHarnessHealth(rootDir, homeDir) {
  const state = await readState(rootDir);
  let budgets = null;
  const targets = {};
  const problems = [];
  const warnings = [];
  const planLocations = await inspectPlanLocations(rootDir);
  const context = createEmptyContext();
  let budgetLoadProblem = null;

  try {
    budgets = await loadContextBudgets(rootDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    budgetLoadProblem = `context-budgets: ${message}`;
    problems.push(budgetLoadProblem);
  }

  for (const location of planLocations) {
    if (location.severity === 'warning') {
      warnings.push(`${location.path}: ${location.message}`);
      continue;
    }

    if (location.severity === 'problem') {
      problems.push(`plan-locations: ${location.path}: ${location.message}`);
    }
  }

  const entryBudget = budgets?.budgets?.entry;

  for (const target of Object.keys(state.targets).filter((name) => state.targets[name].enabled)) {
    const adapter = await loadAdapter(rootDir, target);
    const entries = [];

    for (const entryPath of entriesForScope(rootDir, homeDir, adapter, state.scope)) {
      const status = (await exists(entryPath)) ? 'ok' : 'missing';
      entries.push({ path: entryPath, status });
      if (status !== 'ok') {
        problems.push(`${target}: missing entry ${entryPath}`);
      } else {
        const measurement = measureText(await readFile(entryPath, 'utf8').catch(() => ''));
        const entryContext = {
          target,
          path: entryPath,
          measurement,
          evaluation: null
        };

        context.summary.entries.chars += measurement.chars;
        context.summary.entries.lines += measurement.lines;
        context.summary.entries.approxTokens += measurement.approxTokens;

        if (entryBudget) {
          const evaluation = evaluateBudget(measurement, entryBudget);
          entryContext.evaluation = toBudgetEvaluation(evaluation, entryBudget);

          if (evaluation.verdict !== 'ok') {
            const message = formatBudgetMessage(`entry ${target} ${entryPath}`, measurement, entryBudget, evaluation.verdict);
            addUniqueMessage(context.warnings, message);
            if (evaluation.verdict === 'problem') {
              addUniqueMessage(problems, message);
            }
          }
        }

        context.entries.push(entryContext);
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

  context.hooks = await inspectLocalHookPayloads(
    rootDir,
    budgets?.budgets?.hookPayload,
    state.hookMode,
    context.warnings,
    warnings,
    problems
  );

  if (entryBudget) {
    const evaluation = evaluateBudget(context.summary.entries, entryBudget);
    context.summary.entries.verdict = evaluation.verdict;
    context.summary.entries.evaluation = toBudgetEvaluation(evaluation, entryBudget);

    if (evaluation.verdict !== 'ok') {
      const message = formatBudgetMessage('entry summary', context.summary.entries, entryBudget, evaluation.verdict);
      addUniqueMessage(context.warnings, message);
    }
  } else {
    context.summary.entries.verdict = 'unknown';
  }

  return {
    scope: state.scope,
    projectionMode: state.projectionMode,
    hookMode: state.hookMode,
    lastSync: state.lastSync,
    lastFetch: state.lastFetch,
    lastUpdate: state.lastUpdate,
    upstream: publicUpstreamStatus(state.upstream),
    planLocations,
    warnings,
    context,
    targets,
    problems
  };
}
