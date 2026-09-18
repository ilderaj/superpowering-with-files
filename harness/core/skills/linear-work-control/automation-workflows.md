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
Run one nightly local execution pass for this repository. Read harness/core/skills/linear-work-control/SKILL.md and reference.md first, then resolve the Linear binding for the task you are about to work on.

1. Verified preflight: read the authenticated Linear workspace and run the guard helper. If it does not return ok, make no Linear write, record the mismatch in local task files, and stop.
2. Select at most one ready task: swf-managed + agent-ready + nightly, in the bound project, ordered by priority then updated time. Exclude waiting-human, blocked, ready-review, and anything already running. Use linear_list_issues with the label and state filters when the binding exists.
3. Read the task's local files before acting (planning/active/<task-id>/). If nothing is ready, publish a no-op checkpoint and finish.
4. Work the task locally with the normal SWF governance for this repository. Update local worklog, state, validation, and blockers as you go.
5. Publish one checkpoint to the bound issue: state, progress, completed just now, happening now, next, human action required, latest validation. Update the stored status comment in place.
6. If the task needs a human decision, write the local blocker, publish the structured blocker, move the issue to waiting-human, and continue with the next independent ready task instead of stopping the whole run.
7. If the task fails technically, record the failure locally, set agent-failed with the reason, and continue with the next independent safe task.
8. Only mark Done when the completion gate returns DONE ALLOWED.
9. Finish by publishing one overnight summary for the human: completed, ready for review, needs a decision, failed, still running, skipped, next work.

Constraints: one task at a time, no parallel edits to this repository, never write to a workspace that is not the bound workspace, never invent completion, and keep every published surface short enough to read in a minute.
```

## Morning Handoff

Create a cron automation that runs before the human's working day starts. Prompt:

```text
Produce the morning handoff for this repository. Read harness/core/skills/linear-work-control/SKILL.md and reference.md first, then run the guard helper; if it does not return ok, make no Linear write and report the mismatch locally instead.

1. Read the bound project's issues with labels waiting-human, blocked, ready-review, agent-failed and agent-running, plus Done issues updated in the last 24 hours. Use linear_list_issues with the label, state, and updatedAt filters when the binding exists.
2. Read the bound goal issue's latest checkpoint and overnight summary comments with linear_list_comments.
3. Reconcile them with the local task files so the handoff reflects local truth, not Linear alone.
4. Publish one morning summary comment grouped as: completed, ready for review, needs a decision, failed, still running, skipped, next work. Each line names the issue and the single action the human must take, if any.
5. Leave every waiting-human and blocked issue in place for the human. Do not resolve decisions yourself.
6. Record the run in the local task files, including what the run did not cover.

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

## Verification boundary

A created automation is a Host-side object, not proof that a run happened. There is no supported "run this automation now" entry point, so the first verification pass is a prompt-equivalent manual run whose evidence is recorded exactly like a scheduled run, plus the automation configuration snapshot. Keep the distinction visible: configured, triggered, and observed are three different claims.
