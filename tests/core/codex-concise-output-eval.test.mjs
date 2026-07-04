import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';

import {
  evaluateCodexConciseOutputRun,
  evaluateCodexConciseOutputRunFile
} from '../evals/codex-concise-output/lib/evaluate-codex-concise-output.mjs';

function evidenceRefs(reason = 'Cites rollout trio evidence') {
  return {
    progressRefs: ['planning/active/codex-concise-output-absorption-rollout-20260628/progress.md#phase-4'],
    taskPlanRefs: ['planning/active/codex-concise-output-absorption-rollout-20260628/task_plan.md#phase-4'],
    findingsRefs: ['planning/active/codex-concise-output-absorption-rollout-20260628/findings.md#task-4'],
    reason
  };
}

function scenario({
  id,
  baselineTokens = 40,
  conciseTokens = 20,
  baselineLines = 4,
  conciseLines = 2,
  conciseRequiredInfoPreserved = true,
  conciseTrioWritebackPreserved = true,
  concisePlanningAuthorityPreserved = true,
  baselineRequiredInfoPreserved = true,
  baselineTrioWritebackPreserved = true,
  baselinePlanningAuthorityPreserved = true,
  baselineEvidence = evidenceRefs('Baseline cites rollout trio evidence'),
  conciseEvidence = evidenceRefs('Concise cites rollout trio evidence')
}) {
  return {
    id,
    winner: 'concise',
    metrics: {
      baseline: {
        assistantProcessTokens: baselineTokens,
        assistantProcessLines: baselineLines,
        requiredInfoPreserved: baselineRequiredInfoPreserved,
        trioWritebackPreserved: baselineTrioWritebackPreserved,
        planningAuthorityPreserved: baselinePlanningAuthorityPreserved,
        evidence: baselineEvidence
      },
      concise: {
        assistantProcessTokens: conciseTokens,
        assistantProcessLines: conciseLines,
        requiredInfoPreserved: conciseRequiredInfoPreserved,
        trioWritebackPreserved: conciseTrioWritebackPreserved,
        planningAuthorityPreserved: concisePlanningAuthorityPreserved,
        evidence: conciseEvidence
      }
    }
  };
}

test('acceptance evaluator fails when concise side loses trio writeback', () => {
  const report = evaluateCodexConciseOutputRun({
    runId: 'trio-regression',
    scenarios: [
      scenario({
        id: 'tracked-task-phase-sync',
        conciseTrioWritebackPreserved: false
      })
    ]
  });

  assert.equal(report.pass, false);
  assert.equal(report.summary.trioRegressionCount, 1);
});

test('acceptance evaluator passes when concise side is shorter and preserves safety fields', () => {
  const report = evaluateCodexConciseOutputRun({
    runId: 'passing-sample',
    scenarios: [
      scenario({ id: 'implementation-local-edit' }),
      scenario({ id: 'implementation-with-blocker', conciseTokens: 25, conciseLines: 3 }),
      scenario({ id: 'review-findings-update', conciseTokens: 24, conciseLines: 3 }),
      scenario({ id: 'tracked-task-phase-sync', conciseTokens: 22, conciseLines: 2 }),
      scenario({
        id: 'validation-sensitive-update',
        baselineTokens: 45,
        conciseTokens: 45,
        baselineLines: 5,
        conciseLines: 4
      })
    ]
  });

  assert.equal(report.pass, true);
  assert.deepEqual(report.summary, {
    conciseWinCount: 5,
    trioRegressionCount: 0,
    planningAuthorityRegressionCount: 0,
    requiredInfoRegressionCount: 0,
    unsupportedSafetyClaimCount: 0
  });
});

test('acceptance evaluator fails when safety booleans are true but evidence refs are missing', () => {
  const report = evaluateCodexConciseOutputRun({
    runId: 'unsupported-safety-claim',
    scenarios: [
      scenario({
        id: 'implementation-local-edit',
        conciseEvidence: {
          progressRefs: [],
          taskPlanRefs: [],
          findingsRefs: [],
          reason: ''
        }
      })
    ]
  });

  assert.equal(report.pass, false);
  assert.equal(report.summary.unsupportedSafetyClaimCount, 1);
});

test('acceptance evaluator fails when evidence ref arrays are empty even if reason is non-empty', () => {
  const report = evaluateCodexConciseOutputRun({
    runId: 'empty-refs-with-reason',
    scenarios: [
      scenario({
        id: 'implementation-local-edit',
        conciseEvidence: {
          progressRefs: [],
          taskPlanRefs: [],
          findingsRefs: [],
          reason: 'Mentions rollout safety without exact refs'
        }
      })
    ]
  });

  assert.equal(report.pass, false);
  assert.equal(report.summary.unsupportedSafetyClaimCount, 1);
});

test('acceptance evaluator fails when refs do not point at the rollout trio even if reason is non-empty', () => {
  const report = evaluateCodexConciseOutputRun({
    runId: 'non-rollout-refs-with-reason',
    scenarios: [
      scenario({
        id: 'implementation-local-edit',
        conciseEvidence: {
          progressRefs: ['planning/active/other-task-20260628/progress.md#phase-5'],
          taskPlanRefs: ['planning/active/codex-concise-output-absorption-rollout-20260628/progress.md#phase-5'],
          findingsRefs: ['tests/evals/codex-concise-output/acceptance-rubric.md#safety'],
          reason: 'References unrelated or miscategorized files instead of the rollout trio'
        }
      })
    ]
  });

  assert.equal(report.pass, false);
  assert.equal(report.summary.unsupportedSafetyClaimCount, 1);
});

test('evaluateCodexConciseOutputRunFile accepts a real five-scenario run artifact from disk', async () => {
  const evalRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-concise-output-'));
  const fileName = 'acceptance-run-2026-06-28.json';
  const run = {
    runId: '2026-06-28-real-run',
    scenarios: [
      scenario({ id: 'implementation-local-edit' }),
      scenario({ id: 'implementation-with-blocker', conciseTokens: 25, conciseLines: 3 }),
      scenario({ id: 'review-findings-update', conciseTokens: 24, conciseLines: 3 }),
      scenario({ id: 'tracked-task-phase-sync', conciseTokens: 22, conciseLines: 2 }),
      scenario({
        id: 'validation-sensitive-update',
        baselineTokens: 45,
        conciseTokens: 45,
        baselineLines: 5,
        conciseLines: 4
      })
    ]
  };

  await writeFile(path.join(evalRoot, fileName), JSON.stringify(run, null, 2));

  const report = await evaluateCodexConciseOutputRunFile(evalRoot, fileName);

  assert.equal(report.runId, '2026-06-28-real-run');
  assert.equal(report.pass, true);
  assert.equal(report.summary.conciseWinCount, 5);
  assert.equal(report.summary.unsupportedSafetyClaimCount, 0);
});

test('evaluateCodexConciseOutputRunFile defaults to the passing real observation artifact', async () => {
  const report = await evaluateCodexConciseOutputRunFile(
    path.resolve('tests/evals/codex-concise-output')
  );

  assert.equal(report.runId, '2026-06-29-real-observation');
  assert.equal(report.pass, true);
  assert.equal(report.summary.conciseWinCount, 5);
  assert.equal(report.summary.unsupportedSafetyClaimCount, 0);
});
