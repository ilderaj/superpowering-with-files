import { access, readFile } from 'node:fs/promises';
import { entriesForScope, loadAdapter } from './adapters.mjs';
import { evaluateBudget, loadContextBudgets, measureText, selectBudgetForTarget } from './context-budget.mjs';
import {
  addMeasurement as addContextMeasurement,
  addUniqueMessage as addContextUniqueMessage,
  addWorstMeasurement as addContextWorstMeasurement,
  applyContextSummary as applyBudgetContextSummary,
  createEmptyContext as createBudgetContext,
  createEmptyMeasurement as createBudgetMeasurement,
  formatBudgetMessage as formatContextBudgetMessage,
  inspectLocalHookPayloads as inspectContextHookPayloads,
  inspectPlanningHotContext as inspectContextPlanningHotContext,
  inspectSkillLedger as inspectContextSkillLedger,
  inspectSkillProfileContext as inspectContextSkillProfileContext,
  reportBudgetSelectionIssues as reportContextBudgetSelectionIssues,
  sumMeasurements as sumContextMeasurements,
  toBudgetEvaluation as toContextBudgetEvaluation
} from './health-context-budgets.mjs';
import { inspectGovernanceHealth as inspectGovernanceDomain } from './health-governance.mjs';
import { inspectPlanningDiagnostics } from './health-planning-diagnostics.mjs';
import {
  formatHookProblem as formatProjectionHookProblem,
  inspectProjectionHealth
} from './health-projection-inspection.mjs';
import { readState } from './state.mjs';
import { resolveHarnessSourcePath } from '../../runtime/source-root.mjs';

const CONTEXT_BUDGET_POLICIES_PATH = 'harness/core/context-budget-policies.json';

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

async function loadContextBudgetPolicies(rootDir) {
  const config = JSON.parse(
    await readFile(resolveHarnessSourcePath(rootDir, CONTEXT_BUDGET_POLICIES_PATH), 'utf8')
  );
  return config.targets ?? {};
}

export async function readHarnessHealth(rootDir, homeDir) {
  const state = await readState(rootDir);
  let budgets = null;
  const targets = {};
  const problems = [];
  const warnings = [];
  const planningDiagnostics = await inspectPlanningDiagnostics({ rootDir, homeDir });
  const { activeTaskState, planLocations } = planningDiagnostics;
  const context = createBudgetContext();
  context.ledger = {
    scope: state.scope,
    projectionMode: state.projectionMode,
    hookMode: state.hookMode,
    deploymentProfile: state.deploymentProfile,
    policyProfile: state.policyProfile,
    workspacePolicyOverlay: state.workspacePolicyOverlay ?? null,
    skillProfile: state.skillProfile,
    targets: []
  };
  let budgetLoadProblem = null;
  const budgetPolicies = await loadContextBudgetPolicies(rootDir).catch(() => ({}));
  const entryTotalsByTarget = new Map();
  const hookWorstByTarget = new Map();
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
    const targetLedger = {
      target,
      budgetPolicy: budgetPolicies[target] ?? null,
      session: {
        entry: createBudgetMeasurement(target),
        skillDiscovery: createBudgetMeasurement(target),
        skillFrontmatter: createBudgetMeasurement(target),
        skillBody: createBudgetMeasurement(target),
        skillSource: createBudgetMeasurement(target),
        planningHotContext: createBudgetMeasurement(target)
      },
      turn: {
        hookPayload: createBudgetMeasurement(target),
        hookPayloadWorstEvent: createBudgetMeasurement(target),
        planningHotContext: createBudgetMeasurement(target)
      }
    };

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

        addContextMeasurement(entryTotalsByTarget, target, measurement);

        if (entryBudget) {
          const evaluation = evaluateBudget(measurement, entryBudget);
          entryContext.evaluation = toContextBudgetEvaluation(evaluation, entryBudget);

          if (evaluation.verdict !== 'ok') {
            const message = formatContextBudgetMessage(
              `entry ${target} ${entryPath}`,
              measurement,
              entryBudget,
              evaluation.verdict
            );
            addContextUniqueMessage(context.warnings, message);
            if (evaluation.verdict === 'problem') {
              addContextUniqueMessage(problems, message);
            }
          }
        }

        context.entries.push(entryContext);
      }
    }
    targetLedger.session.entry = entryTotalsByTarget.get(target) ?? createBudgetMeasurement(target);

    const projection = await inspectProjectionHealth({ rootDir, homeDir, state, target });
    for (const duplicate of projection.duplicateMessages) {
      addContextUniqueMessage(context.warnings, duplicate.message);
      addContextUniqueMessage(warnings, duplicate.message);
      if (duplicate.severity === 'problem') {
        addContextUniqueMessage(problems, duplicate.message);
      }
    }

    const skills = projection.skills;
    for (const inspected of skills) {
      if (inspected.status !== 'ok') {
        problems.push(`${target}: ${inspected.skillName}: ${inspected.message}`);
      }
    }

    const skillProfileEntry = await inspectContextSkillProfileContext(
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
      addContextMeasurement(skillProfileTotalsByTarget, target, skillProfileEntry.measurement);
    }

    const skillLedger = await inspectContextSkillLedger(rootDir, state.skillProfile, target, skills);
    targetLedger.session.skillDiscovery = skillLedger.discovery;
    targetLedger.session.skillFrontmatter = skillLedger.frontmatter;
    targetLedger.session.skillBody = skillLedger.skillBody;
    targetLedger.session.skillSource = skillLedger.source;
    targetLedger.skills = skillLedger.skills;

    const hooks = projection.hooks;
    for (const inspected of hooks) {
      if (!['ok', 'unsupported'].includes(inspected.status)) {
        problems.push(formatProjectionHookProblem(target, inspected));
      }
    }
    for (const warning of projection.runtimeWarnings ?? []) {
      addContextUniqueMessage(warnings, warning);
    }

    targets[target] = { entries, skills, hooks };

    const hookBudget = selectBudgetForTarget(budgets?.budgets?.hookPayload, target, 'budgets.hookPayload');
    hookBudgetsByTarget.set(target, hookBudget);
    reportContextBudgetSelectionIssues(`hook payload ${target}`, hookBudget, context.warnings, warnings, problems);

    const hookEntries = await inspectContextHookPayloads(
      rootDir,
      homeDir,
      activeTaskState.activeTaskDir,
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
        addContextWorstMeasurement(hookWorstByTarget, hookEntry.target, hookEntry.measurement);
      }
    }
    targetLedger.turn.hookPayload = sumContextMeasurements(
      hookEntries
        .filter((hookEntry) => hookEntry.target === target)
        .map((hookEntry) => hookEntry.measurement)
        .filter(Boolean),
      target
    );
    targetLedger.turn.hookPayloadWorstEvent =
      hookWorstByTarget.get(target) ?? createBudgetMeasurement(target);

    const planningEntry = await inspectContextPlanningHotContext(
      activeTaskState.activeTaskDir,
      activeTaskState.activeTaskCount,
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
      addContextMeasurement(planningTotalsByTarget, target, planningEntry.measurement);
      targetLedger.session.planningHotContext = planningEntry.measurement;
      targetLedger.turn.planningHotContext = planningEntry.measurement;
    }

    context.ledger.targets.push(targetLedger);
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
      evaluation: toContextBudgetEvaluation(evaluation, entryBudget)
    };
  });
  applyBudgetContextSummary(context.summary.entries, entryTargetTotals, entryBudget);

  if (context.summary.entries.verdict !== 'ok' && entryBudget) {
    const label = context.summary.entries.target
      ? `entry summary ${context.summary.entries.target}`
      : 'entry summary';
    const message = formatContextBudgetMessage(
      label,
      context.summary.entries,
      entryBudget,
      context.summary.entries.verdict
    );
    addContextUniqueMessage(context.warnings, message);
    if (context.summary.entries.verdict === 'problem') {
      addContextUniqueMessage(problems, message);
    }
  }

  const hookBudget = budgets?.budgets?.hookPayload;
  const hookTargetTotals = [...hookWorstByTarget.values()].map((measurement) => {
    const targetHookBudget = hookBudgetsByTarget.get(measurement.target) ?? hookBudget;
    if (!targetHookBudget) {
      return { ...measurement, verdict: 'unknown', evaluation: null };
    }

    const evaluation = evaluateBudget(measurement, targetHookBudget);
    return {
      ...measurement,
      verdict: evaluation.verdict,
      evaluation: toContextBudgetEvaluation(evaluation, targetHookBudget)
    };
  });
  applyBudgetContextSummary(context.summary.hooks, hookTargetTotals, hookBudget);
  context.summary.hooks.accounting = 'worst-event';

  const planningBudget = budgets?.budgets?.planningHotContext;
  const planningTargetTotals = [...planningTotalsByTarget.values()].map((measurement) => {
    if (!planningBudget) {
      return { ...measurement, verdict: 'unknown', evaluation: null };
    }

    const evaluation = evaluateBudget(measurement, planningBudget);
    return {
      ...measurement,
      verdict: evaluation.verdict,
      evaluation: toContextBudgetEvaluation(evaluation, planningBudget)
    };
  });
  applyBudgetContextSummary(context.summary.planning, planningTargetTotals, planningBudget);

  const skillProfileBudget = budgets?.budgets?.skillProfile;
  const skillProfileTargetTotals = [...skillProfileTotalsByTarget.values()].map((measurement) => {
    if (!skillProfileBudget) {
      return { ...measurement, verdict: 'unknown', evaluation: null };
    }

    const evaluation = evaluateBudget(measurement, skillProfileBudget);
    return {
      ...measurement,
      verdict: evaluation.verdict,
      evaluation: toContextBudgetEvaluation(evaluation, skillProfileBudget)
    };
  });
  applyBudgetContextSummary(context.summary.skillProfiles, skillProfileTargetTotals, skillProfileBudget);

  const governance = await inspectGovernanceDomain({ rootDir, homeDir, state, targets });
  const scopeOverlap = governance.scopeOverlap;
  for (const overlap of scopeOverlap.overlaps ?? []) {
    const recommendedAction = overlap.recommendedAction ?? scopeOverlap.recommendedAction;
    const message = recommendedAction
      ? `scope overlap ${overlap.target}: ${overlap.message} Recommended action: ${recommendedAction}`
      : `scope overlap ${overlap.target}: ${overlap.message}`;
    addContextUniqueMessage(context.warnings, message);
    addContextUniqueMessage(warnings, message);
  }

  const safety = governance.safety;
  for (const check of safety.checks) {
    if (check.status === 'warning' && check.message) {
      addContextUniqueMessage(warnings, `safety ${check.name}: ${check.message}`);
      continue;
    }

    if (check.status === 'problem' && check.message) {
      addContextUniqueMessage(problems, `safety ${check.name}: ${check.message}`);
    }
  }

  const userManaged = governance.userManaged;
  for (const problem of governance.userManagedProblems) {
    addContextUniqueMessage(problems, problem);
  }

  const backupGovernance = governance.backupGovernance;
  if (backupGovernance.legacyBackups.length > 0) {
    addContextUniqueMessage(
      problems,
      `Legacy Harness sibling backups detected under user-global roots: ${backupGovernance.legacyBackups.join(', ')}`
    );
  }

  if (backupGovernance.archiveIndexDrift.length > 0) {
    addContextUniqueMessage(
      problems,
      `Harness backup archive/index drift detected under user-global roots: ${backupGovernance.archiveIndexDrift.join(', ')}`
    );
  }

  if (
    state.scope !== 'workspace' &&
    state.skillProfile === 'full' &&
    state.targets.codex?.enabled
  ) {
    addContextUniqueMessage(
      warnings,
      'Install baseline is heavier than the recommended default: user-global installs should usually prefer minimal-global unless you intentionally need the broader baseline capability package.'
    );
  }

  return {
    scope: state.scope,
    projectionMode: state.projectionMode,
    hookMode: state.hookMode,
    deploymentProfile: state.deploymentProfile,
    policyProfile: state.policyProfile,
    workspacePolicyOverlay: state.workspacePolicyOverlay ?? null,
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
    problems,
    budgetLoadProblem
  };
}
