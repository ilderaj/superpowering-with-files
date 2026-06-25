import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateAcceptanceRun,
  evaluateAcceptanceRunFile,
  formatAcceptanceRunReport,
  renderAcceptanceScorecardMarkdown
} from '../evals/ponytail-borrowings/lib/evaluate-acceptance-runs.mjs';

test('evaluateAcceptanceRunFile validates the canonical ponytail acceptance sample', async () => {
  const report = await evaluateAcceptanceRunFile();

  assert.equal(report.pass, true);
  assert.deepEqual(report.notes, []);
  assert.equal(report.runId, '2026-06-21-opt-in-ab');
  assert.deepEqual(report.summary, {
    scenarioCount: 5,
    implementationCount: 2,
    reviewOrDebtCount: 2,
    validationCount: 1,
    metricWinCount: 3,
    validationRegressionCount: 0,
    simplerWithoutSloppierCount: 5,
    borrowedWinnerCount: 5
  });

  const textReport = formatAcceptanceRunReport(report);
  assert.match(textReport, /Ponytail Acceptance Run: 5\/5 scenarios favor the borrowed side/);
  assert.match(textReport, /Verdict: PASS/);

  const markdown = renderAcceptanceScorecardMarkdown(report);
  assert.match(markdown, /# Ponytail Borrowings Acceptance Scorecard/);
  assert.match(markdown, /- Verdict: \*\*PASS\*\*/);
  assert.match(markdown, /\| Scenario \| Category \| Winner \| Metric win \| Validation \| Simpler \|/);
});

test('evaluateAcceptanceRun reports category, metric, and validation failures explicitly', () => {
  const report = evaluateAcceptanceRun({
    runId: 'failing-sample',
    scenarios: [
      {
        id: 'only-one',
        title: 'Single weak scenario',
        category: 'implementation',
        winner: 'baseline',
        metrics: {
          baseline: {
            newDependencies: 0,
            filesChanged: 1,
            diffLines: 5,
            validationPreserved: true,
            simplerWithoutSloppier: false
          },
          borrowed: {
            newDependencies: 0,
            filesChanged: 1,
            diffLines: 5,
            validationPreserved: false,
            simplerWithoutSloppier: false
          }
        },
        winReasons: []
      }
    ]
  });

  assert.equal(report.pass, false);
  assert.equal(report.summary.scenarioCount, 1);
  assert.equal(report.summary.implementationCount, 1);
  assert.equal(report.summary.reviewOrDebtCount, 0);
  assert.equal(report.summary.validationCount, 0);
  assert.equal(report.summary.metricWinCount, 0);
  assert.equal(report.summary.validationRegressionCount, 1);
  assert.equal(report.summary.simplerWithoutSloppierCount, 0);
  assert.equal(report.summary.borrowedWinnerCount, 0);
  assert.ok(report.notes.some((note) => note.includes('need at least 5 scenarios')));
  assert.ok(report.notes.some((note) => note.includes('need at least 2 implementation scenarios')));
  assert.ok(report.notes.some((note) => note.includes('need at least 2 review or debt scenarios')));
  assert.ok(report.notes.some((note) => note.includes('need at least 1 validation-sensitive scenario')));
  assert.ok(report.notes.some((note) => note.includes('borrowed side only wins the dependency/files/diff metric on 0 scenarios')));
  assert.ok(report.notes.some((note) => note.includes('borrowed side regresses validation on 1 scenarios')));
  assert.ok(report.notes.some((note) => note.includes('borrowed side is only judged simpler without getting sloppier on 0 scenarios')));

  const scenario = report.scenarios[0];
  assert.equal(scenario.metricWin, false);
  assert.equal(scenario.validationRegression, true);
  assert.equal(scenario.simplerWithoutSloppier, false);

  const textReport = formatAcceptanceRunReport(report);
  assert.match(textReport, /Verdict: FAIL/);
  assert.match(textReport, /Notes:/);

  const markdown = renderAcceptanceScorecardMarkdown(report);
  assert.match(markdown, /## Notes/);
  assert.match(markdown, /Validation regressions: `1`/);
});
