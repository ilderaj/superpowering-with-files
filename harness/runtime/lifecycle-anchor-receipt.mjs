import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const VALID_ANCHOR_TYPES = new Set([
  'worktree_merged',
  'branch_pushed',
  'pr_created',
  'pr_merged',
  'release_published',
  'autonomous_closure_terminal',
  'task_discarded'
]);

export const VALID_ANCHOR_STRENGTHS = new Set(['weak', 'moderate', 'strong', 'terminal']);

function stamp(value = new Date()) {
  return value.toISOString().replace(/[:]/g, '-');
}

export function lifecycleAnchorDirectory(rootDir, taskId) {
  return path.join(rootDir, '.harness', 'lifecycle', 'anchors', taskId);
}

export function validateLifecycleAnchorReceipt(receipt = {}) {
  const reasons = [];
  for (const field of [
    'taskId',
    'anchorId',
    'anchorType',
    'anchorStrength',
    'observedAt',
    'actor',
    'evidenceRefs',
    'syncBackRef'
  ]) {
    if (!receipt[field]) reasons.push(`Anchor receipt is missing ${field}.`);
  }

  if (receipt.anchorType && !VALID_ANCHOR_TYPES.has(receipt.anchorType)) {
    reasons.push(`Anchor receipt has unknown anchorType "${receipt.anchorType}".`);
  }
  if (receipt.anchorStrength && !VALID_ANCHOR_STRENGTHS.has(receipt.anchorStrength)) {
    reasons.push(`Anchor receipt has unknown anchorStrength "${receipt.anchorStrength}".`);
  }
  if (receipt.evidenceRefs && !Array.isArray(receipt.evidenceRefs)) {
    reasons.push('Anchor receipt evidenceRefs must be an array.');
  }

  return { ok: reasons.length === 0, reasons };
}

export async function writeLifecycleAnchorReceipt(rootDir, receipt) {
  const validation = validateLifecycleAnchorReceipt(receipt);
  if (!validation.ok) {
    throw new Error(validation.reasons.join(' '));
  }

  const receiptDir = lifecycleAnchorDirectory(rootDir, receipt.taskId);
  await mkdir(receiptDir, { recursive: true });
  const safeAnchorId = String(receipt.anchorId).replace(/[^a-zA-Z0-9_.-]+/g, '-');
  const receiptPath = path.join(receiptDir, `${stamp()}-${safeAnchorId}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receiptPath;
}

export async function readLifecycleAnchorReceipts(rootDir, taskId) {
  const receiptDir = lifecycleAnchorDirectory(rootDir, taskId);
  const entries = await readdir(receiptDir).catch(() => []);

  return Promise.all(
    entries
      .filter((name) => name.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right))
      .map(async (name) => JSON.parse(await readFile(path.join(receiptDir, name), 'utf8')))
  );
}

export function summarizeLifecycleAnchorReceipts(receipts = []) {
  const byType = {};
  const byRecommendedStatus = {};

  for (const receipt of receipts) {
    byType[receipt.anchorType] = (byType[receipt.anchorType] || 0) + 1;
    const recommendedStatus = receipt.recommendedStatus || 'unknown';
    byRecommendedStatus[recommendedStatus] = (byRecommendedStatus[recommendedStatus] || 0) + 1;
  }

  return {
    receiptCount: receipts.length,
    byType,
    byRecommendedStatus,
    weakAnchors: receipts.filter((receipt) => receipt.anchorStrength === 'weak').length,
    moderateAnchors: receipts.filter((receipt) => receipt.anchorStrength === 'moderate').length,
    strongAnchors: receipts.filter((receipt) => receipt.anchorStrength === 'strong').length,
    terminalAnchors: receipts.filter((receipt) => receipt.anchorStrength === 'terminal').length
  };
}
