import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildAll } from '../../packages/plugin-kit/src/build-all.mjs';
import { smokeReleaseArtifacts } from '../../packages/plugin-kit/src/smoke.mjs';

const execFileAsync = promisify(execFile);

test('smokeReleaseArtifacts builds and validates release artifacts', async () => {
  const result = await smokeReleaseArtifacts({ version: '1.0.6' });

  assert.equal(result.ok, true);
  assert.equal(result.plugins.length, 4);
  assert.equal(result.runtime.ok, true);
  assert.deepEqual(result.errors, []);
});

test('packed runtime CLI can run doctor from outside the extracted package root', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-runtime-cli-smoke-'));
  const release = await buildAll({
    version: '1.0.6',
    release: true,
    outDir: path.join(workDir, 'release')
  });
  const extractRoot = path.join(workDir, 'extract', 'runtime');
  await mkdir(extractRoot, { recursive: true });
  await execFileAsync('tar', ['-xzf', path.join(release.releaseOut, 'harness-runtime-1.0.6.tgz'), '-C', extractRoot]);

  const outsideCwd = path.join(workDir, 'outside');
  await mkdir(outsideCwd, { recursive: true });

  await assert.doesNotReject(async () => {
    await execFileAsync(
      process.execPath,
      [path.join(extractRoot, 'bin/harness'), 'doctor', '--check-only'],
      { cwd: outsideCwd }
    );
  });
});
