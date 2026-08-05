# Architecture

This page is the implementation map of Harness.

Use it when you need to answer:

- where a behavior lives
- which layer owns a rule
- which artifact is authoritative
- how projection, runtime, MCP, hooks, and upstream baselines fit together

superpowering-with-files uses six layers:

- `harness/core`: platform-neutral policy, skills metadata, templates, and schemas.
- `harness/adapters`: platform-specific projection manifests.
- `harness/installer`: CLI commands and projection logic.
- `harness/runtime`: typed runtime services shared by CLI and MCP.
- `harness/mcp`: MCP tools, resources, and transports.
- `harness/upstream`: vendored baselines and source metadata.

Core is the source of truth. Adapters translate core into platform-specific entry files. The installer manages state, safe writes, and entry + skills projection. Runtime services hold reusable business logic. The MCP layer exposes that logic to external agents as a governed facade rather than as another adapter.

The runtime split is intentional:

- `harness/adapters` remains the legacy compatibility boundary for the current Codex target.
- `harness/runtime` contains root policy, status/doctor/summary services, dry-run planning, safe-apply flows, approval verification, receipts, and registry/policy evaluation.
- `harness/mcp` registers those services as MCP tools and resources over stdio or Streamable HTTP.

If a feature can be shared between CLI and MCP, it belongs in `harness/runtime`, not in `harness/mcp`, and not in a shell wrapper around `./scripts/harness`.

## Trio v2 Operating Boundary

The planning Trio is the sole durable task authority: `planning/active/<task-id>/task_plan.md`, `planning/active/<task-id>/findings.md`, and `planning/active/<task-id>/progress.md`. Documentation and Host state do not replace it.

Route work first, then select one capability family: `dev`, `office`, or `safety`. The Host owns worker and subtask lifecycle, permissions, continuation, and external or human gates.

Codex is the only managed native target. Other Host environments use a generic/manual fallback rather than a managed projection.

This repository does not project planning hooks or scripts. Host hook configuration remains Host-owned and non-authoritative. It never replaces the Trio planning files or main-session round start.

## Operator Surface

The implementation layers above are not the same thing as the operator surface.

- The implementation surface is `core`, `adapters`, `installer`, and `upstream`.
- The operator surface is the workflow-lane map documented in [Workflows](workflows.md).

This separation is intentional:

- workflow lanes package the repo for day-to-day use
- implementation layers keep rendering, projection, and lifecycle mechanics centralized
- optional integrations such as browser automation or eval harnesses remain contracts until the project intentionally adopts a concrete runtime

Browser and eval are therefore architecture extension points, not baseline install requirements.

## Source-Of-Truth And Reconciliation

`docs/reconciliation.md` defines how Harness resolves drift between intended behavior, actual code, verification evidence, active planning, roadmap, backlog, and companion artifacts. Architecture policy should not treat old specs as automatically more authoritative than verified implementation facts, and verified implementation facts should not be treated as accepted product intent without an owner decision.
