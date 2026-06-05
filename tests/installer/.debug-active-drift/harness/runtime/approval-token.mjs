import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { computePlanHash, stableJson } from './write-plan.mjs';

async function ensureSecret(rootDir) {
  const secretPath = path.join(rootDir, '.harness/mcp/approval-secret');
  try {
    return (await readFile(secretPath, 'utf8')).trim();
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  const secret = crypto.randomBytes(32).toString('hex');
  await mkdir(path.dirname(secretPath), { recursive: true });
  await writeFile(secretPath, `${secret}\n`, { mode: 0o600 });
  return secret;
}

function signPayload(secret, payload) {
  return crypto.createHmac('sha256', secret).update(stableJson(payload)).digest('hex');
}

export async function createApprovalToken(rootDir, plan, options = {}) {
  const secret = await ensureSecret(rootDir);
  const createdAt = options.createdAt ?? new Date().toISOString();
  const expiresAt =
    options.expiresAt ?? new Date(Date.now() + (options.ttlMs ?? 10 * 60 * 1000)).toISOString();

  const tokenPayload = {
    schemaVersion: 1,
    tokenId: crypto.randomUUID(),
    actor: options.actor ?? 'local-operator',
    operation: plan.operation,
    rootDir: plan.rootDir,
    planId: plan.planId,
    planHash: computePlanHash({
      schemaVersion: plan.schemaVersion,
      planId: plan.planId,
      operation: plan.operation,
      rootDir: plan.rootDir,
      payload: plan.payload,
      preview: plan.preview
    }),
    createdAt,
    expiresAt
  };

  return {
    ...tokenPayload,
    signature: signPayload(secret, tokenPayload)
  };
}

export async function verifyApprovalToken(rootDir, plan, token) {
  const secret = await ensureSecret(rootDir);
  const expectedPayload = {
    schemaVersion: 1,
    tokenId: token.tokenId,
    actor: token.actor,
    operation: token.operation,
    rootDir: token.rootDir,
    planId: token.planId,
    planHash: token.planHash,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt
  };
  const expectedSignature = signPayload(secret, expectedPayload);

  if (token.signature !== expectedSignature) {
    throw new Error('Approval token signature is invalid.');
  }

  if (new Date(token.expiresAt).getTime() <= Date.now()) {
    throw new Error('Approval token has expired.');
  }

  if (token.operation !== plan.operation || token.rootDir !== plan.rootDir || token.planId !== plan.planId) {
    throw new Error('Approval token does not match the requested plan.');
  }

  const planHash = computePlanHash({
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    operation: plan.operation,
    rootDir: plan.rootDir,
    payload: plan.payload,
    preview: plan.preview
  });

  if (token.planHash !== planHash) {
    throw new Error('Approval token plan hash does not match the requested plan.');
  }

  return {
    ok: true,
    actor: token.actor,
    tokenId: token.tokenId
  };
}
