import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffPolicies, evaluatePolicyBundle } from '../../harness/runtime/policy-evaluator.mjs';

test('policy diff is deterministic for identical bundles', async () => {
  const bundle = { version: '1.0.0', channel: 'local-dev', payload: { ok: true } };
  const diff = diffPolicies(bundle, bundle);
  assert.equal(diff.changed, false);
  assert.equal(diff.currentDigest, diff.nextDigest);
});

test('unsigned team policy fails when signatures are required', async () => {
  const bundle = { version: '1.0.0', channel: 'team', payload: { ok: true } };
  const evaluation = evaluatePolicyBundle(bundle, { requireSignature: true, publicKeyPem: 'test' });
  assert.equal(evaluation.ok, false);
  assert(evaluation.problems.some((problem) => problem.includes('signature')));
});
