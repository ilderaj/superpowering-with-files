# Scheduled workflows (Night Executor and Morning Handoff)

The repository does not add a scheduler, daemon, or poller. These are Host-owned Codex automations whose prompts live outside the repository; this file is the version-controlled source for those prompts and for the setup steps.

## Prerequisites (local MVP)

- The Codex app is running and the machine is awake; an overnight window is a local condition, not a cloud guarantee.
- The repository is readable at its registered project root and the Linear connection is authenticated to the bound workspace.
- The binding exists and `validate-binding` passes; `guard` returns `ok` on the night the run executes.
- Concurrency stays at one: a night run must not edit the repository in parallel with itself or another session.

## Night Executor

Create a cron automation against the registered SWF project with the working directory set to the repository root. Prompt:

```text
Run a bounded serial nightly pass for this repository. Read harness/core/skills/linear-work-control/SKILL.md, reference.md, and the queue helper's --help. The Host owns scheduling; the helper selects work, not worker lifecycle.

1. Capture startedAt once at run entry and track attemptedIssueIds across every binding in this run; never reset startedAt or the attempt ledger when switching tasks or after recovery. Stop admission at 3 attempted slices or 45 minutes, whichever comes first. Check time between bounded steps; at the deadline save a recoverable checkpoint and stop further execution. This is a cooperative budget, not process preemption. A resumed run without its original budget evidence stops instead of receiving a new budget.
2. Discover task bindings only under this repository (reports/linear first, legacy planning bindings only when no preferred file exists). Read the authenticated workspace; validate bindings and run the workspace guard before writes. Query only their explicit team/project scopes, paginate, and deduplicate shared projects and issue UUIDs. Use the tool's `team` parameter, not `teamId`, for labels. Failed reads mean unknown coverage, not an empty queue.
3. Read candidate issues with swf-managed + agent-ready + nightly and read their blocking relations. Resolve each issue UUID to exactly one task binding (goal/taskMap/subIssues), verify team/project, restore its three files and bind-thread before work. Ambiguous or missing mapping is skipped with a reason. Exclude running, waiting-human, blocked, ready-review, failed, completed/canceled, revoked authorization, unresolved dependencies, and attempted issues. Verify local readiness and existing authorization; labels alone grant no permission.
4. Build the documented JSON snapshot (use the authenticated workspace UUID, team/project UUIDs, issue UUIDs consistently; normalize Linear statuses to canonical runtime states, and set blockedBy from fully read relation states, never from a guessed empty list) and run `node harness/core/skills/linear-work-control/scripts/night-queue.mjs < snapshot.json`. On invalid input stop; on a selection re-read that issue, dependencies, local scope and authorization. Rank by priority (1 first, 0 last), oldest updated time, then ID. Record the selected UUID in attemptedIssueIds before starting. Publish agent-running with In Progress before local execution, after writing the local checkpoint and passing the guard. If publishing the claim fails, skip execution and keep that UUID attempted. A status claim is not an atomic lock: use an available repository lock; if concurrent ownership is present or cannot be ruled out, defer conflicting writes. Preserve other sessions' edits.
5. Execute only the bounded authorized slice with the repository's governance. Update local evidence first, then its bound status comment and issue. Successful validation plus satisfied done-when and applicable acceptance allows the completion-gate; only DONE ALLOWED permits Done. An investigation whose acceptance permits sourced unknowns can finish without proving real onboarding readiness. Otherwise record the exact blocker or review gate. Remove agent-running and queue labels on terminal/review/blocked/failed outcomes; preserve unrelated labels. A time-budget checkpoint leaves a clearly resumable ready slice only if safe and still authorized.
6. Re-read the queue after every outcome, including success, blocker and failure. Continue with the next independent eligible slice within the SAME budget. Do not retry attempted issues this run. A dependency-complete successor may be promoted only after local readiness and recorded authorization for that exact slice pass; actual onboarding, costs and other human gates remain separate from local implementation. Unfinished or unknown prerequisites stay closed.
7. Finish with one concise summary: completed, review, needs a decision, failed, running, remaining and skipped (with reasons), coverage gaps, stop reason and next action. Distinguish this task's empty successors from the project's remaining queue. Reuse the bound status comment for task checkpoints; clearly identify any run/project summary. Stay quiet when the state is unchanged and non-actionable; notify on meaningful completion, failure or required human action. Preserve configured/triggered/observed distinctions.

Constraints: one task at a time, no parallel edits to this repository, no wrong-workspace writes, no inferred authorization, no completion from configuration alone. No new schedules or product onboarding beyond recorded authorization.
```

## Morning Handoff

Create a cron automation that runs before the human's working day starts. Prompt:

```text
Produce the morning handoff for this repository. Read harness/core/skills/linear-work-control/SKILL.md and reference.md first, then run the guard helper; if it does not return ok, make no Linear write and report the mismatch locally instead.

1. Read the bound project's issues with labels waiting-human, blocked, ready-review, agent-failed and agent-running, plus Done issues updated in the last 24 hours and the agent-ready + nightly queue (including remaining unattempted work). Use linear_list_issues with the label, state, and updatedAt filters when the binding exists.
2. Read the bound goal issue's latest checkpoint and overnight summary comments with linear_list_comments.
3. Reconcile them with the local task files so the handoff reflects local truth, not Linear alone.
4. Publish one morning summary comment grouped as: completed, ready for review, needs a decision, failed, still running, remaining, skipped, coverage gaps, next work. Each line names the issue and the single action the human must take, if any.
5. Leave every waiting-human and blocked issue in place for the human. Do not resolve decisions yourself.
6. Record the run in the local task files, including what the run did not cover. An unreadable binding or failed query is unavailable, not an empty queue. Distinguish per-task completion from project-wide remaining work. Stay quiet while unchanged and non-actionable; notify only on meaningful change, completion, failure, or required human action.

Constraints: read-mostly, no schedule invention, no bulk status changes, no rewriting history, and no claim that something was delivered when it was only validated locally.
```

## Creating the automations

Create them from the Codex app automation surface, or ask a session to create them with the automation tool. Required settings:

| Field | Value |
| --- | --- |
| kind | cron |
| target | the registered SWF project (not projectless) |
| cwd | the repository root |
| execution environment | local |
| status | paused at creation; activated only after the operator confirms the run time |
| run time | chosen by the operator — this protocol does not invent it (confirmed for this workspace: 01:30 and 07:30 Asia/Shanghai) |

The night run and the morning handoff must not share a minute, and neither may overlap the existing weekly repository review. After the first successful run, record the automation id, the resolved rrule, and the observed run evidence in the task's planning files.

## Installed state

| Workflow | id | kind | status | rrule | model | target | cwd |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Night Executor | `swf-night-executor` | cron | ACTIVE | `FREQ=DAILY;BYHOUR=1;BYMINUTE=30` | `opencode-go/deepseek-v4.1-flash` | registered SWF project | repository root |
| Morning Handoff | `swf-morning-handoff` | cron | ACTIVE | `FREQ=DAILY;BYHOUR=7;BYMINUTE=30` | `opencode-go/deepseek-v4.1-flash` | registered SWF project | repository root |

Both were created paused and were activated by the operator on 2026-09-18 (Asia/Shanghai), so the rrules above are operator-confirmed times rather than placeholders. Activation is a Host-side configuration change: it schedules the next occurrence but proves no run happened. Until a run is observed, describe these two as configured and scheduled, never as triggered or as having run.

The two `text` blocks above are the source prompts. The live copies live at `~/.codex/automations/<id>/automation.toml` and must stay identical; re-check after any edit:

```bash
python3 - <<'PY'
import tomllib, re, pathlib
doc = pathlib.Path('harness/core/skills/linear-work-control/automation-workflows.md').read_text()
blocks = [b.strip() for b in re.findall(r'```text\n(.*?)```', doc, re.S)]
for name, source in zip(('swf-night-executor', 'swf-morning-handoff'), blocks):
    live = tomllib.loads((pathlib.Path.home() / '.codex/automations' / name / 'automation.toml').read_text())['prompt']
    print(name, live.strip() == source)
PY
```

## Recovery limits

The queue helper is a deterministic admission check over a verified snapshot. It does not authenticate facts, enforce wall-clock preemption, or provide a cross-session lock. Until LMP-07 supplies repository locking, check ownership before edits and defer conflicting/unknown ownership. A future scheduled run remains pending evidence even after tests and a manual pass succeed.

## Verification boundary

A created automation is a Host-side object, not proof that a run happened. There is no supported "run this automation now" entry point, so the first verification pass is a prompt-equivalent manual run whose evidence is recorded exactly like a scheduled run, plus the automation configuration snapshot. Keep the distinction visible: configured, triggered, and observed are three different claims.
