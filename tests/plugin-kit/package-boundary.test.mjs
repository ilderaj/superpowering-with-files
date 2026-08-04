import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('root package is a private workspace orchestrator at release version', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));

  assert.equal(pkg.name, 'superpowering-with-files');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.private, true);
  assert.deepEqual(pkg.workspaces, ['packages/*']);
  assert.equal(pkg.scripts['preverify:homepage'], 'node scripts/ensure-homepage-deps.mjs');
  assert.equal(pkg.scripts['plugin:build'], 'node packages/plugin-kit/src/build-all.mjs');
  assert.equal(pkg.scripts['plugin:verify'], 'node --test tests/plugin-kit/*.test.mjs');
  assert.equal(pkg.scripts['plugin:smoke'], 'node packages/plugin-kit/src/smoke.mjs');
  assert.equal(pkg.scripts['release:pack'], 'node packages/plugin-kit/src/build-all.mjs --release');
  assert.equal(pkg.scripts['test:mcp'], undefined);
  assert.equal(pkg.scripts['mcp:stdio'], undefined);
  assert.doesNotMatch(pkg.scripts['verify:core'], /tests\/mcp/);
  for (const dependency of ['@modelcontextprotocol/sdk', 'ws', 'zod']) {
    assert.equal(pkg.dependencies?.[dependency], undefined);
    assert.equal(lock.packages['']?.dependencies?.[dependency], undefined);
  }
  assert.equal(lock.packages['packages/harness-runtime'], undefined);
});

test('local development policy gates retain only the supported verification commands', async () => {
  const policy = JSON.parse(await readFile('harness/core/registry/policies/local-dev.json', 'utf8'));

  assert.deepEqual(policy.payload.verificationGates, [
    'npm run verify',
    './scripts/harness doctor --check-only'
  ]);
});
