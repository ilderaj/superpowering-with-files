import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { buildWritePlan } from '../../harness/runtime/write-plan.mjs';
import { createApprovalToken } from '../../harness/runtime/approval-token.mjs';
import { applyWritePlan } from '../../harness/runtime/safe-apply.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import { createHarnessFixture, removeHarnessFixture, withCwd } from '../helpers/harness-fixture.mjs';

test('sync apply rejects when approval token is missing or invalid', async () => {
  const root = await createHarnessFixture();
  try {
  const plan = buildWritePlan({
    operation: 'sync',
    rootDir: root,
    payload: { args: [] },
    preview: { summary: { create: 0, update: 0, stale: 0 } }
  });

    await assert.rejects(applyWritePlan(plan, {}), /signature is invalid|expired|does not match/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync apply accepts a matching approval token', async (t) => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-home-'));
  const root = await createHarnessFixture();
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;
  t.mock.method(os, 'homedir', () => tempHome);
  t.after(async () => {
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
    await removeHarnessFixture(root);
  });

  await writeState(root, {
    schemaVersion: 1,
    scope: 'user-global',
    projectionMode: 'link',
    hookMode: 'off',
    targets: {
      codex: { enabled: true, paths: [path.join(tempHome, '.codex/AGENTS.md')] },
      copilot: {
        enabled: true,
        paths: [path.join(tempHome, '.copilot/instructions/harness.instructions.md')]
      },
      cursor: { enabled: true, paths: [] },
      'claude-code': { enabled: true, paths: [path.join(tempHome, '.claude/CLAUDE.md')] }
    },
    upstream: {}
  });

  const plan = buildWritePlan({
    operation: 'sync',
    rootDir: root,
    payload: { args: [] },
    preview: { summary: { create: 0, update: 0, stale: 0 } }
  });
  const token = await createApprovalToken(root, plan, { actor: 'test-runner', ttlMs: 60000 });
  const result = await applyWritePlan(plan, token);
  assert.match(result.receiptPath, /\.harness\/mcp\/receipts\//);
});

test('sync apply executes against plan.rootDir instead of the current cwd', async (t) => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-home-'));
  const invocationDir = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-cwd-'));
  const root = await createHarnessFixture();
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;
  t.mock.method(os, 'homedir', () => tempHome);
  t.after(async () => {
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
    await rm(invocationDir, { recursive: true, force: true });
    await removeHarnessFixture(root);
  });

  await writeState(root, {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    hookMode: 'off',
    targets: {
      codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
    },
    upstream: {}
  });

  const plan = buildWritePlan({
    operation: 'sync',
    rootDir: root,
    payload: { args: [] },
    preview: { summary: { create: 1, update: 0, stale: 0 } }
  });
  const token = await createApprovalToken(root, plan, { actor: 'test-runner', ttlMs: 60000 });

  const result = await withCwd(invocationDir, () => applyWritePlan(plan, token));
  const receipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, '.harness/projections.json'), 'utf8'));

  assert.equal(receipt.rootDir, root);
  assert.ok(manifest.entries.length > 0);
  await assert.rejects(access(path.join(invocationDir, '.harness/projections.json')), /ENOENT/);
});
