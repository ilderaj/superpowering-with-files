import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function readRuntimeEvidence(rootDir, target = 'codex') {
  const logPath = path.join(rootDir, '.harness/runtime-hooks', `${target}.jsonl`);
  const contents = await readFile(logPath, 'utf8');
  return contents
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('session-checkpoint records SessionStart evidence before scripts/harness early exit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-session-checkpoint-'));
  try {
    const canonicalRoot = await realpath(root);
    const scriptsDir = path.join(root, 'scripts');
    await mkdir(scriptsDir, { recursive: true });
    const harnessPath = path.join(scriptsDir, 'harness');
    await writeFile(harnessPath, '#!/usr/bin/env bash\nexit 0\n');
    await chmod(harnessPath, 0o755);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/session-checkpoint.sh');
    execFileSync('bash', [scriptPath, 'codex'], {
      cwd: root,
      env: {
        ...process.env,
        HARNESS_PROJECT_ROOT: root
      }
    });

    const entries = await readRuntimeEvidence(root);
    const lastEntry = entries.at(-1);
    assert.equal(lastEntry.parentSkillName, 'safety');
    assert.equal(lastEntry.eventName, 'SessionStart');
    assert.equal(await realpath(lastEntry.projectRoot), canonicalRoot);
    assert.equal(await realpath(lastEntry.cwd), canonicalRoot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
