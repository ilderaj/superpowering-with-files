# Architecture

This page is the implementation map of Harness.

Use it when you need to answer:

- where a behavior lives
- which layer owns a rule
- which artifact is authoritative
- how projection, distribution, and upstream baselines fit together

For the current model-selection recommendations and decision diagrams, see [README](../README.md) and [Astra migration](astra-harness-upgrade.md). Thin entry files load detailed skill references only when relevant. Model choice, reasoning effort, and topology are independent decisions. Existing authorization remains applicable within scope.

## Implementation Layers

superpowering-with-files uses four implementation layers plus one distribution package:

- `harness/core`: platform-neutral policy, skills metadata, templates, and schemas.
- `harness/installer`: CLI commands and projection logic.
- `harness/trio`: Trio v2 entry policy, capability packs, the ChiefOps governance companion, host expressions, and compatibility fixtures.
- `harness/upstream`: vendored baselines and source metadata.
- `packages/plugin-kit`: release-artifact builder and validators that generate packages directly from the Trio skill sources.

Core is the source of truth for policy. The installer manages state, safe writes, and entry + skills projection for the local Codex install path. The Trio layer owns the workflow protocol: its entry policy routes work first, the `dev`, `office`, and `safety` capability packs define quality contracts, and the ChiefOps companion restores the planning trio without acting as a runner. The host expressions under `harness/trio/hosts/` carry Host routing and permission semantics for Codex (`codex.mjs`) and the manual fail-closed fallback (`generic.mjs`); they are governance semantics, not package-format adapters.

The retired `harness/adapters`, `harness/runtime`, and `harness/mcp` planes are not part of the current implementation. No package includes MCP, hooks, or a managed host runtime, and no credentials. Executable scripts inside the packaged plugins are vendored skill assets (for example the `planning-with-files` scripts), not a host runtime.

## Distribution

Each release produces two artifacts generated from one shared skill source map:

- `harness-codex-plugin-<version>.tgz` — the native Codex package. It contains `.codex-plugin/plugin.json` and the established nested layout `skills/trio/{dev,office,safety}` plus the `skills/chiefops/` companion, and installs through the Codex native marketplace path.
- `harness-agent-plugins-<version>.tgz` — the portable Agent Plugins v1 package. It contains a root `plugin.json` with the closed portable schema (`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) and eight immediate skill children: `skills/{trio,dev,office,safety,chiefops,planning-with-files,overengineering-review,simplification-ledger}/SKILL.md`. Agent Plugins discovery is non-recursive, so the portable package uses a flat layout rather than the Codex-nested one.

Codex is the only managed native target. The portable package is a vendor-neutral distribution artifact: installation is manual and client-owned, following each Agent Plugins-compatible client's own procedure. This repository makes no managed generic-client installation claim. The local `install`/`sync` projection remains a Codex-specific local migration path, not a third-party distribution mechanism.

## Trio v2 Operating Boundary

For tracked work, the planning Trio is the sole durable task authority: `planning/active/<task-id>/task_plan.md`, `planning/active/<task-id>/findings.md`, and `planning/active/<task-id>/progress.md`. Documentation and Host state do not replace it.

The optional read-only `trio status --summary --task <id>` view is derived from those same three files for recovery navigation. It is evidence and presentation only; it does not add task state, authorization, acceptance, or Host delivery proof. See [Trio recovery](trio-recovery.md).

Route work first, then select one capability family: `dev`, `office`, or `safety`. The Host owns worker and subtask lifecycle, permissions, continuation, and external or human gates.

Codex is the only managed native target. Other Host environments use a generic/manual fallback rather than a managed projection.

This repository does not project planning hooks or scripts. Host hook configuration remains Host-owned and non-authoritative. It never replaces the Trio planning files or main-session round start.

## Operator Surface

The implementation layers above are not the same thing as the operator surface.

- The implementation surface is `core`, `installer`, `trio`, `upstream`, and `packages/plugin-kit`.
- The operator surface is the workflow-lane map documented in [Workflows](workflows.md).

This separation is intentional:

- workflow lanes package the repo for day-to-day use
- implementation layers keep rendering, projection, and lifecycle mechanics centralized
- optional integrations such as browser automation or eval harnesses remain contracts until the project intentionally adopts a concrete runtime

Browser and eval are therefore architecture extension points, not baseline install requirements.

## Source-Of-Truth And Reconciliation

`docs/reconciliation.md` defines how Harness resolves drift between intended behavior, actual code, verification evidence, active planning, roadmap, backlog, and companion artifacts. Architecture policy should not treat old specs as automatically more authoritative than verified implementation facts, and verified implementation facts should not be treated as accepted product intent without an owner decision.

## Supporting assets and optional methods

Six governance entries remain the logical inventory: the entry policy and five skills. Their bounded reference-file manifest is projected with the same ownership, physical-path, backup, and readback checks. Both plugin layouts include the references under their owning skills. The installer creates missing references when upgrading an existing six-entry installation.

Optional TDD, review, design, debugging, and domain-modeling methods live under `harness/optional-skills/methods/`. `scripts/adopt-global-skills.mjs` adopts these and the three core auxiliary skills through an explicit dry run, ownership checks, reversible backup, and a separate installation receipt. That receipt tracks installed bytes only; it is not task authority. Raw upstream baselines remain pinned; adapted instructions live in overlays.
