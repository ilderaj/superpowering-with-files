import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BUDGET_DIMENSIONS = [
  { measurementKey: 'chars', budgetKey: 'chars', label: 'chars' },
  { measurementKey: 'lines', budgetKey: 'lines', label: 'lines' },
  { measurementKey: 'approxTokens', budgetKey: 'tokens', label: 'approxTokens' }
];

const REQUIRED_CONTEXT_BUDGET_NAMES = ['entry', 'hookPayload', 'planningHotContext', 'skillProfile'];
const REQUIRED_THRESHOLD_KEYS = ['chars', 'lines', 'tokens'];

function textValue(text) {
  return typeof text === 'string' ? text : String(text ?? '');
}

function severityRank(verdict) {
  if (verdict === 'problem') return 2;
  if (verdict === 'warning') return 1;
  return 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createContextBudgetError(message, issues = []) {
  const error = new Error(message);
  error.code = 'ERR_CONTEXT_BUDGETS_INVALID';
  error.issues = issues;
  return error;
}

function validateThresholdNode(node, pathLabel, issues) {
  if (!isPlainObject(node)) {
    issues.push(`${pathLabel} must be a JSON object.`);
    return;
  }

  for (const key of REQUIRED_THRESHOLD_KEYS) {
    if (typeof node[key] !== 'number' || !Number.isFinite(node[key])) {
      issues.push(`${pathLabel}.${key} must be a finite number.`);
    }
  }
}

function validateBudgetSection(section, pathLabel, issues) {
  if (!isPlainObject(section)) {
    issues.push(`${pathLabel} must be a JSON object.`);
    return;
  }

  validateThresholdNode(section.warn, `${pathLabel}.warn`, issues);
  validateThresholdNode(section.problem, `${pathLabel}.problem`, issues);
}

function validateContextBudgetsShape(config) {
  const issues = [];

  if (!isPlainObject(config)) {
    issues.push('context-budgets.json must be a JSON object.');
    return issues;
  }

  if (config.schemaVersion !== 1) {
    issues.push('context-budgets.json schemaVersion must be 1.');
  }

  if (!isPlainObject(config.budgets)) {
    issues.push('context-budgets.json budgets must be a JSON object.');
    return issues;
  }

  for (const budgetName of REQUIRED_CONTEXT_BUDGET_NAMES) {
    validateBudgetSection(config.budgets[budgetName], `budgets.${budgetName}`, issues);
  }

  return issues;
}

export async function loadContextBudgets(rootDir) {
  const file = path.join(rootDir, 'harness/core/context-budgets.json');
  let config;

  try {
    config = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw createContextBudgetError('context-budgets.json is malformed JSON.', [error.message]);
    }

    throw createContextBudgetError(
      `context-budgets.json could not be read: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const issues = validateContextBudgetsShape(config);
  if (issues.length) {
    throw createContextBudgetError(`context-budgets.json is invalid: ${issues[0]}`, issues);
  }

  return config;
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
