import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
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
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
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

test('readHarnessHealth exposes sync timestamps and upstream state', async () => {
  const root = await createHarnessFixture();
  try {
    const upstream = {
      'planning-with-files': {
        candidatePath: '.harness/upstream-candidates/planning-with-files',
        appliedPath: 'harness/upstream/planning-with-files',
        lastFetch: '2026-04-13T01:00:00.000Z',
        lastUpdate: '2026-04-13T02:00:00.000Z'
      }
    };

    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {},
      upstream,
      lastSync: '2026-04-13T00:00:00.000Z',
      lastFetch: '2026-04-13T01:00:00.000Z',
      lastUpdate: '2026-04-13T02:00:00.000Z'
    });

    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.lastSync, '2026-04-13T00:00:00.000Z');
    assert.equal(health.lastFetch, '2026-04-13T01:00:00.000Z');
    assert.equal(health.lastUpdate, '2026-04-13T02:00:00.000Z');
    assert.deepEqual(health.upstream, upstream);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth filters upstream state to public status fields', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {},
      upstream: {
        'planning-with-files': {
          candidatePath: '.harness/upstream-candidates/planning-with-files',
          appliedPath: 'harness/upstream/planning-with-files',
          lastFetch: '2026-04-13T01:00:00.000Z',
          lastUpdate: '2026-04-13T02:00:00.000Z',
          privateToken: 'secret',
          url: 'https://example.invalid/source.git'
        }
      }
    });

    const health = await readHarnessHealth(root, '/home/user');

    assert.deepEqual(health.upstream, {
      'planning-with-files': {
        candidatePath: '.harness/upstream-candidates/planning-with-files',
        appliedPath: 'harness/upstream/planning-with-files',
        lastFetch: '2026-04-13T01:00:00.000Z',
        lastUpdate: '2026-04-13T02:00:00.000Z'
      }
    });
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports hook status without failing unsupported adapters', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] },
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');

    assert.equal(health.hookMode, 'on');
    assert.equal(
      health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files').status,
      'ok'
    );
    assert.equal(
      health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'superpowers').status,
      'ok'
    );
    assert.equal(
      health.targets.codex.hooks.find((hook) => hook.parentSkillName === 'superpowers').status,
      'unsupported'
    );
    assert.equal(health.problems.length, 0);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports a problem when hook config exists without the managed entry', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, '.cursor/hooks.json'),
      `${JSON.stringify({ version: 1, hooks: { stop: [] } }, null, 2)}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'problem');
    assert.match(planning.message, /missing Harness-managed planning-with-files hook/);
    assert.ok(health.problems.some((problem) => problem.includes('planning-with-files')));
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth rejects hook config when marker only appears in a command string', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, '.cursor/hooks.json'),
      `${JSON.stringify(
        {
          version: 1,
          hooks: {
            stop: [
              {
                command: 'echo "Harness-managed planning-with-files hook"',
                description: 'User hook'
              }
            ]
          }
        },
        null,
        2
      )}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'problem');
    assert.match(planning.message, /missing Harness-managed planning-with-files hook/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports malformed JSON hook config as a problem', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(path.join(root, '.cursor/hooks.json'), '{\n');

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'problem');
    assert.equal(planning.message, 'Hook config is malformed JSON.');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth validates Claude Code settings hooks after sync', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets['claude-code'].hooks.find(
      (hook) => hook.parentSkillName === 'planning-with-files'
    );

    assert.equal(planning.status, 'ok');
    assert.equal(health.problems.length, 0);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('readHarnessHealth reports Claude shared skill root symlink as unsupported layout', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'off',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await rm(path.join(root, '.claude/skills'), { recursive: true, force: true });
    await mkdir(path.join(root, '.claude'), { recursive: true });
    await symlink(path.join(root, '.codex/skills'), path.join(root, '.claude/skills'), 'dir');

    const health = await readHarnessHealth(root, '/home/user');
    const skill = health.targets['claude-code'].skills.find(
      (entry) => entry.skillName === 'using-superpowers'
    );

    assert.equal(skill.status, 'problem');
    assert.match(skill.message, /shared skill root symlinks are not supported/i);
  } finally {
    await removeHarnessFixture(root);
  }
});
