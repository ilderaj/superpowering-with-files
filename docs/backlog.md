# Backlog

This backlog turns roadmap direction into scoped work that can become GitHub issues, cloud-dev agent tasks, or human-owned implementation plans.

Status values:

- `proposed`: shaped enough to discuss, not ready for execution.
- `ready`: scoped enough to convert into an issue or implementation plan.
- `blocked`: waiting on platform behavior, credentials, or another backlog item.
- `done`: delivered and verified.

## Current Focus

The next focus area is cloud development parity: make the remote `cloud-dev` lane feel as predictable as the local Harness workflow while preserving branch safety, planning state, and human review boundaries.

## Backlog Items

### CDX-001: Cloud Dev Experience Parity Audit

- Status: ready
- Priority: high
- Type: research and design
- Scope: Compare local Harness workflow behavior with the current GitHub `cloud-dev` lane across planning state, skills, hooks, verification, branch isolation, recovery, and promotion.
- Acceptance signals:
  - A parity matrix lists local behavior, current cloud behavior, gap, and owner for each workflow surface.
  - Gaps are split into Copilot-specific work, shared Harness work, and platform research.
  - The matrix links back to `docs/cloud-dev-harness.md` and `docs/workflows.md`.
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

- Status: proposed
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

- Status: proposed
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

## Current Answers To Open Questions

- Issue templates can standardize the shape of cloud-dev requests and apply labels, which is enough to trigger the current triage workflow. They should not be described as proven native cloud-agent assignment until tested against the real GitHub coding-agent assignment behavior.
- Without a template, Copilot can still be assigned through the official issue assignees API with `agent_assignment.base_branch = cloud-dev`; this repository has real validation evidence for that direct assignment path.
- The specific requirement "human only gives a short description in Copilot ask `/create-issue`, then the system normalizes the issue, adds cloud-dev labels, and assigns the cloud agent with minimal manual formatting" was only partially covered before. It is now tracked explicitly as `CDX-011`.
- The existing issue-triggered workflow posts a normalized `@copilot` handoff comment. That is useful and already deduped, but prompt-based branch control should be described separately from the official assignment API path until a real comment-based run proves PR base behavior.
- Repo Agent tab execution is a platform research item. The desired end state is direct task launch from the repo UI with the same branch, planning, and verification contract as issue-first work.
- Codex and Claude cloud support should start as platform research plus an agent-neutral handoff contract. Local Harness support for Codex and Claude already exists, but it is not the same as cloud-dev automation.
