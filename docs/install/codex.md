# Codex Installation

Codex receives rendered `AGENTS.md` files.

Workspace scope writes:

```text
AGENTS.md
```

User-global scope writes:

```text
~/.codex/AGENTS.md
```

Harness currently projects Codex skills into the official Codex skill roots and materializes them there to keep discovery stable and avoid symlink-specific duplication.

Skill roots:

```text
.agents/skills
~/.agents/skills
```

Codex hooks are experimental and require `codex_hooks = true` in Codex `config.toml`.
Harness projects Codex hooks only when `--hooks=on` is selected.

Hook files:

```text
.codex/hooks.json
.codex/hooks/*
~/.codex/hooks.json
~/.codex/hooks/*
```

The Codex adapter uses official Codex hook config locations and events. Script filenames under `.codex/hooks/*` are Harness-owned adapter choices.

Run:

```bash
./scripts/harness install --targets=codex --scope=workspace
./scripts/harness sync
```

Run with hooks:

```bash
./scripts/harness install --targets=codex --scope=workspace --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
./scripts/harness status
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```

Gemini CLI is not currently a supported Harness installer target. Harness does not create installer-managed Gemini entry files or user-global state.
