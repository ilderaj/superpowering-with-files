// Pure read-side decision helpers ported from harness/trio/core/read.mjs and
// harness/trio/core/store.mjs (HEAD 275345d). These decide over in-memory
// inputs only; the plugin wires real fs reads at the apply(ctx) layer.

import { TERMINAL_STATUSES, TRIO_FILE_NAMES } from './constants.js';

const STATUS_PATTERN = /^Status:\s*([^\r\n]+)$/gm;

export function parseTaskStatus(taskPlan: unknown): string | null {
  if (typeof taskPlan !== 'string' || taskPlan.trim() === '') return null;
  const statuses = [...taskPlan.matchAll(STATUS_PATTERN)].map((match) => match[1].trim());
  if (statuses.length !== 1 || !statuses[0]) return null;
  return statuses[0];
}

export function isTerminalStatus(status: unknown): boolean {
  return typeof status === 'string' && TERMINAL_STATUSES.has(status);
}

export interface ExactTrioFilesResult {
  valid: boolean;
  expected: readonly string[];
  observed: string[];
  extra: string[];
  missing: string[];
}

// Port of store.mjs exactTaskFiles decision: a Trio task directory must
// contain exactly the three authority files, all regular and non-symlinked.
// Symlink/regular-file checks are fs concerns; here we decide over names.
export function exactTrioFileNames(fileNames: unknown): ExactTrioFilesResult {
  const observed = Array.isArray(fileNames)
    ? fileNames.map((name) => String(name))
    : [];
  const expected = [...TRIO_FILE_NAMES];
  const observedSet = new Set(observed);
  const expectedSet = new Set(expected);
  const extra = observed.filter((name) => !expectedSet.has(name)).sort();
  const missing = expected.filter((name) => !observedSet.has(name));
  return {
    valid: observed.length === expected.length && extra.length === 0 && missing.length === 0,
    expected,
    observed,
    extra,
    missing
  };
}
