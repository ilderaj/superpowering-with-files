# Publishable Linear surfaces

Copy these shapes instead of inventing prose. Keep them short: the human reads them in under a minute, and the agent reads them after a restart.

## Goal issue

```markdown
## Goal
<the outcome in one or two sentences>

## Done when
- <verifiable condition>
- <verifiable condition>

## Source of truth
Local durable state at `planning/active/<task-id>/` — Linear is a projection.

## Execution
Local Codex session (`executor:codex-local`). Human owner stays the assignee.

## Status
See the pinned checkpoint comment below.
```

Labels: `swf-managed`. Parent: none.

## Task issue (sub-issue)

```markdown
## Task
<one line>

## Local authority
`planning/active/<task-id>/task_plan.md` — phase <n>

## Done when
- <verifiable condition>

## Notes
<only what changes the decision, not the worklog>
```

Labels: `swf-managed`, `executor:codex-local`, plus the current state label. Parent: the goal issue.

## Checkpoint (status comment update)

```
### Checkpoint - <task title>

- **State:** `running` -> Linear `In Progress` + `agent-running`
- **Progress:** 60% - <what the percentage counts>
- **Completed just now:**
- <one line per finished slice>
- **Happening now:**
- <one line>
- **Next:**
- <one line>
- **Human action required:** no
- **Latest validation:** <what passed> (`<command>`) — or "not run yet"

<!-- swf:checkpoint task=<task-id> at=<timestamp> -->
```

Update the stored status comment by id. One comment per issue, rewritten in place.

## Blocker (status comment update)

```
### Human input required

- **Task:** <task-id>
- **Context:** <what the agent was doing>
- **Question:** <one answerable question>
- **Options:**
1. <option> - <consequence>
2. <option> - <consequence>
- **Impact if unanswered:** <what stays parked>
- **Resume condition:** DECISION recorded in local blockers file

Reply in a comment using one of these forms:

- `DECISION: <option or free-form answer>`
- `PAUSE` / `RESUME` / `CANCEL`
- `REPLAN: <new scope or constraint>`
- `PRIORITY: <urgent|high|normal|low>`

<!-- swf:blocker task=<task-id> at=<timestamp> -->
```

State: `waiting_human` (a decision) or `blocked` (an external condition).

## Completion (status comment update)

```
### Completed - <task title>

- **What changed:**
- <one line per change>
- **Validation:** <command> passed (<counts>)
- **Artifacts:**
- <path or link>
- **Remaining follow-ups:**
- <one line, or none>

<!-- swf:completion task=<task-id> at=<timestamp> -->
```

State: `done` only after `completion-gate` returns `DONE ALLOWED`.

## Morning handoff (status comment update)

```
### Overnight summary - <date>

- **Completed:**
- <issue> - <evidence>
- **Ready for review:**
- <issue> - <what to check>
- **Needs a decision:**
- <issue> - <question, option A / option B>
- **Failed:**
- <issue> - <failure and next attempt>
- **Still running:**
- <issue> - <where it is>
- **Skipped:**
- <issue> - <why>
- **Next work:**
- <what the queue will pick up next>

<!-- swf:summary task=summary at=<timestamp> -->
```
