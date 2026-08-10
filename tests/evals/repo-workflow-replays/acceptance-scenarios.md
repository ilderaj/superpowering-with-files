# Repo Workflow Replay Acceptance Scenarios

## Purpose

These opt-in replay scenarios describe the current user-visible Trio workflow boundary. They are not a second runtime and do not turn a generic/manual handoff into a managed host.

## Current Target Boundary

Codex is the only managed local target.

Other environments use a generic/manual fallback.

Copilot cloud dispatch is a separate external-behavior K3 DAG, not a repository host projection.

## Scenario Set

### 1. Codex Managed Local Projection

- Surface:
  - `AGENTS.md`
  - `.agents/skills/trio/SKILL.md`
  - `.codex/AGENTS.md` for user-global placement
- Claim:
  - the managed Codex surface contains the entry policy, exactly the four Trio skills, and one ChiefOps governance companion.

### 2. Generic/Manual Fallback

- Surface:
  - a bounded manual handoff with an Assignment Packet and the active Trio paths
- Claim:
  - an un-managed environment does not receive a repository projection or a claimed native worker operation.

### 3. K3 Cloud Boundary

- Surface:
  - the separately governed GitHub cloud-dev lane
- Claim:
  - a retained external cloud handoff does not add a managed local host target or alter the Trio authority.

## Evidence

- `tests/trio/projection.test.mjs` proves the managed Codex and manual generic target contracts.
- `tests/plugin-kit/docs-contract.test.mjs` proves the current documentation boundary and the physical absence of retired repository projections.
- `tests/automation/cloud-dev-issue.test.mjs` remains the isolated proof surface for the external K3 cloud behavior.
