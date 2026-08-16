---
name: trio-v2-entry
description: Minimal V2 entry policy for route-first task classification and capability selection.
---

# Trio V2 Entry Policy

## Route First

Route first, then choose effort or execution topology. A route is known before a worker, fan-out, or effort intent is selected.

## Durable Authority

The Trio planning files are the sole durable task authority: `task_plan.md`, `findings.md`, and `progress.md`. The Host owns worker lifecycle, continuation, permissions, and authenticated model evidence. Actual model and effort remain unknown without authenticated Host evidence.

## Capability Selection

Each task selects exactly one capability family: `dev`, `office`, or `safety`. Deep is a current-round reasoning decision for material uncertainty; it is not a durable task type and creates no authority.

## Plan and Execute Boundary

Delegated execution separates planning from production mutation. Chief: intake, route, planning, authority, assignment, gates, review, and acceptance. Execution worker: production changes and primary verification. The worker result is a candidate only; Chief acceptance is required before durable completion.

When primary execution requires a visible worker, the Chief never performs production mutations inline and never substitutes a native subagent for that execution worker. If a compliant visible worker is unavailable, the Host returns `manual_pending` or `blocked`; it never falls back to Chief inline execution. Native subagents remain allowed only as worker-local bounded delegation.

## Projected Inventory

The projected inventory is exactly this entry policy plus `trio/SKILL.md`, `trio/dev/SKILL.md`, `trio/office/SKILL.md`, `trio/safety/SKILL.md`, and one companion `chiefops/SKILL.md`. The entry policy is routing policy, not a fifth capability pack. The ChiefOps companion is a governance companion outside the three capability families; it is not a runner, scheduler, registry, or fourth task-state surface.

## Human Gates

Destructive, external, credential, security-sensitive, merge, push, publish, release, deploy, send, and data-loss actions retain the applicable Host and human gate. Routing never grants permission, and worker completion remains a candidate until Chief acceptance and Trio writeback.
