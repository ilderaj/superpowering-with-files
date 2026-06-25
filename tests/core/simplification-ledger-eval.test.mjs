import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSimplificationLedgerFixtures } from '../../harness/core/skills/simplification-ledger/lib/evaluate-simplification-ledger.mjs';

test('simplification-ledger fixtures keep the report read-only while handling mixed markers and missing triggers', async () => {
  const report = await evaluateSimplificationLedgerFixtures();

  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.passed, 3);
  assert.equal(report.summary.failed, 0);

  const mixedMarkers = report.results.find((result) => result.id === 'mixed-markers');
  const missingTrigger = report.results.find((result) => result.id === 'missing-trigger');
  const ignoreUnsupported = report.results.find((result) => result.id === 'ignore-prose-and-block-comments');

  assert.equal(mixedMarkers?.rowCount, 2);
  assert.equal(missingTrigger?.rowCount, 1);
  assert.equal(ignoreUnsupported?.rowCount, 0);

  for (const result of report.results) {
    assert.equal(result.pass, true, `${result.id}: ${result.notes.join('; ')}`);
  }
});
