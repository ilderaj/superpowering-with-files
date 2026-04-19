import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approxTokenCount,
  evaluateBudget,
  measureText
} from '../../harness/installer/lib/context-budget.mjs';

test('measureText counts chars, lines, and approx tokens', () => {
  const measurement = measureText('alpha\nbeta');

  assert.equal(measurement.chars, 10);
  assert.equal(measurement.lines, 2);
  assert.equal(measurement.approxTokens, 3);
});

test('evaluateBudget returns warning and problem verdicts across budget dimensions', () => {
  const budget = {
    warn: { chars: 8, lines: 2, tokens: 3 },
    problem: { chars: 12, lines: 4, tokens: 5 }
  };

  assert.equal(evaluateBudget(measureText('alpha beta'), budget).verdict, 'warning');
  assert.equal(evaluateBudget(measureText('alpha\nbeta\ngamma'), budget).verdict, 'problem');
  assert.equal(
    evaluateBudget({ chars: 2, lines: 1, approxTokens: 2 }, budget).verdict,
    'ok'
  );
});

test('approxTokenCount respects boundary transitions', () => {
  assert.equal(approxTokenCount(''), 0);
  assert.equal(approxTokenCount('a'), 1);
  assert.equal(approxTokenCount('abcd'), 1);
  assert.equal(approxTokenCount('abcde'), 2);
});
