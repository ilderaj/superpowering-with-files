import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSimplicityLadderFixtures } from '../evals/ponytail-borrowings/lib/evaluate-simplicity-ladder.mjs';

test('simplicity-ladder fixtures preserve decision order and refuse unsafe simplifications', async () => {
  const report = await evaluateSimplicityLadderFixtures();

  assert.equal(report.summary.total, 4);
  assert.equal(report.summary.passed, 4);
  assert.equal(report.summary.failed, 0);
  assert.deepEqual(report.summary.coveredWinningSteps, ['native', 'smallest working diff', 'stdlib']);

  const guardrailFixture = report.results.find((result) => result.id === 'do-not-simplify-away-validation');
  assert.ok(guardrailFixture, 'guardrail fixture should exist');
  assert.equal(guardrailFixture.decision, 'option-a');
  assert.equal(guardrailFixture.winningStep, 'smallest working diff');

  for (const result of report.results) {
    assert.equal(result.pass, true, `${result.id}: ${result.notes.join('; ')}`);
  }
});
