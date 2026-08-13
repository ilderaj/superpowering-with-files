import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smokeReleaseArtifacts } from '../../packages/plugin-kit/src/smoke.mjs';

test('smokeReleaseArtifacts preflights core and Matt companion artifacts', async () => {
  const result = await smokeReleaseArtifacts({ version: '1.0.9' });

  assert.equal(result.ok, true);
  assert.equal(result.plugins.length, 4);
  assert.deepEqual(
    result.plugins.map((plugin) => plugin.target).sort(),
    ['agent-plugins', 'codex', 'matt-skills-agent-plugins', 'matt-skills-codex']
  );
  for (const plugin of result.plugins) {
    assert.equal(plugin.ok, true);
  }
  assert.equal(result.runtime, undefined);
  assert.deepEqual(result.errors, []);
});
