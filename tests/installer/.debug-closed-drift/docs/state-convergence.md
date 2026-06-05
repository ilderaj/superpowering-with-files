# State Convergence

State convergence is the lightweight report used when active task state, roadmap direction, and backlog readiness may have drifted. It complements the reconcile gate in [Reconciliation](reconciliation.md) and should stay short enough for an operator to run during review or maintenance.

## When To Run

Run a convergence check before roadmap/backlog edits, before archiving a batch of tasks, and after multi-iteration work that changes workflow policy, cloud-dev behavior, MCP contracts, adoption guidance, or office templates.

## Inputs

- `./scripts/harness active-summary` and, when useful, `./scripts/harness active-summary --json`
- `planning/active/<task-id>/{task_plan.md,progress.md,findings.md,reconciliation.md}`
- [Roadmap](roadmap.md)
- [Backlog](backlog.md)
- [Reconciliation](reconciliation.md)

## Report Format

```markdown
# State Convergence: <date/task>

## Active Task Summary
- Active:
- Waiting review:
- Blocked:
- Archive-ready:
- Complete but intentionally retained:

## Roadmap / Backlog Alignment
| Item | Current source | Conflict or drift | Decision / next step |
| --- | --- | --- | --- |

## Reconciliation Findings
- Complete:
- Open:
- Waived / not required:

## Updates Applied
- ...

## Updates Deferred
- ...

## Verification
- `<command>` — result
```

## Operator Rules

- Treat `planning/active/<task-id>/` as current task state; treat roadmap/backlog as product direction and executable queue.
- Do not silently rewrite roadmap or backlog from implementation facts. Record the decision or follow-up in the convergence report.
- Use reconciliation fields when drift affects acceptance, verification, docs, roadmap, backlog, MCP contracts, cloud promotion, or archive readiness.
- Link the report from the active task `progress.md` or `reconciliation.md` when it affects a tracked task.
