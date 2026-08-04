import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smokeReleaseArtifacts } from '../../packages/plugin-kit/src/smoke.mjs';

test('smokeReleaseArtifacts preflights only the four plugin artifacts', async () => {
  const result = await smokeReleaseArtifacts({ version: '1.0.9' });

  assert.equal(result.ok, true);
  assert.equal(result.plugins.length, 4);
  assert.equal(result.runtime, undefined);
  assert.deepEqual(result.errors, []);
});
