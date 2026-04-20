import { execFile } from 'node:child_process';
import { access, lstat, readFile, readdir, readlink, realpath } from 'node:fs/promises';
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
const HOOK_PAYLOAD_TIMEOUT_MS = 2000;
const MEASURED_HOOK_PAYLOAD_SKILLS = new Set(['superpowers', 'planning-with-files']);
const MEASURED_HOOK_PAYLOAD_TARGETS = new Set(['codex']);
const VERDICT_RANK = {
  unknown: -1,
  ok: 0,
  warning: 1,
  problem: 2
};

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findSingleActiveTaskDir(rootDir) {
  const activeRoot = path.join(rootDir, 'planning/active');
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  const matches = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const planPath = path.join(activeRoot, entry.name, 'task_plan.md');
    let planText;
    try {
      planText = await readFile(planPath, 'utf8');
    } catch {
      continue;
    }

    if (/^Status:\s*active$/m.test(planText)) {
      matches.push(path.join(activeRoot, entry.name));
    }
  }

  return matches.length === 1 ? matches[0] : null;
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
    target: null,
    targets: [],
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

function addMeasurement(targets, target, measurement) {
  const current = targets.get(target) ?? {
    target,
    chars: 0,
    lines: 0,
    approxTokens: 0
  };

  current.chars += measurement.chars;
  current.lines += measurement.lines;
  current.approxTokens += measurement.approxTokens;
  targets.set(target, current);
}

function chooseWorstEntryTotal(totals) {
  return totals.reduce((current, candidate) => {
    if (!current) return candidate;

    const currentRank = VERDICT_RANK[current.verdict] ?? 0;
    const candidateRank = VERDICT_RANK[candidate.verdict] ?? 0;
    if (candidateRank !== currentRank) {
      return candidateRank > currentRank ? candidate : current;
    }

    if (candidate.approxTokens !== current.approxTokens) {
      return candidate.approxTokens > current.approxTokens ? candidate : current;
    }

    if (candidate.chars !== current.chars) {
      return candidate.chars > current.chars ? candidate : current;
    }

    return candidate.lines > current.lines ? candidate : current;
  }, null);
}

function buildHookPayloadEnv(rootDir, homeDir) {
  return {
    PATH: process.env.PATH ?? '',
    HOME: homeDir,
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    HARNESS_PROJECT_ROOT: rootDir
  };
}

function selectRuntimeSourcePath(projection) {
  return (
    projection.scriptSourcePaths?.find((sourcePath) => {
      const base = path.basename(sourcePath);
      return !base.endsWith('.mjs') && !base.endsWith('.cmd');
    }) ?? null
  );
}

function selectHookPayloadArgs(projection) {
  if (projection.parentSkillName !== 'planning-with-files') {
    return [];
  }

  const eventName =
    projection.eventNames?.find((name) => /userpromptsubmit/i.test(name)) ??
    projection.eventNames?.[0] ??
    'UserPromptSubmit';
  const eventArg = eventName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();

  return [projection.target, eventArg];
}

function selectHookPayloadEventName(projection) {
  if (projection.parentSkillName !== 'planning-with-files') {
    return projection.eventNames?.[0] ?? null;
  }

  return (
    projection.eventNames?.find((name) => /userpromptsubmit/i.test(name)) ??
    projection.eventNames?.[0] ??
    null
  );
}

function createHookPayloadFailureEntry(projection, runtimePath, message) {
  return {
    target: projection.target,
    parentSkillName: projection.parentSkillName,
    eventName: selectHookPayloadEventName(projection),
    runtimePath,
    measurement: null,
    evaluation: null,
    status: 'problem',
    message
  };
}

function validateHookPayloadOutput(output, runtimePath) {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    return `Hook payload output is not valid JSON: ${runtimePath}`;
  }

  if (!isPlainObject(payload?.hookSpecificOutput)) {
    return `Hook payload output is missing hookSpecificOutput: ${runtimePath}`;
  }

  if (typeof payload.hookSpecificOutput.additionalContext !== 'string') {
    return `Hook payload output is missing hookSpecificOutput.additionalContext: ${runtimePath}`;
  }

  if (typeof payload.hookSpecificOutput.hookEventName !== 'string') {
    return `Hook payload output is missing hookSpecificOutput.hookEventName: ${runtimePath}`;
  }

  return null;
}

async function runHookPayloadMeasurement(runtimePath, args, rootDir, homeDir) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, HOOK_PAYLOAD_TIMEOUT_MS);
  timeout.unref?.();

  try {
    const { stdout } = await execFileAsync('bash', [runtimePath, ...args], {
      cwd: rootDir,
      env: buildHookPayloadEnv(rootDir, homeDir),
      signal: controller.signal,
      maxBuffer: 1024 * 1024
    });

    return {
      stdout,
      stderr: '',
      timedOut: false,
      error: null
    };
  } catch (error) {
    return {
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : '',
      timedOut,
      error
    };
  } finally {
    clearTimeout(timeout);
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

async function inspectLocalHookPayloads(
  rootDir,
  homeDir,
  activeTaskDir,
  hookPayloadBudget,
  hookMode,
  hookProjections,
  contextWarnings,
  warnings,
  problems
) {
  if (hookMode !== 'on' || !hookPayloadBudget) {
    return [];
  }

  const measurements = [];

  for (const projection of hookProjections) {
    if (!MEASURED_HOOK_PAYLOAD_TARGETS.has(projection.target)) {
      continue;
    }

    if (!MEASURED_HOOK_PAYLOAD_SKILLS.has(projection.parentSkillName)) {
      continue;
    }

    if (projection.parentSkillName === 'planning-with-files' && !activeTaskDir) {
      continue;
    }

    const runtimeSourcePath = selectRuntimeSourcePath(projection);
    const runtimePath = runtimeSourcePath
      ? path.join(projection.scriptTargetRoot, path.basename(runtimeSourcePath))
      : null;

    if (!runtimeSourcePath) {
      const message = `Hook payload measurement could not select a projected runtime script for ${projection.parentSkillName}.`;
      const entry = createHookPayloadFailureEntry(projection, runtimePath, message);
      if (projection.status === 'ok') {
        addUniqueMessage(contextWarnings, message);
        addUniqueMessage(warnings, message);
        addUniqueMessage(problems, message);
      }
      measurements.push(entry);
      continue;
    }

    if (!(await exists(runtimePath))) {
      const message = `Hook payload measurement runtime script is missing: ${runtimePath}`;
      const entry = createHookPayloadFailureEntry(projection, runtimePath, message);
      if (projection.status === 'ok') {
        addUniqueMessage(contextWarnings, message);
        addUniqueMessage(warnings, message);
        addUniqueMessage(problems, message);
      }
      measurements.push(entry);
      continue;
    }

    const args = selectHookPayloadArgs(projection);
    const result = await runHookPayloadMeasurement(runtimePath, args, rootDir, homeDir);
    const output = result.stdout ?? '';
    const measurement = measureText(output);

    if (result.timedOut) {
      const message = `Hook payload measurement timed out after ${HOOK_PAYLOAD_TIMEOUT_MS}ms: ${runtimePath}`;
      const entry = createHookPayloadFailureEntry(projection, runtimePath, message);
      entry.measurement = measurement;
      addUniqueMessage(contextWarnings, message);
      addUniqueMessage(warnings, message);
      addUniqueMessage(problems, message);
      measurements.push(entry);
      continue;
    }

    if (result.error) {
      const message = `Hook payload measurement failed for ${runtimePath}: ${
        result.error instanceof Error ? result.error.message : String(result.error)
      }`;
      const entry = createHookPayloadFailureEntry(projection, runtimePath, message);
      entry.measurement = measurement;
      addUniqueMessage(contextWarnings, message);
      addUniqueMessage(warnings, message);
      addUniqueMessage(problems, message);
      measurements.push(entry);
      continue;
    }

    const outputProblem = validateHookPayloadOutput(output, runtimePath);
    if (outputProblem) {
      const entry = createHookPayloadFailureEntry(projection, runtimePath, outputProblem);
      entry.measurement = measurement;
      addUniqueMessage(contextWarnings, outputProblem);
      addUniqueMessage(warnings, outputProblem);
      addUniqueMessage(problems, outputProblem);
      measurements.push(entry);
      continue;
    }

    const evaluation = evaluateBudget(measurement, hookPayloadBudget);
    const entry = {
      target: projection.target,
      parentSkillName: projection.parentSkillName,
      eventName: selectHookPayloadEventName(projection),
      runtimePath,
      measurement,
      evaluation: toBudgetEvaluation(evaluation, hookPayloadBudget),
      status: evaluation.verdict === 'ok' ? 'ok' : evaluation.verdict
    };

    if (evaluation.verdict !== 'ok') {
      const message = formatBudgetMessage(
        `hook payload ${projection.target} ${projection.parentSkillName} ${entry.eventName ?? 'unknown'}`,
        measurement,
        hookPayloadBudget,
        evaluation.verdict
      );
      entry.message = message;
      addUniqueMessage(contextWarnings, message);
      addUniqueMessage(warnings, message);
      if (evaluation.verdict === 'problem') {
        addUniqueMessage(problems, message);
      }
    }

    measurements.push(entry);
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
  const activeTaskDir = await findSingleActiveTaskDir(rootDir);
  const entryTotalsByTarget = new Map();

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

        addMeasurement(entryTotalsByTarget, target, measurement);

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
    for (const projection of await planSkillProjections({
      rootDir,
      homeDir,
      scope: state.scope,
      target,
      skillProfile: state.skillProfile
    })) {
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

    context.hooks.push(
      ...(await inspectLocalHookPayloads(
        rootDir,
        homeDir,
        activeTaskDir,
        budgets?.budgets?.hookPayload,
        state.hookMode,
        hooks,
        context.warnings,
        warnings,
        problems
      ))
    );
  }

  const entryTargetTotals = [...entryTotalsByTarget.values()].map((measurement) => {
    if (!entryBudget) {
      return {
        ...measurement,
        verdict: 'unknown',
        evaluation: null
      };
    }

    const evaluation = evaluateBudget(measurement, entryBudget);
    return {
      ...measurement,
      verdict: evaluation.verdict,
      evaluation: toBudgetEvaluation(evaluation, entryBudget)
    };
  });
  const worstEntryTotal = chooseWorstEntryTotal(entryTargetTotals);

  context.summary.entries.targets = entryTargetTotals;
  if (worstEntryTotal) {
    context.summary.entries.target = worstEntryTotal.target;
    context.summary.entries.chars = worstEntryTotal.chars;
    context.summary.entries.lines = worstEntryTotal.lines;
    context.summary.entries.approxTokens = worstEntryTotal.approxTokens;
  }

  if (entryBudget) {
    context.summary.entries.verdict = worstEntryTotal?.verdict ?? 'ok';
    context.summary.entries.evaluation = worstEntryTotal?.evaluation ?? toBudgetEvaluation(evaluateBudget(context.summary.entries, entryBudget), entryBudget);

    if (context.summary.entries.verdict !== 'ok') {
      const label = context.summary.entries.target
        ? `entry summary ${context.summary.entries.target}`
        : 'entry summary';
      const message = formatBudgetMessage(label, context.summary.entries, entryBudget, context.summary.entries.verdict);
      addUniqueMessage(context.warnings, message);
      if (context.summary.entries.verdict === 'problem') {
        addUniqueMessage(problems, message);
      }
    }
  } else {
    context.summary.entries.verdict = 'unknown';
  }

  return {
    scope: state.scope,
    projectionMode: state.projectionMode,
    hookMode: state.hookMode,
    skillProfile: state.skillProfile,
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
