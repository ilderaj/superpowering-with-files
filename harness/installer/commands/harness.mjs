#!/usr/bin/env node
import { install } from './install.mjs';
import { doctor } from './doctor.mjs';
import { sync } from './sync.mjs';
import { status } from './status.mjs';
import { fetchCommand } from './fetch.mjs';
import { updateCommand } from './update.mjs';
import { verify } from './verify.mjs';
import { worktreePreflight } from './worktree-preflight.mjs';
import { adoptGlobal } from './adopt-global.mjs';
import { adoptionStatus } from './adoption-status.mjs';

const commands = {
  install,
  doctor,
  sync,
  status,
  fetch: fetchCommand,
  update: updateCommand,
  verify,
  'worktree-preflight': worktreePreflight,
  'adopt-global': adoptGlobal,
  'adoption-status': adoptionStatus
};

function usage() {
  return [
    'Usage: ./scripts/harness <command>',
    '',
    'Commands:',
    '  install  Configure Harness projections',
    '  doctor   Check Harness installation health',
    '  sync     Reproject core into installed targets',
    '  status   Show local Harness state',
    '  fetch    Fetch upstream candidates',
    '  update   Apply fetched upstream candidates',
    '  verify   Print or write verification reports',
    '  adopt-global     Apply the current repo baseline to the user-global install',
    '  adoption-status  Report user-global adoption drift and health',
    '  worktree-preflight  Recommend an explicit base before creating a Git worktree'
  ].join('\n');
}

const [commandName, ...args] = process.argv.slice(2);

if (!commandName || commandName === '--help' || commandName === '-h') {
  console.log(usage());
  process.exit(0);
}

const command = commands[commandName];
if (!command) {
  console.error(`Unknown command: ${commandName}`);
  console.error(usage());
  process.exit(1);
}

try {
  await command(args);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
