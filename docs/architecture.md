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

- `harness/adapters` remains the projection layer for Codex, GitHub Copilot, Cursor, and Claude Code.
- `harness/runtime` contains root policy, status/doctor/summary services, dry-run planning, safe-apply flows, approval verification, receipts, and registry/policy evaluation.
- `harness/mcp` registers those services as MCP tools and resources over stdio or Streamable HTTP.

If a feature can be shared between CLI and MCP, it belongs in `harness/runtime`, not in `harness/mcp`, and not in a shell wrapper around `./scripts/harness`.

`harness/core/policy/base.md` remains the canonical policy source. Entry files are rendered from heading-based profiles, so the always-on startup payload is smaller than the full canonical policy. Tracked-task and deep-reasoning detail still lives in `base.md`, but it is not injected into every session start by default.

Skill routing is intentionally layered: the `standard` profile projects curated Matt development disciplines and the small Quality Kernel; `high-assurance` adds the selected Superpowers toolbox and deep-review policy; `office` keeps artifact-quality routing separate. `full` remains a compatibility alias for `high-assurance`. None of these profiles changes the sole durable task authority under `planning/active/<task-id>/`.

The full allow-list, entry-policy pairing, source-leaf naming, and target-root projection rules are maintained in [Skill Profiles And Projection Map](skill-profiles.md). `harness/core/skills/profiles.json` is the executable source of that table.

Personal-global projection and repository skill governance are independent control planes. The legacy `.harness/state.json` and `.harness/projections.json` continue to represent personal/global installer state. The repository commits `harness/workspace-skill-profile.json`; `workspace-skills` writes only `.agents/skills`, `.claude/skills`, and `.harness/workspace-skill-projections.json`. This split permits `minimal-global` and repository `standard` to coexist without one scope overwriting the other.

Planning with Files is the only durable agent task-memory system. Active task state lives under `planning/active/<task-id>/`; closed task state may move to `planning/archive/<timestamp>-<task-id>/` only after the lifecycle guard passes. Documentation directories such as `docs/**`, `docs/superpowers/plans/**`, and `docs/plans/**` are not active task state unless the user explicitly asks for a human-facing documentation artifact.
All supported IDE entry files render from the same core policy source, but they do so through a thin default profile. That preserves tracked-task precedence in the canonical policy without forcing the tracked-task and deep-reasoning sections into every session start across Codex, GitHub Copilot, Cursor, and Claude Code.

Projection operations:

- `render`: generate entry files from templates.
- `link`: link compatible skills or directories.
- `materialize`: copy files when a platform needs a real local copy or patched content.

`sync` records Harness-owned paths in `.harness/projections.json`. A later sync may replace paths recorded in that manifest and garbage-collect stale Harness-managed projections that are no longer part of the desired set. If a target path exists but is not owned by Harness, sync refuses to overwrite it unless `--conflict=backup` is used.

This repository does not project planning hooks or scripts. Host hook configuration remains Host-owned and non-authoritative. It never replaces the Trio planning files or main-session round start.

Skill roots are platform metadata, not command-local constants:

| Target | Workspace skill root | User-global skill root |
| --- | --- | --- |
| Codex | `.agents/skills` | `~/.agents/skills` |
| GitHub Copilot | `.agents/skills` | `~/.agents/skills` |
| Cursor | `.agents/skills` | `~/.agents/skills` |
| Claude Code | `.claude/skills` | `~/.claude/skills` |

Codex, GitHub Copilot, and Cursor share `.agents/skills` / `~/.agents/skills` for skill projection. Cursor keeps native `.cursor/rules` and `.cursor` hook roots; only skill projection is shared. Claude Code stays on `.claude/skills` because Harness health checks reject shared Claude skill root symlinks.

Harness materializes skill projections by default so the projected directory is the only discovery source each IDE sees during fresh install. Harness expects each Claude skill target path to be projected individually under `.claude/skills` or `~/.claude/skills`; directory-level sharing such as `.claude/skills -> ~/.agents/skills` is reported as unhealthy.

Some upstream skills carry default file-location guidance that conflicts with Harness. Harness keeps `harness/upstream/**` untouched, then applies projection-layer patches during `sync`.

- The Superpowers `writing-plans` projection is patched so durable plans are written to `planning/active/<task-id>/` instead of `docs/superpowers/plans/**`.
- The `planning-with-files` projection is patched for every supported IDE so its lifecycle guidance requires the companion plan when Superpowers is actually used on a Deep-reasoning task.
- Codex, GitHub Copilot, and Cursor share the `planning-with-files` skill-root resolution patch; GitHub Copilot compatibility fallbacks such as `GITHUB_COPILOT_SKILL_ROOT`, `.github/skills/planning-with-files`, and `~/.copilot/skills/planning-with-files` are preserved inside that shared patch.

These patches preserve the summary/detail split: the active planning files keep durable task state, while any detailed deep-reasoning implementation plan stays in the companion artifact.

Health checks include plan-location diagnostics. Root-level `task_plan.md`, `findings.md`, `progress.md`, `docs/superpowers/plans/*.md`, and `docs/plans/*.md` are reported as warnings because they may be historical or human-facing documents. They are not treated as installation failures unless another health check fails.

Platform metadata also records unsupported installer targets. Gemini CLI is currently metadata-listed as unsupported so the installer can fail explicitly instead of pretending partial projection exists.

`fetch` and `update` operate on known upstream source names from `harness/upstream/sources.json`. `update` refreshes only `harness/upstream/*`. It does not mutate IDE directories directly. Interactive commands retain legacy state receipts; automation uses `--no-state`, then `workspace-skills plan`, `workspace-skills sync --takeover`, and `workspace-skills check` so upstream refresh cannot create or mutate personal-global state.

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
