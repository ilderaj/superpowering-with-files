import os from 'node:os';
import { loadPlatforms, normalizeScope, normalizeTargets } from '../lib/metadata.mjs';
import { resolveTargetPaths } from '../lib/paths.mjs';
import { writeState } from '../lib/state.mjs';

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

export async function install(args = []) {
  const rootDir = process.cwd();
  const metadata = await loadPlatforms(rootDir);
  const scope = normalizeScope(readOption(args, 'scope', metadata.defaultScope));
  const projectionMode = readOption(args, 'projection', 'link');
  const hookMode = readOption(args, 'hooks', 'off');
  const targetArg = readOption(args, 'targets', 'all');
  const targets = normalizeTargets(metadata, targetArg.split(',').filter(Boolean));

  if (!['link', 'portable'].includes(projectionMode)) {
    throw new Error(`Invalid projection mode: ${projectionMode}`);
  }

  if (!['off', 'on'].includes(hookMode)) {
    throw new Error(`Invalid hooks mode: ${hookMode}`);
  }

  const state = {
    schemaVersion: 1,
    scope,
    projectionMode,
    hookMode,
    targets: {},
    upstream: {}
  };

  for (const target of targets) {
    state.targets[target] = {
      enabled: true,
      paths: resolveTargetPaths(rootDir, os.homedir(), scope, target)
    };
  }

  await writeState(rootDir, state);
  console.log(`Installed Harness state for ${targets.join(', ')} using ${scope} scope.`);
}
