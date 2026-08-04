import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';


test('adoption starter kit documents profiles, rollback path, and recovery boundary', async () => {
  const [doc, maintenanceDoc] = await Promise.all([
    readFile(path.join(process.cwd(), 'docs/install/adoption-starter-kit.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'docs/maintenance.md'), 'utf8')
  ]);

  assert.match(doc, /minimal-global, full-local, and cloud-dev profiles/i);
  assert.match(doc, /rollback, doctor, sync dry-run, verify, and smoke-check/i);
  assert.match(
    doc,
    /The starter kit must explain what upstream update can overwrite, what it cannot overwrite, and how to recover safely\./
  );
  assert.match(
    maintenanceDoc,
    /When using the adoption starter kit, verify rollback, doctor, sync dry-run, verify, and smoke-check steps before treating the profile as reusable team guidance\./
  );
});
