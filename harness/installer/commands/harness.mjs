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
import { mcpApprove } from './mcp-approve.mjs';
import { plugin } from './plugin.mjs';
import { workspaceLink } from './workspace-link.mjs';

const commands = {
  install,
  doctor,
  sync,
  status,
  fetch: fetchCommand,
  update: updateCommand,
  verify,
  checkpoint: checkpointCommand,
  'checkpoint-push': checkpointPushCommand,
  summary,
  'active-summary': activeSummary,
  record,
  'mcp-approve': mcpApprove,
  plugin,
  'cloud-bootstrap': cloudBootstrap,
  'link-personal': linkPersonal,
  'worktree-name': worktreeName,
  'worktree-preflight': worktreePreflight,
  'adopt-global': adoptGlobal,
  'adoption-status': adoptionStatus,
  'workspace-link': workspaceLink
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
    '  summary  Print structured session summary for the active task',
    '  active-summary  Print lifecycle summary for all tasks under planning/active',
    '  record   Append a timestamped record block to task_plan, findings, progress, or reconciliation',
    '  mcp-approve  Sign a write plan out-of-band for MCP apply operations',
    '  plugin  Inspect and plan plugin adoption',
    '  checkpoint  Create a safety checkpoint',
    '  checkpoint-push  Verify, record review evidence, commit, and push a recovery branch',
    '  cloud-bootstrap  Generate safety bootstrap files for cloud workspaces',
    '  link-personal    Link personal user-managed config into the global install',
    '  adopt-global     Apply the current repo baseline to the user-global install',
    '  adoption-status  Report user-global adoption drift and health',
    '  workspace-link  Link the current leaf workspace back to an authority root',
    '  worktree-name  Suggest a canonical worktree label and branch name for the active task',
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
