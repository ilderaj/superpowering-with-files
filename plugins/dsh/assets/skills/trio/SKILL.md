---
name: trio
description: Stable Trio entry policy for task routing and capability selection.
---

# Trio Entry

This entry policy selects a task route and one capability family. It does not become a task authority, execute lifecycle actions, or replace Host controls.

## Route First

Route before choosing effort or execution topology. First classify the current work from its scope, duration, uncertainty, and durability needs. Only after the route is known may the Host and caller select an effort intent or execution topology.

## Task Classes

### Quick

Quick work is direct and lightweight: no Trio creation and no mandatory worker or fan-out. It does not require a worktree, design round, or review round.

### Tracked

Tracked work creates or restores only the bound task's three planning files: `planning/active/<task-id>/task_plan.md`, `planning/active/<task-id>/findings.md`, and `planning/active/<task-id>/progress.md`. The Trio is the only durable task authority; no fourth task-state file is introduced.

### Deep

Deep is a current-round reasoning decision for material uncertainty, unclear architecture, a non-obvious root cause, or high-risk judgment. It is not a durable task type and does not create another authority.

## Capability Selection

After routing, choose exactly one capability family: `dev`, `office`, or `safety`. The selected capability may define quality behavior within its own boundary, but it may not take ownership of task state, Host lifecycle, or external gates.

## Plan and Execute Boundary

Delegated execution separates planning from production mutation. Chief: intake, route, planning, authority, assignment, gates, review, and acceptance. Execution worker: production changes and primary verification. The worker result is a candidate only; Chief acceptance is required before durable completion.

Tracked work may be executed directly or governed by Chief. Direct tracked execution performs its own production changes and primary verification and can establish technical verification. Chief independent acceptance is required only when a visible or delegated worker is the primary executor, or when the chosen governance lane explicitly requires it. When a visible worker is primary, the Chief never substitutes a native subagent or performs Chief inline execution, and the worker result remains a candidate until Chief acceptance and Trio writeback.

When primary execution requires a visible worker, the Chief never performs production mutations inline and never substitutes a native subagent for that execution worker. If a compliant visible worker is unavailable, the Host returns `manual_pending` or `blocked`; it never falls back to Chief inline execution. Native subagents remain allowed only as worker-local bounded delegation. Requested model and effort are intent; actual model and effort remain unknown without authenticated Host evidence.

## Authority and Host Boundary

The Trio remains the sole durable task authority. The Host owns worker and subtask lifecycle, requested and actual model evidence, permissions, continuation, and external or human gates. Host-native goal and continuation are the long-task runtime; this entry policy is not a scheduler, daemon, poller, or runner.

Requested model and effort are intent. Without authenticated Host evidence, actual remains unknown. Worker done is only a candidate; the Chief performs acceptance and Trio writeback.

## Human Gates

Destructive, external, credential or security-sensitive, merge, push, publish, release, deploy, send, and data-loss actions retain the applicable human gate. A route or capability selection never grants permission for those actions.
