import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalToken, verifyApprovalToken } from '../../harness/runtime/approval-token.mjs';
import { buildWritePlan } from '../../harness/runtime/write-plan.mjs';

test('approval token matches the original plan only', async () => {
  const plan = buildWritePlan({
    operation: 'sync',
    rootDir: process.cwd(),
    payload: { args: [] },
    preview: { ok: true }
  });
  const token = await createApprovalToken(process.cwd(), plan, { actor: 'test-runner', ttlMs: 60000 });
  const verification = await verifyApprovalToken(process.cwd(), plan, token);
  assert.equal(verification.ok, true);

  const otherPlan = { ...plan, operation: 'install' };
  await assert.rejects(verifyApprovalToken(process.cwd(), otherPlan, token), /does not match/);
});
