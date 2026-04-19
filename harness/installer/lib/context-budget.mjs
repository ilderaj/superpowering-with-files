import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BUDGET_DIMENSIONS = [
  { measurementKey: 'chars', budgetKey: 'chars', label: 'chars' },
  { measurementKey: 'lines', budgetKey: 'lines', label: 'lines' },
  { measurementKey: 'approxTokens', budgetKey: 'tokens', label: 'approxTokens' }
];

function textValue(text) {
  return typeof text === 'string' ? text : String(text ?? '');
}

function severityRank(verdict) {
  if (verdict === 'problem') return 2;
  if (verdict === 'warning') return 1;
  return 0;
}

export async function loadContextBudgets(rootDir) {
  const file = path.join(rootDir, 'harness/core/context-budgets.json');
  return JSON.parse(await readFile(file, 'utf8'));
}

export function approxTokenCount(text) {
  const value = textValue(text);
  if (value.length === 0) return 0;
  return Math.max(1, Math.ceil(value.length / 4));
}

export function measureText(text) {
  const value = textValue(text);
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  return {
    chars: value.length,
    lines: normalized.length === 0 ? 0 : normalized.split('\n').length,
    approxTokens: approxTokenCount(value)
  };
}

export function evaluateBudget(measurement, budget) {
  const checks = BUDGET_DIMENSIONS.map(({ measurementKey, budgetKey, label }) => {
    const value = Number(measurement?.[measurementKey] ?? 0);
    const warn = Number(budget?.warn?.[budgetKey] ?? Number.POSITIVE_INFINITY);
    const problem = Number(budget?.problem?.[budgetKey] ?? Number.POSITIVE_INFINITY);
    const verdict = value >= problem ? 'problem' : value >= warn ? 'warning' : 'ok';

    return {
      label,
      value,
      warn,
      problem,
      verdict
    };
  });

  const verdict = checks.reduce((current, check) => {
    return severityRank(check.verdict) > severityRank(current) ? check.verdict : current;
  }, 'ok');

  return {
    verdict,
    checks
  };
}
