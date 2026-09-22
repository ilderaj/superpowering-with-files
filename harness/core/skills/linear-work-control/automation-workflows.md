# Scheduled workflows (Night Executor, Night Executor Fallback, Morning Handoff)

The repository does not add a scheduler, daemon, or poller. These are Host-owned Codex automations whose prompts live outside the repository; this file is the version-controlled source for those prompts and for the setup steps.

## Prerequisites (local MVP)

- The Codex app is running and the machine is awake; an overnight window is a local condition, not a cloud guarantee.
- The repository is readable at its registered project root and the Linear connection is authenticated to the bound workspace.
- The binding exists and `validate-binding` passes; `guard` returns `ok` on the night the run executes.
- Concurrency stays at one: a night run must not edit the repository in parallel with itself or another session.

## Carrier model ladder

The night and morning workflows are this repository's execution and observation loop, so their carrier must survive a provider outage. Three layers carry it:

| Layer | Carrier | Covers |
| --- | --- | --- |
| L1 primary | `combo/DeepSeekCombo` — opencodex `strategy: failover`, `stickyLimit: 1`, targets `opencode-go/deepseek-v4.1-flash`, `command-code/deepseek/deepseek-v4.1-flash`, `deepseek/deepseek-flash` | one DeepSeek provider failing, rate-limiting, or being unreachable: the proxy moves to the next DeepSeek target inside the same run |
| L2 fallback | `command-code/gpt-5.6-luna` on `swf-night-executor-fallback` | the whole DeepSeek path failing, the primary run failing before its first model call, or the primary run closing its own 01:30 window with no terminal outcome |
| L3 report | the 07:30 Morning Handoff | the gap is reported as a coverage gap when this carrier can still run; it shares L1's carrier, so a total DeepSeek outage also suppresses the report |

L2 exists because prompt-level self-recovery cannot handle a failure that happens before the first model call. On 2026-09-21 the 01:30 run ended after 928s with `502 Bad Gateway: Provider unreachable: getaddrinfo ETIMEOUT opencode.ai`, with no claim and no checkpoint, so nothing inside the prompt could run. The fallback is a separate Host schedule pinned to an independent model path; it acts only when the primary pass did not complete, and a primary window that closes with no terminal outcome counts as not completed. Because L3 shares L1's carrier, a missing morning report is itself the signal, never a clean night.

Configured failover is not proven failover. This ladder records configured carriers. `provider actual identity` stays `unknown` without separate authentication, and a fallback activation counts as observed only when it actually runs.

Carrier independence has two dimensions, and a fallback must hold both: the upstream provider path and the accounting domain. L1 runs on third-party provider keys and never spends the ChatGPT account's Codex quota. A carrier bound to that account pool is gated by the plan quota, and an exhausted quota stops it before its first model call — precisely the failure the fallback exists to absorb. On 2026-09-22 the 03:00 fallback, then pinned to `main/gpt-5.6-luna`, failed after 6.3s with `usage_limit_exceeded` while the account's weekly window stood at 100%; the 01:30 primary had completed normally on `combo/DeepSeekCombo`, so that was a carrier gap, not a night gap. L2 therefore runs on `command-code/gpt-5.6-luna`: a different upstream and a different accounting domain from both L1 and the ChatGPT pool, with the same model and effort, so its capability expectation is unchanged. A carrier that cannot start is reported as unavailable, never as a night gap.

## Night Executor

Create a cron automation against the registered SWF project with the working directory set to the repository root. Prompt:

```text
Run a bounded serial nightly pass for this repository. Read harness/core/skills/linear-work-control/SKILL.md, reference.md, project-first.md, and the queue helper's --help. The Host owns scheduling; the helper selects work, not worker lifecycle.

Before queue selection, reconcile pending sync.lifecycle events from current-repository reports/linear bindings, including archived Trio paths, following lifecycle.md. Re-read local Current State and exact task identity; run lifecycle plan, workspace/root/target guards, then verify-receipt after MCP readback before acknowledgement. Do not execute a task with unresolved lifecycle debt. Never create replacement issues or archive shared Projects. This is recovery of explicit local lifecycle events, not bulk cleanup.

1. Capture startedAt once at run entry and track attemptedIssueIds across every binding in this run; never reset startedAt or the attempt ledger when switching scopes or tasks or after recovery. Run each mapped scope under this same budget: one global window, no fresh budget per scope. Stop admission at 3 attempted slices or 45 minutes, whichever comes first. Check time between bounded steps; at the deadline save a recoverable checkpoint and stop further execution. Record deadlineAt, actual finishedAt, any overrun and its reason; once the deadline is reached, do not select another slice. This is a cooperative budget, not process preemption. A resumed run without its original budget evidence stops instead of receiving a new budget. At run entry and each checkpoint, record the run/session identifier only when the Host provides it, the actual passed configuration's configured model and effort, Host-reported route and effort, provider actual identity, evidence source and time, and verification result. Compare against the actual passed configuration; do not hardcode an old route. Only trusted Host evidence bound to the current run can yield matched. A worker or model self-report, missing evidence, or evidence from another run remains unknown. Unknown model evidence permits existing authorized low-risk local work, with the evidence gap preserved; it is not model verification. A trusted route or effort mismatch is mismatch: stop the affected execution path and preserve its checkpoint.
2. Load .harness/linear/routing.json and follow project-first.md: shared Team is not the execution scope; each exact Project and registered Git family is. Normalize v1 maps losslessly and v2 task bindings explicitly; use resolve-product-binding for v2, not the v1-only resume-brief. Before every claim/write run the additional project-routing guard-target with fresh full issue and exact expected binding; include comment ownership for comment writes. Discover task bindings only under this repository (reports/linear first, legacy planning bindings only when no preferred file exists), including every mapped successor reachable from each binding. Read the authenticated workspace; validate bindings and run the workspace guard before writes. Query only their explicit team/project scopes, paginate, and deduplicate shared projects and issue UUIDs. Use the tool's `team` parameter, not `teamId`, for labels. Failed reads mean unknown coverage, not an empty queue. Before the first selection, apply the successor promotion checks in step 6 even when the labeled queue is empty; otherwise a predecessor accepted during the day can strand its successor overnight.
3. Read candidate issues with swf-managed + agent-ready + nightly and read their blocking relations. Resolve each issue UUID to exactly one task binding (goal/taskMap/subIssues or subIssueIds). Require the API-returned identifier and UUID to agree uniquely; never let a caller-supplied identifier or UUID select a different issue. A binding need not store a title: use the API title for display and human reconciliation only. If a cached title differs after a legitimate rename, refresh the issue and continue when identifier and UUID still agree. Verify team/project, restore its three files and bind-thread before work. When the task is mapped inside another task's binding, pass that discovered file explicitly via --binding to resume-brief; do not treat absence of a binding beside the child task as local-only. Ambiguous, duplicate, missing, or identifier/UUID-mismatched mappings are skipped with a reason. Exclude running, waiting-human, blocked, ready-review, failed, completed/canceled, revoked authorization, unresolved dependencies, and attempted issues. Verify local readiness and existing authorization; labels alone grant no permission.
4. Build the documented JSON snapshot once per discovered scope (same startedAt and global attemptedIssueIds in every call; use the authenticated workspace UUID, team/project UUIDs, issue UUIDs consistently; normalize Linear statuses to canonical runtime states, and set blockedBy from fully read relation states, never from a guessed empty list) and run `node harness/core/skills/linear-work-control/scripts/night-queue.mjs < snapshot.json` per scope. On invalid input stop; on a selection re-read that issue, dependencies, local scope and authorization. When several scopes have eligible work, compare the per-scope winning candidates by the same ranking - priority (1 first, 0 last), then oldest updatedAt, then ID - and work the best scope first. Record the selected UUID in attemptedIssueIds before starting. Publish agent-running with In Progress before local execution, after writing the local checkpoint and passing the guard. If publishing the claim fails, skip execution and keep that UUID attempted. A status claim is not an atomic lock: use an available repository lock; if concurrent ownership is present or cannot be ruled out, defer conflicting writes. If ownership is unknown, skip the conflicting write and continue with independent work; do not globally block the run. Preserve other sessions' edits.
5. Execute only the bounded authorized slice with the repository's governance. Before and after every result, append to the already-bound task's existing progress.md: startedAt, the full attemptedIssueIds list, current slice, promotion outcomes, and the model evidence fields above. Do not create a new state store. Update local evidence first, then its bound status comment and issue. Successful validation plus satisfied done-when and applicable acceptance allows the completion-gate; only DONE ALLOWED permits Done. An investigation whose acceptance permits sourced unknowns can finish without proving real onboarding readiness. Otherwise record the exact blocker or review gate. Remove agent-running and queue labels on terminal/review/blocked/failed outcomes; preserve unrelated labels. A time-budget checkpoint leaves a clearly resumable ready slice only if safe and still authorized: on a safe budget stop, return a claimed but unstarted slice to Todo and remove agent-running so the next run can reselect it. For an already-started partial slice, record remaining work and verification of the changed portion; return it to Todo + agent-ready + nightly only if that checkpoint is safe and authorized. Otherwise remove agent-running and report the precise failed/blocked condition. Partial progress never permits Done.
6. Re-read the queue after every outcome, including success, blocker and failure. Continue with the next independent eligible slice within the SAME budget. Do not retry attempted issues this run. Scan mapped successors again after each result and before promotion. Mapped successors become promotable once their real prerequisites are Done and readiness evidence passes, regardless of queue labels: after recorded authorization for that exact slice, set Todo + agent-ready + nightly without repeat permission. Record each promotion attempt and result in the existing progress.md. Dependencies and authorization stay separate; unmet or unknown prerequisites stay closed; actual onboarding, costs and other human gates remain outside the local implementation slice.
7. Finish with one concise summary: completed, review, needs a decision, failed, running, remaining and skipped (with reasons), coverage gaps, stop reason and next action. An empty scope is not an empty project: report each scope's queue separately and treat unavailable or unreadable scopes as unknown coverage. Publish the run/project summary on the binding's goalIssue.id, and reuse the bound status comment for task checkpoints. Stay quiet when the state is unchanged and non-actionable; notify on meaningful completion, failure or required human action. Preserve configured/triggered/observed distinctions.

Constraints: one task at a time, no parallel edits to this repository, no wrong-workspace writes, no inferred authorization, no completion from configuration alone. No new schedules or product onboarding beyond recorded authorization.
```

## Night Executor Fallback

Create a second cron automation against the registered SWF project, on an independent model path, that runs after the night run's budget has closed. Prompt:

```text
Act as the fallback carrier for this repository's night executor. Your model is an independent fallback path; the primary night pass runs on the DeepSeek combo. Do not duplicate work that already completed.

1. Determine whether tonight's (Asia/Shanghai) night run at 01:30 completed. Read the most recent Host session record for the swf-night-executor automation, and each bound task's progress.md entry whose startedAt falls inside tonight's window. A completed run has a startedAt checkpoint plus a terminal outcome (published summary, final checkpoint, or documented blocker). A failed run has no startedAt checkpoint, a Host turn that ended with an error before any tool action, or a startedAt checkpoint whose own 3-attempt / 45-minute window has closed with no terminal outcome; an entry checkpoint alone is not completion. A run is still running only while its own window is open, and your 03:00 start is already past tonight's 01:30 window. If tonight's run completed, or is still running, stop without any write and without a notification; report nothing.
2. If tonight's run failed before doing its work, or never started, execute the canonical Night Executor workflow in harness/core/skills/linear-work-control/automation-workflows.md in full, under its own rules: entry reconciliation, one global 3-attempt / 45-minute budget measured from your own start, workspace and target guards before every write, readback after every write, promotion only for mapped successors whose real prerequisites are Done and whose readiness evidence passes, and Done only through DONE ALLOWED. Do not reuse the primary run's 01:30 admission window. Do not retry an issue id that tonight's run already recorded as attempted with a terminal outcome.
3. Record the carrier explicitly. In the bound task's progress.md and in the published checkpoint, record carrier=fallback, the configured model and effort, Host-reported route and effort, provider actual identity (unknown unless separately authenticated), evidence source and time, and verification as matched, unknown, or mismatch. Never present the fallback as the primary night pass and never claim that the primary run succeeded.
4. Publish exactly one short summary on the binding's goalIssue.id when you acted, naming the reason the primary pass was replaced. When nothing needed doing, publish nothing.

Constraints: one task at a time, no parallel edits to this repository, no wrong-workspace writes, no inferred authorization, no completion from configuration alone, and no change to the primary night, morning, or any other automation.
```

## Morning Handoff

Create a cron automation that runs before the human's working day starts. Prompt:

```text
Produce the morning handoff for this repository. Read harness/core/skills/linear-work-control/SKILL.md, reference.md and project-first.md first, then run the guard helper; if it does not return ok, make no Linear write and report the mismatch locally instead.

Before summary, reconcile only explicit pending sync.lifecycle events using lifecycle.md, including archived task paths. Use fresh workspace/root/target guards and verified readback; preserve unrelated sync debt and all human gates. Report unresolved lifecycle debt and exclude it from executable work. This narrow reconciliation does not authorize unrelated status cleanup.

1. Load .harness/linear/routing.json and follow project-first.md. Normalize v1/v2 explicitly, discover all exact Project scopes, group the handoff by Project, and use project-routing guard-target before any write including comment ownership. Discover every binding under this repository and read each bound project's issues with labels waiting-human, blocked, ready-review, agent-failed and agent-running, plus Done issues updated in the last 24 hours and the agent-ready + nightly queue (including remaining unattempted work). Reconcile each issue by API identifier + UUID; show the current API title for human review, and refresh stale cached titles instead of rejecting a binding. Use linear_list_issues with the label, state, and updatedAt filters when the binding exists. A parent In Progress status is not evidence of an actually running child: report running only when the child has current agent-running evidence and a current checkpoint.
2. Read the bound goal issue's latest checkpoint and overnight summary comments with linear_list_comments.
3. Reconcile them with the local task files so the handoff reflects local truth, not Linear alone. For each observed run, report configured model and effort, Host-reported route and effort, provider actual identity, evidence source and time, and verification as matched, unknown, or mismatch. Only run-bound trusted Host evidence supports matched; preserve provider actual identity as unknown when it is not separately authenticated, and never upgrade evidence from a worker or model self-report. For heartbeat entries found in a bounded read-only inventory, report active or paused and whether a thread-resolved route is evidenced; unresolved heartbeat routing is unknown and requires no bulk modification.
4. Verify the fallback carrier itself. Read the most recent Host session record for the swf-night-executor-fallback automation for tonight's 03:00 run and classify it as ran, failed-before-first-model-call, or not-triggered; when it failed before its first model call, name the Host error code (for example usage_limit_exceeded) and the carrier's configured model. Report that as one coverage-gap line. A fallback that did not run is a carrier gap, not a night gap: only a primary run whose own 01:30 window closed with no terminal outcome is a night gap. Never present a missing fallback record as the primary pass having failed, and never infer that the night completed from it.
5. Publish one morning summary comment grouped as: completed, ready for review, needs a decision, failed, still running, remaining, skipped, coverage gaps, next work. Each line names the issue, the reason for its classification, the next action, and the owner. Include the shared budget's attempted count, deadline, actual finished time, overrun and reason when present. Distinguish expired/stale labels from a real human decision: a stale label is cleanup evidence, while a decision requires an explicit unresolved question or gate. Do not infer a human decision from a parent status or an old label.
6. Leave every waiting-human and blocked issue in place for the human. Do not resolve decisions yourself.
7. Record the run in the local task files, including what the run did not cover. An unreadable binding or failed query is unavailable, not an empty queue. Distinguish per-task completion from project-wide remaining work. Stay quiet while unchanged and non-actionable; notify only on meaningful change, completion, failure, or required human action.

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
| run time | chosen by the operator — this protocol does not invent it (confirmed for this workspace: 01:30 night, 03:00 fallback, 07:30 morning Asia/Shanghai) |

The night run and the morning handoff must not share a minute, and neither may overlap the existing weekly repository review. After the first successful run, record the automation id, the resolved rrule, and the observed run evidence in the task's planning files.

## Installed state

| Workflow | id | kind | status | rrule | model | target | cwd |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Night Executor | `swf-night-executor` | cron | ACTIVE | `FREQ=DAILY;BYHOUR=1;BYMINUTE=30` | `combo/DeepSeekCombo` | registered SWF project | repository root |
| Night Executor Fallback | `swf-night-executor-fallback` | cron | ACTIVE | `FREQ=DAILY;BYHOUR=3;BYMINUTE=0` | `command-code/gpt-5.6-luna` | registered SWF project | repository root |
| Morning Handoff | `swf-morning-handoff` | cron | ACTIVE | `FREQ=DAILY;BYHOUR=7;BYMINUTE=30` | `combo/DeepSeekCombo` | registered SWF project | repository root |

The night and morning carriers were created paused and activated by the operator on 2026-09-18 (Asia/Shanghai). The fallback was added on 2026-09-21 with the carrier-ladder change and is ACTIVE. The rrules above are operator-confirmed times rather than placeholders. Activation is a Host-side configuration change: it schedules the next occurrence but proves no run happened. Until a run is observed, describe these three as configured and scheduled, never as triggered or as having run, and treat a fallback activation as observed only once it actually runs.

The three `text` blocks above are the source prompts, in the order night, fallback, morning. The live copies live at `~/.codex/automations/<id>/automation.toml` and must stay identical; re-check after any edit:

```bash
python3 - <<'PY'
import tomllib, re, pathlib
doc = pathlib.Path('harness/core/skills/linear-work-control/automation-workflows.md').read_text()
blocks = [b.strip() for b in re.findall(r'```text\n(.*?)```', doc, re.S)]
for name, source in zip(('swf-night-executor', 'swf-night-executor-fallback', 'swf-morning-handoff'), blocks):
    live = tomllib.loads((pathlib.Path.home() / '.codex/automations' / name / 'automation.toml').read_text())['prompt']
    print(name, live.strip() == source)
PY
```

## Recovery limits

The queue helper is a deterministic admission check over a verified snapshot. It does not authenticate facts, enforce wall-clock preemption, or provide a cross-session lock. Until LMP-07 supplies repository locking, check ownership before edits and defer conflicting/unknown ownership. A future scheduled run remains pending evidence even after tests and a manual pass succeed.

## Verification boundary

A created automation is a Host-side object, not proof that a run happened. There is no supported "run this automation now" entry point, so the first verification pass is a prompt-equivalent manual run whose evidence is recorded exactly like a scheduled run, plus the automation configuration snapshot. Keep the distinction visible: configured, triggered, and observed are three different claims.
