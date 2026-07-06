# ChiefOps Template

Use this minimal frame when a tracked task needs a bounded governance pass before the next execution slice.

```text
ChiefOps Readout
Task: <task-id>
Objective: <current execution goal>
Current truth:
- Planning authority: planning/active/<task-id>/
- Execution receipts: <receipt summary or "none yet">
- Proof target: <proof target or highest-risk claim>
- Open blockers: <none|summary>

Next slice:
- Scope: <one bounded slice>
- Files/surfaces: <compact list>
- Primary proof: <test, review, or acceptance surface>
- Backstop proof: <secondary surface, if needed>
- Sync-back: update planning/active/<task-id>/ after meaningful progress

Forbidden moves:
- no second durable memory
- no new runner or scheduler
- no ChiefOps-specific receipt dialect
```
