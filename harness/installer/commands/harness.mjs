#!/usr/bin/env node
import { install } from './install.mjs';
import { doctor } from './doctor.mjs';
import { sync } from './sync.mjs';
import { fetchCommand } from './fetch.mjs';
import { updateCommand } from './update.mjs';
import { verify } from './verify.mjs';
import { worktreePreflight } from './worktree-preflight.mjs';
import { checkpointCommand } from './checkpoint.mjs';
import { checkpointPushCommand } from './checkpoint-push.mjs';
import { workspaceLink } from './workspace-link.mjs';
import { tokenAudit } from './token-audit.mjs';
import { trioCommand } from './trio.mjs';

const commands = {
  fetch: fetchCommand,
  update: updateCommand,
  checkpoint: checkpointCommand,
  'checkpoint-push': checkpointPushCommand,
  'worktree-preflight': worktreePreflight,
  'workspace-link': workspaceLink,
  'token-audit': tokenAudit,
  trio: trioCommand
};

function usage() {
  return [
    'Usage: ./scripts/harness <command>',
    '',
    'Commands:',
  '  install  Use the managed Codex plugin installer (legacy projection retired)',
  '  sync     Use the managed Codex plugin update path (legacy projection retired)',
  '  legacy-projection install|sync|doctor|verify  Explicit compatibility path for old installations',
  '  doctor   Use plugin-native discovery for current Codex health',
    '  trio     Inspect a Trio, plan its next action, or explicitly write its lifecycle',
  '  verify   Use plugin verification for current Codex health',
    '  checkpoint  Create a safety checkpoint',
    '  token-audit  Print a weekly cross-session token audit'
  ].join('\n');
}

const [commandName, ...args] = process.argv.slice(2);

if (!commandName || commandName === '--help' || commandName === '-h') {
  console.log(usage());
  process.exit(0);
}

if (['install', 'sync', 'doctor', 'verify'].includes(commandName)) {
  console.error(`The old Harness ${commandName} projection is retired from the normal Codex path. Use the installed harness-codex-plugin; for an intentional old-installation recovery, run legacy-projection ${commandName} with the same options.`);
  process.exit(1);
}

let command = commands[commandName];
if (commandName === 'legacy-projection') {
  const [action, ...legacyArgs] = args;
  if (!['install', 'sync', 'doctor', 'verify'].includes(action)) {
    console.error('legacy-projection requires install, sync, doctor, or verify.');
    process.exit(1);
  }
  command = () => ({ install, sync, doctor, verify })[action](legacyArgs);
}
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
