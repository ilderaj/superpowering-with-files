import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VALID_CLOSURE_STATUSES = new Set(['resolved', 'waived']);

function stamp() {
  return new Date().toISOString().replace(/[:]/g, '-');
}

export function deriveFollowupId({ unitId, followup = {} }) {
  return `${unitId}:${followup.type || 'unknown'}:${followup.target || 'unknown'}`;
}

export function followupClosureDirectory(rootDir, taskId) {
  return path.join(rootDir, '.harness', 'execution', 'followup-closures', taskId);
}

export function validateFollowupClosure(closure = {}) {
  const reasons = [];

  for (const field of [
    'taskId',
    'unitId',
    'followupId',
    'closureStatus',
    'actor',
    'closedAt',
    'reason',
    'evidenceRef',
    'syncBackRef'
  ]) {
    if (!closure[field]) {
      reasons.push(`Follow-up closure is missing ${field}.`);
    }
  }

  if (!VALID_CLOSURE_STATUSES.has(closure.closureStatus)) {
    reasons.push(`Follow-up closure has unknown closureStatus "${closure.closureStatus}".`);
  }

  return { ok: reasons.length === 0, reasons };
}

export async function writeFollowupClosure(rootDir, closure) {
  const validation = validateFollowupClosure(closure);
  if (!validation.ok) {
    throw new Error(validation.reasons.join(' '));
  }

  const closureDir = followupClosureDirectory(rootDir, closure.taskId);
  await mkdir(closureDir, { recursive: true });
  const closurePath = path.join(closureDir, `${stamp()}-${closure.unitId}.json`);
  await writeFile(closurePath, `${JSON.stringify(closure, null, 2)}\n`);
  return closurePath;
}

export async function readFollowupClosures(rootDir, taskId) {
  const closureDir = followupClosureDirectory(rootDir, taskId);
  const entries = await readdir(closureDir).catch(() => []);

  return Promise.all(
    entries
      .filter((name) => name.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right))
      .map(async (name) => JSON.parse(await readFile(path.join(closureDir, name), 'utf8')))
  );
}

export function summarizeFollowupClosures(closures = []) {
  return {
    closureCount: closures.length,
    resolvedClosures: closures.filter((entry) => entry.closureStatus === 'resolved').length,
    waivedClosures: closures.filter((entry) => entry.closureStatus === 'waived').length
  };
}
