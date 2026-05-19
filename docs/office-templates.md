# Office Templates

Harness remains coding-first. Office templates are lightweight planning shapes for everyday research, decisions, reviews, follow-ups, and approvals when the work benefits from durable state but does not need a worktree, code diff, or code verification.

## How To Use

1. Create `planning/active/<task-id>/`.
2. Copy one template from `harness/core/templates/planning/` into `task_plan.md` or into a supporting file in the active task directory.
3. Keep `findings.md` for evidence and `progress.md` for status updates.
4. Use `reconciliation-lite.md` only when the outcome changes docs, process, roadmap/backlog, approvals, or follow-up commitments.
5. Finish/archive with the normal lifecycle once decisions and evidence are transferred.

## Template Set

| Template | Use for | Typical evidence |
| --- | --- | --- |
| `research-task.md` | Compare options or answer a bounded question. | Sources, findings, recommendation. |
| `decision-record.md` | Record a decision and rationale. | Options considered, decision owner, consequences. |
| `document-review.md` | Review a document for accuracy, clarity, or approval. | Review notes, required edits, sign-off. |
| `meeting-follow-up.md` | Track outcomes from a meeting. | Attendees, decisions, action items. |
| `approval-tracking.md` | Track approvals and blockers. | Approver, status, date, conditions. |
| `reconciliation-lite.md` | Align office outcomes with docs/backlog/process. | Changed commitments and follow-up owner. |

## Boundaries

- Do not require worktrees for office tasks unless the task becomes coding work.
- Do not run code tests for non-code work; verify with source links, review checklists, approvals, or document diffs.
- Do not edit `harness/upstream/**` templates for office support. These templates live in Harness-owned template space.
- Escalate to the normal coding workflow when implementation, runtime behavior, adapter output, MCP contracts, or release state changes.
