import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signPolicyBundle, verifyPolicySignature } from '../../harness/runtime/policy-signature.mjs';

test('policy signature round-trips with generated keys', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const bundle = { version: '1.0.0', channel: 'team', payload: { ok: true } };
  const signature = signPolicyBundle(
    privateKey.export({ type: 'pkcs1', format: 'pem' }),
    bundle
  );
  const verified = verifyPolicySignature(
    publicKey.export({ type: 'pkcs1', format: 'pem' }),
    bundle,
    signature
  );
  assert.equal(verified, true);
});
