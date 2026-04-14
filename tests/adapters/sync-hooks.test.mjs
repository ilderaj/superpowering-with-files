import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

test('sync does not install hooks when hookMode is off', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: { cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await assert.rejects(readFile(path.join(root, '.cursor/hooks.json'), 'utf8'), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync installs cursor planning hooks when hookMode is on', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const hooks = await readFile(path.join(root, '.cursor/hooks.json'), 'utf8');
    assert.match(hooks, /Harness-managed planning-with-files hook/);
    assert.match(await readFile(path.join(root, '.cursor/hooks/task-scoped-hook.sh'), 'utf8'), /planning\/active/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync installs claude hooks into settings while preserving settings fields', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { 'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] } },
      upstream: {}
    });
    await mkdir(path.join(root, '.claude'), { recursive: true });
    await writeFile(
      path.join(root, '.claude/settings.json'),
      `${JSON.stringify(
        {
          permissions: {
            allow: ['Bash(node --test)']
          }
        },
        null,
        2
      )}\n`
    );

    await withCwd(root, () => sync([]));

    await assert.rejects(readFile(path.join(root, '.claude/hooks.json'), 'utf8'), /ENOENT/);

    const settings = JSON.parse(await readFile(path.join(root, '.claude/settings.json'), 'utf8'));
    assert.deepEqual(settings.permissions, {
      allow: ['Bash(node --test)']
    });
    assert.match(JSON.stringify(settings.hooks), /Harness-managed planning-with-files hook/);
    assert.match(JSON.stringify(settings.hooks), /Harness-managed superpowers hook/);
    assert.match(
      await readFile(path.join(root, '.claude/hooks/task-scoped-hook.sh'), 'utf8'),
      /planning\/active/
    );
    assert.match(
      await readFile(path.join(root, '.claude/hooks/run-hook.cmd'), 'utf8'),
      /session-start/
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync merges cursor superpowers and planning hooks', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const hooks = JSON.parse(await readFile(path.join(root, '.cursor/hooks.json'), 'utf8'));

    assert.ok(hooks.hooks.sessionStart);
    assert.ok(hooks.hooks.preToolUse);
    assert.match(JSON.stringify(hooks), /Harness-managed superpowers hook/);
    assert.match(JSON.stringify(hooks), /Harness-managed planning-with-files hook/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync removes stale cursor hooks when hookMode is turned off', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: { cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    await assert.rejects(readFile(path.join(root, '.cursor/hooks.json'), 'utf8'), /ENOENT/);
    await assert.rejects(readFile(path.join(root, '.cursor/hooks/task-scoped-hook.sh'), 'utf8'), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync removes stale Claude hooks while preserving unrelated settings fields', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { 'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] } },
      upstream: {}
    });
    await mkdir(path.join(root, '.claude'), { recursive: true });
    await writeFile(
      path.join(root, '.claude/settings.json'),
      `${JSON.stringify(
        {
          permissions: {
            allow: ['Bash(node --test)']
          }
        },
        null,
        2
      )}\n`
    );

    await withCwd(root, () => sync([]));
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: { 'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    const settings = JSON.parse(await readFile(path.join(root, '.claude/settings.json'), 'utf8'));
    assert.deepEqual(settings, {
      permissions: {
        allow: ['Bash(node --test)']
      }
    });
    await assert.rejects(readFile(path.join(root, '.claude/hooks/task-scoped-hook.sh'), 'utf8'), /ENOENT/);
    await assert.rejects(readFile(path.join(root, '.claude/hooks/run-hook.cmd'), 'utf8'), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});
