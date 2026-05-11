# Roadmap

This document captures deferred product and workflow work that is intentionally not in the current default baseline.

## Current Direction

- Keep the global Harness baseline broad: Codex, Copilot, Cursor, and Claude Code remain part of `adopt-global`.
- Keep `safety` and `cloud-safe` off by default for global installs.
- Treat safety as a workspace-scoped capability until the overlay model and tool-allowance issues are resolved.
- Productize `cloud-dev` as the next operator lane: remote work should feel as predictable as local Harness work while staying isolated behind human review and branch promotion.
- Treat the current Copilot cloud-dev lane as the verified baseline, then expand through explicit platform research for Codex and Claude cloud agents.
- Prefer issue-first cloud tasks today because issues preserve durable task state, labels, workflow preflight, and review history.
- Explore two additional cloud entry points: native Copilot assignment during issue creation, and direct task launch from the repository Agent tab.

Detailed execution candidates live in [Backlog](backlog.md). Keep this roadmap focused on direction, sequencing, and product boundaries.

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

- Status: complete
- Goal: close the foundation umbrella and make the repo ready for repeatable adoption, release, and external handoff.
- Scope:
  - close `harness-template-foundation` after release/adoption state is recorded
  - verify `dev`, `origin/dev`, and release documentation are aligned
  - ensure adoption automation reports only committed, meaningful changes
  - re-evaluate default safety posture after v1.4 is proven
- Closeout:
  - `adopt-global` now refreshes the user-global receipt against the current verified repo head, and `adoption-status` returns `in_sync` across the supported targets
  - release docs continue to point at the renamed `superpowering-with-files` repository and current `harness verify` / `doctor` command surface
  - `harness-template-foundation` is closed as a delivery umbrella after release/adoption facts are recorded and archived
  - default safety posture remains `keep default-off`; broader rollout stays deferred until the `v1.4` scheduled-run observation lands
- Success criteria:
  - active planning contains only current work
  - release docs match the renamed repository and current command surface
  - adoption status is reproducible across supported targets
  - broader safety rollout is based on verified overlay behavior

### v1.7: Cloud Dev Experience Parity

- Status: planned
- Goal: make the remote `cloud-dev` lane match the local Harness experience where it matters: planning state, skill visibility, verification, recovery, branch isolation, and operator handoff.
- Scope:
  - audit local-vs-cloud workflow parity across Copilot, Codex, and Claude entry surfaces
  - keep Copilot `github-cloud` as the first verified implementation lane
  - add repo-local issue templates or issue forms for cloud-dev tasks
  - decide whether native Copilot assignment should be automated, manual, or both behind an explicit repository switch
  - produce a concise status summary for branch readiness, active issues, PRs, and latest workflow artifacts
- Success criteria:
  - a human can start cloud-dev work without remembering branch, label, or verification details
  - issue-first tasks preserve the same planning and review boundaries as local work
  - direct Copilot assignment remains clearly separated from workflow preflight
  - prompt-based handoff and assignment-API handoff have separately recorded evidence

### v1.8: Multi-Agent Cloud Support And Direct Repo Entry

- Status: proposed
- Goal: extend cloud-dev beyond Copilot only after each platform has a verified launch, branch-control, credential, and PR-review story.
- Scope:
  - define an agent-neutral cloud task contract for issue, branch, planning, verification, and promotion metadata
  - research Codex cloud execution support for `AGENTS.md`, shared `.agents/skills`, hooks, and branch targeting
  - research Claude cloud execution support for `CLAUDE.md`, `.claude/skills`, hooks, and branch targeting
  - evaluate whether the repository Agent tab can launch tasks directly while preserving the same cloud-dev contract
  - keep local Harness support for Codex and Claude distinct from unverified cloud dispatch claims
- Success criteria:
  - each supported cloud agent has a documented, tested dispatch path
  - unsupported or partially supported agents remain documented as research lanes, not promised automation
  - direct repo UI task launch can be accepted only when it preserves `cloud-dev` base, planning state, and review boundaries

## Active Roadmap Items

### 1. Cloud Dev Experience Parity

- Status: planned
- Priority: high
- Problem: local Harness workflows have clear planning, verification, and recovery surfaces, while cloud-dev still requires operator knowledge spread across docs, workflows, and GitHub UI behavior.
- Goal: give cloud-dev a first-class operator experience without weakening the remote-only staging boundary.
- Success criteria:
  - a parity matrix identifies local behavior, current cloud behavior, and gaps
  - cloud-dev issue creation captures labels, scope, acceptance criteria, and verification consistently
  - preflight and status checks are visible before any cloud agent is assigned

### 2. Cloud Agent Assignment And Issue Entry

- Status: planned
- Priority: high
- Problem: issue templates, comment-based `@copilot` handoff, and official Copilot assignment API are related but not equivalent. The roadmap needs separate evidence for each path.
- Goal: make issue-first cloud tasks easy to create while keeping assignment and branch targeting explicit.
- Success criteria:
  - repo-local cloud-dev issue templates or forms are available
  - direct Copilot assignment with `agent_assignment.base_branch = cloud-dev` remains documented as a verified override path
  - comment-based handoff has its own real branch-targeting validation before being described as equivalent

### 3. Multi-Agent Cloud Dispatch

- Status: proposed
- Priority: medium
- Problem: Codex and Claude have local Harness projections, but the repository does not yet have a verified cloud dispatch path for either platform.
- Goal: support Codex and Claude cloud agents only through verified, platform-specific dispatch adapters that satisfy the shared cloud-dev contract.
- Success criteria:
  - agent-neutral task metadata is defined before adding new cloud dispatchers
  - Codex and Claude support statements distinguish local checkout support from cloud automation
  - each new cloud agent path proves branch base, PR target, credentials, tool surface, and verification behavior

### 4. Repository Agent Tab Direct Execution

- Status: proposed
- Priority: medium
- Problem: issue-triggered tasks are durable but not always the fastest UI path. The repository Agent tab may offer direct execution, but its branch and task-state controls need verification.
- Goal: allow direct repo UI task launch only if it preserves cloud-dev branch safety, planning state, and review boundaries.
- Success criteria:
  - Agent tab inputs and outputs are documented
  - direct task launch can set or preserve `cloud-dev` as base and target PR branch
  - tasks launched outside issues still produce a durable trace, or the roadmap keeps issue-first as the required entry

### 5. Re-evaluate Default Safety Posture

- Status: deferred
- Priority: medium
- Depends on:
  - completed workspace safety overlay evidence
  - completed safety hook false-positive reduction evidence
  - cloud-dev parity results
- Decision for now: keep safety available, but default-off. Revisit broader default rollout only after local and cloud operator paths both have verified overlay behavior.
