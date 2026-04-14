import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveHookRoots,
  resolveSkillRoots,
  resolveSkillTargetPaths,
  resolveTargetPaths
} from '../../harness/installer/lib/paths.mjs';

test('resolveTargetPaths returns workspace paths', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'workspace', 'codex');
  assert.deepEqual(paths, ['/repo/AGENTS.md']);
});

test('resolveTargetPaths returns Copilot workspace path under .github', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'workspace', 'copilot');
  assert.deepEqual(paths, ['/repo/.github/copilot-instructions.md']);
});

test('resolveTargetPaths returns user-global paths', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'user-global', 'copilot');
  assert.deepEqual(paths, ['/home/user/.copilot/instructions/harness.instructions.md']);
});

test('resolveTargetPaths returns both Copilot entry scopes', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'both', 'copilot');
  assert.deepEqual(paths, [
    '/repo/.github/copilot-instructions.md',
    '/home/user/.copilot/instructions/harness.instructions.md'
  ]);
});

test('resolveTargetPaths returns Cursor workspace rule only for workspace scope', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'workspace', 'cursor');
  assert.deepEqual(paths, ['/repo/.cursor/rules/harness.mdc']);
});

test('resolveTargetPaths returns no Cursor user-global rendered entry', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'user-global', 'cursor');
  assert.deepEqual(paths, []);
});

test('resolveTargetPaths returns Cursor workspace rule only when scope is both', () => {
  const paths = resolveTargetPaths('/repo', '/home/user', 'both', 'cursor');
  assert.deepEqual(paths, ['/repo/.cursor/rules/harness.mdc']);
});

test('resolveTargetPaths rejects unknown targets', () => {
  assert.throws(() => resolveTargetPaths('/repo', '/home/user', 'workspace', 'unknown'), /Unknown target/);
});

test('resolveSkillRoots returns workspace skill root for Copilot', () => {
  assert.deepEqual(resolveSkillRoots('/repo', '/home/user', 'workspace', 'copilot'), [
    '/repo/.github/skills'
  ]);
});

test('resolveSkillRoots returns global skill root for Codex', () => {
  assert.deepEqual(resolveSkillRoots('/repo', '/home/user', 'user-global', 'codex'), [
    '/home/user/.agents/skills'
  ]);
});

test('resolveSkillRoots returns workspace skill root for Codex', () => {
  assert.deepEqual(resolveSkillRoots('/repo', '/home/user', 'workspace', 'codex'), [
    '/repo/.agents/skills'
  ]);
});

test('resolveSkillTargetPaths maps a single skill into each selected root', () => {
  assert.deepEqual(
    resolveSkillTargetPaths('/repo', '/home/user', 'both', 'cursor', {
      layout: 'single',
      targetName: 'planning-with-files'
    }),
    [
      '/repo/.cursor/skills/planning-with-files',
      '/home/user/.cursor/skills/planning-with-files'
    ]
  );
});

test('resolveSkillTargetPaths maps collection children into the skill root', () => {
  assert.deepEqual(
    resolveSkillTargetPaths('/repo', '/home/user', 'workspace', 'claude-code', {
      layout: 'collection',
      childNames: ['using-superpowers', 'writing-plans']
    }),
    [
      '/repo/.claude/skills/using-superpowers',
      '/repo/.claude/skills/writing-plans'
    ]
  );
});

test('resolveHookRoots returns workspace hook root for Cursor', () => {
  assert.deepEqual(resolveHookRoots('/repo', '/home/user', 'workspace', 'cursor'), [
    '/repo/.cursor'
  ]);
});

test('resolveHookRoots returns workspace hook root for Copilot', () => {
  assert.deepEqual(resolveHookRoots('/repo', '/home/user', 'workspace', 'copilot'), [
    '/repo/.github/hooks'
  ]);
});

test('resolveHookRoots returns both hook roots for Claude Code', () => {
  assert.deepEqual(resolveHookRoots('/repo', '/home/user', 'both', 'claude-code'), [
    '/repo/.claude',
    '/home/user/.claude'
  ]);
});
