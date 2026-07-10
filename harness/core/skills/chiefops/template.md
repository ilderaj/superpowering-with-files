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

Chief Prompt Contract:
- Restore planning/active/<task-id>/ before acting
- Choose exactly one bounded next action
- If the issue is plan/intake related, route to plan or goal2plan
- If the issue is release closure, route to autonomous-release-closure
- If the issue is proof/closure, route to verify/reconcile/finish/release
- Do not implement directly unless this slice is explicitly assigned

Next slice:
- Scope: <one bounded slice>
- Files/surfaces: <compact list>
- Primary proof: <test, review, or acceptance surface>
- Backstop proof: <secondary surface, if needed>
- Sync-back: update planning/active/<task-id>/ after meaningful progress

Assignment Packet:
- authorityTaskId: <bound authority task id>
- authorityRoot: <absolute authority root>
- taskPlanPath: <absolute authority task_plan.md path>
- findingsPath: <absolute authority findings.md path>
- progressPath: <absolute authority progress.md path>
- bindingObservation: <current hashes for taskPlanPath, findingsPath, and progressPath>
- unitId: <existing execution unit or temporary prompt-only id>
- Non-goals: <what this slice must not widen into>
- Allowed changes: <bounded surface>
- Expected receipt: <none yet | blocked | failed | done_with_evidence after work>
- Return to chief: <what to report back>

Worker Prompt Contract:
- Read and hash the exact authoritative files before tracked edits; return binding_mismatch if they differ from bindingObservation or are missing/contradictory
- Set HARNESS_PROJECT_ROOT to authorityRoot, or pass explicit --root when supported
- Keep planning single-homed; do not copy, symlink, or unignore the trio in the worker checkout
- Return status and evidence to Chief; Chief owns planning writeback unless this packet explicitly grants a bounded planning edit
- Use task_plan/progress for assignment intent
- Write an execution receipt only if work was actually attempted and reached an outcome
- Return after one bounded slice

Forbidden moves:
- no second durable memory
- no new runner or scheduler
- no ChiefOps-specific receipt dialect
```
