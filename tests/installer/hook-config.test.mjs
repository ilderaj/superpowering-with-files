import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeHookConfig, mergeHookSettings } from '../../harness/installer/lib/hook-config.mjs';

test('mergeHookConfig preserves unrelated user hook entries', () => {
  const merged = mergeHookConfig(
    {
      version: 1,
      hooks: {
        preToolUse: [
          {
            command: 'user-script.sh',
            description: 'User hook'
          }
        ]
      }
    },
    {
      version: 1,
      hooks: {
        preToolUse: [
          {
            command: '.cursor/hooks/task-scoped-hook.sh pre-tool-use',
            description: 'Harness-managed planning-with-files hook'
          }
        ]
      }
    },
    'cursor'
  );

  assert.deepEqual(merged.hooks.preToolUse.map((entry) => entry.description), [
    'User hook',
    'Harness-managed planning-with-files hook'
  ]);
});

test('mergeHookConfig replaces prior Harness-managed entries for the same skill', () => {
  const merged = mergeHookConfig(
    {
      version: 1,
      hooks: {
        stop: [
          {
            command: 'old-command',
            description: 'Harness-managed planning-with-files hook'
          },
          {
            command: 'user-command',
            description: 'User hook'
          }
        ]
      }
    },
    {
      version: 1,
      hooks: {
        stop: [
          {
            command: 'new-command',
            description: 'Harness-managed planning-with-files hook'
          }
        ]
      }
    },
    'cursor'
  );

  assert.deepEqual(
    merged.hooks.stop.map((entry) => entry.command),
    ['user-command', 'new-command']
  );
});

test('mergeHookConfig rejects missing hooks objects', () => {
  assert.throws(
    () => mergeHookConfig({ version: 1 }, { version: 1, hooks: {} }, 'cursor'),
    /Hook config for cursor must contain a hooks object/
  );
});

test('mergeHookSettings preserves non-hook Claude settings', () => {
  const merged = mergeHookSettings(
    {
      permissions: {
        allow: ['Bash(node --test)']
      }
    },
    {
      hooks: {
        SessionStart: [
          {
            description: 'Harness-managed superpowers hook',
            matcher: 'startup',
            hooks: [{ type: 'command', command: 'sh .claude/hooks/run-hook.cmd session-start' }]
          }
        ]
      }
    },
    'claude-code'
  );

  assert.deepEqual(merged.permissions, {
    allow: ['Bash(node --test)']
  });
  assert.deepEqual(
    merged.hooks.SessionStart.map((entry) => entry.description),
    ['Harness-managed superpowers hook']
  );
});

test('mergeHookSettings replaces prior Harness-managed entry while preserving unrelated user hook entry', () => {
  const merged = mergeHookSettings(
    {
      hooks: {
        SessionStart: [
          {
            description: 'Harness-managed superpowers hook',
            matcher: 'startup',
            hooks: [{ type: 'command', command: 'old-command' }]
          },
          {
            description: 'User hook',
            matcher: 'startup',
            hooks: [{ type: 'command', command: 'user-command' }]
          }
        ]
      },
      permissions: {
        allow: ['Bash(node --test)']
      }
    },
    {
      hooks: {
        SessionStart: [
          {
            description: 'Harness-managed superpowers hook',
            matcher: 'startup',
            hooks: [{ type: 'command', command: 'new-command' }]
          }
        ]
      }
    },
    'claude-code'
  );

  assert.deepEqual(
    merged.hooks.SessionStart.map((entry) => entry.hooks[0].command),
    ['user-command', 'new-command']
  );
  assert.deepEqual(merged.permissions, {
    allow: ['Bash(node --test)']
  });
});

test('mergeHookSettings rejects non-object existing hooks field', () => {
  assert.throws(
    () =>
      mergeHookSettings(
        { hooks: [{ description: 'User hook' }] },
        { hooks: { SessionStart: [] } },
        'claude-code'
      ),
    /settings hooks must be an object/
  );
});
