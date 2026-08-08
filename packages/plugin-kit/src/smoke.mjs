import { execFile } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildAll } from './build-all.mjs';
import { validateBuiltPlugin } from './preflight.mjs';

const execFileAsync = promisify(execFile);

export async function smokeReleaseArtifacts({ version, rootDir = process.cwd() } = {}) {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-smoke-'));
  const release = await buildAll({
    version,
    release: true,
    outDir: path.join(workDir, 'release'),
    rootDir
  });

  const errors = [];
  const plugins = [];

  for (const artifact of release.artifacts) {
    const extractRoot = path.join(workDir, 'extract', artifact.target);
    await mkdir(extractRoot, { recursive: true });
    await execFileAsync('tar', ['-xzf', artifact.path, '-C', extractRoot]);

    if (artifact.type === 'plugin') {
      const result = await validateBuiltPlugin({ target: artifact.target, pluginRoot: extractRoot });
      result.ok = result.errors.length === 0;
      plugins.push(result);
      errors.push(...result.errors);
      continue;
    }

  }

  return {
    ok: errors.length === 0,
    releaseOut: release.releaseOut,
    plugins,
    errors
  };
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isMainModule()) {
  const result = await smokeReleaseArtifacts();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
