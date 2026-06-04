import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { install } from '../installer/commands/install.mjs';
import { checkpointCommand } from '../installer/commands/checkpoint.mjs';
import { sync } from '../installer/commands/sync.mjs';
import { record } from '../installer/commands/record.mjs';
import { writeAuditReceipt } from './audit-receipt.mjs';
import { writeExecutionReceipt } from './execution-receipt.mjs';
import { writeFollowupClosure } from './followup-closure.mjs';
import { verifyApprovalToken } from './approval-token.mjs';
import { writeRegistry } from './registry-service.mjs';

async function changedFilesFromGit(rootDir) {
  const headFile = path.join(rootDir, '.git');
  await readFile(headFile, 'utf8').catch(() => '');
  return [];
}

async function writeDeniedReceipt(rootDir, plan, token, reason) {
  return writeAuditReceipt(rootDir, {
    schemaVersion: 1,
    operation: plan.operation,
    rootDir,
    actor: token?.actor ?? 'unknown',
    planId: plan.planId,
    planHash: plan.planHash,
    approvalTokenId: token?.tokenId ?? null,
    changedFiles: [],
    verificationCommands: [],
    resultStatus: 'denied',
    deniedReason: reason
  });
}

export async function applyWritePlan(plan, token) {
  let executionReceiptPath = null;
  let followupClosurePath = null;

  try {
    await verifyApprovalToken(plan.rootDir, plan, token);
  } catch (error) {
    await writeDeniedReceipt(plan.rootDir, plan, token, error.message);
    throw error;
  }

  if (plan.operation === 'sync') {
    await sync([]);
  } else if (plan.operation === 'install') {
    await install(plan.payload.args ?? []);
  } else if (plan.operation === 'checkpoint') {
    await checkpointCommand(plan.payload.args ?? []);
  } else if (plan.operation === 'record_progress') {
    await record(plan.payload.args ?? []);
  } else if (plan.operation === 'record_execution_receipt') {
    executionReceiptPath = await writeExecutionReceipt(plan.rootDir, {
      ...plan.payload.receipt,
      actor: token.actor
    });
  } else if (plan.operation === 'record_followup_closure') {
    followupClosurePath = await writeFollowupClosure(plan.rootDir, {
      ...plan.payload.closure,
      actor: token.actor
    });
  } else if (plan.operation === 'distribution') {
    await writeRegistry(plan.rootDir, plan.payload.bundle, plan.payload.channel);
  } else {
    const error = new Error(`Unsupported write operation: ${plan.operation}`);
    await writeDeniedReceipt(plan.rootDir, plan, token, error.message);
    throw error;
  }

  const receiptPath = await writeAuditReceipt(plan.rootDir, {
    schemaVersion: 1,
    operation: plan.operation,
    rootDir: plan.rootDir,
    actor: token.actor,
    planId: plan.planId,
    planHash: plan.planHash,
    approvalTokenId: token.tokenId,
    changedFiles: await changedFilesFromGit(plan.rootDir),
    verificationCommands: [],
    resultStatus: 'success'
  });

  return { receiptPath, executionReceiptPath, followupClosurePath };
}
