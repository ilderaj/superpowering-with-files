import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargetPaths } from '../../harness/installer/lib/paths.mjs';

test('resolveTargetPaths returns workspace paths', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'workspace', 'codex');
  assert.deepEqual(paths, ['/repo/AGENTS.md']);
});

test('resolveTargetPaths returns user-global paths', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'user-global', 'copilot');
  assert.deepEqual(paths, ['/home/user/.copilot/copilot-instructions.md']);
});

test('resolveTargetPaths returns both paths', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'both', 'cursor');
  assert.deepEqual(paths, ['/repo/.cursor/rules/harness.mdc', '/home/user/.cursor/rules/harness.mdc']);
});
