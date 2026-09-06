# Backlog

This backlog turns roadmap direction into scoped work that can become GitHub issues, tracked implementation plans, or explicit "not yet" decisions.

## V1.3 Disposition

For the current V1.3 implementation, KER-001 is deferred, KER-002 is carried into the real-task baseline and replay, GOV-001 is superseded in scope by the current lightweight contract, GOV-002 and REC-003 are carried into the evidence/discovery work, REC-001/002 are replaced in scope by the existing Trio recovery contract, and UPD-001/OFFICE-001/MCP-001/ADOPT-001/CDX expansion items remain deferred. These labels are planning classification only; existing item `Status` values remain unchanged until independently verified.

Status values:

- `proposed`: shaped enough to discuss, not ready to execute
- `ready`: scoped enough to convert into an issue or tracked plan
- `blocked`: waiting on platform behavior, credentials, or another item
- `done`: delivered and verified

## Current Focus

The current mainline is kernel closure and governance productization:

1. harden `sync` and adjacent projection/update surfaces
2. validate the execution kernel on more real tracked tasks
3. close lightweight-default drift across hooks, installs, and route wording
4. make acceptance, release, and lifecycle discipline easier to operate day to day

Cloud-dev, MCP expansion, adoption kits, and office templates remain valuable, but they are intentionally deferred until the local kernel and governance surfaces are steadier.

## Mainline Now

### KER-001: Sync Boundary Hardening

- Status: ready
- Priority: high
- Type: runtime and structural hardening
- Scope: split `sync` into clearer planning, apply, report, projection, and cleanup concerns without weakening current verified behavior.
- Acceptance signals:
  - reviewable seams replace the current hotspot-style coordination surface
  - update/projection risk is easier to diagnose before writes occur
  - sync-level regressions are covered by focused proof instead of broad confidence only
- Dependencies: existing `sync` runtime services, update/report surfaces, and projection tests

### KER-002: Execution Kernel Proof On Real Tracked Tasks

- Status: ready
- Priority: high
- Type: validation and product shaping
- Scope: prove execution contracts, receipts, follow-up closure, and route truth on additional real tracked tasks beyond the original audit thread.
- Acceptance signals:
  - multiple real tracked tasks can use the execution-kernel surfaces without one-off rescue rules
  - receipts remain evidence-only, but summaries and reconciliation can rely on them safely
  - route truth is stable across quick, tracked, and deeper lanes
- Dependencies: execution contract and receipt runtime already shipped

### GOV-001: Lightweight-Default Hygiene Closure

- Status: ready
- Priority: high
- Type: operator experience and token/runtime hygiene
- Scope: close the remaining drift between what lightweight/tracked-lean surfaces promise and what they actually inject or require.
- Acceptance signals:
  - tracked-lean and session-start wording no longer imply heavier context than users receive
  - recommended install posture is clearer, including when `minimal-global` should remain the default
  - persistent payload warnings are either removed or explicitly accepted as intentional tradeoffs
- Dependencies: current hook payload surfaces, install profiles, and route-aware docs

### GOV-002: Acceptance Replay And Release Closure As First-Class Proof Surfaces

- Status: proposed
- Priority: high
- Type: verification and governance
- Scope: make acceptance replay, repo-workflow proof, and release closure easier to discover, run, and interpret as repo-level evidence surfaces.
- Acceptance signals:
  - there is a clear operator answer to "where is the authoritative acceptance proof?"
  - release-closure work no longer depends on scattered planning archaeology
  - weekly review can reference acceptance/release proof without re-explaining the surfaces each time
- Dependencies: current replay pack, release-closure tasks, and verification docs

### REC-001: Post-Implementation Reconcile Lane

- Status: ready
- Priority: high
- Type: workflow and lifecycle design
- Scope: add a `reconcile` lane after implementation and verification, before finish/archive, for tracked coding tasks and related governance work.
- Acceptance signals:
  - `docs/workflows.md` describes when reconciliation is required and when it can be marked not required
  - reconciliation compares planned intent, actual changes, acceptance status, verification evidence, intentional deviations, unresolved drift, and docs/backlog update needs
  - the default behavior is report-only; roadmap/backlog/spec rewrites still require explicit owner approval
  - one tracked coding-task dry run proves the lane from plan through archive-readiness
- Dependencies: `docs/reconciliation.md`, existing planning lifecycle

### REC-002: Reconciliation Artifact Persistence

- Status: ready
- Priority: high
- Type: planning lifecycle
- Scope: persist reconciliation output in durable task memory and preserve it during archive.
- Acceptance signals:
  - tracked work can store `planning/active/<task-id>/reconciliation.md` as an optional lifecycle artifact, or use an equivalent progress section
  - archive procedures preserve the reconciliation artifact
  - active summaries expose whether reconciliation is complete, not required, or still open
  - tiny tasks can explicitly mark `reconcile: not required` with a reason
- Dependencies: `REC-001`

### REC-003: SOT Map And Drift Policy

- Status: ready
- Priority: high
- Type: documentation and governance
- Scope: make source-of-truth boundaries explicit across code, tests, verification evidence, planning, specs, roadmap, backlog, MCP, and adapter policy.
- Acceptance signals:
  - `docs/reconciliation.md` or equivalent docs define which artifact is authoritative for which question
  - common drift cases include roadmap-vs-planning, spec-vs-code, and cloud-task-vs-local-state examples
  - conflict handling requires explicit reconciliation instead of silent overwrite
  - agents can discover this policy from roadmap, backlog, and workflow docs
- Dependencies: none

### UPD-001: Upstream Update Compatibility Contract

- Status: proposed
- Priority: medium-high
- Type: maintenance and release hygiene
- Scope: make upstream refresh/update output more reviewable before local projection changes are accepted.
- Acceptance signals:
  - update reports include changed upstream files, affected projections, required re-sync, risk level, and patch-drift warnings
  - focused adapter/projection checks are listed for updates that affect skills, hooks, or planning policy
  - the process preserves the existing update-then-sync separation
- Dependencies: existing upstream refresh automation

## Proof-Gated Expansion

These items stay backlogged unless the mainline above is sufficiently stable.

### MCP-001: MCP Read-Only Adoption As Compatibility Layer

- Status: proposed
- Priority: medium
- Type: compatibility and adoption
- Scope: treat MCP read-only as the minimum compatibility layer for agents or IDEs that do not yet warrant a native Harness adapter.
- Acceptance signals:
  - documentation defines native adapter, MCP read-only, and docs-only adoption tiers
  - MCP exposes or documents status, active task summary, task details, verification summaries, and safe dry-run surfaces where appropriate
  - a pilot integration can inspect Harness state without modifying repository files
  - MCP remains a runtime facade, not a platform-specific projection adapter
- Dependencies: completed MCP runtime facade review

### ADOPT-001: Deployment And Adoption Starter Kit

- Status: proposed
- Priority: medium
- Type: operator experience
- Scope: provide a small adoption package for new repositories and teams.
- Acceptance signals:
  - quickstart compares `minimal-global`, `full-local`, and `cloud-dev` profiles
  - includes rollback, doctor, sync dry-run, verify, and smoke-check steps
  - explains what upstream update can and cannot overwrite
  - a disposable-home or fixture-based adoption test validates the guide
- Dependencies: existing install and maintenance docs

### OFFICE-001: Everyday Work Lightweight Templates

- Status: proposed
- Priority: low-medium
- Type: workflow templates
- Scope: extend Harness discipline to research, decisions, document review, and follow-up work without diluting the coding-first architecture.
- Acceptance signals:
  - templates still use `planning/active/<task-id>/` with task plan, findings, progress, and optional reconciliation
  - non-coding tasks do not require worktrees, code diffs, or code verification
  - coding workflow remains the primary Harness use case and is not made more generic or vague
- Dependencies: `REC-003` and planning lifecycle

## Deferred Cloud Lanes

These remain intentional backlog items, but they are no longer the default next-focus lane.

### CDX-001: Cloud Dev Experience Parity Audit

- Status: ready
- Priority: medium
- Type: research and design
- Scope: compare local Harness workflow behavior with the current GitHub `cloud-dev` lane across planning state, skills, hooks, verification, branch isolation, recovery, and promotion.
- Acceptance signals:
  - a parity matrix lists local behavior, current cloud behavior, gap, and owner for each workflow surface
  - gaps are split into Copilot-specific work, shared Harness work, and platform research
  - the matrix links back to `docs/cloud-dev-harness.md`, `docs/workflows.md`, and `docs/reconciliation.md`
  - the matrix includes how remote tasks preserve or reconcile planning state, implementation summaries, verification evidence, and docs/backlog update needs
- Dependencies: current Copilot cloud-dev lane remains the baseline fact source

### CDX-002: Repo-Local Cloud Dev Issue Template

- Status: ready
- Priority: medium
- Type: documentation and GitHub configuration
- Scope: add a repo-local issue form or template for cloud-dev tasks with fields for goal, scope, acceptance criteria, verification, and task kind.
- Acceptance signals:
  - creating a cloud-dev issue from the template reliably applies the `cloud-dev` label and one `agent:*` task label
  - the template text mirrors the operator guide and avoids hidden branch assumptions
  - triage behavior is unchanged for non-template issues
- Dependencies: none

### CDX-003: Copilot Assignment Automation Decision

- Status: proposed
- Priority: medium
- Type: platform validation
- Scope: decide whether Harness should automate Copilot assignment through the official issue assignees API, leave assignment as a manual operator step, or support both behind an explicit repository variable.
- Acceptance signals:
  - a GitHub API probe confirms whether `agent_assignment.base_branch = cloud-dev` is still accepted and preserves PR base
  - the decision records whether issue templates alone can assign the coding agent in a way that preserves `cloud-dev`
  - any automated path is guarded by branch readiness and does not replace the existing triage preflight
- Dependencies: `CDX-002` and current direct assignment evidence

### CDX-004: Comment-Based Copilot Handoff Verification

- Status: ready
- Priority: medium
- Type: validation
- Scope: verify whether the workflow-posted `@copilot` prompt reliably causes Copilot to open PRs against `cloud-dev`, especially after adding explicit `base_branch=cloud-dev` wording.
- Acceptance signals:
  - a real issue-to-comment-to-Copilot run records task base, PR base, and head branch
  - the result distinguishes prompt compliance from official assignment API behavior
  - the operator guide is updated with the verified boundary
- Dependencies: merged PR that strengthens the prompt protocol

### CDX-005: Agent Tab Task Launcher Research

- Status: proposed
- Priority: low-medium
- Type: platform research
- Scope: determine whether GitHub's repository Agent tab can launch tasks directly with repo-owned context, labels, branch base, and verification expectations.
- Acceptance signals:
  - a short report identifies which inputs the Agent tab can control: base branch, task prompt, issue linkage, labels, assignee, and PR target
  - the report states whether tasks can start without an issue and still preserve durable planning state
  - recommended behavior is added to `docs/cloud-dev-harness.md` and this backlog
- Dependencies: access to the GitHub Agent tab in the target repository

### CDX-006: Agent-Neutral Cloud Task Contract

- Status: proposed
- Priority: medium
- Type: design
- Scope: define a shared handoff contract for cloud agents so Copilot, Codex, and Claude can receive the same task intent while using platform-specific dispatch mechanisms.
- Acceptance signals:
  - the contract names required fields: task id, source issue, base branch, target PR base, planning path, allowed commands, verification, and promotion policy
  - the contract separates common Harness requirements from platform-specific launch APIs
  - the current Copilot triage prompt can be expressed as one adapter implementation of the contract
- Dependencies: `CDX-001` and `CDX-003`

### CDX-007: Codex Cloud Agent Support Research

- Status: proposed
- Priority: low-medium
- Type: platform research
- Scope: research whether Codex has a cloud execution surface that can consume `AGENTS.md`, shared `.agents/skills`, hooks, and a controlled branch target from GitHub.
- Acceptance signals:
  - the report states the supported cloud entry points and their ability to set branch base and PR target
  - the report identifies required Harness projection changes, if any
  - a small pilot issue or task is defined only after the platform path is concrete
- Dependencies: `CDX-006`

### CDX-008: Claude Cloud Agent Support Research

- Status: proposed
- Priority: low-medium
- Type: platform research
- Scope: research whether Claude Code or related Claude cloud execution can run against GitHub with `CLAUDE.md`, `.claude/skills`, hooks, and a controlled branch target.
- Acceptance signals:
  - the report states the supported cloud entry points and their ability to set branch base and PR target
  - the report identifies whether Claude's skill and hook model can be projected without weakening local Claude Code support
  - a pilot path is proposed only when credentials, branch controls, and review boundaries are known
- Dependencies: `CDX-006`

### CDX-009: Cloud Dev Status Summary

- Status: proposed
- Priority: low-medium
- Type: operator experience
- Scope: provide a concise status command or generated report for the cloud-dev lane, including branch divergence, open PRs targeting `cloud-dev`, latest sync result, latest triage result, and active cloud issues.
- Acceptance signals:
  - a human can run one command before assigning a cloud agent and see whether the lane is ready
  - the output links to the relevant issue, PR, workflow run, or artifact when available
  - the report uses existing checkers rather than duplicating branch logic
- Dependencies: existing `check-cloud-dev-branch` runner

### CDX-010: Cloud Dev Promotion Playbook

- Status: ready
- Priority: low-medium
- Type: documentation and workflow hardening
- Scope: make promotion from `cloud-dev` to `dev` repeatable with a documented checklist and optional helper command.
- Acceptance signals:
  - the playbook states when to open a promotion PR, which verification is required, and how to recover from divergence
  - it keeps agent automation out of direct writes to `dev` and `main`
  - it references the same branch readiness checks used by issue triage
- Dependencies: none

### CDX-011: Copilot Ask `/create-issue` Minimal-Human Intake

- Status: ready
- Priority: medium
- Type: operator experience and platform validation
- Scope: validate and, if feasible, productize a flow where a human uses `https://github.com/copilot` ask mode with `/create-issue`, writes only a short natural-language issue description, and the system turns it into a cloud-dev-ready issue.
- Acceptance signals:
  - a human can provide only a short freeform description instead of manually filling the full cloud-dev issue structure
  - the created issue body is normalized into the repo's preferred cloud-dev structure such as Goal, Scope, Acceptance Criteria, and Verification
  - the issue receives `cloud-dev` plus exactly one task-kind label automatically
  - if GitHub platform behavior allows it, Copilot assignment is applied automatically and preserves `cloud-dev` as the working base through the official assignment path
  - if automatic assignment is not available from `/create-issue`, the remaining human or workflow fallback step is explicitly documented and kept minimal
  - the end-to-end behavior is verified on the real GitHub path from ask-mode issue creation to either triage handoff or direct assignment
- Dependencies: `CDX-002`, `CDX-003`, and current operator evidence for Copilot cloud-dev assignment

## Current Answers To Open Questions

- Cloud-dev remains a real lane, but it is no longer the default next-focus lane for this repository.
- MCP read-only and adoption packaging remain valuable because they can widen compatibility without a full native adapter, but they should wait until the local kernel and governance surfaces are calmer.
- Multi-agent cloud support for Codex and Claude should stay research-only until the repository can prove a stable local contract worth projecting outward.
