import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeHookConfig } from '../../harness/installer/lib/hook-config.mjs';

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

