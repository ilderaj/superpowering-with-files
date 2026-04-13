import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('skill index defines required v1 skills and projections', async () => {
  const index = JSON.parse(await readFile('harness/core/skills/index.json', 'utf8'));

  assert.equal(index.schemaVersion, 1);
  assert.ok(index.skills.superpowers);
  assert.ok(index.skills['planning-with-files']);
  assert.equal(index.skills['planning-with-files'].source, 'https://github.com/OthmanAdi/planning-with-files');
  assert.equal(index.skills['planning-with-files'].projection.copilot, 'materialize');
  assert.equal(index.skills.superpowers.projection.codex, 'link');
});

test('skill index declares layouts required for filesystem projection', async () => {
  const index = JSON.parse(await readFile('harness/core/skills/index.json', 'utf8'));

  assert.equal(index.skills.superpowers.layout, 'collection');
  assert.equal(index.skills['planning-with-files'].layout, 'single');
  assert.equal(index.skills['planning-with-files'].targetName, 'planning-with-files');
  assert.equal(index.skills['planning-with-files'].patches.copilot.type, 'copilot-planning-with-files');
});

test('skill index declares hook projection metadata', async () => {
  const index = JSON.parse(await readFile('harness/core/skills/index.json', 'utf8'));

  assert.equal(index.skills.superpowers.hooks.cursor.config, 'hooks-cursor.json');
  assert.equal(index.skills.superpowers.hooks['claude-code'].config, 'hooks.json');
  assert.equal(index.skills['planning-with-files'].hooks.default.adapter, 'task-scoped-planning');
});
