import crypto from 'node:crypto';
import { stableJson } from './write-plan.mjs';

export function createPolicyDigest(bundle) {
  return crypto.createHash('sha256').update(stableJson(bundle)).digest('hex');
}

export function signPolicyBundle(privateKeyPem, bundle) {
  const sign = crypto.createSign('SHA256');
  sign.update(stableJson(bundle));
  sign.end();
  return sign.sign(privateKeyPem, 'base64');
}

export function verifyPolicySignature(publicKeyPem, bundle, signature) {
  const verify = crypto.createVerify('SHA256');
  verify.update(stableJson(bundle));
  verify.end();
  return verify.verify(publicKeyPem, signature, 'base64');
}
