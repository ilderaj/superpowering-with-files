import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectLocalHookPayloads } from '../../harness/installer/lib/health-context-budgets.mjs';

const HOOK_PAYLOAD_BUDGET = {
  warn: { chars: 12000, lines: 160, tokens: 3000 },
  problem: { chars: 18000, lines: 240, tokens: 4500 }
};

function hookScript(logPath) {
  return `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$2" >> "${logPath}"
case "$2" in
  session-start) event_name="SessionStart" ;;
  user-prompt-submit) event_name="UserPromptSubmit" ;;
  stop) event_name="Stop" ;;
  *) event_name="$2" ;;
esac
printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"ok"}}\\n' "$event_name"
`;
}

test('inspectLocalHookPayloads measures overlapping Copilot planning hook payloads only once per event', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-hook-dedupe-'));
  const home = path.join(root, 'home');
  const workspaceHookRoot = path.join(root, '.github/hooks');
  const globalHookRoot = path.join(home, '.copilot/hooks');
  const activeTaskDir = path.join(root, 'planning/active/copilot-overlap-tax');
  const callLog = path.join(root, 'hook-calls.log');

  try {
    await mkdir(workspaceHookRoot, { recursive: true });
    await mkdir(globalHookRoot, { recursive: true });
    await mkdir(activeTaskDir, { recursive: true });

    await writeFile(path.join(workspaceHookRoot, 'task-scoped-hook.sh'), hookScript(callLog));
    await writeFile(path.join(globalHookRoot, 'task-scoped-hook.sh'), hookScript(callLog));

    const hookProjections = [
      {
        target: 'copilot',
        parentSkillName: 'planning-with-files',
        eventNames: ['sessionStart', 'userPromptSubmit', 'stop'],
        scriptSourcePaths: [
          path.join(root, 'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh')
        ],
        scriptTargetRoot: workspaceHookRoot,
        status: 'ok'
      },
      {
        target: 'copilot',
        parentSkillName: 'planning-with-files',
        eventNames: ['sessionStart', 'userPromptSubmit', 'stop'],
        scriptSourcePaths: [
          path.join(root, 'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh')
        ],
        scriptTargetRoot: globalHookRoot,
        status: 'ok'
      }
    ];

    const hooks = await inspectLocalHookPayloads(
      root,
      home,
      activeTaskDir,
      HOOK_PAYLOAD_BUDGET,
      'on',
      hookProjections,
      [],
      [],
      []
    );

    const callEvents = (await readFile(callLog, 'utf8')).trim().split('\n');

    assert.deepEqual(callEvents, ['session-start', 'user-prompt-submit', 'stop']);
    assert.equal(hooks.length, 3);
    assert.ok(hooks.every((hook) => hook.runtimePath.startsWith(globalHookRoot)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
