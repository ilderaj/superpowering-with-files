import os from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readHarnessHealth } from '../lib/health.mjs';
import { summarizeHookEvidence } from '../lib/hook-evidence-summary.mjs';
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
    'Usage: ./scripts/harness verify [--output=stdout|<directory>]',
    '',
    'Options:',
    '  --output=stdout|<directory>  Print the report to stdout or write latest.{json,md} into a directory',
    '  --help, -h                   Show this help message'
  ].join('\n');
}

function renderHookPayloadDetailLines(hooks = []) {
  if (hooks.length === 0) {
    return ['Hook payload detail:', '- none'];
  }

  return [
    'Hook payload detail:',
    ...hooks.map((hook) => {
      return `- ${hook.target} / ${hook.category ?? 'other'} / ${hook.status ?? 'unknown'} / ${hook.measurement?.approxTokens ?? 0} tokens`;
    })
  ];
}

function renderScopeOverlapLines(scopeOverlap) {
  const lines = [
    `Scope overlap verdict: ${scopeOverlap?.verdict ?? 'ok'}`,
    `Scope overlap detail: ${scopeOverlap?.details?.length ? scopeOverlap.details.join('; ') : 'None.'}`
  ];

  if (scopeOverlap?.recommendedAction) {
    lines.push(`Recommended action: ${scopeOverlap.recommendedAction}`);
  }

  return lines;
}

function renderBudgetLedgerLines(ledger) {
  const lines = [
    'Budget ledger:',
    `- install: scope=${ledger?.scope ?? 'unknown'}, projection=${ledger?.projectionMode ?? 'unknown'}, hooks=${ledger?.hookMode ?? 'unknown'}, policy=${ledger?.policyProfile ?? 'unknown'}, skills=${ledger?.skillProfile ?? 'unknown'}`
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

  return lines;
}

function renderMarkdown(report) {
  const context = report.health?.context;
  const summary = context?.summary?.entries;
  const hookSummary = context?.summary?.hooks;
  const planningSummary = context?.summary?.planning;
  const skillProfileSummary = context?.summary?.skillProfiles;
  return [
    '# Harness Verification Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Scope: ${report.checks.scope}`,
    `Projection mode: ${report.checks.projectionMode}`,
    `Targets: ${report.checks.selectedTargets.join(', ') || 'none'}`,
    'Authoritative proof surface: .harness/verification',
    'Authoritative commands: npm run verify:all ; ./scripts/harness verify --output=.harness/verification',
    '',
    `Context entries: ${context?.entries?.length ?? 0}`,
    `Context entry verdict: ${summary?.verdict ?? 'unknown'}`,
    `Context entry target: ${summary?.target ?? 'none'}`,
    `Context entry size: ${summary?.chars ?? 0} chars, ${summary?.lines ?? 0} lines, ${summary?.approxTokens ?? 0} approx tokens (worst target session)`,
    `Hook payload verdict: ${hookSummary?.verdict ?? 'unknown'}`,
    `Hook payload target: ${hookSummary?.target ?? 'none'}`,
    `Hook payload size: ${hookSummary?.chars ?? 0} chars, ${hookSummary?.lines ?? 0} lines, ${hookSummary?.approxTokens ?? 0} approx tokens (worst target session)`,
    ...renderHookPayloadDetailLines(context?.hooks ?? []),
    ...renderScopeOverlapLines(report.health?.scopeOverlap),
    ...renderBudgetLedgerLines(context?.ledger),
    `Planning hot context verdict: ${planningSummary?.verdict ?? 'unknown'}`,
    `Planning hot context target: ${planningSummary?.target ?? 'none'}`,
    `Planning hot context size: ${planningSummary?.chars ?? 0} chars, ${planningSummary?.lines ?? 0} lines, ${planningSummary?.approxTokens ?? 0} approx tokens (worst target session)`,
    `Skill profile verdict: ${skillProfileSummary?.verdict ?? 'unknown'}`,
    `Skill profile target: ${skillProfileSummary?.target ?? 'none'}`,
    `Skill profile size: ${skillProfileSummary?.chars ?? 0} chars, ${skillProfileSummary?.lines ?? 0} lines, ${skillProfileSummary?.approxTokens ?? 0} approx tokens (worst target session)`,
    `Context warnings: ${context?.warnings?.length ?? 0}`
  ].join('\n') + '\n';
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

async function verifyTrioEnvironment({ environment, config }) {
  const prepared = await prepareTrioProjection({ environment, config });
  await assertTrioProjectionInSync(prepared, environment);
  const report = {
    schemaVersion: 2,
    runtime: 'trio',
    opened: true,
    rendered: false,
    descriptorCount: prepared.descriptors.length,
    conflicts: prepared.conflicts
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function verifyTrio(args) {
  const options = parseTrioCommandOptions(args, {
    values: ['fixture-root', 'home-dir', 'output']
  });
  if (!Object.hasOwn(options, 'fixture-root')) {
    const error = new Error('Trio verify requires an explicit --fixture-root.');
    error.code = 'ERR_TRIO_FIXTURE';
    throw error;
  }
  if (Object.hasOwn(options, 'output') && options.output !== 'stdout') {
    const error = new Error('Trio verify supports --output=stdout only.');
    error.code = 'ERR_TRIO_VERIFY_OUTPUT';
    throw error;
  }
  const fixture = await resolveTrioFixture({
    fixtureRoot: options['fixture-root'],
    homeDir: options['home-dir']
  });
  const config = await readState(fixture.fixtureRoot);
  if (config.schemaVersion !== 2 || config.runtime !== 'trio') {
    const error = new Error('Trio verify requires a schema-v2 Trio state.');
    error.code = 'ERR_TRIO_STATE';
    throw error;
  }
  return verifyTrioEnvironment({ environment: fixture, config });
}

function parseProductionVerifyOptions(args) {
  const options = parseTrioCommandOptions(args, { values: ['output'] });
  if (Object.hasOwn(options, 'output') && options.output !== 'stdout') {
    const error = new Error('Trio verify supports --output=stdout only.');
    error.code = 'ERR_TRIO_VERIFY_OUTPUT';
    throw error;
  }
  return options;
}

async function verifyLegacy(args, options, rootDir, state) {
  const health = await readHarnessHealth(rootDir, options.homeDir ?? os.homedir());
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    checks: {
      stateReadable: true,
      selectedTargets: Object.keys(state.targets),
      scope: state.scope,
      projectionMode: state.projectionMode
    },
    verification: {
      hookEvidence: summarizeHookEvidence(health)
    },
    health
  };

  const output = readOption(args, 'output', 'stdout');
  const markdown = renderMarkdown(report);

  if (output === 'stdout' || output === '-') {
    process.stdout.write(markdown);
    if (health.problems.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  const dir = path.isAbsolute(output) ? output : path.join(rootDir, output);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(dir, 'latest.md'), markdown);

  console.log(`Verification report written to ${path.relative(rootDir, path.join(dir, 'latest.md'))}`);
  if (health.problems.length > 0) {
    process.exitCode = 1;
  }
}

export async function verify(args = [], options = {}) {
  if (hasFixtureRootArgument(args)) {
    fixtureRuntimeRequired();
    if (hasFlag(args, '--help', '-h')) {
      console.log(usage());
      return;
    }
    return verifyTrio(args);
  }

  assertProductionRuntimeSelector();
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const rootDir = options.rootDir ?? (await discoverAuthorityRoot(process.cwd())).rootDir;
  const probe = await probeInstallerState(rootDir);
  if (probe.kind === 'absent') {
    const error = new Error('Trio verify requires an installed schema-v2 state.');
    error.code = 'ERR_TRIO_STATE';
    throw error;
  }
  if (probe.kind === 'v2') {
    parseProductionVerifyOptions(args);
    const environment = await resolveTrioProductionEnvironment({
      rootDir,
      homeDir: options.homeDir
    });
    return verifyTrioEnvironment({ environment, config: probe.state });
  }
  const error = new Error('Persisted schema-v1 state requires install --upgrade with recovery evidence.');
  error.code = 'ERR_TRIO_UPGRADE_REQUIRED';
  throw error;
}
