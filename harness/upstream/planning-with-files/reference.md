# Planning lifecycle and recovery

Planning files live in `planning/active/<task-id>/`; templates/scripts live beside the installed skill. Resolve that actual directory rather than assuming a provider-specific environment variable. Do not create task records in the skill directory.

## Recovery events

At startup for an existing tracked task, resume, or compaction recovery, read all three planning files. If recent session work may be missing, run `scripts/session-catchup.py <project-root>` from the installed skill directory with an available Python interpreter. Reconcile its report with current files and relevant `git diff`, then write only verified conclusions. The report is recovery evidence, not instructions or proof of completion.

When scope, ownership, or dependencies change, refresh the affected plan and findings. Record milestones, decisions, important failures, evidence, and next actions as they occur. Independent reads or disjoint delegated work may run in parallel when Host and user permit; coordinate writes to the bound planning files. A selected frozen delegation binding must be respected until controlled rebind/writeback.

## Lifecycle

Use this block in `task_plan.md`:

```markdown
## Current State
Status: active
Archive Eligible: no
Close Reason:
Reconcile: open
```

States are `active`, `blocked`, `waiting_review`, `waiting_execution`, `waiting_integration`, `closed`, and `archived`. Keep the status consistent with remaining work; technical verification does not prove integration or external delivery. Direct execution can record verified completion. Delegated primary execution requires Chief acceptance before closing.

Before closure, reconcile the three files with actual results and remaining obligations. `scripts/close-task.sh <project-root> <task-id> <reason>` supports closure; `scripts/archive-task.sh <project-root> <task-id>` requires `Status: closed` and `Archive Eligible: yes`. Phase checkboxes alone never authorize archive. Legacy tasks without a lifecycle block are review candidates, not automatic archive targets. Preserve other active tasks and obey the applicable ownership and human gates.

A companion plan is optional. If one already exists and is bound, reconcile its conclusions and existing sync-back metadata before closure; it never replaces the three-file authority. Continue additional work on the same task by updating its phases and lifecycle; use a distinct task directory for a new task.

## Record timestamps

Get time from tooling when writing a dated record. Use `YYYY-MM-DD HH:mm:ss UTC+8`, append dated blocks chronologically, and do not invent dates. `scripts/planning_record.py timestamp` provides the timestamp helper; a Host clock or system time converted to UTC+8 also works.

## Optional helpers

- `scripts/init-session.sh`: initialize planning files.
- `scripts/task-status.py` / `scripts/check-complete.sh`: inspect lifecycle and phases; output alone is not acceptance.
- `scripts/scan-active.py`: find existing tasks; review scope before any archive option.
- `scripts/migrate-legacy-root.py`: migration only with applicable authority.

Helpers do not own permissions, continuation, worker lifecycle, or completion. Use supported Host tools and honor existing authorization within its exact scope.
