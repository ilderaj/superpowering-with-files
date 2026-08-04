#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const groups = [
  [
    'tests/automation/upstream-refresh-workflow.test.mjs',
    'tests/automation/upstream-refresh-lib.test.mjs',
    'tests/automation/upstream-pr-lib.test.mjs',
    'tests/automation/repo-verify-workflow.test.mjs'
  ],
  [
    'tests/adapters/planning-record-time.test.mjs',
    'tests/adapters/skill-projection.test.mjs',
    'tests/adapters/sync-skills.test.mjs',
    'tests/adapters/sync-hooks.test.mjs',
    'tests/installer/matt-skill-patches.test.mjs',
    'tests/installer/upstream-commands.test.mjs',
    'tests/installer/policy-render.test.mjs'
  ],
  [
    'tests/core/simplification-ledger-search.test.mjs'
  ]
];

for (const files of groups) {
  await execFileAsync('node', ['--test', ...files], {
    stdio: 'inherit',
    maxBuffer: 1024 * 1024 * 8
  });
}
