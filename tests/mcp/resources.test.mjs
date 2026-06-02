import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listHarnessResources, readHarnessResource } from '../../harness/runtime/resource-service.mjs';

async function createHarnessFixture(prefix = 'harness-mcp-resources-') {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await cp(path.join(process.cwd(), 'harness'), path.join(root, 'harness'), { recursive: true });
  await mkdir(path.join(root, 'planning/active/task-with-reconciliation'), { recursive: true });
  await writeFile(
    path.join(root, 'planning/active/task-with-reconciliation/task_plan.md'),
    [
      '# Task With Reconciliation',
      '',
      '## Current State',
      'Status: closed',
      'Archive Eligible: yes',
      'Close Reason: fixture',
      'Reconcile: complete',
      '',
      '### Phase 1: Fixture',
      '- **Status:** complete'
    ].join('\n')
  );
  await writeFile(path.join(root, 'planning/active/task-with-reconciliation/findings.md'), '# Findings\n');
  await writeFile(path.join(root, 'planning/active/task-with-reconciliation/progress.md'), '# Progress\n');
  await writeFile(
    path.join(root, 'planning/active/task-with-reconciliation/reconciliation.md'),
    '# Reconciliation: task-with-reconciliation\n\n## Archive Readiness\nReady, reason: fixture.\n'
  );
  return root;
}

async function removeFixture(root) {
  await rm(root, { recursive: true, force: true });
}

test('listHarnessResources returns the fixed resources and task resources', async () => {
  const resources = await listHarnessResources({ root: process.cwd() });
  const uris = resources.map((resource) => resource.uri);
  assert(uris.includes('harness://status'));
  assert(uris.includes('harness://active-tasks'));
  assert(uris.includes('harness://verification/latest'));
});

test('readHarnessResource returns active task data', async () => {
  const result = await readHarnessResource('harness://active-tasks', { root: process.cwd() });
  assert.equal(result.contents[0].uri, 'harness://active-tasks');
  assert.match(result.contents[0].text, /counts/);
});

test('resource services resolve the authority root from a nested leaf cwd', async () => {
  const root = await createHarnessFixture();
  try {
    const leafDir = path.join(root, 'packages/demo');
    await mkdir(leafDir, { recursive: true });

    const resources = await listHarnessResources({ cwd: leafDir });
    const uris = resources.map((resource) => resource.uri);
    assert(uris.includes('harness://task/task-with-reconciliation/reconciliation'));

    const adapters = await readHarnessResource('harness://adapters', { cwd: leafDir });
    assert.match(adapters.contents[0].text, /"platforms"/);
  } finally {
    await removeFixture(root);
  }
});


test('listHarnessResources exposes task reconciliation resources when present', async () => {
  const root = await createHarnessFixture();
  try {
    const realRoot = await realpath(root);
    const input = { root: realRoot, allowedRoots: [realRoot], cwd: realRoot };
    const resources = await listHarnessResources(input);
    const taskResources = resources.filter((resource) => resource.uri.includes('/reconciliation'));
    assert.equal(taskResources.length, 1);
    assert.equal(taskResources[0].uri, 'harness://task/task-with-reconciliation/reconciliation');
    const result = await readHarnessResource(taskResources[0].uri, input);
    assert.equal(result.contents[0].mimeType, 'text/markdown');
    assert.match(result.contents[0].text, /Archive Readiness/);
  } finally {
    await removeFixture(root);
  }
});
