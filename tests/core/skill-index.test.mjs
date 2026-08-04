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
  assert.equal(index.skills['planning-with-files'].projection.codex, 'materialize');
  assert.equal(index.skills.superpowers.projection.codex, 'materialize');
  assert.equal(index.skills.superpowers.projection.cursor, 'materialize');
  assert.equal(index.skills.superpowers.projection['claude-code'], 'materialize');
  assert.equal(index.skills['goal-writer'].projection.codex, 'materialize');
  assert.equal(index.skills['goal-writer'].source, 'local');
  assert.equal(index.skills['goal2plan'].projection.codex, 'materialize');
  assert.equal(index.skills['goal2plan'].source, 'local');
  assert.equal(index.skills['autonomous-release-closure'].projection.codex, 'materialize');
  assert.equal(index.skills['autonomous-release-closure'].source, 'local');
  assert.equal(index.skills['overengineering-review'].projection.codex, 'materialize');
  assert.equal(index.skills['overengineering-review'].source, 'local');
  assert.equal(index.skills['simplification-ledger'].projection.codex, 'materialize');
  assert.equal(index.skills['simplification-ledger'].source, 'local');
});

test('skill index declares layouts required for filesystem projection', async () => {
  const index = JSON.parse(await readFile('harness/core/skills/index.json', 'utf8'));

  assert.equal(index.skills.superpowers.layout, 'collection');
  assert.equal(index.skills['planning-with-files'].layout, 'single');
  assert.equal(index.skills['planning-with-files'].targetName, 'planning-with-files');
  assert.equal(index.skills['planning-with-files'].patches.default.type, 'planning-with-files-companion-plan');
  assert.equal(index.skills['planning-with-files'].patches.codex.type, 'planning-with-files-skill-root');
  assert.equal(index.skills['planning-with-files'].patches.copilot.type, 'planning-with-files-skill-root');
  assert.equal(index.skills['planning-with-files'].patches.cursor.type, 'planning-with-files-skill-root');
  assert.equal(index.skills['goal-writer'].layout, 'single');
  assert.equal(index.skills['goal-writer'].targetName, 'goal-writer');
  assert.equal(index.skills['goal2plan'].layout, 'single');
  assert.equal(index.skills['goal2plan'].targetName, 'goal2plan');
  assert.equal(index.skills['autonomous-release-closure'].layout, 'single');
  assert.equal(index.skills['autonomous-release-closure'].targetName, 'autonomous-release-closure');
  assert.equal(index.skills['overengineering-review'].layout, 'single');
  assert.equal(index.skills['overengineering-review'].targetName, 'overengineering-review');
  assert.equal(index.skills['simplification-ledger'].layout, 'single');
  assert.equal(index.skills['simplification-ledger'].targetName, 'simplification-ledger');
});

test('skill index keeps Superpowers activation out of hook projection metadata', async () => {
  const index = JSON.parse(await readFile('harness/core/skills/index.json', 'utf8'));

  assert.equal(index.skills.superpowers.hooks, undefined);
  assert.equal(index.skills['planning-with-files'].hooks.default.adapter, 'task-scoped-planning');
});

test('skill index registers the executing-plans replan patch on the superpowers metadata surface', async () => {
  const index = JSON.parse(await readFile('harness/core/skills/index.json', 'utf8'));

  assert.deepEqual(index.skills.superpowers.childPatches['executing-plans'], {
    type: 'superpowers-executing-plans-replan',
    marker: 'Harness Superpowers executing-plans replan patch'
  });
  assert.deepEqual(index.skills.superpowers.childPatches['subagent-driven-development'], {
    type: 'superpowers-subagent-driven-development-budget',
    marker: 'Harness Superpowers subagent-driven-development budget patch',
    requiredMarkers: [
      {
        path: 'implementer-prompt.md',
        marker: 'Harness Superpowers subagent-driven-development implementer context budget patch'
      },
      {
        path: 'task-reviewer-prompt.md',
        marker: 'Harness Superpowers subagent-driven-development task reviewer budget patch'
      }
    ]
  });
  assert.deepEqual(index.skills.superpowers.childPatches['verification-before-completion'], {
    type: 'superpowers-verification-before-completion',
    marker: 'Harness Superpowers verification-before-completion proof patch'
  });
  assert.deepEqual(index.skills.superpowers.childPatches['using-superpowers'], {
    type: 'superpowers-using-superpowers-routing',
    marker: 'Harness Superpowers using-superpowers routing patch'
  });
});
