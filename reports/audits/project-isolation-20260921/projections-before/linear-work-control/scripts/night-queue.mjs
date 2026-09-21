#!/usr/bin/env node
import { selectNightIssue } from '../lib/night-queue.mjs';

const help = `Usage: node harness/core/skills/linear-work-control/scripts/night-queue.mjs < snapshot.json
Read JSON from stdin and emit JSON with at most one nextIssueId (or null), reason,
skipped [{id,reason}], remainingIssueIds, attemptsUsed and elapsedMs.
Exit 0: valid selection/stop; 1: invalid input; 2: invalid CLI arguments.

Required snapshot:
{"startedAt":"2026-09-19T01:00:00Z","now":"2026-09-19T01:01:00Z",
 "attemptedIssueIds":[],"context":{"workspace":"swf","team":"SUP","project":"workbench"},
 "candidates":[{"id":"SUP-24","workspace":"swf","team":"SUP","project":"workbench",
 "state":"ready","labels":["swf-managed","agent-ready","nightly"],
 "authorized":true,"readiness":true,"blockedBy":[],"priority":2,"updatedAt":"2026-09-19T00:00:00Z"}]}

All timestamps must be UTC ISO YYYY-MM-DDTHH:mm:ss[.sss]Z.
Use stable exact IDs/refs consistently for workspace/team/project and issues.
Canonical states: planned, ready, running, waiting_human, blocked, review,
failed, done, canceled. blockedBy is required: [] means confirmed no dependencies;
otherwise [{"id":"SUP-23","state":"done"}]. Only actual Done maps to done;
unknown relation status maps to unknown and is ineligible. Missing/malformed
relation data rejects the snapshot. authorized and readiness are explicit Booleans.
Authorization must cover the intended slice; labels alone do not grant it.
Priority order: 1,2,3,4,0; then oldest updatedAt, then codepoint ID ascending.
Malformed candidates or duplicate IDs reject the entire snapshot.

Caller retains startedAt for the ENTIRE run across bindings/scopes and supplies
fresh now, candidates and dependency states each call. Append nextIssueId to
attemptedIssueIds BEFORE execution; include failed/blocked attempts and attempts
in other scopes. Stop at 3 attempts or 45 minutes elapsed (inclusive).
remainingIssueIds lists eligible unselected work, including at a budget stop;
skipped explains other candidates. Invalid input returns no selection.
This tool neither executes nor claims issues, writes Linear, persists history,
schedules work, nor provides a distributed lock. Caller owns serial execution,
history integrity, clock progression and runtime deadline enforcement.
`;

const args = process.argv.slice(2);
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write(help);
} else if (args.length) {
  emit({ ok: false, nextIssueId: null, reason: 'invalid-input', error: 'Use --help or JSON stdin' });
  process.exitCode = 2;
} else {
  try {
    let text = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) text += chunk;
    const result = selectNightIssue(JSON.parse(text));
    emit(result);
    if (!result.ok) process.exitCode = 1;
  } catch {
    emit({ ok: false, nextIssueId: null, reason: 'invalid-input', error: 'Cannot read valid JSON snapshot', skipped: [], remainingIssueIds: [] });
    process.exitCode = 1;
  }
}
