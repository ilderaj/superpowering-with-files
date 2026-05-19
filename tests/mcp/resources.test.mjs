import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listHarnessResources, readHarnessResource } from '../../harness/runtime/resource-service.mjs';

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


test('listHarnessResources exposes task reconciliation resources when present', async () => {
  const resources = await listHarnessResources({ root: process.cwd() });
  const taskResources = resources.filter((resource) => resource.uri.includes('/reconciliation'));
  assert(taskResources.length > 0);
  const result = await readHarnessResource(taskResources[0].uri, { root: process.cwd() });
  assert.equal(result.contents[0].mimeType, 'text/markdown');
});
