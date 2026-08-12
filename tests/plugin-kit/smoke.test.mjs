import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smokeReleaseArtifacts } from '../../packages/plugin-kit/src/smoke.mjs';

test('smokeReleaseArtifacts preflights the Codex and Agent Plugins artifacts', async () => {
  const result = await smokeReleaseArtifacts({ version: '1.0.9' });

  assert.equal(result.ok, true);
  assert.equal(result.plugins.length, 2);
  assert.deepEqual(
    result.plugins.map((plugin) => plugin.target).sort(),
    ['agent-plugins', 'codex']
  );
  for (const plugin of result.plugins) {
    assert.equal(plugin.ok, true);
  }
  assert.equal(result.runtime, undefined);
  assert.deepEqual(result.errors, []);
});
