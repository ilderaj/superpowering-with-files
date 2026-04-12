# HarnessTemplate

HarnessTemplate is a reusable workflow template for agents and humans working in the same repository. It gives Codex, GitHub Copilot, Cursor, and Claude Code one shared governance policy while preserving each tool's native instruction entrypoint.

The core model is simple:

- `planning-with-files` is the durable task memory.
- `superpowers` is optional, temporary reasoning support.
- Rendered entry files carry the same Harness policy into each IDE or agent.
- Workspace, user-global, and combined installation scopes are supported.

## Quick Start

```bash
./scripts/harness install --scope=workspace --targets=all --projection=link
./scripts/harness sync
./scripts/harness doctor
```

`workspace` is the default scope. Use `both` when you want a user-level Harness policy plus repository-local entrypoints.

## Workflow

Harness routes work through one global governance policy before any tool-specific behavior matters. The default path is lightweight: do the work directly, keep the active planning files current, and verify before reporting back. Superpowers are reserved for cases where their extra structure is worth the cost.

```mermaid
flowchart TD
  A["Task arrives"] --> B["Agent reads its Harness entry file"]
  B --> C["Apply global governance rules"]
  C --> D{"Is the task simple and clear?"}

  D -- "Yes" --> E["Execute directly"]
  E --> F["Update active planning files when relevant"]
  F --> G["Verify"]
  G --> H["Report result"]

  D -- "No" --> I["Create or reuse planning/active/<task-id>/"]
  I --> J["task_plan.md"]
  I --> K["findings.md"]
  I --> L["progress.md"]

  J --> M{"Does this need Superpowers?"}
  K --> M
  L --> M

  M -- "No" --> N["Execute in normal mode"]
  M -- "Yes" --> O["Use temporary Superpowers reasoning"]

  O --> P{"Which capability fits?"}
  P -- "Unclear architecture or requirements" --> P1["brainstorming / writing-plans"]
  P -- "Complex debugging or unknown root cause" --> P2["systematic-debugging"]
  P -- "Existing plan to run" --> P3["executing-plans"]
  P -- "Independent parallel work" --> P4["dispatching-parallel-agents / subagent-driven-development"]
  P -- "Completion checks or review" --> P5["verification-before-completion / requesting-code-review"]

  P1 --> Q["Sync durable decisions back to Planning with Files"]
  P2 --> Q
  P3 --> Q
  P4 --> Q
  P5 --> Q

  Q --> N
  N --> R["Verify"]
  R --> S{"Complete?"}
  S -- "No" --> T["Record the failure and try a different approach"]
  T --> N
  S -- "Yes" --> U["Set Status: closed and Archive Eligible: yes"]
  U --> V{"Archive requested and lifecycle guard passes?"}
  V -- "No" --> W["Keep task under planning/active/"]
  V -- "Yes" --> X["Move to planning/archive/<timestamp>-<task-id>/"]
```

## Complex Request Mode

For broad requests with mixed bug fixes, UI changes, product strategy, release checks, or App Store preparation, use this order:

```text
Planning with Files master orchestration
-> worktree/branch isolation when risk or parallelism requires it
-> per-phase Superpowers reasoning only when justified
-> scoped subagent execution
-> main-agent review and verification
-> sync back to Planning with Files
```

Rendered entry files carry this mode into Codex, GitHub Copilot, Cursor, and Claude Code. The main agent remains responsible for file ownership boundaries, integration, verification, and syncing durable decisions back to the active Planning with Files task.

Use Superpowers only when the architecture is unclear, requirements are ambiguous, debugging is complex, the root cause is not obvious, or deep structured reasoning is explicitly requested. If Superpowers are used, durable decisions must be copied back into the task's three Planning with Files documents.

## Installation Structure

Harness has four layers:

- `harness/core`: platform-neutral policy, templates, metadata, skill projection metadata, and schemas.
- `harness/adapters`: target-specific manifests for Codex, Copilot, Cursor, and Claude Code.
- `harness/installer`: CLI commands and projection logic.
- `harness/upstream`: vendored baselines for `superpowers` and `planning-with-files`.

```mermaid
flowchart LR
  Repo["HarnessTemplate"] --> Core["harness/core"]
  Repo --> Adapters["harness/adapters"]
  Repo --> Installer["harness/installer"]
  Repo --> Upstream["harness/upstream"]

  Core --> Policy["policy/base.md"]
  Core --> Templates["templates/*.hbs"]
  Core --> Metadata["metadata/platforms.json"]
  Core --> Skills["skills/index.json"]

  Adapters --> Manifests["target manifest.json files"]
  Installer --> Install["install writes .harness/state.json"]
  Installer --> Sync["sync renders entry files"]
  Installer --> FsOps["fs-ops can write, copy, or symlink"]

  Policy --> Entry["Rendered governance entry file"]
  Templates --> Entry
  Metadata --> Entry
  Manifests --> Entry
  Sync --> Entry

  Entry --> Codex["Codex: AGENTS.md"]
  Entry --> Copilot["Copilot: copilot-instructions.md"]
  Entry --> Cursor["Cursor: .cursor/rules/harness.mdc"]
  Entry --> Claude["Claude Code: CLAUDE.md"]

  Upstream --> Superpowers["superpowers skills baseline"]
  Upstream --> Planning["planning-with-files baseline"]
  Skills -. "link/materialize strategy metadata" .-> Superpowers
  Skills -. "link/materialize strategy metadata" .-> Planning
```

Current implementation note: `sync` renders instruction entry files as real files. Skill projection strategies are modeled and tested, but skill filesystem projection is not wired into `sync` yet. There is no hard-link implementation; the filesystem helpers support real files and symlinks.

## Entry Files

| Target | Workspace entry | User-global entry | Current file behavior |
| --- | --- | --- | --- |
| Codex | `AGENTS.md` | `~/.codex/AGENTS.md` | Rendered real file |
| GitHub Copilot | `.copilot/copilot-instructions.md` | `~/.copilot/copilot-instructions.md` | Rendered real file |
| Cursor | `.cursor/rules/harness.mdc` | `~/.cursor/rules/harness.mdc` | Rendered real file |
| Claude Code | `CLAUDE.md` | `~/.claude/CLAUDE.md` | Rendered real file |

## Skill Projection Metadata

| Skill baseline | Codex | GitHub Copilot | Cursor | Claude Code |
| --- | --- | --- | --- | --- |
| `harness/upstream/superpowers/skills` | `link` | `link` | `link` | `link` |
| `harness/upstream/planning-with-files` | `link` | `materialize` | `link` | `link` |

Copilot uses `materialize` for `planning-with-files` because its skill and hook behavior differs from Codex and Claude Code. Other targets prefer symlink-compatible projections when skill projection is implemented.

## Common Commands

```bash
./scripts/harness install
./scripts/harness sync
./scripts/harness doctor
./scripts/harness status
./scripts/harness fetch
./scripts/harness update
```

## Documentation

- [Architecture](docs/architecture.md)
- [Maintenance](docs/maintenance.md)
- [Release](docs/release.md)
- [Codex installation](docs/install/codex.md)
- [GitHub Copilot installation](docs/install/copilot.md)
- [Cursor installation](docs/install/cursor.md)
- [Claude Code installation](docs/install/claude-code.md)
