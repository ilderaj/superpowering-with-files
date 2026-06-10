import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('root package is a private workspace orchestrator at release version', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));

  assert.equal(pkg.name, 'superpowering-with-files');
  assert.equal(pkg.version, '1.0.8');
  assert.equal(pkg.private, true);
  assert.deepEqual(pkg.workspaces, ['packages/*']);
  assert.equal(pkg.scripts['plugin:build'], 'node packages/plugin-kit/src/build-all.mjs');
  assert.equal(pkg.scripts['plugin:verify'], 'node --test tests/plugin-kit/*.test.mjs');
  assert.equal(pkg.scripts['plugin:smoke'], 'node packages/plugin-kit/src/smoke.mjs');
  assert.equal(pkg.scripts['release:pack'], 'node packages/plugin-kit/src/build-all.mjs --release');
});
