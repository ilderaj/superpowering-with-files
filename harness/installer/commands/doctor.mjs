import {
  assertProductionRuntimeSelector,
  parseTrioCommandOptions,
  probeInstallerState,
  readState,
  resolveTrioFixture,
  resolveTrioProductionEnvironment,
  selectInstallerRuntime
} from '../lib/state.mjs';
import { discoverAuthorityRoot } from '../../trio/core/authority.mjs';
import { assertTrioProjectionInSync, prepareTrioProjection } from './sync.mjs';

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
