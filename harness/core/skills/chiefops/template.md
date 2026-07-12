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
- planningRoot: <absolute authority root; rendered as authorityRoot in a manual prompt>
- taskPlanPath: <absolute authority task_plan.md path>
- findingsPath: <absolute authority findings.md path>
- progressPath: <absolute authority progress.md path>
- bindingObservation: <current hashes for taskPlanPath, findingsPath, and progressPath>
- majorPhase: <discovery | design | execute | verify | reconcile>
- currentSlice: <one bounded objective>
- nonGoals: <what this slice must not widen into>
- proofTarget: <claim to prove>
- primaryProof: <highest-risk proof>
- evidenceSink: <existing evidence surface>
- capabilityClass: <frontier_reasoning | balanced_execution | economy_mechanical | fast_check>
- reasoningDemand: <light | standard | deep>
- costPreference: <economy | balanced | quality_first>
- latencyClass: <interactive | standard | long_running>
- riskClass: <low | medium | high>
- permissionClass: <observe | workspace | egress_gated | release>
- allowedOps: <existing V0b operations>
- delegationPolicy: <prohibited | worker_discretion | encouraged>
- upgradeTrigger: <condition that forces a stronger route or stop>
- expectedCheckInBy: <ISO milestone deadline>
- stopCondition: <safe return condition>
- expectedReceipt: <existing receipt outcome>
- returnToChiefInstruction: <major-phase gate request>

Packet context contract:
- Stable governance prefix: durable authority, autonomy/approval boundaries, capability and child-envelope constraints, and the required return contract
- Dynamic execution delta: exact trio paths and hashes, current slice, allowed surfaces, proof target/evidence sink, deadline, and stop condition
- Return concise status in this order: conclusion, required evidence, material caveat, and next action
- Prompt caching, persisted reasoning, Programmatic Tool Calling, multi-agent, Pro mode, and max reasoning effort are API practices, not native Codex thread controls
- This is prompt shaping only; it is not cache configuration or a persisted packet schema

Worker Prompt Contract:
- Read and hash the exact authoritative files before tracked edits; return binding_mismatch if they differ from bindingObservation or are missing/contradictory
- Set HARNESS_PROJECT_ROOT to authorityRoot, or pass explicit --root when supported
- Do not forward Chief chat history; use the trio-derived packet and necessary source references
- Keep planning single-homed; do not copy, symlink, or unignore the trio in the worker checkout
- Verify majorPhase, currentSlice, proofTarget, permissionClass, and delegationPolicy before work
- Treat worker_discretion as the tracked-phase default; subagent permission cannot exceed the parent ceiling
- Every subagent dispatch declares explicit model and thinking, is mechanically narrower than the parent envelope, uses Terra/high without verified detailed-plan eligibility, and treats Luna/high/Sol admission as manual contract checks rather than native enforcement
- Return at the major phase boundary; stay autonomous only inside the approved phase
- Treat expectedCheckInBy as a milestone deadline, not a polling interval
- Return status and evidence to Chief; Chief owns planning writeback unless this packet explicitly grants a bounded planning edit
- Use task_plan/progress for assignment intent
- Write an execution receipt only if work was actually attempted and reached an outcome
- Return after one bounded slice

Forbidden moves:
- no second durable memory
- no new runner or scheduler
- no ChiefOps-specific receipt dialect
```
