#!/usr/bin/env node

import { spawn } from 'node:child_process';

const groups = [
  [
    'tests/automation/upstream-refresh-workflow.test.mjs',
    'tests/automation/upstream-refresh-lib.test.mjs',
    'tests/automation/upstream-pr-lib.test.mjs',
    'tests/automation/repo-verify-workflow.test.mjs'
  ],
  [
    'tests/installer/upstream-commands.test.mjs'
  ],
  [
    'tests/core/simplification-ledger-search.test.mjs'
  ]
];

for (const files of groups) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`node --test ${files.join(' ')} failed with exit code ${code}`));
    });
  });
}
