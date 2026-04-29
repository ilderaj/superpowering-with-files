import { execFile } from 'node:child_process';
import { access, lstat, readFile, readdir, readlink, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { entriesForScope, loadAdapter } from './adapters.mjs';
import { readBackupIndex } from './backup-archive.mjs';
import { evaluateBudget, loadContextBudgets, measureText, selectBudgetForTarget } from './context-budget.mjs';
import { hookEntryMarker } from './hook-config.mjs';
import { planHookProjections } from './hook-projection.mjs';
import { loadPlatforms } from './metadata.mjs';
import { inspectPlanLocations } from './plan-locations.mjs';
import { buildPlanningHotContext } from './planning-hot-context.mjs';
import { resolveHookRoots, resolveSkillRoots, resolveTargetPaths } from './paths.mjs';
import {
  PLANNING_WITH_FILES_DESTRUCTIVE_LOG_PATCH_MARKER,
  PLANNING_WITH_FILES_RISK_ASSESSMENT_PATCH_MARKER
} from './planning-with-files-risk-assessment-patch.mjs';
import { loadSkillProfiles, planSkillProjections } from './skill-projection.mjs';
import { isSafetyPolicyProfile, resolveAgentConfigRoots } from './safety-projection.mjs';
import { readState } from './state.mjs';
import { readUserManaged } from './user-managed.mjs';

const execFileAsync = promisify(execFile);
const HOOK_PAYLOAD_TIMEOUT_MS = 2000;
const MEASURED_HOOK_PAYLOAD_SKILLS = new Set(['superpowers', 'planning-with-files']);
const MEASURED_HOOK_PAYLOAD_TARGETS = new Set(['codex', 'copilot']);
const COPILOT_SCOPE_OVERLAP_RECOMMENDED_ACTION =
  'choose one canonical scope for Copilot unless the workspace install is intentionally overriding safety policy.';
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

const HOOK_EVIDENCE_BY_TARGET = {
  codex: { evidenceLevel: 'verified' },
  copilot: { evidenceLevel: 'verified' },
  cursor: { evidenceLevel: 'verified' },
  'claude-code': { evidenceLevel: 'verified' }
};

function hookEvidence(projection) {
  return (
    HOOK_EVIDENCE_BY_TARGET[projection.target] ?? {
      evidenceLevel: 'provisional',
      message: `Official hook documentation has not been verified for ${projection.target}.`
    }
  );
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
      entries: createEmptyContextTotals(),
      hooks: createEmptyContextTotals(),
      planning: createEmptyContextTotals(),
      skillProfiles: createEmptyContextTotals()
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

function reportBudgetSelectionIssues(scopeName, budget, contextWarnings, warnings, problems) {
  const issues = budget?.selectionIssues ?? [];
  if (issues.length === 0) {
    return;
  }

  const message = `context ${scopeName} problem: malformed target budget override (${issues.join('; ')})`;
  addUniqueMessage(contextWarnings, message);
  addUniqueMessage(warnings, message);
  addUniqueMessage(problems, message);
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

function applyContextSummary(summary, totals, budget) {
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

async function inspectPlanningHotContext(
  activeTaskDir,
  planningBudget,
  hookMode,
  target,
  hooks,
  contextWarnings,
  warnings,
  problems
) {
  if (hookMode !== 'on' || !planningBudget || !activeTaskDir) {
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

async function inspectSkillProfileContext(
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

function parseHookPayloadOutput(output, runtimePath) {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    return {
      payload: null,
      problem: `Hook payload output is not valid JSON: ${runtimePath}`
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

function compareMeasurements(left, right) {
  if ((left?.approxTokens ?? 0) !== (right?.approxTokens ?? 0)) {
    return (left?.approxTokens ?? 0) - (right?.approxTokens ?? 0);
  }

  if ((left?.chars ?? 0) !== (right?.chars ?? 0)) {
    return (left?.chars ?? 0) - (right?.chars ?? 0);
  }

  return (left?.lines ?? 0) - (right?.lines ?? 0);
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

function inspectScopeOverlap(rootDir, homeDir, targets) {
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
  const enabled = isSafetyPolicyProfile(state.policyProfile);
  if (!enabled) {
    return {
      enabled: false,
      profile: state.policyProfile,
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
    profile: state.policyProfile,
    checks
  };
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

    for (const request of selectHookPayloadRequests(projection)) {
      const result = await runHookPayloadMeasurement(runtimePath, request.args, rootDir, homeDir);
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

      const { payload, problem } = parseHookPayloadOutput(output, runtimePath);
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
        runtimePaths: [runtimePath],
        scopes: [pathScope(rootDir, homeDir, runtimePath)],
        measurement,
        evaluation: null,
        status: 'ok'
      });
    }
  }

  return aggregateHookPayloadEntries(measurements, hookPayloadBudget, contextWarnings, warnings, problems);
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
  const hookTotalsByTarget = new Map();
  const hookBudgetsByTarget = new Map();
  const planningTotalsByTarget = new Map();
  const skillProfileTotalsByTarget = new Map();

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

    const skillProfileEntry = await inspectSkillProfileContext(
      rootDir,
      state.skillProfile,
      budgets?.budgets?.skillProfile,
      state.hookMode,
      target,
      skills,
      context.warnings,
      warnings,
      problems
    );
    if (skillProfileEntry) {
      context.skillProfiles.push(skillProfileEntry);
      addMeasurement(skillProfileTotalsByTarget, target, skillProfileEntry.measurement);
    }

    const hooks = [];
    for (const projection of await planHookProjections({
      rootDir,
      homeDir,
      scope: state.scope,
      target,
      hookMode: state.hookMode,
      policyProfile: state.policyProfile
    })) {
      const inspected = await inspectHook(projection);
      hooks.push(inspected);
      if (!['ok', 'unsupported'].includes(inspected.status)) {
        problems.push(`${target}: ${inspected.parentSkillName}: ${inspected.message}`);
      }
    }

    targets[target] = { entries, skills, hooks };

    const hookBudget = selectBudgetForTarget(budgets?.budgets?.hookPayload, target, 'budgets.hookPayload');
    hookBudgetsByTarget.set(target, hookBudget);
    reportBudgetSelectionIssues(`hook payload ${target}`, hookBudget, context.warnings, warnings, problems);

    const hookEntries = await inspectLocalHookPayloads(
      rootDir,
      homeDir,
      activeTaskDir,
      hookBudget,
      state.hookMode,
      hooks,
      context.warnings,
      warnings,
      problems
    );
    context.hooks.push(...hookEntries);
    for (const hookEntry of hookEntries) {
      if (hookEntry.measurement) {
        addMeasurement(hookTotalsByTarget, hookEntry.target, hookEntry.measurement);
      }
    }

    const planningEntry = await inspectPlanningHotContext(
      activeTaskDir,
      budgets?.budgets?.planningHotContext,
      state.hookMode,
      target,
      hooks,
      context.warnings,
      warnings,
      problems
    );
    if (planningEntry) {
      context.planning.push(planningEntry);
      addMeasurement(planningTotalsByTarget, target, planningEntry.measurement);
    }
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
  applyContextSummary(context.summary.entries, entryTargetTotals, entryBudget);

  if (context.summary.entries.verdict !== 'ok' && entryBudget) {
    const label = context.summary.entries.target
      ? `entry summary ${context.summary.entries.target}`
      : 'entry summary';
    const message = formatBudgetMessage(label, context.summary.entries, entryBudget, context.summary.entries.verdict);
    addUniqueMessage(context.warnings, message);
    if (context.summary.entries.verdict === 'problem') {
      addUniqueMessage(problems, message);
    }
  }

  const hookBudget = budgets?.budgets?.hookPayload;
  const hookTargetTotals = [...hookTotalsByTarget.values()].map((measurement) => {
    const targetHookBudget = hookBudgetsByTarget.get(measurement.target) ?? hookBudget;
    if (!targetHookBudget) {
      return { ...measurement, verdict: 'unknown', evaluation: null };
    }

    const evaluation = evaluateBudget(measurement, targetHookBudget);
    return {
      ...measurement,
      verdict: evaluation.verdict,
      evaluation: toBudgetEvaluation(evaluation, targetHookBudget)
    };
  });
  applyContextSummary(context.summary.hooks, hookTargetTotals, hookBudget);

  const planningBudget = budgets?.budgets?.planningHotContext;
  const planningTargetTotals = [...planningTotalsByTarget.values()].map((measurement) => {
    if (!planningBudget) {
      return { ...measurement, verdict: 'unknown', evaluation: null };
    }

    const evaluation = evaluateBudget(measurement, planningBudget);
    return {
      ...measurement,
      verdict: evaluation.verdict,
      evaluation: toBudgetEvaluation(evaluation, planningBudget)
    };
  });
  applyContextSummary(context.summary.planning, planningTargetTotals, planningBudget);

  const skillProfileBudget = budgets?.budgets?.skillProfile;
  const skillProfileTargetTotals = [...skillProfileTotalsByTarget.values()].map((measurement) => {
    if (!skillProfileBudget) {
      return { ...measurement, verdict: 'unknown', evaluation: null };
    }

    const evaluation = evaluateBudget(measurement, skillProfileBudget);
    return {
      ...measurement,
      verdict: evaluation.verdict,
      evaluation: toBudgetEvaluation(evaluation, skillProfileBudget)
    };
  });
  applyContextSummary(context.summary.skillProfiles, skillProfileTargetTotals, skillProfileBudget);
  const scopeOverlap = inspectScopeOverlap(rootDir, homeDir, targets);
  for (const overlap of scopeOverlap.overlaps ?? []) {
    const recommendedAction = overlap.recommendedAction ?? scopeOverlap.recommendedAction;
    const message = recommendedAction
      ? `scope overlap ${overlap.target}: ${overlap.message} Recommended action: ${recommendedAction}`
      : `scope overlap ${overlap.target}: ${overlap.message}`;
    addUniqueMessage(context.warnings, message);
    addUniqueMessage(warnings, message);
  }

  const safety = await inspectSafetyHealth(rootDir, homeDir, state, targets);
  for (const check of safety.checks) {
    if (check.status === 'warning' && check.message) {
      addUniqueMessage(warnings, `safety ${check.name}: ${check.message}`);
      continue;
    }

    if (check.status === 'problem' && check.message) {
      addUniqueMessage(problems, `safety ${check.name}: ${check.message}`);
    }
  }

  const userManaged = await readUserManaged(homeDir);
  for (const managedPath of userManaged.paths ?? []) {
    if (!(await exists(managedPath))) {
      addUniqueMessage(problems, `user-managed: missing personal projection ${managedPath}`);
    }
  }

  const backupGovernance = await inspectBackupGovernance(rootDir, homeDir);
  if (backupGovernance.legacyBackups.length > 0) {
    addUniqueMessage(
      problems,
      `Legacy Harness sibling backups detected under user-global roots: ${backupGovernance.legacyBackups.join(', ')}`
    );
  }

  if (backupGovernance.archiveIndexDrift.length > 0) {
    addUniqueMessage(
      problems,
      `Harness backup archive/index drift detected under user-global roots: ${backupGovernance.archiveIndexDrift.join(', ')}`
    );
  }

  return {
    scope: state.scope,
    projectionMode: state.projectionMode,
    hookMode: state.hookMode,
    policyProfile: state.policyProfile,
    skillProfile: state.skillProfile,
    lastSync: state.lastSync,
    lastFetch: state.lastFetch,
    lastUpdate: state.lastUpdate,
    upstream: publicUpstreamStatus(state.upstream),
    planLocations,
    warnings,
    context,
    safety,
    userManaged,
    scopeOverlap,
    targets,
    problems
  };
}
