# Backlog

This backlog turns roadmap direction into scoped work that can become GitHub issues, cloud-dev agent tasks, or human-owned implementation plans.

Status values:

- `proposed`: shaped enough to discuss, not ready for execution.
- `ready`: scoped enough to convert into an issue or implementation plan.
- `blocked`: waiting on platform behavior, credentials, or another backlog item.
- `done`: delivered and verified.

## Current Focus

The next focus area is Harness traceability and adoption convergence: first add post-implementation reconciliation and source-of-truth boundaries, then continue cloud-dev parity through an agent-neutral contract, MCP compatibility, deployment/adoption hardening, upstream-update safety, and lightweight everyday-work templates.

## Backlog Items

### CDX-001: Cloud Dev Experience Parity Audit

- Status: ready (documentation contract started in [Cloud Dev Parity](cloud-dev-parity.md); live cloud behavior gaps remain open)
- Priority: high
- Type: research and design
- Scope: Compare local Harness workflow behavior with the current GitHub `cloud-dev` lane across planning state, skills, hooks, verification, branch isolation, recovery, and promotion.
- Acceptance signals:
  - A parity matrix lists local behavior, current cloud behavior, gap, and owner for each workflow surface.
  - Gaps are split into Copilot-specific work, shared Harness work, and platform research.
  - The matrix links back to `docs/cloud-dev-harness.md`, `docs/workflows.md`, and `docs/reconciliation.md`.
  - The matrix includes how remote tasks preserve or reconcile planning state, implementation summaries, verification evidence, and docs/backlog update needs.
- Dependencies: current Copilot cloud-dev lane remains the baseline fact source.

### CDX-002: Repo-Local Cloud Dev Issue Template

- Status: ready
- Priority: high
- Type: documentation and GitHub configuration
- Scope: Add a repo-local issue form or template for cloud-dev tasks with fields for goal, scope, acceptance criteria, verification, and task kind.
- Acceptance signals:
  - Creating a cloud-dev issue from the template reliably applies the `cloud-dev` label and one `agent:*` task label.
  - The template text mirrors the operator guide and avoids hidden branch assumptions.
  - The triage workflow behavior is unchanged for non-template issues.
- Dependencies: none.

### CDX-003: Copilot Assignment Automation Decision

- Status: proposed
- Priority: high
- Type: platform validation
- Scope: Decide whether Harness should automate Copilot assignment through the official issue assignees API, leave assignment as a manual operator step, or support both behind an explicit repository variable.
- Acceptance signals:
  - A GitHub API probe confirms whether `agent_assignment.base_branch = cloud-dev` is still accepted and preserves PR base.
  - The decision records whether issue templates alone can assign the coding agent in a way that preserves `cloud-dev`.
  - Any automated path is guarded by branch readiness and does not replace the existing triage preflight.
- Dependencies: `CDX-002` for template behavior, current direct assignment evidence from issue `#58` and PR `#59`.

### CDX-004: Comment-Based Copilot Handoff Verification

- Status: ready
- Priority: high
- Type: validation
- Scope: Verify whether the workflow-posted `@copilot` prompt reliably causes Copilot to open PRs against `cloud-dev`, especially after adding explicit `base_branch=cloud-dev` wording.
- Acceptance signals:
  - A real issue-to-comment-to-Copilot run records task base, PR base, and head branch.
  - The result distinguishes prompt compliance from official assignment API behavior.
  - The operator guide is updated with the verified boundary.
- Dependencies: merged PR that strengthens the prompt protocol.

### CDX-005: Agent Tab Task Launcher Research

- Status: proposed
- Priority: medium
- Type: platform research
- Scope: Determine whether GitHub's repository Agent tab can launch tasks directly with repo-owned context, labels, branch base, and verification expectations.
- Acceptance signals:
  - A short report identifies which inputs the Agent tab can control: base branch, task prompt, issue linkage, labels, assignee, and PR target.
  - The report states whether tasks can start without an issue and still preserve durable planning state.
  - Recommended behavior is added to `docs/cloud-dev-harness.md` and this backlog.
- Dependencies: access to the GitHub Agent tab in the target repository.

### CDX-006: Agent-Neutral Cloud Task Contract

- Status: proposed (initial documentation contract exists in [Cloud Dev Parity](cloud-dev-parity.md); automation remains future work)
- Priority: medium
- Type: design
- Scope: Define a shared handoff contract for cloud agents so Copilot, Codex, and Claude can receive the same task intent while using platform-specific dispatch mechanisms.
- Acceptance signals:
  - The contract names required fields: task id, source issue, base branch, target PR base, planning path, allowed commands, verification, and promotion policy.
  - The contract separates common Harness requirements from platform-specific launch APIs.
  - Existing Copilot triage prompt can be expressed as one adapter implementation of the contract.
- Dependencies: `CDX-001` and `CDX-003`.

### CDX-007: Codex Cloud Agent Support Research

- Status: proposed
- Priority: medium
- Type: platform research
- Scope: Research whether Codex has a cloud execution surface that can consume `AGENTS.md`, shared `.agents/skills`, hooks, and a controlled branch target from GitHub.
- Acceptance signals:
  - The report states the supported cloud entry points and their ability to set branch base and PR target.
  - The report identifies required Harness projection changes, if any.
  - A small pilot issue or task is defined only after the platform path is concrete.
- Dependencies: `CDX-006`.

### CDX-008: Claude Cloud Agent Support Research

- Status: proposed
- Priority: medium
- Type: platform research
- Scope: Research whether Claude Code or related Claude cloud execution can run against GitHub with `CLAUDE.md`, `.claude/skills`, hooks, and a controlled branch target.
- Acceptance signals:
  - The report states the supported cloud entry points and their ability to set branch base and PR target.
  - The report identifies whether Claude's skill and hook model can be projected without weakening local Claude Code support.
  - A pilot path is proposed only when credentials, branch controls, and review boundaries are known.
- Dependencies: `CDX-006`.

### CDX-009: Cloud Dev Status Summary

- Status: proposed
- Priority: medium
- Type: operator experience
- Scope: Provide a concise status command or generated report for the cloud-dev lane, including branch divergence, open PRs targeting `cloud-dev`, latest sync result, latest triage result, and active cloud issues.
- Acceptance signals:
  - A human can run one command before assigning a cloud agent and see whether the lane is ready.
  - The output links to the relevant issue, PR, workflow run, or artifact when available.
  - The report uses existing checkers rather than duplicating branch logic.
- Dependencies: existing `check-cloud-dev-branch` runner.

### CDX-010: Cloud Dev Promotion Playbook

- Status: ready
- Priority: medium
- Type: documentation and workflow hardening
- Scope: Make promotion from `cloud-dev` to `dev` repeatable with a documented checklist and optional helper command.
- Acceptance signals:
  - The playbook states when to open a promotion PR, which verification is required, and how to recover from divergence.
  - It keeps agent automation out of direct writes to `dev` and `main`.
  - It references the same branch readiness checks used by issue triage.
- Dependencies: none.

### CDX-011: Copilot Ask `/create-issue` Minimal-Human Intake

- Status: ready
- Priority: high
- Type: operator experience and platform validation
- Scope: Validate and, if feasible, productize a flow where a human uses `https://github.com/copilot` ask mode with `/create-issue`, writes only a short natural-language issue description, and the system turns it into a cloud-dev-ready issue.
- Acceptance signals:
  - A human can provide only a short freeform description instead of manually filling the full cloud-dev issue structure.
  - The created issue body is normalized into the repo's preferred cloud-dev structure such as Goal, Scope, Acceptance Criteria, and Verification.
  - The issue receives `cloud-dev` plus exactly one task-kind label automatically.
  - If GitHub platform behavior allows it, Copilot assignment is applied automatically and preserves `cloud-dev` as the working base through the official assignment path.
  - If automatic assignment is not available from `/create-issue`, the remaining human or workflow fallback step is explicitly documented and kept minimal.
  - The end-to-end behavior is verified on the real GitHub path from ask-mode issue creation to either triage handoff or direct assignment.
- Dependencies: `CDX-002`, `CDX-003`, and current operator evidence for Copilot cloud-dev assignment.

### REC-001: Post-Implementation Reconcile Lane

- Status: ready
- Priority: high
- Type: workflow and lifecycle design
- Scope: Add a `reconcile` lane after implementation and verification, before finish/archive, for tracked coding tasks and cloud-dev work.
- Acceptance signals:
  - `docs/workflows.md` describes when reconciliation is required and when it can be marked not required.
  - Reconciliation compares planned intent, actual changes, acceptance status, verification evidence, intentional deviations, unresolved drift, and docs/backlog update needs.
  - The default behavior is report-only; roadmap/backlog/spec rewrites require explicit owner approval.
  - One tracked coding-task dry run proves the lane from plan through archive-readiness.
- Dependencies: `docs/reconciliation.md`, existing planning lifecycle.

### REC-002: Reconciliation Artifact Persistence

- Status: ready
- Priority: high
- Type: planning lifecycle
- Scope: Persist reconciliation output in durable task memory and preserve it during archive.
- Acceptance signals:
  - Tracked work can store `planning/active/<task-id>/reconciliation.md` or an equivalent `## Reconciliation` progress section.
  - Archive procedures preserve the reconciliation artifact.
  - Active summaries can expose whether reconciliation is complete, not required, or still open.
  - Tiny tasks can explicitly mark `reconcile: not required` with a reason.
- Dependencies: REC-001.

### REC-003: SOT Map And Drift Policy

- Status: ready (policy in [Reconciliation](reconciliation.md); report format in [State Convergence](state-convergence.md))
- Priority: high
- Type: documentation and governance
- Scope: Make source-of-truth boundaries explicit across code, tests, verification evidence, planning, specs, roadmap, backlog, MCP, and adapter policy.
- Acceptance signals:
  - `docs/reconciliation.md` or equivalent docs define which artifact is authoritative for which question.
  - Common drift cases include roadmap-vs-planning, spec-vs-code, and cloud-task-vs-local-state examples.
  - Conflict handling requires explicit reconciliation instead of silent overwrite.
  - Agents can discover this policy from roadmap, backlog, and workflow docs.
- Dependencies: none.

### MCP-001: MCP Read-Only Adoption As Compatibility Layer

- Status: proposed (tier contract documented in [MCP Read-Only Compatibility](mcp-read-only-compatibility.md); pilot integration still pending)
- Priority: high
- Type: compatibility and adoption
- Scope: Treat MCP read-only as the minimum compatibility layer for agents or IDEs that do not yet warrant a native Harness adapter.
- Acceptance signals:
  - Documentation defines native adapter, MCP read-only, and docs-only adoption tiers.
  - MCP exposes/read-documents status, active task summary, task details, verification summaries, and safe dry-run surfaces where appropriate.
  - A pilot integration can inspect Harness state without modifying repository files.
  - MCP remains a runtime facade, not a platform-specific projection adapter.
- Dependencies: completed MCP runtime facade review.

### ADOPT-001: Deployment And Adoption Starter Kit

- Status: proposed (operator guide drafted in [Adoption Starter Kit](install/adoption-starter-kit.md); fixture/disposable-home validation still pending)
- Priority: medium
- Type: operator experience
- Scope: Provide a small adoption package for new repositories and teams.
- Acceptance signals:
  - Quickstart compares `minimal-global`, `full-local`, and `cloud-dev` profiles.
  - Includes rollback, doctor, sync dry-run, verify, and smoke-check steps.
  - Explains what upstream update can and cannot overwrite.
  - A disposable-home or fixture-based adoption test validates the guide.
- Dependencies: existing install and maintenance docs.

### UPD-001: Upstream Update Compatibility Contract

- Status: proposed (report contract documented in [Upstream Update Compatibility](upstream-update-compatibility.md); command output automation remains future work)
- Priority: medium
- Type: maintenance and release hygiene
- Scope: Make upstream refresh/update output more reviewable before local projection changes are accepted.
- Acceptance signals:
  - Update reports include changed upstream files, affected projections, required re-sync, risk level, and patch-drift warnings.
  - Focused adapter/projection checks are listed for updates that affect skills, hooks, or planning policy.
  - The process preserves the existing update-then-sync separation.
- Dependencies: existing upstream refresh automation.

### OFFICE-001: Everyday Work Lightweight Templates

- Status: proposed (initial templates documented in [Office Templates](office-templates.md); generation commands are not implemented)
- Priority: low-medium
- Type: workflow templates
- Scope: Add lightweight Harness templates for non-coding work such as research, decision records, document review, meeting follow-up, and approvals.
- Acceptance signals:
  - Templates still use `planning/active/<task-id>/` with task plan, findings, progress, and optional reconciliation.
  - Non-coding tasks do not require worktrees, code diffs, or code verification.
  - Coding workflow remains the primary Harness use case and is not made more generic or vague.
- Dependencies: REC-003 and planning lifecycle.

## Current Answers To Open Questions

- Issue templates can standardize the shape of cloud-dev requests and apply labels, which is enough to trigger the current triage workflow. They should not be described as proven native cloud-agent assignment until tested against the real GitHub coding-agent assignment behavior.
- Official GitHub Docs now state that Copilot on `https://github.com/copilot` can create issues from natural language or screenshots, fill title, body, labels, assignees, and more using repository issue forms or templates, and optionally assign the issue to Copilot during creation.
- Without a template, Copilot can still be assigned through the official issue assignees API with `agent_assignment.base_branch = cloud-dev`; this repository has real validation evidence for that direct assignment path.
- The specific requirement "human only gives a short description in Copilot ask `/create-issue`, then the system normalizes the issue, adds cloud-dev labels, and assigns the cloud agent with minimal manual formatting" was only partially covered before. It is now tracked explicitly as `CDX-011`.
- The remaining unknown is repo-specific rather than platform-generic: we still need to verify whether Copilot issue creation on GitHub can reliably map this repository's preferred `cloud-dev` and `agent:*` labels, and whether assignment at creation time can preserve `cloud-dev` as the working base without a separate manual override.
- The existing issue-triggered workflow posts a normalized `@copilot` handoff comment. That is useful and already deduped, but prompt-based branch control should be described separately from the official assignment API path until a real comment-based run proves PR base behavior.
- Repo Agent tab execution is a platform research item. The desired end state is direct task launch from the repo UI with the same branch, planning, and verification contract as issue-first work.
- Codex and Claude cloud support should start as platform research plus an agent-neutral handoff contract. Local Harness support for Codex and Claude already exists, but it is not the same as cloud-dev automation.
