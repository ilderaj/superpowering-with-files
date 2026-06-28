import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function defaultEvalRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function hasEvidenceRefs(side) {
  const evidence = side.evidence ?? {};
  return Array.isArray(evidence.progressRefs)
    && Array.isArray(evidence.taskPlanRefs)
    && Array.isArray(evidence.findingsRefs)
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
  const run = JSON.parse(await readFile(path.join(evalRoot, fileName), 'utf8'));
  return evaluateCodexConciseOutputRun({
    runId: fileName,
    scenarios: [run]
  });
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
