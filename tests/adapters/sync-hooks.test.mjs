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

test('sync installs copilot planning hooks aligned with the official VS Code lifecycle', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const hooks = JSON.parse(await readFile(path.join(root, '.github/hooks/planning-with-files.json'), 'utf8'));

    assert.ok(hooks.hooks.sessionStart);
    assert.ok(hooks.hooks.userPromptSubmit);
    assert.ok(hooks.hooks.preToolUse);
    assert.ok(hooks.hooks.postToolUse);
    assert.ok(hooks.hooks.stop);
    assert.equal(hooks.hooks.agentStop, undefined);
    assert.equal(hooks.hooks.errorOccurred, undefined);
    assert.match(JSON.stringify(hooks), /Harness-managed planning-with-files hook/);
    assert.match(await readFile(path.join(root, '.github/hooks/task-scoped-hook.sh'), 'utf8'), /planning\/active/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync does not install copilot Superpowers session-start hooks', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await assert.rejects(readFile(path.join(root, '.github/hooks/superpowers.json'), 'utf8'), /ENOENT/);
    await assert.rejects(readFile(path.join(root, '.github/hooks/session-start'), 'utf8'), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync installs copilot safety hooks when the safety profile is active', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'safety',
      skillProfile: 'full',
      targets: { copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const hooks = JSON.parse(await readFile(path.join(root, '.github/hooks/safety.json'), 'utf8'));

    assert.ok(hooks.hooks.sessionStart);
    assert.ok(hooks.hooks.preToolUse);
    assert.match(JSON.stringify(hooks), /Harness-managed safety hook/);
    assert.match(await readFile(path.join(root, '.github/hooks/pretool-guard.sh'), 'utf8'), /permissionDecision/);
    assert.match(await readFile(path.join(root, '.github/hooks/session-checkpoint.sh'), 'utf8'), /checkpoint/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync installs codex planning hooks when hookMode is on', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'always-on-core',
      targets: { codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const hooks = JSON.parse(await readFile(path.join(root, '.codex/hooks.json'), 'utf8'));

    assert.ok(hooks.hooks.SessionStart);
    assert.ok(hooks.hooks.UserPromptSubmit);
    assert.equal(hooks.hooks.Stop, undefined);
    assert.match(JSON.stringify(hooks), /Harness-managed planning-with-files hook/);
    assert.match(await readFile(path.join(root, '.codex/hooks/task-scoped-hook.sh'), 'utf8'), /planning\/active/);
    assert.match(
      await readFile(path.join(root, '.codex/hooks/runtime-hook-evidence.sh'), 'utf8'),
      /harness_record_runtime_hook_evidence/
    );
    assert.match(
      await readFile(path.join(root, '.codex/hooks/planning-hot-context.mjs'), 'utf8'),
      /buildPlanningHotContext/
    );
    assert.doesNotMatch(JSON.stringify(hooks), /Harness-managed superpowers hook/);
    await assert.rejects(readFile(path.join(root, '.codex/hooks/session-start'), 'utf8'), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync removes a previously managed Codex Superpowers hook while preserving planning hooks', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'always-on-core',
      targets: { codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] } },
      upstream: {}
    });
    const indexPath = path.join(root, 'harness/core/skills/index.json');
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    index.skills.superpowers.hooks = {
      codex: {
        source: 'harness/core/hooks/superpowers',
        config: 'codex-hooks.json',
        scriptRoot: 'scripts',
        scripts: ['session-start', 'run-hook.cmd'],
        events: ['SessionStart']
      }
    };
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);

    await withCwd(root, () => sync([]));
    assert.match(
      await readFile(path.join(root, '.codex/hooks.json'), 'utf8'),
      /Harness-managed superpowers hook/
    );

    delete index.skills.superpowers.hooks;
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    await withCwd(root, () => sync([]));

    const hooks = await readFile(path.join(root, '.codex/hooks.json'), 'utf8');
    assert.doesNotMatch(hooks, /Harness-managed superpowers hook/);
    assert.match(hooks, /Harness-managed planning-with-files hook/);
    await assert.rejects(readFile(path.join(root, '.codex/hooks/session-start'), 'utf8'), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync prunes stale Harness-managed Codex Stop hooks on re-sync', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'always-on-core',
      targets: { codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await writeFile(
      path.join(root, '.codex/hooks.json'),
      `${JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                description: 'Harness-managed planning-with-files hook',
                hooks: [{ type: 'command', command: 'echo planning-session-start' }]
              }
            ],
            UserPromptSubmit: [
              {
                description: 'Harness-managed planning-with-files hook',
                hooks: [{ type: 'command', command: 'echo planning-user-prompt-submit' }]
              }
            ],
            Stop: [
              {
                description: 'Harness-managed planning-with-files hook',
                hooks: [{ type: 'command', command: 'echo stale-planning-stop' }]
              },
              {
                description: 'User hook',
                hooks: [{ type: 'command', command: 'echo user-stop' }]
              }
            ]
          }
        },
        null,
        2
      )}\n`
    );

    await withCwd(root, () => sync([]));
    const hooks = JSON.parse(await readFile(path.join(root, '.codex/hooks.json'), 'utf8'));

    assert.equal(hooks.hooks.Stop?.find((entry) => entry.description === 'Harness-managed planning-with-files hook'), undefined);
    assert.equal(hooks.hooks.Stop?.find((entry) => entry.description === 'User hook')?.hooks?.[0]?.command, 'echo user-stop');
    assert.ok(hooks.hooks.SessionStart);
    assert.ok(hooks.hooks.UserPromptSubmit);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync installs codex safety hooks when the safety profile is active', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'safety',
      skillProfile: 'full',
      targets: { codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const hooks = JSON.parse(await readFile(path.join(root, '.codex/hooks.json'), 'utf8'));

    assert.ok(hooks.hooks.PreToolUse);
    assert.match(JSON.stringify(hooks), /Harness-managed safety hook/);
    assert.match(await readFile(path.join(root, '.codex/hooks/pretool-guard.sh'), 'utf8'), /policyProfile/);
    assert.match(await readFile(path.join(root, '.codex/hooks/pretool-guard.sh'), 'utf8'), /permissionDecision/);
    assert.match(await readFile(path.join(root, '.codex/hooks/session-checkpoint.sh'), 'utf8'), /checkpoint/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync --dry-run emits a warnings array when hook-aware reporting is enabled', async (t) => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    let stdout = '';
    t.mock.method(process.stdout, 'write', (chunk) => {
      stdout += String(chunk);
      return true;
    });

    await withCwd(root, () => sync(['--dry-run']));
    const payload = JSON.parse(stdout);

    assert.equal(Array.isArray(payload.warnings), true);
    assert.equal(typeof payload.details, 'object');
    assert.equal(payload.details.mode, 'dry-run');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync installs copilot safety hooks when the safety profile is active', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'safety',
      skillProfile: 'full',
      targets: { copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const hooks = JSON.parse(await readFile(path.join(root, '.github/hooks/safety.json'), 'utf8'));

    assert.ok(hooks.hooks.sessionStart);
    assert.ok(hooks.hooks.preToolUse);
    assert.match(JSON.stringify(hooks), /Harness-managed safety hook/);
    assert.match(await readFile(path.join(root, '.github/hooks/pretool-guard.sh'), 'utf8'), /permissionDecision/);
    assert.match(await readFile(path.join(root, '.github/hooks/session-checkpoint.sh'), 'utf8'), /checkpoint/);
    assert.match(
      await readFile(path.join(root, '.github/hooks/runtime-hook-evidence.sh'), 'utf8'),
      /harness_record_runtime_hook_evidence/
    );
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
    assert.doesNotMatch(JSON.stringify(settings.hooks), /Harness-managed superpowers hook/);
    assert.match(
      await readFile(path.join(root, '.claude/hooks/task-scoped-hook.sh'), 'utf8'),
      /planning\/active/
    );
    assert.equal(settings.hooks.SessionStart, undefined);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('sync installs only routing-aware planning hooks for cursor', async () => {
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

    assert.equal(hooks.hooks.sessionStart, undefined);
    assert.ok(hooks.hooks.preToolUse);
    assert.doesNotMatch(JSON.stringify(hooks), /Harness-managed superpowers hook/);
    assert.match(JSON.stringify(hooks), /Harness-managed planning-with-files hook/);
    await assert.rejects(readFile(path.join(root, '.cursor/hooks/session-start'), 'utf8'), /ENOENT/);
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
