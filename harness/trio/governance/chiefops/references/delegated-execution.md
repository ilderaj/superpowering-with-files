# Delegated execution

These rules apply to the selected governed delegation lane. Human intent constrains model and effort choices; the agent recommends or selects supported intent, and the Host executes and attests. Requested intent is not authenticated actual execution. For optional starting points, use Trio's execution reference. Use bounded parallel helpers where beneficial and allowed. Each child receives an explicit proper-subset envelope of the parent's frozen scope and no broader permissions; the parent integrates and verifies results. Under `visible_worker_required`, the visible primary topology is strict: no Chief inline or native-subagent substitute. Return `manual_pending` or `blocked` if it is unavailable.

## Freeze and validate

Before dispatch, bind exact authority root, task ID, currentSlice, baseline branch/HEAD, allowed paths, dependencies, non-goals, proof commands, evidence sink, stop conditions, and return contract. Freeze only these declared scopes; preserve unrelated concurrent work. Recompute sha256 of each authority file against the frozen assignment before worker reads, tests, or edits. An in-scope dirty baseline, scope contradiction, or mismatched authority hash stops as `binding_mismatch` or `blocked`. Keep the three Trio authority files frozen until controlled rebind or acceptance writeback; a revised scope requires revalidation, not informal expansion.

Chief owns planning, assignment, review, gates, acceptance, and authority writeback. The primary worker owns production changes and primary verification. Worker completion is a candidate until Chief acceptance. Return paths, relevant RED/GREEN or regression evidence, command exits/counts, limits, and status at completed slices or stops. Reuse unchanged evidence when still applicable; new changes or failed proof require targeted verification.

## Permissions

Plan the exact permission scope before dispatch in this governed lane: the assignment packet and its allowed paths are settled before any visible worker exists. Apply least privilege with task-specific writable roots that never exceed the frozen slice. Full Access is an explicit exception, never a default or an escalation path. Recheck the frozen scope before any escalation or review: an out-of-scope operation is blocked before escalation eligibility. Approval only resolves Host restriction and never expands frozen scope or allowed paths. Generated or materialized surfaces are never direct-written through escalation; change source-owned policy and projection proof instead.

Reuse existing authorization for the same scope. Approval resolves only the applicable Host restriction and never expands frozen scope; it does not justify a repeated user question when already satisfied. Host security controls remain binding.

## Worker approval and semantic lanes

Full Access is not `approval_policy=never`; it describes only the sandbox axis. An explicit requested approval policy is required for any permission claim, and the actual per-worker approval policy stays `unknown` until the Host authenticates it against the exact packet digest. A missing requested approval policy, or worker-specific approval evidence that is missing or mismatched, returns `manual_pending:worker_approval_policy_unbound`; never claim that Full Access makes a worker approval-free.

`awaiting_approval` is a non-terminal reserved lane status, not a reason to spawn a replacement. Recovery follows the approved ladder: awaiting approval -> human/Host approval -> continue the same worker; binding or context inconsistency -> rebind the same worker -> bounded integrity probe; unavailable or rebind impossible -> Chief explicitly releases the old lane -> one replacement worker. A different output root alone never creates a distinct repair lane; a new worker needs a different frozen `currentSlice` identity and disjoint declared scope.

The authority task ID plus frozen `currentSlice` identity reserve the semantic work. The packet digest is immutable evidence and audit binding, never a discriminator that permits a replacement or a required identity field: a revised packet with the same task and slice stays reserved even when its digest changes because declared output or scope changed. Every unreleased active status (`planned`, `observed`, `idle`, `executing`, `awaiting_approval`, `blocked`, `candidate_done`) reserves its task and frozen slice; `stopped` is not an active reservation. A reserved lane without task or current-slice identity is pending, not permission to spawn: it fails closed to `manual_pending:semantic_identity_unbound:<status>` on a non-overlapping spawn, and only an authenticated matching Chief release settles it. A packet-less spawn facing a fully identified active lane is likewise pending, not independent: supply the immutable assignment packet, or settle the lane with an authenticated Chief release.

An unresolved worktree `clientThreadId` is pending Host lifecycle state: resolve that exact setup with a bounded status/wait before any fallback, and allow at most one corrected create-request attempt before `manual_pending`. The Host owns this lifecycle; the repository only models it as a fail-closed descriptor contract.

`on-request` workers must create temporary workspace non-destructively (`mktemp -d` or a scoped non-destructive path); never issue `rm -rf` merely to recreate temporary state.

## Worker-local goals

`worker_self_goal` is a bounded handoff contract: objective, success criteria, stop conditions, evidence, iteration bound, milestone check-in, and return condition. Numeric criteria are useful when the domain supports them, not a dispatch gate. Native goals and continuation obey Host tool rules: ordinary work creates no goal; explicitly requested goals reuse a matching active goal, resolve conflicts, and receive a token budget only if requested. No cross-thread goal controller or implicit scheduler is created here.
