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

Codex projects skills into the shared Harness roots `.agents/skills` and `~/.agents/skills` to keep discovery stable and avoid symlink-specific duplication.

Skill roots:

```text
.agents/skills
~/.agents/skills
```

These are the same shared Harness skill roots used by GitHub Copilot.

Codex hooks are officially documented and remain gated behind `codex_hooks = true` in Codex `config.toml`. Codex can load hooks from `hooks.json` or inline `[hooks]` tables in `config.toml` at both repo and user config layers.
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

For user-global adoption, keep the default `full` profile unless you explicitly want the smaller `minimal-global` projection:

```bash
./scripts/harness install --targets=codex --scope=user-global --skills-profile=minimal-global
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
