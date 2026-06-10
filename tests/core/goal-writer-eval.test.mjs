import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGoalWriterFixtures } from '../../harness/core/skills/goal-writer/lib/evaluate-goal-writer.mjs';

test('goal-writer fixtures pass hard checks and stay within the prompt budget', async () => {
  const report = await evaluateGoalWriterFixtures();
  const quickTask = report.results.find((result) => result.id === 'quick-task');

  assert.equal(report.summary.total, 6);
  assert.equal(report.summary.passed, 6);
  assert.equal(report.summary.failed, 0);
  assert.ok(report.summary.maxLength <= 4000);
  assert.ok(report.summary.minScore >= 9);
  assert.ok(quickTask, 'quick-task fixture should exist');
  assert.ok(quickTask.length <= 1200, 'quick-task fixture should use the compact prompt budget');

  for (const result of report.results) {
    assert.equal(result.pass, true, `${result.id}: ${result.notes.join('; ')}`);
    assert.equal(result.usesFencedBlock, true, result.id);
    assert.equal(result.hasNumericTarget, true, result.id);
    assert.ok(result.length <= 4000, result.id);
    assert.deepEqual(result.missingSections, [], result.id);
  }
});
