# Architecture

superpowering-with-files uses four layers:

- `harness/core`: platform-neutral policy, skills metadata, templates, and schemas.
- `harness/adapters`: platform-specific projection manifests.
- `harness/installer`: CLI commands and projection logic.
- `harness/upstream`: vendored baselines and source metadata.

Core is the source of truth. Adapters translate core into platform-specific entry files. The installer manages state, safe writes, and entry + skills projection.

Planning with Files is the only durable agent task-memory system. Active task state lives under `planning/active/<task-id>/`; closed task state may move to `planning/archive/<timestamp>-<task-id>/` only after the lifecycle guard passes. Documentation directories such as `docs/**`, `docs/superpowers/plans/**`, and `docs/plans/**` are not active task state unless the user explicitly asks for a human-facing documentation artifact.

Projection operations:

- `render`: generate entry files from templates.
- `link`: link compatible skills or directories.
- `materialize`: copy files when a platform needs a real local copy or patched content.
- `hook-config`: merge verified Harness-managed hook entries into a target adapter-specific config file.
- `hook-script`: copy hook helper scripts into the target hook script root.

`sync` records Harness-owned paths in `.harness/projections.json`. A later sync may replace paths recorded in that manifest and garbage-collect stale Harness-managed projections that are no longer part of the desired set. If a target path exists but is not owned by Harness, sync refuses to overwrite it unless `--conflict=backup` is used.

Hook projection is disabled by default. `install --hooks=on` records `hookMode: "on"` in `.harness/state.json`; later `sync` reads that state and plans hook projections from `harness/core/skills/index.json`.

Hook support is adapter-based:

| Hook source | Codex | GitHub Copilot | Cursor | Claude Code |
| --- | --- | --- | --- | --- |
| `planning-with-files` task-scoped hook | Supported with Codex event limits | Supported | Provisional | Supported |
| `superpowers` session-start hook | Supported via Harness wrapper | Unsupported | Provisional | Supported |

Unsupported hook adapters are modeled explicitly and reported by `status` and `doctor`, but they are not treated as health failures. This keeps cross-IDE behavior honest instead of pretending every platform consumes the same hook schema.

Hook facts must be backed by official platform documentation before Harness treats them as verified contracts:

| Target | Official doc-backed facts | Harness-owned or provisional facts |
| --- | --- | --- |
| Codex | `.codex/hooks.json`, `~/.codex/hooks.json`, `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `codex_hooks = true`, Windows disabled | Script filenames under `.codex/hooks/*` are Harness-owned adapter choices. |
| GitHub Copilot / VS Code | `.github/hooks/*.json`, `~/.copilot/hooks`, PascalCase hook events, Claude hook config compatibility, Copilot CLI lowerCamelCase compatibility | Harness chooses concrete hook filenames such as `planning-with-files.json` and `task-scoped-hook.sh`. |
| Claude Code | `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`, `SessionStart` and `UserPromptSubmit` stdout context injection | Harness chooses script filenames under `.claude/hooks/*`. |
| Cursor | No official docs-level hook path, event, or schema citation is currently recorded in this repository. | Existing Cursor hook projection is treated as provisional until a Cursor official hooks contract is cited. |

Hook config/settings JSON files are merged rather than blindly overwritten. Harness marks each managed hook entry with a `Harness-managed ... hook` description, removes the previous managed entry for that same skill, and preserves unrelated user hook entries. The target-specific hook container must be mergeable; Claude Code settings JSON can preserve non-hook fields while Harness updates only the `hooks` field. If an existing hook config or settings JSON is malformed, `sync` refuses to modify it unless `--conflict=backup` is used.

Hook roots are platform metadata, not command-local constants:

| Target | Workspace hook root | User-global hook root |
| --- | --- | --- |
| Codex | `.codex` | `~/.codex` |
| GitHub Copilot | `.github/hooks` | `~/.copilot/hooks` |
| Cursor | `.cursor` | `~/.cursor` |
| Claude Code | `.claude` | `~/.claude` |

Claude Code stores hook configuration in `.claude/settings.json` and `~/.claude/settings.json`; helper scripts live under `.claude/hooks/*` and `~/.claude/hooks/*`.

The planning-with-files hook helper reads only task-scoped active plans under `planning/active/<task-id>/`. It does not read or create project-root planning files, and it does not archive tasks. Stop-style hooks only remind the agent to update `progress.md` and confirm the task lifecycle block.

Skill roots are platform metadata, not command-local constants:

| Target | Workspace skill root | User-global skill root |
| --- | --- | --- |
| Codex | `.agents/skills` | `~/.agents/skills` |
| GitHub Copilot | `.github/skills` | `~/.copilot/skills` |
| Cursor | `.cursor/skills` | `~/.cursor/skills` |
| Claude Code | `.claude/skills` | `~/.claude/skills` |

Harness materializes skill projections by default so the projected directory is the only discovery source each IDE sees during fresh install. Claude Code shared skill-root symlinks are intentionally unsupported. Harness expects each Claude skill target path to be projected individually under `.claude/skills` or `~/.claude/skills`; directory-level sharing such as `.claude/skills -> ~/.agents/skills` is reported as unhealthy.

Some upstream skills carry default file-location guidance that conflicts with Harness. Harness keeps `harness/upstream/**` untouched, then applies projection-layer patches during `sync`. The Superpowers `writing-plans` projection is patched so durable plans are written to `planning/active/<task-id>/` instead of `docs/superpowers/plans/**`.

Health checks include plan-location diagnostics. Root-level `task_plan.md`, `findings.md`, `progress.md`, `docs/superpowers/plans/*.md`, and `docs/plans/*.md` are reported as warnings because they may be historical or human-facing documents. They are not treated as installation failures unless another health check fails.

Platform metadata also records unsupported installer targets. Gemini CLI is currently metadata-listed as unsupported so the installer can fail explicitly instead of pretending partial projection exists.

`fetch` and `update` operate on known upstream source names from `harness/upstream/sources.json`. `update` refreshes only `harness/upstream/*`. It does not mutate IDE directories directly. The next `sync` reads the refreshed upstream baseline and updates Harness-owned projections.
