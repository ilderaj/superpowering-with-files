import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { access, lstat, mkdtemp, readFile, readdir, readlink, rm } from 'node:fs/promises';
import { buildWritePlan } from '../../harness/runtime/write-plan.mjs';
import { createApprovalToken } from '../../harness/runtime/approval-token.mjs';
import { applyWritePlan } from '../../harness/runtime/safe-apply.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import { createHarnessFixture, removeHarnessFixture } from '../helpers/harness-fixture.mjs';

async function snapshotTree(targetPath) {
  try {
    const stat = await lstat(targetPath);
    if (stat.isDirectory()) {
      const names = (await readdir(targetPath)).sort();
      return {
        kind: 'directory',
        entries: await Promise.all(
          names.map(async (name) => ({
            name,
            value: await snapshotTree(path.join(targetPath, name))
          }))
        )
      };
    }
    if (stat.isFile()) {
      return {
        kind: 'file',
        bytes: (await readFile(targetPath)).toString('base64')
      };
    }
    if (stat.isSymbolicLink()) {
      return {
        kind: 'symlink',
        target: await readlink(targetPath)
      };
    }
    return { kind: 'other' };
  } catch (error) {
    if (error?.code === 'ENOENT') return { kind: 'absent' };
    throw error;
  }
}

async function snapshotWriteSurfaces(root, projectionTargets) {
  return {
    state: await snapshotTree(path.join(root, '.harness', 'state.json')),
    projections: await snapshotTree(path.join(root, '.harness', 'projections.json')),
    targets: await Promise.all(
      projectionTargets.map(async (targetPath) => ({
        path: targetPath,
        value: await snapshotTree(targetPath)
      }))
    ),
    auditReceipts: await snapshotTree(path.join(root, '.harness', 'mcp', 'receipts')),
    executionReceipts: await snapshotTree(path.join(root, '.harness', 'execution', 'receipts')),
    followupClosures: await snapshotTree(
      path.join(root, '.harness', 'execution', 'followup-closures')
    )
  };
}

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

test('sync apply rejects persisted V1 state with a matching approval token without writes', async (t) => {
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

  const projectionTargets = [
    path.join(tempHome, '.codex/AGENTS.md'),
    path.join(tempHome, '.copilot/instructions/harness.instructions.md'),
    path.join(tempHome, '.claude/CLAUDE.md')
  ];
  await writeState(root, {
    schemaVersion: 1,
    scope: 'user-global',
    projectionMode: 'link',
    hookMode: 'off',
    targets: {
      codex: { enabled: true, paths: [projectionTargets[0]] },
      copilot: {
        enabled: true,
        paths: [projectionTargets[1]]
      },
      cursor: { enabled: true, paths: [] },
      'claude-code': { enabled: true, paths: [projectionTargets[2]] }
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
  const before = await snapshotWriteSurfaces(root, projectionTargets);

  await assert.rejects(
    applyWritePlan(plan, token),
    (error) => {
      assert.equal(error.code, 'ERR_TRIO_UPGRADE_REQUIRED');
      assert.equal(
        error.message,
        'Persisted schema-v1 state requires install --upgrade with recovery evidence.'
      );
      return true;
    }
  );

  assert.deepEqual(await snapshotWriteSurfaces(root, projectionTargets), before);
});

test('sync apply rejects persisted V1 state from another cwd without writes', async (t) => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-home-'));
  const invocationDir = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-cwd-'));
  const root = await createHarnessFixture();
  const originalHome = process.env.HOME;
  const originalChdir = process.chdir.bind(process);
  const previousCwd = process.cwd();
  process.env.HOME = tempHome;
  t.mock.method(os, 'homedir', () => tempHome);
  t.after(async () => {
    originalChdir(previousCwd);
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
    await rm(invocationDir, { recursive: true, force: true });
    await removeHarnessFixture(root);
  });

  const projectionTargets = [path.join(root, 'AGENTS.md')];
  await writeState(root, {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    hookMode: 'off',
    targets: {
      codex: { enabled: true, paths: projectionTargets }
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
  const before = await snapshotWriteSurfaces(root, projectionTargets);

  originalChdir(invocationDir);
  t.mock.method(process, 'chdir', () => {
    throw new Error('applyWritePlan should not call process.chdir');
  });

  await assert.rejects(
    applyWritePlan(plan, token),
    (error) => {
      assert.equal(error.code, 'ERR_TRIO_UPGRADE_REQUIRED');
      assert.equal(
        error.message,
        'Persisted schema-v1 state requires install --upgrade with recovery evidence.'
      );
      return true;
    }
  );

  assert.deepEqual(await snapshotWriteSurfaces(root, projectionTargets), before);
  await assert.rejects(access(path.join(invocationDir, '.harness/projections.json')), /ENOENT/);
});

test('install apply rejects legacy options without changing write surfaces', async (t) => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-home-'));
  const invocationDir = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-install-cwd-'));
  const root = await createHarnessFixture();
  const originalHome = process.env.HOME;
  const originalChdir = process.chdir.bind(process);
  const previousCwd = process.cwd();
  process.env.HOME = tempHome;
  t.mock.method(os, 'homedir', () => tempHome);
  t.after(async () => {
    originalChdir(previousCwd);
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
    await rm(invocationDir, { recursive: true, force: true });
    await removeHarnessFixture(root);
  });

  const plan = buildWritePlan({
    operation: 'install',
    rootDir: root,
    payload: { args: ['--scope=workspace', '--targets=codex'] },
    preview: { scope: 'workspace', targets: ['codex'] }
  });
  const token = await createApprovalToken(root, plan, { actor: 'test-runner', ttlMs: 60000 });
  const projectionTargets = [path.join(root, 'AGENTS.md')];
  const before = await snapshotWriteSurfaces(root, projectionTargets);

  originalChdir(invocationDir);
  t.mock.method(process, 'chdir', () => {
    throw new Error('applyWritePlan should not call process.chdir');
  });

  await assert.rejects(
    applyWritePlan(plan, token),
    (error) => {
      assert.equal(error.code, 'ERR_TRIO_FIXTURE');
      assert.equal(error.message, 'Unsupported or duplicate Trio argument: --scope.');
      return true;
    }
  );

  assert.deepEqual(await snapshotWriteSurfaces(root, projectionTargets), before);
  await assert.rejects(access(path.join(invocationDir, 'AGENTS.md')), /ENOENT/);
});
