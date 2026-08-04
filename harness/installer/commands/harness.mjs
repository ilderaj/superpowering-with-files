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
import { checkpointCommand } from './checkpoint.mjs';
import { checkpointPushCommand } from './checkpoint-push.mjs';
import { cloudBootstrap } from './cloud-bootstrap.mjs';
import { linkPersonal } from './link-personal.mjs';
import { summary } from './summary.mjs';
import { record } from './record.mjs';
import { worktreeName } from './worktree-name.mjs';
import { activeSummary } from './active-summary.mjs';
import { lifecycleSweep } from './lifecycle-sweep.mjs';
import { mcpApprove } from './mcp-approve.mjs';
import { plugin } from './plugin.mjs';
import { workspaceLink } from './workspace-link.mjs';
import { tokenAudit } from './token-audit.mjs';
import { codexModelDefault } from './codex-model-default.mjs';
import { upstreamLockCommand } from './upstream-lock.mjs';
import { workspaceSkills } from './workspace-skills.mjs';
import { trioCommand } from './trio.mjs';

const commands = {
  install,
  doctor,
  sync,
  status,
  fetch: fetchCommand,
  'upstream-lock': upstreamLockCommand,
  update: updateCommand,
  verify,
  checkpoint: checkpointCommand,
  'checkpoint-push': checkpointPushCommand,
  summary,
  'active-summary': activeSummary,
  'lifecycle-sweep': lifecycleSweep,
  record,
  'mcp-approve': mcpApprove,
  plugin,
  'cloud-bootstrap': cloudBootstrap,
  'link-personal': linkPersonal,
  'worktree-name': worktreeName,
  'worktree-preflight': worktreePreflight,
  'adopt-global': adoptGlobal,
  'adoption-status': adoptionStatus,
  'workspace-link': workspaceLink,
  'token-audit': tokenAudit,
  'codex-model-default': codexModelDefault,
  'workspace-skills': workspaceSkills,
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
    '  trio     Read or plan the next Trio action without writing',
    '  verify   Print or write verification reports',
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
