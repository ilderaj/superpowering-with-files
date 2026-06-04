# Decision-Plane Router Design

## Summary

Harness should introduce a task-time routing decision plane that chooses the cheapest correct execution path without creating a second durable task-memory system and without silently mutating install-time state.

The recommended model is a **Decision-Plane Router** with three routes:

- `lean-direct`
- `tracked-lean`
- `deep-rich`

This router should:

1. reuse the existing task-classification model;
2. consume runtime and governance signals that already exist;
3. emit lightweight route signals for operator surfaces;
4. write durable route evidence only when the task is already tracked.

The design goal is not to invent more profiles. The goal is to make Harness answer a more important product question:

> given the current task shape and current evidence, which execution path should this task be on right now?

## Problem

Harness already has install-time defaults, projection profiles, hook payload budgets, and health warnings.

Today it can say:

- user-global installs should default to `minimal-global`;
- a given configuration is heavier than recommended;
- hook payloads are within budget;
- planning hot context is compact enough;
- a target is projecting a smaller or larger skill set.

What it does not yet do is route task execution behavior from those signals.

That leaves the system with a gap:

- install-time defaults exist,
- diagnostics exist,
- runtime surfaces exist,
- but the product still lacks a first-class decision layer that consistently maps task shape to execution cost.

As a result, token economy remains more measurable than behavioral.

## Goals

- Introduce a routing decision layer that chooses among `lean-direct`, `tracked-lean`, and `deep-rich`.
- Reuse the existing `quick / tracked / deep-reasoning` task-classification model as the primary router input.
- Preserve `planning/active/<task-id>/` as the only authoritative task-memory surface.
- Keep quick tasks lightweight and non-ceremonial.
- Allow tracked tasks to remain durable without automatically incurring deep-task cost.
- Require explicit promotion into richer execution paths.
- Surface route decisions in operator-facing surfaces without forcing every route decision into durable storage.
- Support future attachment to execution contracts, receipts, reconciliation, and orchestration without redesigning the route model again.

## Non-Goals

- Do not replace install-time skill profiles.
- Do not silently rewrite `state.skillProfile`, `hookMode`, or user-global install state as a side effect of routing.
- Do not require quick tasks to create `planning/active/<task-id>/`.
- Do not invent a second durable routing ledger outside authoritative planning.
- Do not build a full orchestration runtime in this design.
- Do not auto-demote tracked or deep tasks aggressively once durable state already exists.

## Confirmed Constraints

- `planning/active/<task-id>/` remains the only authoritative task memory.
- Task classification rules in `AGENTS.md` and `CLAUDE.md` remain the policy baseline.
- Quick tasks should still execute directly without heavyweight workflow routing.
- Tracked tasks must still use task-scoped planning.
- Deep-reasoning tasks remain the only class that may justify richer reasoning surfaces.
- Execution-contract and receipt semantics must remain compatible with this router.

## Design Principles

1. **Classification first**
   The router should productize the existing task classes rather than invent a competing taxonomy.

2. **Cheapest correct path**
   The router should choose the lightest path that still satisfies the task's durability, recovery, and reasoning needs.

3. **No hidden authority drift**
   Route decisions may influence runtime behavior, but authoritative task truth still lives in planning files.

4. **Promotion is explicit**
   Richer paths require positive evidence, not accidental escalation.

5. **Durability follows task class**
   Quick tasks get ephemeral route signals; tracked tasks get durable route evidence.

## Route Model

Harness should define three route states.

### 1. `lean-direct`

Use for quick tasks.

Characteristics:

- execute directly;
- no required task-scoped planning;
- no heavy planning ceremony;
- no automatic deep-task context expansion;
- keep routing evidence ephemeral.

### 2. `tracked-lean`

Use for tracked tasks that need durable planning but do not yet justify deep reasoning.

Characteristics:

- authoritative planning is required;
- planning surfaces remain active;
- runtime should prefer brief/hot context over full rich reasoning payloads;
- execution remains durable without assuming deep-task overhead.

This route is intentionally the bridge between "cheap direct work" and "rich heavy-task work."

### 3. `deep-rich`

Use for deep-reasoning tasks.

Characteristics:

- authoritative planning is required;
- richer reasoning surfaces are allowed;
- execution contracts, receipts, reconcile-heavy flows, and future orchestration features are fully compatible;
- deep reasoning is justified by explicit task conditions.

## Why `tracked-lean` must exist

Without `tracked-lean`, Harness would collapse into a two-route model:

- direct quick work
- rich heavy work

That would force many durable but ordinary tracked tasks into a path that is more expensive than necessary.

`tracked-lean` preserves a middle band:

- durable enough to recover,
- light enough to stay economical,
- structured enough to promote later if needed.

This route is essential for the user's north star:

- small work should stay cheap,
- heavy work should stay rich,
- but not every durable task is heavy.

## Router Inputs

The router should consume two layers of input.

### Layer 1: Task Classification

Primary input:

- `quick`
- `tracked`
- `deep`

This is the policy anchor.

### Layer 2: State Signals

Secondary signals should refine the route without replacing classification:

- whether a task-scoped planning directory already exists;
- whether multiple active tasks exist;
- whether reconciliation is open or blocking archive-readiness;
- whether execution receipts expose blocked, failed, or open follow-up signals;
- whether companion drift or planning anomalies exist;
- whether hook or planning context budgets are under pressure;
- whether the user explicitly requested durable planning or deep reasoning;
- whether worktree or branch isolation is in play.

## Router Outputs

The router should emit two classes of output.

### 1. Ephemeral Route Signals

Use in operator/runtime surfaces:

- hook payload shaping;
- planning hot vs brief context selection;
- `summary`;
- `active-summary`;
- future route inspection commands.

These signals explain:

- current route;
- promotion reason;
- whether the route is stable or pending escalation.

### 2. Durable Route Evidence

Write only for tracked or deep tasks.

Durable evidence should live in authoritative planning and record at least:

- selected route;
- why the route is not lighter;
- if promoted, what triggered promotion;
- any follow-up obligation created by the promotion.

Quick tasks should not become tracked just to log a route decision.

## Promotion Rules

Promotion should be narrow and explicit.

Recommended path transitions:

- `lean-direct -> tracked-lean`
- `tracked-lean -> deep-rich`

### `lean-direct -> tracked-lean`

Typical triggers:

- the user requests durable planning or durable review history;
- the task becomes multi-step;
- research or comparison work appears;
- worktree or branch isolation becomes necessary;
- recovery across sessions becomes important.

### `tracked-lean -> deep-rich`

Typical triggers:

- architecture is unclear;
- requirements are ambiguous;
- debugging is complex;
- root cause is not obvious;
- explicit deep reasoning is requested;
- execution-contract or receipt-heavy flow becomes necessary;
- richer reconcile or orchestration behavior is needed.

## Demotion Rules

Automatic demotion should be conservative.

Once a task already has durable tracked state, frequent route downgrades risk confusing recovery and increasing drift between runtime behavior and planning evidence.

Recommended v1 rule:

- allow route promotion automatically when criteria are met;
- allow demotion only as an explicit reviewed decision for tracked tasks;
- do not silently demote `deep-rich` to `tracked-lean` inside the same task lifecycle.

## Surface Integration

### Hook Context

The router should shape context choice, not just inspect it afterward.

Expected behavior:

- `lean-direct`: avoid tracked-task hot-context behavior;
- `tracked-lean`: prefer brief/hot compact planning context;
- `deep-rich`: allow richer planning context and related deep-task surfaces.

### `summary`

`summary --task` should be able to show the current route for tracked tasks in a compact way when useful.

### `active-summary`

`active-summary` should eventually expose:

- current route;
- promotions in effect;
- anomalies where task state and route do not match.

### Planning

Tracked and deep tasks should record route evidence in task-scoped planning.

### Reconciliation

The route should not redefine reconciliation authority, but reconciliation may eventually check whether the route that was used matched the work that actually happened.

## Recommended Planning Shape

For tracked or deep tasks, v1 should add a lightweight route record to `task_plan.md` or an equivalent planning section.

Suggested minimum fields:

- `Selected Route`
- `Route Reason`
- `Promotion Trigger` if promoted
- `Route Evidence Surface`

Example:

```md
## Routing Decision

- Selected Route: tracked-lean
- Route Reason: task requires durable planning and recovery but does not justify deep reasoning
- Promotion Trigger: none
- Route Evidence Surface: planning + summary
```

This should remain smaller than execution-contract data and should not become a second plan format.

## Rollout Strategy

### Stage 1: Define The Decision Model

- document route states;
- document inputs and promotion rules;
- define durable vs ephemeral evidence boundaries.

### Stage 2: Surface Route Signals

- route-aware summary surfaces;
- route-aware hook selection behavior;
- planning sync-back for tracked tasks.

### Stage 3: Attach Behavior

- route-aware context shaping;
- route-aware reconcile checks;
- route-aware future orchestration expansion.

## Risks

### Risk: Router becomes a second classification system

Mitigation:

- keep task classification as the primary input;
- do not invent unrelated route names or criteria.

### Risk: Router silently rewrites install state

Mitigation:

- keep install profiles and route decisions separate;
- treat install state as baseline capability, not runtime route truth.

### Risk: Quick tasks become over-instrumented

Mitigation:

- keep quick-task route signals ephemeral only;
- do not require planning files for `lean-direct`.

### Risk: Rich-route promotion becomes too eager

Mitigation:

- require explicit triggers for `tracked-lean -> deep-rich`;
- avoid using budget diagnostics alone as promotion proof.

## Recommended Approach

Adopt **Decision-Plane Router with `tracked-lean` preserved as a first-class middle route**.

Why:

- it aligns with the existing task-classification policy;
- it protects quick-task economy;
- it avoids collapsing all durable work into a heavy path;
- it keeps authoritative planning central;
- it creates a clean bridge from current governance behavior to future orchestration behavior.

## Next Step

The next implementation planning step should define:

1. the authoritative routing record shape for tracked tasks;
2. which runtime surface first consumes the route;
3. how route-aware context selection is verified without silently changing install-time state.
