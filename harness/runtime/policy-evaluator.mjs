import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPolicyDigest, verifyPolicySignature } from './policy-signature.mjs';

export async function loadRegistrySchema(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, 'harness/core/registry/schema.json'), 'utf8'));
}

export function diffPolicies(currentPolicy, nextPolicy) {
  return {
    currentDigest: currentPolicy ? createPolicyDigest(currentPolicy) : null,
    nextDigest: createPolicyDigest(nextPolicy),
    changed: JSON.stringify(currentPolicy ?? null) !== JSON.stringify(nextPolicy)
  };
}

export function evaluatePolicyBundle(bundle, options = {}) {
  const problems = [];
  if (!bundle || typeof bundle !== 'object') {
    problems.push('policy bundle must be a JSON object');
  }
  if (!bundle?.version) {
    problems.push('policy bundle must include version');
  }
  if (!bundle?.channel) {
    problems.push('policy bundle must include channel');
  }

  if (options.requireSignature) {
    if (!bundle?.signature) {
      problems.push('signed team policy requires signature metadata');
    } else if (!verifyPolicySignature(options.publicKeyPem, bundle.payload, bundle.signature)) {
      problems.push('policy signature verification failed');
    }
  }

  return {
    ok: problems.length === 0,
    problems
  };
}
