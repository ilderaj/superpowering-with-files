import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('plugin migration docs cover global adoption cutover and rollback', async () => {
  const docs = await readFile('docs/install/plugin-migration.md', 'utf8');
  assert.match(docs, /Shadow Install/);
  assert.match(docs, /Dual Run/);
  assert.match(docs, /Cutover/);
  assert.match(docs, /Rollback/);
  assert.match(docs, /harness plugin migrate --target=codex --dry-run/);
});

test('release artifact docs list all packed plugin assets and verification gates', async () => {
  const docs = await readFile('docs/release-plugin-artifacts.md', 'utf8');
  for (const target of ['codex', 'claude-code', 'cursor', 'copilot']) {
    assert.match(docs, new RegExp(`harness-${target}-plugin-1\\.0\\.6\\.tgz`));
  }
  assert.match(docs, /harness-runtime-1\.0\.6\.tgz/);
  assert.match(docs, /SHA256SUMS/);
  assert.match(docs, /npm run plugin:smoke/);
});
