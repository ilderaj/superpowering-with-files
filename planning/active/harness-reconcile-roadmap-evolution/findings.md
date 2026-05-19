# Findings: harness-reconcile-roadmap-evolution

## Initial Findings

- `docs/architecture.md` treats `planning/active/<task-id>/` as durable active task state.
- `docs/maintenance.md` already distinguishes active task state from companion plans and archive behavior.
- Existing roadmap/backlog emphasize cloud-dev parity, cloud agent research, and repo UI entry, but do not define a universal post-implementation spec/docs reconciliation contract.
- Active planning contains several completed or waiting-review tasks whose state should eventually be reconciled with roadmap/backlog status.
- The strongest process gap is not lack of specs; it is lack of a lightweight implementation-aftercare step that compares intent, actual changes, verification evidence, and follow-up docs/backlog updates.
