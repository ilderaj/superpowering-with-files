import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesForScope, renderEntry } from '../../harness/installer/lib/adapters.mjs';

test('renderEntry combines base policy and platform override', async () => {
  const rendered = await renderEntry(process.cwd(), 'codex');
  assert.match(rendered, /# Harness Policy For Codex/);
  assert.match(rendered, /Hybrid Workflow Policy/);
  assert.match(rendered, /Codex Platform Notes/);
  assert.match(rendered, /Rule Precedence/);
  assert.match(rendered, /Quick task/);
  assert.match(rendered, /Tracked task/);
});

test('renderEntry includes complex orchestration policy for every supported target', async () => {
  const targets = ['codex', 'copilot', 'cursor', 'claude-code'];

  for (const target of targets) {
    const rendered = await renderEntry(process.cwd(), target);
    assert.match(rendered, /Complex Task Orchestration/, target);
    assert.match(rendered, /Planning with Files is the source of truth/, target);
    assert.match(rendered, /Plan Location Boundaries/, target);
    assert.match(rendered, /docs\/superpowers\/plans/, target);
    assert.match(rendered, /Git worktrees and branches provide isolation/, target);
    assert.match(rendered, /Worktree Base Preflight/, target);
    assert.match(rendered, /worktree-preflight/, target);
    assert.match(rendered, /Worktree base: <base-ref> @ <base-sha>/, target);
    assert.match(rendered, /Cross-IDE Portability/, target);
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
