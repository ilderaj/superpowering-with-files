import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectContextBudgets } from '../../harness/installer/lib/health-context-budgets.mjs';

test('inspectContextBudgets preserves budget summary verdicts and worst-case aggregation', () => {
  const budget = {
    warn: { chars: 100, lines: 20, tokens: 30 },
    problem: { chars: 200, lines: 40, tokens: 60 }
  };

  const report = inspectContextBudgets({
    totals: [
      {
        target: 'codex',
        chars: 90,
        lines: 10,
        approxTokens: 20,
        verdict: 'ok',
        evaluation: { verdict: 'ok' }
      },
      {
        target: 'copilot',
        chars: 150,
        lines: 18,
        approxTokens: 35,
        verdict: 'warning',
        evaluation: { verdict: 'warning' }
      }
    ],
    budget
  });

  assert.equal(report.target, 'copilot');
  assert.equal(report.verdict, 'warning');
  assert.equal(report.approxTokens, 35);
  assert.equal(report.targets.length, 2);
  assert.ok(report.evaluation);
});
