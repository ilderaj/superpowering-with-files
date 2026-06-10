import { execFile } from 'node:child_process';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { evaluateBudget, measureText } from './context-budget.mjs';
import { buildPlanningHotContext } from './planning-hot-context.mjs';
import {
  classifySkillProjectionDuplicates,
  loadSkillProfiles
} from './skill-projection.mjs';

const execFileAsync = promisify(execFile);
// Hook payload measurement is a health signal, not an interactive request path.
// Give projected hook scripts enough budget to survive cold Node startup and
// heavier fixture/suite environments before classifying them as broken.
const HOOK_PAYLOAD_TIMEOUT_MS = 15000;
const MEASURED_HOOK_PAYLOAD_SKILLS = new Set(['superpowers', 'planning-with-files']);
const MEASURED_HOOK_PAYLOAD_TARGETS = new Set(['codex', 'copilot', 'cursor', 'claude-code']);
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createEmptyContextTotals() {
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

export function createEmptyMeasurement(target = null) {
  return {
    chars: 0,
    lines: 0,
    approxTokens: 0,
    target
  };
}

export function createEmptyContext() {
  return {
    entries: [],
    hooks: [],
    planning: [],
    skillProfiles: [],
    ledger: {
      scope: null,
      projectionMode: null,
      hookMode: null,
      policyProfile: null,
      skillProfile: null,
      targets: []
    },
    summary: {
      entries: createEmptyContextTotals(),
      hooks: createEmptyContextTotals(),
      planning: createEmptyContextTotals(),
      skillProfiles: createEmptyContextTotals()
    },
    warnings: []
  };
}

export function sumMeasurements(measurements = [], target = null) {
  return measurements.reduce(
    (total, measurement) => ({
      chars: total.chars + (measurement?.chars ?? 0),
      lines: total.lines + (measurement?.lines ?? 0),
      approxTokens: total.approxTokens + (measurement?.approxTokens ?? 0),
      target
    }),
    createEmptyMeasurement(target)
  );
}

function formatBudgetThresholds(budget) {
  return `warn ${budget.warn.chars} chars, ${budget.warn.lines} lines, ${budget.warn.tokens} tokens; problem ${budget.problem.chars} chars, ${budget.problem.lines} lines, ${budget.problem.tokens} tokens`;
}

export function formatBudgetMessage(scopeName, measurement, budget, verdict) {
  return `context ${scopeName} ${verdict}: ${measurement.chars} chars, ${measurement.lines} lines, ${measurement.approxTokens} approx tokens (${formatBudgetThresholds(budget)})`;
}

export function toBudgetEvaluation(evaluation, budget) {
  return {
    ...evaluation,
    thresholds: budget
  };
}

export function addUniqueMessage(collection, message) {
  if (!collection.includes(message)) {
    collection.push(message);
  }
}

export function reportBudgetSelectionIssues(scopeName, budget, contextWarnings, warnings, problems) {
  const issues = budget?.selectionIssues ?? [];
  if (issues.length === 0) {
    return;
  }

  const message = `context ${scopeName} problem: malformed target budget override (${issues.join('; ')})`;
  addUniqueMessage(contextWarnings, message);
  addUniqueMessage(warnings, message);
  addUniqueMessage(problems, message);
}

function compareMeasurements(left, right) {
  if ((left?.approxTokens ?? 0) !== (right?.approxTokens ?? 0)) {
    return (left?.approxTokens ?? 0) - (right?.approxTokens ?? 0);
  }

  if ((left?.chars ?? 0) !== (right?.chars ?? 0)) {
    return (left?.chars ?? 0) - (right?.chars ?? 0);
  }

  return (left?.lines ?? 0) - (right?.lines ?? 0);
}

export function addMeasurement(targets, target, measurement) {
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

export function addWorstMeasurement(targets, target, measurement) {
  const current = targets.get(target);
  if (!current || compareMeasurements(measurement, current) > 0) {
    targets.set(target, { ...measurement, target });
  }
}

function chooseWorstContextTotal(totals) {
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

export function applyContextSummary(summary, totals, budget) {
  const worstTotal = chooseWorstContextTotal(totals);
  summary.targets = totals;

  if (worstTotal) {
    summary.target = worstTotal.target;
    summary.chars = worstTotal.chars;
    summary.lines = worstTotal.lines;
    summary.approxTokens = worstTotal.approxTokens;
  }

  if (!budget) {
    summary.verdict = 'unknown';
    summary.evaluation = null;
    return;
  }

  summary.verdict = worstTotal?.verdict ?? 'ok';
  summary.evaluation =
    worstTotal?.evaluation ?? toBudgetEvaluation(evaluateBudget(summary, budget), budget);
}

export function inspectContextBudgets({ totals, budget }) {
  const summary = createEmptyContextTotals();
  applyContextSummary(summary, totals, budget);
  return summary;
}

function createMeasuredSummaryEntry(target, measurement, evaluation, extra = {}) {
  return {
    target,
    measurement,
    evaluation,
    status: evaluation?.verdict === 'ok' ? 'ok' : (evaluation?.verdict ?? 'unknown'),
    ...extra
  };
}

function buildSkillProfileDiscoveryText(profileName, target, skills) {
  const lines = [
    '[harness] SKILL PROFILE DISCOVERY',
    `Profile: ${profileName}`,
    `Target: ${target}`,
    `Skills: ${skills.length}`
  ];

  for (const skill of skills) {
    const label = skill.parentSkillName === skill.skillName
      ? skill.skillName
      : `${skill.parentSkillName}:${skill.skillName}`;
    lines.push(`- ${label} (${skill.strategy})`);
  }

  return lines.join('\n');
}

function extractFrontmatter(text) {
  if (!text.startsWith('---')) {
    return '';
  }

  const end = text.indexOf('\n---', 3);
  return end >= 0 ? text.slice(0, end + 4) : '';
}

function isTextBudgetFile(filePath) {
  return /\.(md|json|mjs|js|sh|cmd|txt|hbs|yml|yaml)$/i.test(filePath);
}

async function measureTextTree(rootPath) {
  const measurements = [];

  async function visit(currentPath) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      if (!entry.isFile() || !isTextBudgetFile(entryPath)) {
        continue;
      }

      measurements.push(measureText(await readFile(entryPath, 'utf8').catch(() => '')));
    }
  }

  await visit(rootPath);
  return sumMeasurements(measurements);
}

export async function inspectSkillLedger(rootDir, profileName, target, skills) {
  const discovery = measureText(buildSkillProfileDiscoveryText(profileName, target, skills));
  const skillRows = [];

  for (const skill of skills) {
    const label = skill.parentSkillName === skill.skillName
      ? skill.skillName
      : `${skill.parentSkillName}:${skill.skillName}`;
    const skillText = await readFile(path.join(skill.sourcePath, 'SKILL.md'), 'utf8').catch(() => '');
    const skillBody = measureText(skillText);
    const frontmatter = measureText(extractFrontmatter(skillText));
    const source = await measureTextTree(skill.sourcePath);

    skillRows.push({
      label,
      sourcePath: path.relative(rootDir, skill.sourcePath).split(path.sep).join('/'),
      measurement: {
        discovery: frontmatter,
        skillBody,
        source
      }
    });
  }

  return {
    profileName,
    target,
    skillCount: skills.length,
    discovery,
    frontmatter: sumMeasurements(skillRows.map((row) => row.measurement.discovery), target),
    skillBody: sumMeasurements(skillRows.map((row) => row.measurement.skillBody), target),
    source: sumMeasurements(skillRows.map((row) => row.measurement.source), target),
    skills: skillRows
  };
}

export async function inspectPlanningHotContext(
  activeTaskDir,
  activeTaskCount,
  planningBudget,
  hookMode,
  target,
  hooks,
  contextWarnings,
  warnings,
  problems
) {
  if (hookMode !== 'on' || !planningBudget || !activeTaskDir) {
    if (hookMode === 'on' && planningBudget && activeTaskCount > 1) {
      const message =
        `Planning hot context measurement skipped because ${activeTaskCount} active tasks are present under planning/active. ` +
        'Harness can only measure planning hot context when exactly one active task is active.';
      addUniqueMessage(contextWarnings, message);
      addUniqueMessage(warnings, message);
    }
    return null;
  }

  const hasPlanningHook = hooks.some(
    (hook) => hook.parentSkillName === 'planning-with-files' && ['ok', 'unsupported'].includes(hook.status)
  );
  if (!hasPlanningHook) {
    return null;
  }

  const taskPlanPath = path.join(activeTaskDir, 'task_plan.md');
  const findingsPath = path.join(activeTaskDir, 'findings.md');
  const progressPath = path.join(activeTaskDir, 'progress.md');
  const output = await buildPlanningHotContext({ taskPlanPath, findingsPath, progressPath });
  const measurement = measureText(output);
  const evaluation = toBudgetEvaluation(evaluateBudget(measurement, planningBudget), planningBudget);
  const entry = createMeasuredSummaryEntry(target, measurement, evaluation, {
    taskDir: activeTaskDir
  });

  if (evaluation.verdict !== 'ok') {
    const message = formatBudgetMessage(`planning hot context ${target}`, measurement, planningBudget, evaluation.verdict);
    entry.message = message;
    addUniqueMessage(contextWarnings, message);
    addUniqueMessage(warnings, message);
    if (evaluation.verdict === 'problem') {
      addUniqueMessage(problems, message);
    }
  }

  return entry;
}

export async function inspectSkillProfileContext(
  rootDir,
  skillProfileName,
  skillBudget,
  hookMode,
  target,
  skills,
  contextWarnings,
  warnings,
  problems
) {
  if (!skillBudget || hookMode !== 'on') {
    return null;
  }

  const skillProfiles = await loadSkillProfiles(rootDir);
  const profileName = skillProfileName ?? skillProfiles.defaultProfile;
  const discoveryText = buildSkillProfileDiscoveryText(profileName, target, skills);
  const measurement = measureText(discoveryText);
  const evaluation = toBudgetEvaluation(evaluateBudget(measurement, skillBudget), skillBudget);
  const entry = createMeasuredSummaryEntry(target, measurement, evaluation, {
    profileName,
    selectedSkills: skills.map((skill) =>
      skill.parentSkillName === skill.skillName ? skill.skillName : `${skill.parentSkillName}:${skill.skillName}`
    )
  });

  if (evaluation.verdict !== 'ok') {
    const message = formatBudgetMessage(`skill profile ${target} ${profileName}`, measurement, skillBudget, evaluation.verdict);
    entry.message = message;
    addUniqueMessage(contextWarnings, message);
    addUniqueMessage(warnings, message);
    if (evaluation.verdict === 'problem') {
      addUniqueMessage(problems, message);
    }
  }

  return entry;
}

function buildHookPayloadEnv(rootDir, homeDir, projection) {
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: homeDir,
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    HARNESS_PROJECT_ROOT: rootDir
  };

  if (projection?.target === 'claude-code') {
    env.CLAUDE_PLUGIN_ROOT = path.dirname(projection.scriptTargetRoot ?? rootDir);
  } else if (projection?.target === 'cursor') {
    env.CURSOR_PLUGIN_ROOT = path.dirname(projection.scriptTargetRoot ?? rootDir);
  } else if (projection?.target === 'copilot') {
    env.COPILOT_CLI = '1';
  }

  return env;
}

function selectRuntimeSourcePath(projection) {
  return (
    projection.scriptSourcePaths?.find((sourcePath) => {
      const base = path.basename(sourcePath);
      return base !== 'runtime-hook-evidence.sh' && !base.endsWith('.mjs') && !base.endsWith('.cmd');
    }) ?? null
  );
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

function normalizeHookEventName(eventName) {
  return typeof eventName === 'string' ? eventName.replace(/[^A-Za-z0-9]/g, '').toLowerCase() : '';
}

function classifyHookPayload({ parentSkillName, eventName }) {
  if (parentSkillName === 'superpowers') return 'bootstrap';

  const normalizedEventName = normalizeHookEventName(eventName);
  if (normalizedEventName === 'sessionstart') return 'planning-brief';
  if (normalizedEventName === 'userpromptsubmit') return 'planning-hot';
  if (normalizedEventName === 'stop') return 'session-summary';
  return 'other';
}

function toHookPayloadEventArg(eventName) {
  return eventName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

function selectHookPayloadRequests(projection) {
  if (projection.parentSkillName === 'superpowers') {
    const eventName = selectHookPayloadEventName(projection);
    return eventName ? [{ eventName, args: [] }] : [];
  }

  if (projection.parentSkillName !== 'planning-with-files') {
    return [];
  }

  if (projection.target === 'copilot') {
    return (projection.eventNames ?? [])
      .filter((eventName) =>
        ['sessionstart', 'userpromptsubmit', 'stop'].includes(normalizeHookEventName(eventName))
      )
      .map((eventName) => ({
        eventName,
        args: [projection.target, toHookPayloadEventArg(eventName)]
      }));
  }

  const eventName = selectHookPayloadEventName(projection);
  return eventName ? [{ eventName, args: [projection.target, toHookPayloadEventArg(eventName)] }] : [];
}

function hookPayloadCandidateKey(projection, eventName) {
  return [
    projection.target,
    projection.parentSkillName,
    eventName,
    classifyHookPayload({ parentSkillName: projection.parentSkillName, eventName })
  ].join('\0');
}

function hookPayloadScopeRank(scope) {
  switch (scope) {
    case 'user-global':
      return 2;
    case 'workspace':
      return 1;
    default:
      return 0;
  }
}

function choosePreferredHookPayloadCandidate(current, candidate) {
  if (!current) {
    return candidate;
  }

  current.runtimePaths = mergeUnique(current.runtimePaths, candidate.runtimePaths);
  current.scopes = mergeUnique(current.scopes, candidate.scopes);

  const currentHasRuntime = Boolean(current.runtimeSourcePath);
  const candidateHasRuntime = Boolean(candidate.runtimeSourcePath);
  if (candidateHasRuntime !== currentHasRuntime) {
    if (candidateHasRuntime) {
      candidate.runtimePaths = mergeUnique(candidate.runtimePaths, current.runtimePaths);
      candidate.scopes = mergeUnique(candidate.scopes, current.scopes);
      return candidate;
    }
    return current;
  }

  const currentScopeRank = hookPayloadScopeRank(current.scope);
  const candidateScopeRank = hookPayloadScopeRank(candidate.scope);
  if (candidateScopeRank !== currentScopeRank) {
    if (candidateScopeRank > currentScopeRank) {
      candidate.runtimePaths = mergeUnique(candidate.runtimePaths, current.runtimePaths);
      candidate.scopes = mergeUnique(candidate.scopes, current.scopes);
      return candidate;
    }
    return current;
  }

  return current;
}

function createHookPayloadFailureEntry(projection, runtimePath, message, eventNameOverride = null) {
  const eventName = eventNameOverride ?? selectHookPayloadEventName(projection);
  return {
    target: projection.target,
    parentSkillName: projection.parentSkillName,
    eventName,
    category: classifyHookPayload({ parentSkillName: projection.parentSkillName, eventName }),
    runtimePath,
    measurement: null,
    evaluation: null,
    status: 'problem',
    message
  };
}

function parseHookPayloadOutput(output, runtimePath, expectedEventName = null) {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    return {
      payload: null,
      problem: `Hook payload output is not valid JSON: ${runtimePath}`
    };
  }

  if (typeof payload.additional_context === 'string') {
    return {
      payload: {
        hookSpecificOutput: {
          hookEventName: expectedEventName ?? 'unknown',
          additionalContext: payload.additional_context
        }
      },
      problem: null
    };
  }

  if (!isPlainObject(payload?.hookSpecificOutput)) {
    return {
      payload: null,
      problem: `Hook payload output is missing hookSpecificOutput: ${runtimePath}`
    };
  }

  if (typeof payload.hookSpecificOutput.additionalContext !== 'string') {
    return {
      payload: null,
      problem: `Hook payload output is missing hookSpecificOutput.additionalContext: ${runtimePath}`
    };
  }

  if (typeof payload.hookSpecificOutput.hookEventName !== 'string') {
    return {
      payload: null,
      problem: `Hook payload output is missing hookSpecificOutput.hookEventName: ${runtimePath}`
    };
  }

  return { payload, problem: null };
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

function mergeUnique(values = [], additions = []) {
  return [...new Set([...(values ?? []), ...(additions ?? [])])];
}

function aggregateHookPayloadEntries(entries, hookPayloadBudget, contextWarnings, warnings, problems) {
  const aggregated = new Map();
  const passthrough = [];

  for (const entry of entries) {
    if (!entry.measurement || entry.status === 'problem' && !entry.evaluation) {
      passthrough.push(entry);
      continue;
    }

    const key = [entry.target, entry.parentSkillName, entry.eventName, entry.category].join('\0');
    const current = aggregated.get(key);
    if (!current) {
      aggregated.set(key, {
        ...entry,
        measurement: { ...entry.measurement },
        scopes: [...(entry.scopes ?? [])],
        runtimePaths: [...(entry.runtimePaths ?? (entry.runtimePath ? [entry.runtimePath] : []))]
      });
      continue;
    }

    if (compareMeasurements(entry.measurement, current.measurement) > 0) {
      current.measurement = { ...entry.measurement };
      current.runtimePath = entry.runtimePath ?? current.runtimePath;
    }
    current.scopes = mergeUnique(current.scopes, entry.scopes);
    current.runtimePaths = mergeUnique(current.runtimePaths, entry.runtimePaths ?? (entry.runtimePath ? [entry.runtimePath] : []));
  }

  return [...aggregated.values(), ...passthrough]
    .map((entry) => {
      if (entry.status === 'problem' && !entry.evaluation) {
        return entry;
      }

      if (!entry.measurement || !hookPayloadBudget) {
        return {
          ...entry,
          evaluation: entry.measurement ? null : entry.evaluation,
          status: entry.status ?? 'unknown'
        };
      }

      const evaluation = evaluateBudget(entry.measurement, hookPayloadBudget);
      const result = {
        ...entry,
        evaluation: toBudgetEvaluation(evaluation, hookPayloadBudget),
        status: evaluation.verdict === 'ok' ? 'ok' : evaluation.verdict
      };

      if (evaluation.verdict !== 'ok') {
        const message = formatBudgetMessage(
          `hook payload ${result.target} ${result.parentSkillName} ${result.eventName ?? 'unknown'}`,
          result.measurement,
          hookPayloadBudget,
          evaluation.verdict
        );
        result.message = message;
        addUniqueMessage(contextWarnings, message);
        addUniqueMessage(warnings, message);
        if (evaluation.verdict === 'problem') {
          addUniqueMessage(problems, message);
        }
      }

      return result;
    })
    .sort((left, right) =>
      [
        left.target ?? '',
        left.category ?? '',
        left.parentSkillName ?? '',
        left.eventName ?? '',
        left.status ?? ''
      ]
        .join('\0')
        .localeCompare(
          [
            right.target ?? '',
            right.category ?? '',
            right.parentSkillName ?? '',
            right.eventName ?? '',
            right.status ?? ''
          ].join('\0')
        )
    );
}

async function runHookPayloadMeasurement(runtimePath, args, rootDir, homeDir, projection) {
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
      env: buildHookPayloadEnv(rootDir, homeDir, projection),
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

export async function inspectLocalHookPayloads(
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
  const dedupedCandidates = new Map();

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

    for (const request of selectHookPayloadRequests(projection)) {
      const scope = runtimePath ? pathScope(rootDir, homeDir, runtimePath) : 'external';
      const key = hookPayloadCandidateKey(projection, request.eventName);
      const candidate = {
        key,
        projection,
        request,
        runtimeSourcePath,
        runtimePath,
        scope,
        runtimePaths: runtimePath ? [runtimePath] : [],
        scopes: [scope]
      };
      dedupedCandidates.set(
        key,
        choosePreferredHookPayloadCandidate(dedupedCandidates.get(key), candidate)
      );
    }
  }

  for (const candidate of dedupedCandidates.values()) {
    const { projection, request, runtimeSourcePath, runtimePath } = candidate;

    if (!runtimeSourcePath) {
      const message = `Hook payload measurement could not select a projected runtime script for ${projection.parentSkillName}.`;
      const entry = createHookPayloadFailureEntry(projection, runtimePath, message, request.eventName);
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
      const entry = createHookPayloadFailureEntry(projection, runtimePath, message, request.eventName);
      if (projection.status === 'ok') {
        addUniqueMessage(contextWarnings, message);
        addUniqueMessage(warnings, message);
        addUniqueMessage(problems, message);
      }
      measurements.push(entry);
      continue;
    }

    const result = await runHookPayloadMeasurement(runtimePath, request.args, rootDir, homeDir, projection);
      const output = result.stdout ?? '';
      const measurement = measureText(output);

      if (result.timedOut) {
        const message = `Hook payload measurement timed out after ${HOOK_PAYLOAD_TIMEOUT_MS}ms: ${runtimePath}`;
        const entry = createHookPayloadFailureEntry(projection, runtimePath, message, request.eventName);
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
        const entry = createHookPayloadFailureEntry(projection, runtimePath, message, request.eventName);
        entry.measurement = measurement;
        addUniqueMessage(contextWarnings, message);
        addUniqueMessage(warnings, message);
        addUniqueMessage(problems, message);
        measurements.push(entry);
        continue;
      }

      const { payload, problem } = parseHookPayloadOutput(output, runtimePath, request.eventName);
      if (problem) {
        const entry = createHookPayloadFailureEntry(projection, runtimePath, problem, request.eventName);
        entry.measurement = measurement;
        addUniqueMessage(contextWarnings, problem);
        addUniqueMessage(warnings, problem);
        addUniqueMessage(problems, problem);
        measurements.push(entry);
        continue;
      }

      const eventName = payload.hookSpecificOutput.hookEventName;
      measurements.push({
        target: projection.target,
        parentSkillName: projection.parentSkillName,
        eventName,
        category: classifyHookPayload({ parentSkillName: projection.parentSkillName, eventName }),
        runtimePath,
        runtimePaths: candidate.runtimePaths,
        scopes: candidate.scopes,
        measurement,
        evaluation: null,
        status: 'ok'
      });
  }

  return aggregateHookPayloadEntries(measurements, hookPayloadBudget, contextWarnings, warnings, problems);
}
