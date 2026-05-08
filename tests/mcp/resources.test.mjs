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
