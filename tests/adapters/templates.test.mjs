import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEntry } from '../../harness/installer/lib/adapters.mjs';

test('renderEntry combines base policy and platform override', async () => {
  const rendered = await renderEntry(process.cwd(), 'codex');
  assert.match(rendered, /# Harness Policy For Codex/);
  assert.match(rendered, /Hybrid Workflow Policy/);
  assert.match(rendered, /Codex Platform Notes/);
});
