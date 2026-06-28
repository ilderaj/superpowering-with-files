import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLLOUT_TASK_ROOT = 'planning/active/codex-concise-output-absorption-rollout-20260628';
const ROLLOUT_EVIDENCE_FILES = {
  progressRefs: `${ROLLOUT_TASK_ROOT}/progress.md`,
  taskPlanRefs: `${ROLLOUT_TASK_ROOT}/task_plan.md`,
  findingsRefs: `${ROLLOUT_TASK_ROOT}/findings.md`
};

function defaultEvalRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function isRolloutRef(ref, expectedFile) {
  return typeof ref === 'string'
    && (ref === expectedFile || ref.startsWith(`${expectedFile}#`));
}

function countValidRefs(refs, expectedFile) {
  if (!Array.isArray(refs)) {
    return 0;
  }

  return refs.filter((ref) => isRolloutRef(ref, expectedFile)).length;
}

export function hasEvidenceRefs(side) {
  const evidence = side.evidence ?? {};
  const progressRefs = Array.isArray(evidence.progressRefs) ? evidence.progressRefs : null;
  const taskPlanRefs = Array.isArray(evidence.taskPlanRefs) ? evidence.taskPlanRefs : null;
  const findingsRefs = Array.isArray(evidence.findingsRefs) ? evidence.findingsRefs : null;
  const validRefCount = countValidRefs(progressRefs, ROLLOUT_EVIDENCE_FILES.progressRefs)
    + countValidRefs(taskPlanRefs, ROLLOUT_EVIDENCE_FILES.taskPlanRefs)
    + countValidRefs(findingsRefs, ROLLOUT_EVIDENCE_FILES.findingsRefs);

  return Array.isArray(progressRefs)
    && Array.isArray(taskPlanRefs)
    && Array.isArray(findingsRefs)
    && validRefCount > 0
    && typeof evidence.reason === 'string'
    && evidence.reason.trim() !== '';
}

export function conciseWin(scenario) {
  const a = scenario.metrics.baseline;
  const b = scenario.metrics.concise;
  return b.assistantProcessTokens < a.assistantProcessTokens
    || b.assistantProcessLines < a.assistantProcessLines;
}

export function trioRegression(scenario) {
  return Boolean(scenario.metrics.baseline.trioWritebackPreserved)
    && !scenario.metrics.concise.trioWritebackPreserved;
}

export function planningAuthorityRegression(scenario) {
  return Boolean(scenario.metrics.baseline.planningAuthorityPreserved)
    && !scenario.metrics.concise.planningAuthorityPreserved;
}

export function unsupportedSafetyClaim(side) {
  return (side.trioWritebackPreserved || side.planningAuthorityPreserved) && !hasEvidenceRefs(side);
}

function requiredInfoRegression(scenario) {
  return Boolean(scenario.metrics.baseline.requiredInfoPreserved)
    && !scenario.metrics.concise.requiredInfoPreserved;
}

export function evaluateCodexConciseOutputRun(run) {
  const scenarios = run.scenarios ?? [];
  const conciseWins = scenarios.filter(conciseWin);
  const trioRegressions = scenarios.filter(trioRegression);
  const planningAuthorityRegressions = scenarios.filter(planningAuthorityRegression);
  const requiredInfoRegressions = scenarios.filter(requiredInfoRegression);
  const unsupportedSafetyClaims = scenarios.flatMap((scenario) => {
    const claims = [];
    if (unsupportedSafetyClaim(scenario.metrics.baseline)) {
      claims.push(`${scenario.id}:baseline`);
    }
    if (unsupportedSafetyClaim(scenario.metrics.concise)) {
      claims.push(`${scenario.id}:concise`);
    }
    return claims;
  });

  const notes = [];

  if (scenarios.length !== 5) {
    notes.push(`need exactly 5 scenarios, got ${scenarios.length}`);
  }
  if (conciseWins.length < 4) {
    notes.push(`concise side only wins process narration size on ${conciseWins.length} scenarios`);
  }
  if (requiredInfoRegressions.length > 0) {
    notes.push(`concise side drops required information on ${requiredInfoRegressions.length} scenarios`);
  }
  if (trioRegressions.length > 0) {
    notes.push(`concise side regresses trio writeback on ${trioRegressions.length} scenarios`);
  }
  if (planningAuthorityRegressions.length > 0) {
    notes.push(`concise side regresses planning authority on ${planningAuthorityRegressions.length} scenarios`);
  }
  if (unsupportedSafetyClaims.length > 0) {
    notes.push(`safety claims lack evidence refs on ${unsupportedSafetyClaims.length} sides`);
  }

  return {
    runId: run.runId,
    pass: notes.length === 0,
    notes,
    summary: {
      conciseWinCount: conciseWins.length,
      trioRegressionCount: trioRegressions.length,
      planningAuthorityRegressionCount: planningAuthorityRegressions.length,
      requiredInfoRegressionCount: requiredInfoRegressions.length,
      unsupportedSafetyClaimCount: unsupportedSafetyClaims.length
    },
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      winner: scenario.winner,
      conciseWin: conciseWin(scenario),
      trioRegression: trioRegression(scenario),
      planningAuthorityRegression: planningAuthorityRegression(scenario),
      requiredInfoRegression: requiredInfoRegression(scenario),
      unsupportedSafetyClaims: {
        baseline: unsupportedSafetyClaim(scenario.metrics.baseline),
        concise: unsupportedSafetyClaim(scenario.metrics.concise)
      },
      baseline: scenario.metrics.baseline,
      concise: scenario.metrics.concise
    }))
  };
}

export async function evaluateCodexConciseOutputRunFile(
  evalRoot = defaultEvalRoot(),
  fileName = 'acceptance-run-template.json'
) {
  const parsed = JSON.parse(await readFile(path.join(evalRoot, fileName), 'utf8'));
  const run = Array.isArray(parsed.scenarios)
    ? {
        runId: parsed.runId ?? fileName,
        scenarios: parsed.scenarios
      }
    : {
        runId: parsed.runId ?? fileName,
        scenarios: [parsed]
      };

  return evaluateCodexConciseOutputRun(run);
}

export function formatCodexConciseOutputReport(report) {
  const lines = [];
  lines.push(`Codex Concise Output Acceptance: ${report.summary.conciseWinCount} concise wins across ${report.scenarios.length} scenarios`);
  lines.push(`Trio regressions: ${report.summary.trioRegressionCount}`);
  lines.push(`Planning-authority regressions: ${report.summary.planningAuthorityRegressionCount}`);
  lines.push(`Required-info regressions: ${report.summary.requiredInfoRegressionCount}`);
  lines.push(`Unsupported safety claims: ${report.summary.unsupportedSafetyClaimCount}`);
  lines.push(`Verdict: ${report.pass ? 'PASS' : 'FAIL'}`);
  lines.push('');

  for (const scenario of report.scenarios) {
    lines.push(
      `${scenario.winner === 'concise' ? 'CONCISE' : 'BASELINE'} ${scenario.id} | conciseWin=${scenario.conciseWin ? 'yes' : 'no'} | trioRegression=${scenario.trioRegression ? 'yes' : 'no'} | planningAuthorityRegression=${scenario.planningAuthorityRegression ? 'yes' : 'no'} | requiredInfoRegression=${scenario.requiredInfoRegression ? 'yes' : 'no'}`
    );
  }

  if (report.notes.length > 0) {
    lines.push('');
    lines.push('Notes:');
    for (const note of report.notes) {
      lines.push(`- ${note}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
