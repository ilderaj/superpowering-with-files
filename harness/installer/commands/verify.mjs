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
