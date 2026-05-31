import os from 'node:os';
import { computeAdoptionStatus } from '../lib/adoption.mjs';

const SUPPORTED_TARGETS = ['codex', 'claude-code', 'cursor', 'copilot'];

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function optionValue(args, name, fallback = undefined) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function usage() {
  return [
    'Usage: ./scripts/harness plugin <doctor|migrate>',
    '',
    'Inspect and plan plugin adoption without replacing existing global Harness projections.',
    '',
    'Commands:',
    '  doctor                 Print plugin adoption readiness as JSON',
    '  migrate --dry-run      Print a target cutover plan; apply mode is intentionally not implemented yet',
    '',
    'Options:',
    '  --target=<name>        One of: codex, claude-code, cursor, copilot',
    '  --dry-run              Required for migrate',
    '  --help, -h             Show this help message'
  ].join('\n');
}

export async function plugin(args = []) {
  const [subcommand, ...rest] = args;
  if (!subcommand || hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  if (subcommand === 'doctor') {
    await pluginDoctor(rest);
    return;
  }

  if (subcommand === 'migrate') {
    await pluginMigrate(rest);
    return;
  }

  throw new Error(`Unknown plugin subcommand: ${subcommand}`);
}

async function pluginDoctor() {
  const adoption = await computeAdoptionStatus(process.cwd(), os.homedir()).catch((error) => ({
    error: error instanceof Error ? error.message : String(error)
  }));

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        command: 'plugin doctor',
        supportedTargets: SUPPORTED_TARGETS,
        globalAdoption: {
          availableAsMigrationSeed: true,
          status: adoption
        },
        migration: {
          recommendedMode: 'shadow-install-then-cutover',
          destructiveCleanup: false
        }
      },
      null,
      2
    )
  );
}

async function pluginMigrate(args) {
  if (!hasFlag(args, '--dry-run')) {
    throw new Error('plugin migrate currently supports --dry-run only.');
  }

  const target = optionValue(args, '--target', 'codex');
  if (!SUPPORTED_TARGETS.includes(target)) {
    throw new Error(`Unsupported plugin migration target: ${target}`);
  }

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        command: 'plugin migrate',
        target,
        dryRun: true,
        steps: [
          {
            id: 'capture-baseline',
            description: 'Record current global projections, hooks, MCP config, and Harness state.'
          },
          {
            id: 'install-plugin-shadow',
            description: 'Install the target plugin while keeping existing global Harness files as fallback.'
          },
          {
            id: 'dual-run',
            description: 'Compare plugin skills, hooks, MCP tools, and doctor evidence against global adoption.'
          },
          {
            id: 'cutover',
            description: 'Move one target at a time to plugin-first behavior after doctor passes.'
          },
          {
            id: 'cleanup',
            description: 'Only after user confirmation, remove or downgrade obsolete global projections.'
          }
        ]
      },
      null,
      2
    )
  );
}
