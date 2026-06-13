import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAutonomousReleaseClosureFixtures } from '../../harness/core/skills/autonomous-release-closure/lib/evaluate-autonomous-release-closure.mjs';

test('autonomous-release-closure fixtures pass hard checks', async () => {
  const report = await evaluateAutonomousReleaseClosureFixtures();

  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.failed, 0);

  for (const result of report.results) {
    assert.equal(result.pass, true, `${result.id}: ${result.notes.join('; ')}`);
  }
});
