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

## Projected Inventory

The projected inventory is exactly this entry policy plus `trio/SKILL.md`, `trio/dev/SKILL.md`, `trio/office/SKILL.md`, and `trio/safety/SKILL.md`. The entry policy is routing policy, not a fifth capability pack.

## Human Gates

Destructive, external, credential, security-sensitive, merge, push, publish, release, deploy, send, and data-loss actions retain the applicable Host and human gate. Routing never grants permission, and worker completion remains a candidate until Chief acceptance and Trio writeback.
