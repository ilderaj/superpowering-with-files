# Architecture

HarnessTemplate uses four layers:

- `harness/core`: platform-neutral policy, skills metadata, templates, and schemas.
- `harness/adapters`: platform-specific projection manifests.
- `harness/installer`: CLI commands and projection logic.
- `harness/upstream`: vendored baselines and source metadata.

Core is the source of truth. Adapters translate core into platform-specific entry files. The installer manages state, safe writes, and entry + skills projection.

Projection operations:

- `render`: generate entry files from templates.
- `link`: link compatible skills or directories.
- `materialize`: copy files when a platform needs a real local copy or patched content.

`sync` records Harness-owned paths in `.harness/projections.json`. A later sync may replace paths recorded in that manifest. If a target path exists but is not owned by Harness, sync refuses to overwrite it unless `--conflict=backup` is used.

Skill roots are platform metadata, not command-local constants:

| Target | Workspace skill root | User-global skill root |
| --- | --- | --- |
| Codex | `.codex/skills` | `~/.codex/skills` |
| GitHub Copilot | `.github/skills` | `~/.copilot/skills` |
| Cursor | `.cursor/skills` | `~/.cursor/skills` |
| Claude Code | `.claude/skills` | `~/.claude/skills` |

`update` refreshes only `harness/upstream/*`. It does not mutate IDE directories directly. The next `sync` reads the refreshed upstream baseline and updates Harness-owned projections.
