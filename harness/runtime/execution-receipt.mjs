import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deriveFollowupId } from './followup-closure.mjs';

const VALID_RESULT_STATUSES = new Set(['done_with_evidence', 'blocked', 'failed', 'abandoned']);

function stamp() {
  return new Date().toISOString().replace(/[:]/g, '-');
}

export function normalizeExecutionFollowups(receipt = {}) {
  return (receipt.followups || []).map((followup) => ({
    ...followup,
    followupId: deriveFollowupId({
      unitId: receipt.unitId,
      followup
    })
  }));
}

export function executionReceiptDirectory(rootDir, taskId) {
  return path.join(rootDir, '.harness', 'execution', 'receipts', taskId);
}

export function validateExecutionReceipt(receipt = {}) {
  const reasons = [];

  for (const field of ['taskId', 'unitId', 'actor', 'mode', 'resultStatus', 'syncBackRef']) {
    if (!receipt[field]) {
      reasons.push(`Receipt is missing ${field}.`);
    }
  }

  if (!VALID_RESULT_STATUSES.has(receipt.resultStatus)) {
    reasons.push(`Receipt has unknown resultStatus "${receipt.resultStatus}".`);
  }

  return { ok: reasons.length === 0, reasons };
}

export async function writeExecutionReceipt(rootDir, receipt) {
  const validation = validateExecutionReceipt(receipt);
  if (!validation.ok) {
    throw new Error(validation.reasons.join(' '));
  }

  const receiptDir = executionReceiptDirectory(rootDir, receipt.taskId);
  await mkdir(receiptDir, { recursive: true });

  const receiptPath = path.join(receiptDir, `${stamp()}-${receipt.unitId}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receiptPath;
}

export async function readExecutionReceipts(rootDir, taskId) {
  const receiptDir = executionReceiptDirectory(rootDir, taskId);
  const entries = await readdir(receiptDir).catch(() => []);

  return Promise.all(
    entries
      .filter((name) => name.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right))
      .map(async (name) => JSON.parse(await readFile(path.join(receiptDir, name), 'utf8')))
  );
}

export function summarizeExecutionReceipts(receipts = [], closures = []) {
  const closureStates = new Map(
    closures
      .filter((closure) => closure && closure.followupId)
      .map((closure) => [closure.followupId, closure.closureStatus])
  );
  let openFollowups = 0;
  let resolvedFollowups = 0;
  let waivedFollowups = 0;

  for (const receipt of receipts) {
    for (const followup of normalizeExecutionFollowups(receipt)) {
      if (followup.status !== 'open') {
        continue;
      }

      const closureStatus = closureStates.get(followup.followupId);
      if (closureStatus === 'resolved') {
        resolvedFollowups += 1;
      } else if (closureStatus === 'waived') {
        waivedFollowups += 1;
      } else {
        openFollowups += 1;
      }
    }
  }

  return {
    receiptCount: receipts.length,
    blockedUnits: receipts.filter((receipt) => receipt.resultStatus === 'blocked').length,
    failedUnits: receipts.filter((receipt) => receipt.resultStatus === 'failed').length,
    openFollowups,
    resolvedFollowups,
    waivedFollowups
  };
}
