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

Harness does not assume a single Codex feature-gate name. Check the installed Codex build first:

```bash
codex features list | rg '^hooks\s'
```

Expected on current builds: a `hooks` row marked enabled. If your Codex version uses a different gate name or config shape, follow the upstream Codex docs for that build instead of assuming Harness can enable it for you.

Harness projects Codex hooks only when `--hooks=on` is selected. It projects the verified planning-with-files `SessionStart` and `UserPromptSubmit` events, plus the superpowers `SessionStart` wrapper. When the `safety` profile is active, Harness can also project Codex `SessionStart` and `PreToolUse` safety hooks. Those remain repository-owned policy checks and do not replace host-platform approvals.

When these hooks run in a live Codex session, Harness writes runtime trace evidence under `.harness/runtime-hooks/codex.jsonl` and surfaces it in `doctor` and `verify` as runtime evidence instead of guessing.

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

If you already installed Codex hooks before this allowlist change, re-run `./scripts/harness sync` so stale planning `Stop` entries are removed from existing Codex hook configs.

For manual branches or extra worktrees created from inside the repo, resolve the name with:

```bash
./scripts/harness worktree-name --task <task-id> --namespace codex
```

Codex App may already provide an isolated workspace or its own worktree model. Treat the helper as a supplementary naming tool for manual branch or worktree creation inside that workspace, not as a replacement for host-owned workspace identity.

For user-global adoption, the default skill profile is the lean `minimal-global` projection. Use `--skills-profile=full` only when you intentionally want the complete skill surface:

```bash
./scripts/harness install --targets=codex --scope=user-global
./scripts/harness sync
```

If `doctor --check-only` warns that Codex is paired with `full` at user-global or `both` scope, treat that as a nudge to prefer `minimal-global` unless you really need the larger surface.

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

Harness archives the pre-existing content into `~/.harness/backups/` and records it in `~/.harness/backup-index.json`; it no longer leaves `.harness-backup-*` siblings in the live skill or entry roots.

If older `.harness-backup-*` siblings already exist from a previous takeover, the next successful `sync` imports them into the archive store and removes the live duplicates before projecting the new baseline.

Gemini CLI is not currently a supported Harness installer target. Harness does not create installer-managed Gemini entry files or user-global state.
