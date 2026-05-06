# Roadmap

This document captures deferred product and workflow work that is intentionally not in the current default baseline.

## Current Direction

- Keep the global Harness baseline broad: Codex, Copilot, Cursor, and Claude Code remain part of `adopt-global`.
- Keep `safety` and `cloud-safe` off by default for global installs.
- Treat safety as a workspace-scoped capability until the overlay model and tool-allowance issues are resolved.

## Version Plan

### v1.1: Planning Hygiene And Active Task Cleanup

- Status: complete
- Goal: keep `planning/active/` limited to work that still needs a real decision, external event, PR review, or implementation.
- Scope:
  - archive tasks that are explicitly closed and archive eligible
  - close completed planning/meta tasks after their durable conclusions are transferred
  - keep PR/review tasks active until the review outcome is known
  - keep tasks with external concurrent edits untouched
  - publish a lifecycle audit checklist for `planning/active/`
  - provide a machine-readable active queue summary for operator review
- Success criteria:
  - `empty active task directories = 0`
  - `missing task_plan.md = 0`
  - `missing Current State lifecycle block = 0`
  - archive-ready tasks are explicitly identified and companion-synced
  - completed planning-only tasks are moved to `planning/archive/`
  - remaining active and waiting-review tasks each have a named keep reason or external gate

### v1.2: Cross-IDE Projection And Hook Closure

- Status: complete
- Goal: finish the current cross-IDE projection, single-source, and hook-alignment work so Codex, GitHub Copilot, Cursor, and Claude Code have stable native projections.
- Scope:
  - integrate `cross-ide-projection-audit` execution work or make an explicit no-merge decision
  - finish `cross-ide-hook-capability-alignment` dev integration and push
  - review the `cross-ide-single-source-consolidation` PR outcome
  - complete Cursor official load-model evidence with source links
- Closeout:
  - `cross-ide-projection-audit` closed with an explicit no-merge decision after `dev` revalidation
  - `cross-ide-hook-capability-alignment` closed after confirming its implementation commit was already in `dev`
  - `cross-ide-single-source-consolidation` closed after confirming PR #22 was merged
  - `cursor-official-load-model-research` closed after adding the official rules/skills/hooks link matrix
- Success criteria:
  - projection paths match current platform facts
  - hook support statements match native platform behavior
  - shared skill roots are used only where they reduce maintenance without violating platform expectations

### v1.3: Context Budget And Skill Discovery Governance

- Status: complete
- Goal: turn the current context-cost and duplicate-skill investigations into enforceable budget and discovery rules.
- Scope:
  - finish `global-rule-context-load-analysis` without overwriting concurrent edits
  - close the remaining report gap in `rtk-support-feasibility-analysis`
  - fold TypeMint/Copilot duplicate-skill findings into projection dedupe rules
  - track generic-target brief/hot context behavior as a budget regression candidate
- Closeout:
  - `verify` and `doctor` now expose structured budget ledger output and per-target discovery diagnostics
  - user-global bootstrap defaults stay lean via `minimal-global` while full skill surfaces remain opt-in
  - generic-target planning hooks now use the compact/brief contract instead of re-emitting full hot context on repeated turns
  - RTK feasibility is closed as a policy result, not an implementation lane for this version
  - completed `global-rule-context-load-analysis` and `rtk-support-feasibility-analysis` were archived after sync-back
- Success criteria:
  - `verify` and `doctor` expose actionable context budget data
  - global installs default to lean skill profiles
  - full skill surfaces remain opt-in
  - duplicate skill candidates are prevented or clearly diagnosed

### v1.4: Safety Overlay, Cloud Harness, And Automation Follow-Through

- Status: implementation complete; scheduled-run observation pending
- Goal: make safety and cloud usage additive overlays instead of global baseline mutations.
- Scope:
  - complete the `post-upstream-automation-followups` scheduled-run observation after 2026-05-08 20:05 Asia/Shanghai
  - review and decide the `origin-cloud-harness-deployment-plan`
  - implement a workspace safety overlay model that does not rewrite the global baseline
  - reduce safety hook false positives for read/search/verification workflows
- Closeout:
  - state now records baseline policy plus workspace overlay and deployment profile without rewriting the user-global baseline
  - Copilot `github-cloud` repo-local deployment now projects workspace skills to `.github/skills`
  - safety pre-tool guard now allows normal read/search/verification flows such as `rg`, `node --test`, `npm run verify`, and low-risk `find`
  - `post-upstream-automation-followups` remains active only for the first scheduled-run observation window on 2026-05-08
- Success criteria:
  - `sync`, `doctor`, and `adoption-status` report global baseline plus workspace overlays coherently
  - cloud repo-local policy files are clearly separated from local user-global adoption
  - destructive-action guardrails remain effective without blocking routine low-risk work

### v1.5: Workflow Productization And Operator Experience

- Status: complete
- Goal: turn Harness from a substrate into a clearer set of operator workflows without adding a second planning system.
- Scope:
  - use the gstack comparison findings to define workflow lanes such as plan, review, verify, finish, release, and archive
  - close or merge the `readme-slim-pr` review outcome
  - keep docs concise while preserving diagrams and command surfaces
  - define browser/runtime/eval integration as contracts, not mandatory dependencies
- Closeout:
  - `readme-slim-pr` PR #29 is merged and archived as historical delivery state
  - workflow lanes now have a dedicated operator-facing entry in `docs/workflows.md`
  - README, maintenance, architecture, and release docs now describe the same lane model
  - browser and eval capabilities are documented as optional contracts, not core install requirements
- Success criteria:
  - users can identify the right Harness lane without reading internal policy detail
  - README and docs explain the workflow model without duplicating the full rules
  - evaluation and QA hooks remain optional and measurable

### v1.6: Release Readiness And Adoption Stabilization

- Status: planned
- Goal: close the foundation umbrella and make the repo ready for repeatable adoption, release, and external handoff.
- Scope:
  - close `harness-template-foundation` after release/adoption state is recorded
  - verify `dev`, `origin/dev`, and release documentation are aligned
  - ensure adoption automation reports only committed, meaningful changes
  - re-evaluate default safety posture after v1.4 is proven
- Success criteria:
  - active planning contains only current work
  - release docs match the renamed repository and current command surface
  - adoption status is reproducible across supported targets
  - broader safety rollout is based on verified overlay behavior

## Active Roadmap Items

### 1. Global Baseline + Workspace Safety Overlay

- Status: implementation complete
- Priority: high
- Problem: the current installer/runtime model uses a single authoritative repo state. Enabling workspace safety rewrites that state instead of layering safety on top of the existing global baseline.
- Goal: allow a workspace to enable safety for one IDE without disrupting the repo's global baseline, shared skills, or other workspace/IDE access patterns.
- Success criteria:
  - user-global baseline remains intact after workspace safety enablement
  - workspace safety is stored as an additive overlay, not as a replacement for the baseline state
  - `sync`, `doctor`, and `adoption-status` report both layers coherently

### 2. Safety Hook False-Positive Reduction

- Status: implementation complete
- Priority: high
- Problem: the current safety hook can block normal read-only agent/tool operations, which makes diagnosis and routine maintenance harder than intended.
- Goal: preserve destructive-action guardrails without aborting normal file reads, searches, verification commands, or other low-risk agent workflows.
- Success criteria:
  - normal read/search/verification flows do not trigger `Hook PreToolUse aborted`
  - dangerous commands still downgrade to `ask` or `deny`
  - Copilot runtime payload variants remain covered by regression tests

### 3. Re-evaluate Default Safety Posture

- Status: deferred
- Priority: medium
- Depends on:
  - Global Baseline + Workspace Safety Overlay
  - Safety Hook False-Positive Reduction
- Decision for now: keep safety available, but default-off. Revisit whether broader default rollout is warranted only after the two items above are complete and verified.
