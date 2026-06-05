# Health-First Boundary Hardening Design

## Active Task Path

`planning/active/comprehensive-project-audit-20260603/`

- Active task path: `planning/active/comprehensive-project-audit-20260603/`

## Lifecycle State

- Status: active
- Lifecycle state: active
- Active companion artifact: `docs/superpowers/specs/2026-06-05-health-first-boundary-hardening-design.md`
- Sync-back Status: synced through Track 4 health-first spec drafting and self-review; awaiting user review gate

## Summary

Harness should begin Track 4 `Structural Boundary Hardening` with a **health-first** slice.

The goal is not to refactor for aesthetics.
The goal is to reduce coordination pressure in the most overloaded governance entrypoint without weakening the behavior proven in Tracks 1-3.

This slice should:

1. split `harness/installer/lib/health.mjs` along already-proven behavioral seams;
2. preserve `readHarnessHealth()` as the stable public entrypoint;
3. align internal boundaries with the way the current tests and product surfaces already behave;
4. prepare later `sync` refactoring without forcing `sync` and `health` to change in the same slice.

## Problem

Harness has now proven four substantial behavior layers:

- authoritative planning and companion governance;
- execution contracts;
- receipts and follow-up closure;
- decision-plane routing with lightweight-vs-rich task behavior.

Those features are real and tested.
They also increase pressure on central coordination files.

The strongest current hotspot is `harness/installer/lib/health.mjs`.

Current evidence shows:

- the file is about 1882 lines long;
- it contains active/planning diagnostics;
- it contains projection and hook inspection behavior;
- it contains hook/payload/planning/skill-profile measurement logic;
- it contains safety, backup, user-managed, and scope-overlap governance;
- it orchestrates all of the above through one public entrypoint: `readHarnessHealth()`.

This is not only a size problem.
It is a boundary problem:

- product diagnostics,
- policy evaluation,
- measurement aggregation,
- and projection inspection

are all coordinated inside one file.

That creates three concrete risks:

1. new governance behavior keeps concentrating in one module;
2. test coverage stays broad but implementation seams remain implicit;
3. future Track 2/3 work will keep paying integration cost in the same file.

## Goals

- Split `health.mjs` into smaller internal modules whose boundaries match current behavior domains.
- Keep `readHarnessHealth()` as the stable external surface during v1.
- Isolate planning diagnostics from projection inspection and context-budget accounting.
- Make future additions to companion, execution-contract, receipt, or routing health checks less likely to further bloat one coordinator file.
- Improve the fit between implementation boundaries and the existing `health.test.mjs` domains.
- Reduce the chance that future `sync` work depends on hidden `health` internals.

## Non-Goals

- Do not redesign `doctor` output semantics in this slice.
- Do not change health verdict policy beyond what is necessary for extraction.
- Do not refactor `sync.mjs` in the same implementation slice.
- Do not rewrite tests just to match a new file layout.
- Do not create a second public health API.
- Do not move routing, receipt, or companion behavior into new abstractions unless they directly serve the health boundary split.

## Current-State Evidence

The current code already exposes natural split candidates.

### 1. Planning Diagnostics Cluster

Examples:

- `inspectActiveTaskState()`
- `inspectCompanionSyncHealth()`
- `inspectExecutionContractHealth()`
- `inspectPlanLocations()`

These functions answer:

- is planning state structurally healthy?
- are companion links and lifecycle semantics aligned?
- are execution contracts malformed?

This is one coherent domain: **planning diagnostics**.

### 2. Context/Budget Measurement Cluster

Examples:

- `inspectPlanningHotContext()`
- `inspectSkillProfileContext()`
- `inspectLocalHookPayloads()`
- `applyContextSummary()`
- measurement helpers and budget formatting helpers

These functions answer:

- how large are entry, hook, planning, and skill-profile surfaces?
- what is the verdict for those measurements?
- how should summaries aggregate worst-case or per-target cost?

This is one coherent domain: **context measurement and budget summarization**.

### 3. Projection / Hook Inspection Cluster

Examples:

- `inspectSkill()`
- `inspectHook()`
- hook payload parsing and runtime evidence helpers
- duplicate skill classification integration

These functions answer:

- did the projected skill/hook land correctly?
- is the hook config structurally valid?
- what runtime evidence exists for the projection?

This is one coherent domain: **projection inspection**.

### 4. Governance / Safety Cluster

Examples:

- `inspectSafetyHealth()`
- `inspectBackupGovernance()`
- scope overlap inspection
- user-managed path validation

These functions answer:

- are governance boundaries still safe?
- do backups, scope ownership, and safety policy still line up?

This is one coherent domain: **governance health**.

### 5. Thin Orchestrator Role

`readHarnessHealth()` already behaves like an orchestrator.
The problem is that too much logic still lives beside it rather than behind narrower internal boundaries.

## Design Principles

1. **Refactor around proven behavior**
   The split should mirror existing product domains, not invent a new abstraction map first.

2. **Stable public surface**
   Keep one public `readHarnessHealth()` entrypoint while shrinking its implementation burden.

3. **Behavior-first seams**
   Create boundaries where tests and user-facing semantics already cluster naturally.

4. **No speculative shared core**
   Avoid introducing generic helper frameworks that do not yet have a concrete consumer.

5. **Prepare, do not overreach**
   This slice should make later `sync` and broader Track 4 work easier, but should not attempt to solve all boundary problems at once.

## Approaches

### Option 1: `health-first` Internal Domain Split

Split `health.mjs` into internal modules such as:

- `health-planning-diagnostics.mjs`
- `health-context-budgets.mjs`
- `health-projection-inspection.mjs`
- `health-governance.mjs`
- `health-shared-measurements.mjs` if needed

Keep `readHarnessHealth()` as the single public entrypoint that imports these modules.

Pros:

- attacks the highest-confidence hotspot first;
- aligns with current test domains;
- limits behavioral blast radius;
- creates cleaner entrypoints for future additions.

Cons:

- does not immediately simplify `sync.mjs`;
- may leave a still-large orchestrator until a second slice shrinks it further.

### Option 2: `sync-first`

Start by splitting `sync.mjs`.

Pros:

- attacks the second-largest coordinator;
- directly benefits install/sync behavior maintenance.

Cons:

- larger behavior surface in the first slice;
- plan/apply/cleanup/report coupling is currently riskier to separate;
- weaker fit with the already-clustered health tests.

### Option 3: Shared-Seams First

Extract generic evaluators and result objects before splitting major files.

Pros:

- potentially cleaner long-term architecture.

Cons:

- too abstract for the first slice;
- risks over-design;
- weaker direct connection to current user-visible behavior.

## Recommendation

Choose **Option 1: `health-first`**.

The reasons are concrete:

- `health.mjs` is the highest-confidence hotspot;
- its responsibilities already group into real behavior domains;
- its tests already imply those domains;
- the slice can improve structural clarity without changing public semantics;
- it creates better preconditions for later `sync` refactoring.

## Proposed Module Boundaries

This slice should target internal extraction, not public API multiplication.

### A. `health-planning-diagnostics.mjs`

Owns:

- active task discovery for health inspection;
- companion sync inspection;
- execution-contract inspection;
- plan-location aggregation integration if the current implementation boundary supports it.

Primary output:

- structured planning health findings with severity, path, and message.

### B. `health-context-budgets.mjs`

Owns:

- measurement helpers;
- budget evaluation formatting;
- entry/hook/planning/skill-profile summary aggregation;
- hook payload accounting mode logic.

Primary output:

- structured context measurements and summary verdicts.

### C. `health-projection-inspection.mjs`

Owns:

- skill projection inspection;
- hook inspection;
- runtime evidence attachment for projected hooks;
- duplicate skill display/problem classification integration.

Primary output:

- structured target-level skill/hook inspection results.

### D. `health-governance.mjs`

Owns:

- safety-policy checks;
- backup governance;
- scope overlap;
- user-managed path validation.

Primary output:

- governance findings that can become warnings or problems.

### E. `health.mjs`

Keeps:

- `readHarnessHealth()` public entrypoint;
- top-level assembly of state, budgets, targets, warnings, and problems;
- no heavy domain logic beyond orchestration and final shape composition.

## Migration Strategy

Use a narrow staged migration.

### Step 1: Extract Without Semantic Change

- move domain helpers into new internal modules;
- keep all return shapes and warning/problem text stable;
- re-export nothing new publicly.

### Step 2: Shrink Orchestrator Responsibility

- make `readHarnessHealth()` assemble results from extracted modules;
- reduce inline helper count in `health.mjs`;
- preserve test behavior.

### Step 3: Add One Structural Guard

After extraction, add a small regression signal such as:

- a test that imports the new modules through the public entrypoint path only;
- or a narrow line-of-responsibility assertion in planning notes/spec review.

The goal is not to test file layout mechanically.
The goal is to prevent future re-concentration from starting immediately.

## Testing Strategy

Do not rewrite the entire health suite.

Instead:

1. keep existing `health.test.mjs` behavior coverage as the primary regression net;
2. add a few targeted tests only where extraction changes the seam behavior;
3. verify `doctor --check-only` still reports:
   - planning/companion issues,
   - context budget issues,
   - baseline hygiene issues,
   - safety/governance issues
   with unchanged semantics.

Success here is measured by:

- stable user-facing behavior,
- smaller internal responsibility clusters,
- and clearer future extension points.

## Risks

### Risk 1: False modularity

The code may move into more files without reducing coupling.

Mitigation:

- split by behavior domain, not by helper count;
- keep each extracted module answerable by one clear question.

### Risk 2: Hidden semantic drift

Warnings or verdict aggregation could change accidentally during extraction.

Mitigation:

- preserve existing warning/problem strings unless explicitly justified;
- use current tests and real `doctor --check-only` behavior as baseline evidence.

### Risk 3: Orchestrator stays too large

`readHarnessHealth()` may remain heavier than ideal after v1 extraction.

Mitigation:

- accept a still-thin orchestration layer in v1;
- treat further shrinkage as a follow-on slice, not a reason to overreach now.

## Completion Rule

This `health-first` Track 4 slice should be considered complete when:

1. `health.mjs` no longer houses the main domain logic for planning diagnostics, context/budget measurement, projection inspection, and governance checks all in one file;
2. `readHarnessHealth()` remains the stable public entrypoint;
3. existing health/doctor behavior remains intact under tests and real command verification;
4. the resulting boundaries make later `sync` work easier without requiring that `sync` be refactored in the same slice.

## Next Step

If this design is approved, the next artifact should be a focused implementation plan that:

- names the exact extracted modules,
- orders the extraction sequence,
- identifies required regression tests,
- and defines the real command verification set for `doctor`.
