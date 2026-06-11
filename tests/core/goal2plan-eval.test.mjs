import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGoal2PlanFixtures } from '../../harness/core/skills/goal2plan/lib/evaluate-goal2plan.mjs';

test('goal2plan fixtures pass Mode B hard checks', async () => {
  const report = await evaluateGoal2PlanFixtures();

  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.failed, 0);

  for (const result of report.results) {
    assert.equal(result.pass, true, `${result.id}: ${result.notes.join('; ')}`);
    assert.equal(result.usesFencedBlock, true, result.id);
    assert.equal(result.hasNumericTarget, true, result.id);
    assert.ok(result.length <= 4000, result.id);
  }
});
