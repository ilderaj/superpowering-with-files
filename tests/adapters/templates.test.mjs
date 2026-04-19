import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesForScope, renderEntry } from '../../harness/installer/lib/adapters.mjs';

test('renderEntry combines always-on core policy and platform override', async () => {
  const rendered = await renderEntry(process.cwd(), 'codex');
  assert.match(rendered, /# Harness Policy For Codex/);
  assert.match(rendered, /Hybrid Workflow Policy/);
  assert.match(rendered, /Codex Platform Notes/);
  assert.match(rendered, /Rule Precedence/);
  assert.match(rendered, /Quick task/);
  assert.match(rendered, /Tracked task/);
});

test('renderEntry keeps the always-on core profile thin across supported targets', async () => {
  const targets = ['codex', 'copilot', 'cursor', 'claude-code'];

  for (const target of targets) {
    const rendered = await renderEntry(process.cwd(), target);
    assert.match(rendered, /Rule Precedence/, target);
    assert.match(rendered, /Task Classification/, target);
    assert.doesNotMatch(rendered, /Complex Task Orchestration/, target);
    assert.doesNotMatch(rendered, /Companion Plan Model/, target);
  }
});

test('renderEntry emits Copilot instructions frontmatter for file-based user profile instructions', async () => {
  const rendered = await renderEntry(process.cwd(), 'copilot');
  assert.match(rendered, /^---\napplyTo: "\*\*"\n---\n/);
});

test('entriesForScope uses installer path metadata instead of adapter entry arrays', () => {
  const adapter = {
    target: 'codex',
    workspaceEntries: ['bogus-workspace.md'],
    globalEntries: ['bogus-global.md']
  };

  assert.deepEqual(entriesForScope('/repo', '/home/user', adapter, 'workspace'), ['/repo/AGENTS.md']);
  assert.deepEqual(entriesForScope('/repo', '/home/user', adapter, 'user-global'), ['/home/user/.codex/AGENTS.md']);
  assert.deepEqual(entriesForScope('/repo', '/home/user', adapter, 'both'), [
    '/repo/AGENTS.md',
    '/home/user/.codex/AGENTS.md'
  ]);
});
