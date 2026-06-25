import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOverengineeringReviewFixtures } from '../../harness/core/skills/overengineering-review/lib/evaluate-overengineering-review.mjs';

test('overengineering-review fixtures cover all supported cut tags without widening into general review', async () => {
  const report = await evaluateOverengineeringReviewFixtures();

  assert.equal(report.summary.total, 6);
  assert.equal(report.summary.passed, 6);
  assert.equal(report.summary.failed, 0);
  assert.deepEqual(report.summary.coveredTags, ['delete', 'native', 'shrink', 'stdlib', 'yagni']);

  const outOfScope = report.results.find((result) => result.id === 'out-of-scope-correctness');
  assert.ok(outOfScope, 'out-of-scope fixture should exist');
  assert.equal(outOfScope.noFindings, true);
  assert.deepEqual(outOfScope.tags, []);
  assert.equal(outOfScope.netLines, 0);

  for (const result of report.results) {
    assert.equal(result.pass, true, `${result.id}: ${result.notes.join('; ')}`);
  }
});
