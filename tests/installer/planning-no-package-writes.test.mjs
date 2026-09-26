import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

test('PWF resolution and status leave a relocated installed scripts directory unchanged', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'swf-pwf-no-writes-'));
  const scripts = path.join(tmp, 'scripts');
  try {
    await cp('harness/core/upstream-overlays/planning-with-files/scripts', scripts, {
      recursive: true, filter: entry => !entry.includes('__pycache__') && !entry.endsWith('.pyc')
    });
    const before = (await readdir(scripts, {recursive:true})).sort();
    const env = {...process.env};
    delete env.PYTHONDONTWRITEBYTECODE;
    delete env.PYTHONPYCACHEPREFIX;
    const result = execFileSync('python3', [path.join(scripts, 'planning_paths.py'), 'active-dir', tmp, 'sample'], {env,encoding:'utf8'});
    assert.equal(result.trim(), path.join(await realpath(tmp), 'planning/active/sample'));
    execFileSync('python3', [path.join(scripts, 'task-status.py'), '--help'], {env});
    assert.deepEqual((await readdir(scripts, {recursive:true})).sort(), before);
  } finally { await rm(tmp, {recursive:true,force:true}); }
});
