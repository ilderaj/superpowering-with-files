import os from 'node:os';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import {
  diffProjectionManifest,
  readProjectionManifest
} from '../lib/projection-manifest.mjs';
import {
  readState
} from '../lib/state.mjs';
import {
  buildSyncPlan,
  collectSyncOperations,
  formatDiff,
  includeRetiredProjectionDiff
} from '../lib/sync-plan.mjs';
import { applySyncPlan } from '../lib/sync-apply.mjs';
import { renderSyncReport } from '../lib/sync-report.mjs';

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function usage() {
  return [
    'Usage: ./scripts/harness sync [--conflict=reject|backup] [--dry-run] [--check] [--takeover]',
    '',
    'Options:',
    '  --conflict=reject|backup  Refuse or back up non-Harness-owned paths before writing',
    '  --dry-run                 Print the desired projection diff without writing files',
    '  --check                   Exit non-zero when sync would make changes',
    '  --takeover                Treat desired projection targets as Harness-owned for this run',
    '  --help, -h                Show this help message'
  ].join('\n');
}

export async function planSyncOperations({ rootDir, homeDir, state }) {
  return collectSyncOperations({ rootDir, homeDir, state });
}

async function computeBaseSyncPlanReport({
  rootDir,
  homeDir,
  state
}) {
  const effectiveHomeDir = homeDir ?? os.homedir();
  const effectiveState = state ?? (await readState(rootDir));
  const currentManifest = await readProjectionManifest(rootDir);
  const plan = await planSyncOperations({ rootDir, homeDir: effectiveHomeDir, state: effectiveState });
  const diff = includeRetiredProjectionDiff(
    diffProjectionManifest(currentManifest, plan.manifest),
    plan.retiredProjections
  );
  return {
    state: effectiveState,
    currentManifest,
    plan,
    diff,
    summary: formatDiff(diff)
  };
}

export async function computeSyncPlanReport({ rootDir, homeDir, state }) {
  const baseReport = await computeBaseSyncPlanReport({ rootDir, homeDir, state });
  return renderSyncReport(baseReport, {
    mode: 'plan',
    warnings: [],
    details: {
      projections: baseReport.plan?.targets ?? [],
      hooks: [...new Set(baseReport.plan?.hookWrites?.map((entry) => entry.parentSkillName).filter(Boolean) ?? [])]
    }
  });
}

export async function sync(args = [], options = {}) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const rootDir = options.rootDir ?? (await discoverAuthorityRoot(process.cwd())).rootDir;
  const homeDir = options.homeDir ?? os.homedir();
  const state = options.state ?? (await readState(rootDir));
  const conflictMode = readOption(args, 'conflict', 'reject');
  const dryRun = hasFlag(args, '--dry-run');
  const check = hasFlag(args, '--check');
  const takeover = hasFlag(args, '--takeover');
  if (!['reject', 'backup'].includes(conflictMode)) {
    throw new Error(`Invalid conflict mode: ${conflictMode}`);
  }

  const currentManifest = await readProjectionManifest(rootDir);
  const plan = await buildSyncPlan(args, {
    rootDir,
    homeDir,
    state,
    findRetiredProjections: options.findRetiredProjections
  });
  const diff = includeRetiredProjectionDiff(
    diffProjectionManifest(currentManifest, plan.desiredManifest),
    plan.executionPlan.retiredProjections
  );
  const summary = formatDiff(diff);

  if (dryRun || check) {
    console.log(JSON.stringify(renderSyncReport(
      {
        mode: check ? 'check' : 'dry-run',
        targets: plan.executionPlan.targets,
        summary,
        diff
      },
      {
        mode: check ? 'check' : 'dry-run',
        warnings: plan.report.warnings,
        details: plan.report.details
      }
    ), null, 2));
    if (check && (summary.create > 0 || summary.update > 0 || summary.stale > 0)) {
      throw new Error('Harness sync check failed: projections are out of sync.');
    }
    return;
  }

  await applySyncPlan(plan, {
    rootDir,
    homeDir,
    state,
    currentManifest,
    conflictMode,
    takeover,
    findRetiredProjections: options.findRetiredProjections
  });
  console.log(
    `Synced ${plan.executionPlan.targets.length} target(s): ${plan.executionPlan.targets.join(', ')} (create=${summary.create}, update=${summary.update}, stale=${summary.stale})`
  );
}
