import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp } from 'node:fs/promises';
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
  let runtime = { ok: false };

  for (const artifact of release.artifacts) {
    const extractRoot = path.join(workDir, 'extract', artifact.target);
    await mkdir(extractRoot, { recursive: true });
    await execFileAsync('tar', ['-xzf', artifact.path, '-C', extractRoot]);

    if (artifact.type === 'plugin') {
      const result = await validateBuiltPlugin({ target: artifact.target, pluginRoot: extractRoot });
      const wrapper = await runNodeEntrypoint(path.join(extractRoot, 'mcp/harness-runtime.mjs'));
      if (!wrapper.ok) {
        result.errors.push(`MCP wrapper failed: ${wrapper.error}`);
      }
      result.ok = result.errors.length === 0;
      plugins.push(result);
      errors.push(...result.errors);
      continue;
    }

    if (artifact.type === 'runtime') {
      const runtimeErrors = [];
      for (const requiredFile of ['package.json', 'bin/harness', 'bin/harness-mcp-stdio.mjs', 'harness/mcp/stdio.mjs']) {
        if (!(await pathExists(path.join(extractRoot, requiredFile)))) {
          runtimeErrors.push(`Missing runtime file: ${requiredFile}`);
        }
      }
      const runtimeWrapper = await runNodeEntrypoint(path.join(extractRoot, 'bin/harness-mcp-stdio.mjs'));
      if (!runtimeWrapper.ok) {
        runtimeErrors.push(`Runtime MCP wrapper failed: ${runtimeWrapper.error}`);
      }
      runtime = { ok: runtimeErrors.length === 0, errors: runtimeErrors };
      errors.push(...runtimeErrors);
    }
  }

  return {
    ok: errors.length === 0,
    releaseOut: release.releaseOut,
    plugins,
    runtime,
    errors
  };
}

async function runNodeEntrypoint(entrypoint) {
  try {
    await execFileAsync(process.execPath, [entrypoint], { input: '', timeout: 1500 });
    return { ok: true };
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    if (error?.killed && !/ERR_MODULE_NOT_FOUND|Cannot find package|ENOENT/.test(stderr)) {
      return { ok: true, timedOut: true };
    }

    return {
      ok: false,
      error: stderr || (error instanceof Error ? error.message : String(error))
    };
  }
}

async function pathExists(candidatePath) {
  try {
    await access(candidatePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isMainModule()) {
  const result = await smokeReleaseArtifacts();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
