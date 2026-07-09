import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseChiefOpsBlocks } from './coordination-blocks.mjs';
import { validateBindingPacket, validateWorkerReceipt } from './schema.mjs';

function sourceProgressRef(root, taskId) {
  return path.join(root, 'planning/active', taskId, 'progress.md');
}

function safeRef(value) {
  if (!value) {
    return null;
  }

  return `ref:${String(value).slice(-6)}`;
}

function workerIndexEntry(root, taskId, binding, receipt = null) {
  return {
    authorityTaskId: binding.authorityTaskId,
    planningRootRef: 'authority_root',
    workerId: binding.workerId,
    threadRef: safeRef(receipt?.sessionId || receipt?.threadId || binding.sessionId || binding.threadId),
    status: receipt?.status || binding.status || 'bound',
    lastCheckInAt: receipt?.observedAt || binding.observedAt || binding.createdAt,
    currentSlice: binding.currentSlice,
    proofTarget: binding.proofTarget,
    evidenceSink: binding.evidenceSink,
    sourceProgressRef: {
      file: path.relative(root, sourceProgressRef(root, taskId)),
      blockId: binding.sourceProgressRef.blockId,
      contentHash: binding.sourceProgressRef.contentHash,
      observedAt: binding.sourceProgressRef.observedAt
    }
  };
}

function detectDuplicateConflicts(taskId, bindings, receipts = [], seenByField, receiptIds) {
  const conflicts = [];

  for (const field of ['workerId', 'bindingId', 'bindingToken', 'bindingVersion']) {
    const seen = seenByField.get(field) || new Map();
    seenByField.set(field, seen);

    for (const binding of bindings) {
      const key = binding[field];
      if (!key) {
        continue;
      }

      if (seen.has(key)) {
        conflicts.push({ taskId, reason: `duplicate_${field}`, field, value: key, previousTaskId: seen.get(key).taskId });
      } else {
        seen.set(key, { taskId, binding });
      }
    }
  }

  for (const receipt of receipts) {
    if (receiptIds.has(receipt.receiptId)) {
      conflicts.push({ taskId, reason: 'duplicate_receiptId', field: 'receiptId', value: receipt.receiptId });
    }
    receiptIds.add(receipt.receiptId);
  }

  return conflicts;
}

function sameBindingIdentity(binding, receipt) {
  if (receipt.bindingVersion) {
    return receipt.bindingVersion === binding.bindingVersion;
  }

  if (receipt.bindingToken) {
    return receipt.bindingToken === binding.bindingToken;
  }

  return false;
}

export async function rebuildChiefOpsIndex({ root, taskIds }) {
  const workers = [];
  const conflicts = [];
  const receiptIds = new Set();
  const seenByField = new Map();

  for (const taskId of taskIds) {
    const progressPath = sourceProgressRef(root, taskId);
    const markdown = await readFile(progressPath, 'utf8');
    const blocks = parseChiefOpsBlocks(markdown);
    const bindings = [];
    const receipts = [];

    for (const block of blocks) {
      if (block.type === 'ChiefOpsWorkerBinding') {
        bindings.push(validateBindingPacket(block.value));
      }
      if (block.type === 'ChiefOpsWorkerReceipt') {
        receipts.push(validateWorkerReceipt(block.value));
      }
    }

    for (const binding of bindings) {
      const latestReceipt =
        receipts
          .filter((receipt) => receipt.workerId === binding.workerId && sameBindingIdentity(binding, receipt))
          .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0] || null;

      workers.push(workerIndexEntry(root, taskId, binding, latestReceipt));
    }

    conflicts.push(...detectDuplicateConflicts(taskId, bindings, receipts, seenByField, receiptIds));
  }

  return {
    schemaVersion: 'chiefops.v0b.index',
    generatedFrom: 'planning/active',
    indexGeneratedAt: new Date().toISOString(),
    workers,
    conflicts
  };
}
