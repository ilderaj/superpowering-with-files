import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { readHarnessHealth } from '../lib/health.mjs';
import { listHookEvidenceRows } from '../lib/hook-evidence-summary.mjs';
import {
  assertProductionRuntimeSelector,
  parseTrioCommandOptions,
  probeInstallerState,
  readState,
  resolveTrioFixture,
  resolveTrioProductionEnvironment,
  selectInstallerRuntime
} from '../lib/state.mjs';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import { assertTrioProjectionInSync, prepareTrioProjection } from './sync.mjs';

const HOME_PATH_PATTERNS = [
  /(?:^|[^A-Za-z0-9])\/Users\/[^/\n\r]+\/(?:[^ \n\r\t"'`<>]|$)/,
  /(?:^|[^A-Za-z0-9])\/home\/[^/\n\r]+\/(?:[^ \n\r\t"'`<>]|$)/,
  /(?:^|[^A-Za-z0-9])C:\\Users\\[^\\\n\r]+\\(?:[^ \n\r\t"'`<>]|$)/i
];

function containsHomePath(text) {
  return HOME_PATH_PATTERNS.some((pattern) => pattern.test(text));
}

function renderSafetySection(safety) {
  if (!safety?.enabled) {
    return '';
  }

  const lines = ['Safety checks:', `- profile: ${safety.profile}`];
  for (const check of safety.checks ?? []) {
    lines.push(`- ${check.name}: ${check.status}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderHookPayloadSection(health) {
  const hooks = health.context?.hooks ?? [];
  const lines = [
    `Hook payload verdict: ${health.context?.summary?.hooks?.verdict ?? 'unknown'}`,
    `Hook payload target: ${health.context?.summary?.hooks?.target ?? 'none'}`,
    'Hook payload detail:'
  ];

  if (hooks.length === 0) {
    lines.push('- none');
  } else {
    for (const hook of hooks) {
      lines.push(
        `- ${hook.target} / ${hook.category ?? 'other'} / ${hook.status ?? 'unknown'} / ${hook.measurement?.approxTokens ?? 0} tokens`
      );
    }
  }

  lines.push(`Scope overlap verdict: ${health.scopeOverlap?.verdict ?? 'ok'}`);
  lines.push(`Scope overlap detail: ${health.scopeOverlap?.details?.length ? health.scopeOverlap.details.join('; ') : 'None.'}`);
  if (health.scopeOverlap?.recommendedAction) {
    lines.push(`Recommended action: ${health.scopeOverlap.recommendedAction}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderHookEvidenceSection(health) {
  const rows = listHookEvidenceRows(health);
  const lines = ['Hook evidence:'];

  if (rows.length === 0) {
    lines.push('- none');
  } else {
    for (const row of rows) {
      lines.push(
        `- ${row.target} / ${row.parentSkillName}: config=${row.config}, payload=${row.payload}, runtime=${row.runtime}`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function renderBudgetLedgerSection(health) {
  const ledger = health.context?.ledger;
  const lines = [
    'Budget ledger:',
    `- install: scope=${ledger?.scope ?? 'unknown'}, projection=${ledger?.projectionMode ?? 'unknown'}, deployment=${ledger?.deploymentProfile ?? 'unknown'}, hooks=${ledger?.hookMode ?? 'unknown'}, policy=${ledger?.policyProfile ?? 'unknown'}, overlay=${ledger?.workspacePolicyOverlay ?? 'none'}, skills=${ledger?.skillProfile ?? 'unknown'}`
  ];

  for (const target of ledger?.targets ?? []) {
    if (target.budgetPolicy?.sessionPolicy) {
      lines.push(`- ${target.target} policy: ${target.budgetPolicy.sessionPolicy}`);
    }
    lines.push(
      `- ${target.target} session: entry=${target.session?.entry?.approxTokens ?? 0}, skillDiscovery=${target.session?.skillDiscovery?.approxTokens ?? 0}, skillBody=${target.session?.skillBody?.approxTokens ?? 0}, skillSource=${target.session?.skillSource?.approxTokens ?? 0}, planning=${target.session?.planningHotContext?.approxTokens ?? 0} tokens`
    );
    lines.push(
      `- ${target.target} turn: hooks=${target.turn?.hookPayload?.approxTokens ?? 0}, planning=${target.turn?.planningHotContext?.approxTokens ?? 0} tokens`
    );
  }

  return `${lines.join('\n')}\n`;
}

function renderedScopeOverlapWarnings(health) {
  return new Set(
    (health.scopeOverlap?.overlaps ?? []).map((overlap) => {
      const recommendedAction = overlap.recommendedAction ?? health.scopeOverlap?.recommendedAction;
      return recommendedAction
        ? `scope overlap ${overlap.target}: ${overlap.message} Recommended action: ${recommendedAction}`
        : `scope overlap ${overlap.target}: ${overlap.message}`;
    })
  );
}

function usage() {
  return [
    'Usage: ./scripts/harness doctor [--check-only]',
    '',
    'Options:',
    '  --check-only  Check the current installation without mutation',
    '  --help, -h    Show this help message'
  ].join('\n');
}

function hasFixtureRootArgument(args) {
  return args.some((argument) => argument === '--fixture-root' || (
    typeof argument === 'string' && argument.startsWith('--fixture-root=')
  ));
}

function fixtureRuntimeRequired() {
  if (selectInstallerRuntime() !== 'trio') {
    const error = new Error('Trio --fixture-root requires SWF_RUNTIME=trio.');
    error.code = 'ERR_TRIO_RUNTIME_SELECTOR';
    throw error;
  }
}

async function doctorTrioEnvironment({ environment, config, checkOnly }) {
  const prepared = await prepareTrioProjection({ environment, config });
  await assertTrioProjectionInSync(prepared, environment);
  const report = {
    schemaVersion: 2,
    runtime: 'trio',
    readable: true,
    descriptorCount: prepared.descriptors.length,
    conflicts: prepared.conflicts,
    mode: checkOnly ? 'check-only' : 'doctor'
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function doctorTrio(args) {
  const options = parseTrioCommandOptions(args, {
    values: ['fixture-root', 'home-dir'],
    flags: ['check-only']
  });
  if (!Object.hasOwn(options, 'fixture-root')) {
    const error = new Error('Trio doctor requires an explicit --fixture-root.');
    error.code = 'ERR_TRIO_FIXTURE';
    throw error;
  }
  const fixture = await resolveTrioFixture({
    fixtureRoot: options['fixture-root'],
    homeDir: options['home-dir']
  });
  const config = await readState(fixture.fixtureRoot);
  if (config.schemaVersion !== 2 || config.runtime !== 'trio') {
    const error = new Error('Trio doctor requires a schema-v2 Trio state.');
    error.code = 'ERR_TRIO_STATE';
    throw error;
  }
  return doctorTrioEnvironment({
    environment: fixture,
    config,
    checkOnly: options['check-only']
  });
}

async function doctorLegacy(args, options, rootDir) {
  const checkOnly = args.includes('--check-only');
  const health = await readHarnessHealth(rootDir, options.homeDir ?? os.homedir());
  const problems = [];
  const warnings = [...health.warnings];

  problems.push(...health.problems);

  for (const [target, targetHealth] of Object.entries(health.targets)) {
    for (const entry of targetHealth.entries) {
      const text = await readFile(entry.path, 'utf8').catch(() => '');
      if (containsHomePath(text)) {
        problems.push(`${target}: personal path found in ${entry.path}`);
      }
    }
  }

  if (health.context?.warnings?.length) {
    warnings.push(...health.context.warnings);
  }

  const uniqueProblems = [...new Set(problems)];
  const uniqueWarnings = warnings.filter((warning, index) => {
    return !uniqueProblems.includes(warning) && warnings.indexOf(warning) === index;
  });
  const scopeOverlapWarnings = renderedScopeOverlapWarnings(health);
  const renderedWarnings = uniqueWarnings.filter((warning) => !scopeOverlapWarnings.has(warning));

  if (renderedWarnings.length) {
    console.error(renderedWarnings.join('\n'));
  }

  if (uniqueProblems.length) {
    const safetySection = renderSafetySection(health.safety);
    if (safetySection) {
      console.log(safetySection);
    }
    console.log(renderHookPayloadSection(health));
    console.log(renderHookEvidenceSection(health));
    console.log(renderBudgetLedgerSection(health));
    console.error(uniqueProblems.join('\n'));
    process.exitCode = 1;
    return;
  }

  const safetySection = renderSafetySection(health.safety);
  if (safetySection) {
    console.log(safetySection);
  }
  console.log(renderHookPayloadSection(health));
  console.log(renderHookEvidenceSection(health));
  console.log(renderBudgetLedgerSection(health));
  console.log(checkOnly ? 'Harness check passed.' : 'Harness installation is healthy.');
}

export async function doctor(args = [], options = {}) {
  if (hasFixtureRootArgument(args)) {
    fixtureRuntimeRequired();
    if (args.includes('--help') || args.includes('-h')) {
      console.log(usage());
      return;
    }
    return doctorTrio(args);
  }

  assertProductionRuntimeSelector();
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }

  const rootDir = options.rootDir ?? (await discoverAuthorityRoot(process.cwd())).rootDir;
  const probe = await probeInstallerState(rootDir);
  if (probe.kind === 'absent') {
    const error = new Error('Trio doctor requires an installed schema-v2 state.');
    error.code = 'ERR_TRIO_STATE';
    throw error;
  }
  if (probe.kind === 'v2') {
    const environment = await resolveTrioProductionEnvironment({
      rootDir,
      homeDir: options.homeDir
    });
    return doctorTrioEnvironment({
      environment,
      config: probe.state,
      checkOnly: args.includes('--check-only')
    });
  }
  const error = new Error('Persisted schema-v1 state requires install --upgrade with recovery evidence.');
  error.code = 'ERR_TRIO_UPGRADE_REQUIRED';
  throw error;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await doctor(process.argv.slice(2));
}
