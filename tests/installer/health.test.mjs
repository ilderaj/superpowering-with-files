import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readHarnessHealth } from '../../harness/installer/lib/health.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

test('readHarnessHealth reports entry and skill status per target', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.copilot/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.targets.codex.entries[0].status, 'ok');
    assert.equal(
      health.targets.codex.skills.find((skill) => skill.skillName === 'using-superpowers').status,
      'ok'
    );
    assert.equal(
      health.targets.copilot.skills.find((skill) => skill.skillName === 'planning-with-files').status,
      'ok'
    );
    assert.equal(health.problems.length, 0);
  } finally {
    await removeHarnessFixture(root);
  }
});
