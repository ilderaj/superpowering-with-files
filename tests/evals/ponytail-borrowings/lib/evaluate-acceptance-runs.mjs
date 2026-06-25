import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function defaultEvalRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function categorySummary(scenarios) {
  const counts = {
    implementation: 0,
    reviewOrDebt: 0,
    validation: 0
  };

  for (const scenario of scenarios) {
    if (scenario.category === 'implementation') counts.implementation += 1;
    if (scenario.category === 'review' || scenario.category === 'debt') counts.reviewOrDebt += 1;
    if (scenario.category === 'validation') counts.validation += 1;
  }

  return counts;
}

function metricWin(scenario) {
  const a = scenario.metrics.baseline;
  const b = scenario.metrics.borrowed;
  return (
    (typeof a.newDependencies === 'number' && typeof b.newDependencies === 'number' && b.newDependencies < a.newDependencies)
    || (typeof a.filesChanged === 'number' && typeof b.filesChanged === 'number' && b.filesChanged < a.filesChanged)
    || (typeof a.diffLines === 'number' && typeof b.diffLines === 'number' && b.diffLines < a.diffLines)
  );
}

function validationRegression(scenario) {
  const a = scenario.metrics.baseline;
  const b = scenario.metrics.borrowed;
  return Boolean(a.validationPreserved) && !b.validationPreserved;
}

function simplerWin(scenario) {
  return scenario.metrics.borrowed.simplerWithoutSloppier === true;
}

export function evaluateAcceptanceRun(run) {
  const notes = [];
  const scenarios = run.scenarios ?? [];
  const categories = categorySummary(scenarios);
  const metricWins = scenarios.filter(metricWin);
  const validationRegressions = scenarios.filter(validationRegression);
  const simplerWins = scenarios.filter(simplerWin);
  const borrowedWinners = scenarios.filter((scenario) => scenario.winner === 'borrowed');

  if (scenarios.length < 5) {
    notes.push(`need at least 5 scenarios, got ${scenarios.length}`);
  }
  if (categories.implementation < 2) {
    notes.push(`need at least 2 implementation scenarios, got ${categories.implementation}`);
  }
  if (categories.reviewOrDebt < 2) {
    notes.push(`need at least 2 review or debt scenarios, got ${categories.reviewOrDebt}`);
  }
  if (categories.validation < 1) {
    notes.push('need at least 1 validation-sensitive scenario');
  }
  if (metricWins.length < 3) {
    notes.push(`borrowed side only wins the dependency/files/diff metric on ${metricWins.length} scenarios`);
  }
  if (validationRegressions.length > 0) {
    notes.push(`borrowed side regresses validation on ${validationRegressions.length} scenarios`);
  }
  if (simplerWins.length < 4) {
    notes.push(`borrowed side is only judged simpler without getting sloppier on ${simplerWins.length} scenarios`);
  }

  return {
    runId: run.runId,
    pass: notes.length === 0,
    notes,
    summary: {
      scenarioCount: scenarios.length,
      implementationCount: categories.implementation,
      reviewOrDebtCount: categories.reviewOrDebt,
      validationCount: categories.validation,
      metricWinCount: metricWins.length,
      validationRegressionCount: validationRegressions.length,
      simplerWithoutSloppierCount: simplerWins.length,
      borrowedWinnerCount: borrowedWinners.length
    },
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      winner: scenario.winner,
      metricWin: metricWin(scenario),
      validationRegression: validationRegression(scenario),
      simplerWithoutSloppier: simplerWin(scenario),
      baseline: scenario.metrics.baseline,
      borrowed: scenario.metrics.borrowed,
      winReasons: scenario.winReasons ?? []
    }))
  };
}

export async function evaluateAcceptanceRunFile(evalRoot = defaultEvalRoot(), fileName = 'acceptance-run-2026-06-21.json') {
  const run = JSON.parse(await readFile(path.join(evalRoot, fileName), 'utf8'));
  return evaluateAcceptanceRun(run);
}

export function formatAcceptanceRunReport(report) {
  const lines = [];
  lines.push(`Ponytail Acceptance Run: ${report.summary.borrowedWinnerCount}/${report.summary.scenarioCount} scenarios favor the borrowed side`);
  lines.push(`Metric wins (dependency/files/diff): ${report.summary.metricWinCount}`);
  lines.push(`Validation regressions: ${report.summary.validationRegressionCount}`);
  lines.push(`Simpler without sloppier: ${report.summary.simplerWithoutSloppierCount}`);
  lines.push(`Verdict: ${report.pass ? 'PASS' : 'FAIL'}`);
  lines.push('');

  for (const scenario of report.scenarios) {
    lines.push(
      `${scenario.winner === 'borrowed' ? 'BORROWED' : 'BASELINE'} ${scenario.id} | category=${scenario.category} | metricWin=${scenario.metricWin ? 'yes' : 'no'} | simpler=${scenario.simplerWithoutSloppier ? 'yes' : 'no'} | validationRegression=${scenario.validationRegression ? 'yes' : 'no'}`
    );
    for (const reason of scenario.winReasons) {
      lines.push(`- ${reason}`);
    }
    if (scenario.winReasons.length === 0) {
      lines.push('- no win reasons recorded');
    }
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

export function renderAcceptanceScorecardMarkdown(report) {
  const lines = [];
  lines.push('# Ponytail Borrowings Acceptance Scorecard');
  lines.push('');
  lines.push(`- Run id: \`${report.runId}\``);
  lines.push(`- Verdict: **${report.pass ? 'PASS' : 'FAIL'}**`);
  lines.push(`- Scenarios: \`${report.summary.scenarioCount}\``);
  lines.push(`- Borrowed-side wins: \`${report.summary.borrowedWinnerCount}\``);
  lines.push(`- Metric wins (dependency/files/diff): \`${report.summary.metricWinCount}\``);
  lines.push(`- Validation regressions: \`${report.summary.validationRegressionCount}\``);
  lines.push(`- Simpler without sloppier: \`${report.summary.simplerWithoutSloppierCount}\``);
  lines.push('');
  lines.push('| Scenario | Category | Winner | Metric win | Validation | Simpler |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const scenario of report.scenarios) {
    lines.push(
      `| ${scenario.title} | ${scenario.category} | ${scenario.winner} | ${scenario.metricWin ? 'yes' : 'no'} | ${scenario.validationRegression ? 'regressed' : 'kept'} | ${scenario.simplerWithoutSloppier ? 'yes' : 'no'} |`
    );
  }
  lines.push('');

  for (const scenario of report.scenarios) {
    lines.push(`## ${scenario.title}`);
    lines.push('');
    lines.push(`- Winner: \`${scenario.winner}\``);
    lines.push(`- Metric win: \`${scenario.metricWin ? 'yes' : 'no'}\``);
    lines.push(`- Baseline: deps=\`${scenario.baseline.newDependencies}\`, files=\`${scenario.baseline.filesChanged}\`, diff=\`${scenario.baseline.diffLines}\`, validation=\`${scenario.baseline.validationPreserved}\``);
    lines.push(`- Borrowed: deps=\`${scenario.borrowed.newDependencies}\`, files=\`${scenario.borrowed.filesChanged}\`, diff=\`${scenario.borrowed.diffLines}\`, validation=\`${scenario.borrowed.validationPreserved}\``);
    for (const reason of scenario.winReasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  if (report.notes.length > 0) {
    lines.push('## Notes');
    lines.push('');
    for (const note of report.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}
