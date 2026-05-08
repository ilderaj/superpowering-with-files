import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { buildWritePlan } from '../../harness/runtime/write-plan.mjs';
import { createApprovalToken } from '../../harness/runtime/approval-token.mjs';
import { applyWritePlan } from '../../harness/runtime/safe-apply.mjs';

test('sync apply rejects when approval token is missing or invalid', async () => {
  const plan = buildWritePlan({
    operation: 'sync',
    rootDir: process.cwd(),
    payload: { args: [] },
    preview: { summary: { create: 0, update: 0, stale: 0 } }
  });

  await assert.rejects(applyWritePlan(plan, {}), /signature is invalid|expired|does not match/);
});

test('sync apply accepts a matching approval token', async (t) => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-home-'));
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;
  t.mock.method(os, 'homedir', () => tempHome);
  t.after(async () => {
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  const plan = buildWritePlan({
    operation: 'sync',
    rootDir: process.cwd(),
    payload: { args: [] },
    preview: { summary: { create: 0, update: 0, stale: 0 } }
  });
  const token = await createApprovalToken(process.cwd(), plan, { actor: 'test-runner', ttlMs: 60000 });
  const result = await applyWritePlan(plan, token);
  assert.match(result.receiptPath, /\.harness\/mcp\/receipts\//);
});
