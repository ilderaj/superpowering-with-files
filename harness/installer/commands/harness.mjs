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
  install,
  doctor,
  sync,
  fetch: fetchCommand,
  update: updateCommand,
  verify,
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
    '  install  Configure Harness projections',
    '  sync     Reproject core into installed targets',
    '  doctor   Check Harness installation health',
    '  trio     Inspect a Trio, plan its next action, or explicitly write its lifecycle',
    '  verify   Check projection sync and report structure to stdout',
    '  checkpoint  Create a safety checkpoint',
    '  token-audit  Print a weekly cross-session token audit'
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
