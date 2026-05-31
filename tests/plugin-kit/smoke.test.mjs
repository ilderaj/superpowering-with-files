import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smokeReleaseArtifacts } from '../../packages/plugin-kit/src/smoke.mjs';

test('smokeReleaseArtifacts builds and validates release artifacts', async () => {
  const result = await smokeReleaseArtifacts({ version: '1.0.6' });

  assert.equal(result.ok, true);
  assert.equal(result.plugins.length, 4);
  assert.equal(result.runtime.ok, true);
  assert.deepEqual(result.errors, []);
});
