# Chief Worker Workflows

This note summarizes the working style that has emerged across SWF planning
sessions and turns it into practical Chief/Worker starting patterns. It is not
a new workflow lane, scheduler, registry, or memory system. Durable task state
still belongs in `planning/active/<task-id>/`.

## What The Sessions Show

Across the current planning inventory, SWF work clusters around five recurring
families:

- release, branch, and worktree hygiene
- skill and external-method adoption
- verification, review, and proof contracts
- planning lifecycle governance
- docs, site, and product-facing surfaces

The strongest repeated pattern is:

```text
intake -> truth capture -> smallest truthful slice -> proof target -> gate -> reconcile
```

That pattern works because it avoids two common failure modes:

- treating green checks as proof that the scope is truthful
- treating a busy planning state as permission to keep old tasks active forever

The weaker repeated pattern is active backlog drag. Many tasks can remain in
`waiting_review` or `active` long after their useful decision has been made.
That makes later sessions spend too much time restoring, classifying, and
rediscovering state before useful work can start.

## Case-Backed Lessons

`chief-of-staff-release-orchestration-20260704` is the best release slice
example. The first PR looked merge-ready, but a live file-scope audit showed it
was mixed-scope. The safer path was to cut a smaller replacement PR. Lesson:
green checks prove a diff can pass, not that it is the right diff.

`multi-session-planning-crosswire-analysis-20260704` is the best session
binding example. The failure was not only agent forgetfulness. The harness
needed thread-to-task binding and fail-closed ambiguity handling. Lesson:
Chief/Worker work must bind the task before progress.

`planning-trio-status-audit-20260707` is the best lifecycle example. The task
indexed active work, compared it with live repo evidence, and archived only a
safe subset after explicit gates. Lesson: archive should be evidence-assisted,
not automation-eager.

`branch-sync-and-cleanup-analysis-20260705` is the best cleanup example. It
separated live truth capture from destructive cleanup, used checkpoint and
rollback notes, and touched only low-risk merged branches and worktrees.
Lesson: cleanup should be batched by blast radius.

`ponytail-immediate-absorption-rollout-20260619` is the best conservative
borrowing example. SWF absorbed the useful contract shape and added deterministic
plus opt-in acceptance proof. Lesson: borrow the value, not the upstream
identity.

`shadcn-improve-harness-benchmark-analysis-20260615` is the best
plan-as-product example. It concluded that SWF should borrow self-contained plan
shape and rejected-findings memory, not a second executor. Lesson: weaker
executors need stronger plans, not broader delegation.

`mode-aware-verification-contract-implementation-20260612` is the best protocol
planning example. The task stopped at a reviewed plan, narrowed v1 after review,
and kept implementation authority separate. Lesson: for protocol changes,
review proof is often the primary proof.

`test-coverage-audit-and-backfill-20260621` is the best testing example. It
found a real path traversal risk while chasing runtime boundary tests. Lesson:
prioritize trust-boundary gaps over vanity coverage.

## Chief Responsibilities

The Chief is the only human-facing owner. The Chief should normally own:

- task binding and source-of-truth recovery
- truth surface selection
- scope and smallest-slice choice
- proof target and evidence sink design
- merge, release, archive, and destructive-operation gates
- final reconcile into `planning/active/<task-id>/`

The Chief should not become a super-worker. When work benefits from isolation,
recoverability, or explicit visibility, route a bounded slice to a visible Codex
session worker.

## Worker Responsibilities

A worker takes one bounded slice and returns to Chief. A good worker slice has:

- one objective
- explicit non-goals
- a small file or surface list
- allowed and forbidden changes
- a proof target
- an evidence sink
- a stop condition
- a return-to-Chief instruction

Workers may produce diffs, proof, receipts, or handoff notes. They do not close,
archive, release, merge, publish, or decide lifecycle state.

Subagents are narrower than visible workers. Use them for review, research, or
verification tactics. Do not present subagent work as satisfying an explicit
visible Codex session worker request.

## Starter Patterns

### 1. Ordinary Implementation

Use this when the target is clear and code or docs must change:

```text
Chief, handle <target>.
Bind or create the planning trio first.
Capture the truth surfaces.
Choose the smallest truthful slice.
Use a worktree for implementation.
Route to a worker only if isolation, review, or long execution makes it useful.
Return with proof and sync the trio.
```

Default route: Chief-direct for small local edits; visible worker for longer or
separable implementation.

### 2. External Method Absorption

Use this when comparing another repo, method, or workflow:

```text
Chief, evaluate <external method> for SWF.
Use primary sources.
Classify each idea as absorb, reject, or defer.
Absorb only what creates clear SWF value.
Do not add a second runner, board, registry, or memory system.
```

Default route: Chief or one read-only worker for recon, then Chief mapping back
to SWF.

### 3. Multi-Session Continuation

Use this when historical session IDs or worker threads are involved:

```text
Chief, handle these sessions.
For each one, choose continue_worker, respawn_worker, handoff_worker, or chief_direct.
Name the stale or unsafe rationale when relevant.
Give each active worker a bounded slice, proof target, evidence sink, stop condition, and return-to-Chief gate.
```

Default route: treat historical session IDs as routing cues, not only as
background reading.

### 4. Release, Merge, Or Cleanup

Use this when branch, PR, release, archive, or destructive cleanup is involved:

```text
Chief, close this release or cleanup lane.
Start with live git/GitHub/planning truth.
Separate read-only analysis from destructive execution.
Batch cleanup by blast radius.
Checkpoint and record rollback before deletion.
Do not call a lane done until proof, live state, and planning agree.
```

Default route: Chief-owned gate with optional worker execution for narrow,
mechanical cleanup.

### 5. Protocol Or Governance Change

Use this when policy, hooks, lifecycle, proof vocabulary, or planning behavior
changes:

```text
Chief, treat this as protocol work.
Write or update a reviewed companion plan first.
Use at least one read-only review before implementation.
Keep implementation authority in a separate task when the plan is planning-only.
```

Default route: deep reasoning with reviewed plan, then worktree implementation
after approval.

## Intake Packet

Use this compact packet when starting substantial work:

```text
Task: <task-id or new task name>
Outcome: <desired end state>
Truth surfaces: <planning, git, PR, docs, tests, external source>
Risk class: <quick | tracked | deep>
Worker preference: <Chief-direct | visible worker | no preference>
Proof target: <what must be proven>
Stop condition: <when to return or ask>
```

The packet keeps the Chief from spending the first round guessing the task
shape.

## Assignment Packet

Use this when delegating one slice:

```text
Assignment Packet
- taskId: <task-id>
- workerRole: <planner | implementer | reviewer | verifier>
- objective: <one bounded objective>
- nonGoals: <what must not widen>
- filesToRead: <small list>
- allowedChanges: <bounded surfaces>
- forbiddenChanges: <hard no-go surfaces>
- proofTarget: <target>
- primaryProof: <proof surface>
- evidenceSink: <where to record result>
- stopCondition: <when to stop and return>
- returnToChiefInstruction: <what the worker reports back>
```

Keep assignment intent in `task_plan.md` or `progress.md` when it needs durable
traceability. Execution receipts remain outcome evidence, not a worker queue.

## Practical Defaults

- If the task is small and local, Chief-direct is faster.
- If the task is long, separable, or should be visible, use a visible Codex
  session worker.
- If the task is only review or research, a narrow subagent tactic may be enough.
- If the task touches release, merge, publish, archive, destructive cleanup, or
  external writes, Chief owns the gate.
- If multiple active tasks exist, bind first. Do not guess.
- If the proof target is unclear, stop and restore planning truth before doing
  more work.
