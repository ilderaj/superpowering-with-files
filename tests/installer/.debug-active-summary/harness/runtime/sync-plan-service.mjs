import os from 'node:os';
import { readState } from '../installer/lib/state.mjs';
import { computeSyncPlanReport } from '../installer/commands/sync.mjs';
import { resolveHarnessRoot } from './root-policy.mjs';

export async function getSyncDryRun(input = {}) {
  const resolved = await resolveHarnessRoot(input.root, input);
  const state = await readState(resolved.rootDir);
  const report = await computeSyncPlanReport({
    rootDir: resolved.rootDir,
    homeDir: input.homeDir ?? os.homedir(),
    state
  });

  return {
    rootDir: resolved.rootDir,
    targets: report.plan.targets,
    summary: report.summary,
    diff: report.diff
  };
}
